import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { z } from "zod";
import { HouseType, TierKey } from "../config";
import {
  getHouse,
  getUser,
  getGuest,
  getGuestsForHouse,
  getDrugTestsForGuest,
  getMeetingActivitiesForGuest,
} from "../api/firestore";
import { tierAllows } from "../util/tierPricing";
import { parseInput } from "../validation";

const complianceExportSchema = z.object({
  houseId: z.string().min(1),
  residentId: z.string().optional(),
  // ISO date strings; compared lexicographically (ISO sorts chronologically).
  // Avoid z.string().datetime() (deprecated) — validate loosely.
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// Loosely-typed shapes for the data we export. We deliberately do NOT import
// the mobile entities — the callable owns the field contract it reads.
interface DrugTest {
  testDate?: string;
  result?: string;
  testType?: string;
  substancesDetected?: string[];
  observerName?: string;
  observedBy?: string;
  isRandom?: boolean;
  notes?: string;
}

interface MeetingActivity {
  timestamp?: string;
  loggedAt?: string;
  verified?: boolean;
  data?: {
    meetingName?: string;
    meetingType?: string;
    duration?: number | string;
  };
}

interface ResidentRecord {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  moveInDate?: string;
  intakeDate?: string;
  moveOutDate?: string;
  legalStatus?: string;
  phase?: number | string;
  houseId?: string;
  id?: string;
}

// Escapes a single CSV value: wrap in double-quotes and double any internal
// quotes when the value contains a comma, quote, or newline.
function csvEscape(value: string | number | boolean): string {
  const str = String(value ?? "");
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(fields: (string | number | boolean)[]): string {
  return fields.map(csvEscape).join(",");
}

function residentLabel(r: ResidentRecord): string {
  return (
    r.displayName ||
    [r.firstName, r.lastName].filter(Boolean).join(" ") ||
    "Unknown"
  );
}

// Returns the date portion (YYYY-MM-DD) of an ISO string, for window compare.
function datePart(iso?: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

// Inclusive [startDate, endDate] window check on a date (ISO/date string).
// Empty bounds are treated as open-ended.
function inWindow(dateIso: string, start?: string, end?: string): boolean {
  const d = datePart(dateIso);
  if (!d) return false;
  if (start && d < datePart(start)) return false;
  if (end && d > datePart(end)) return false;
  return true;
}

// Lowest sellable tier whose `features.complianceExport` is true, per house type
// (justification §6b value ladder). Used only to phrase the upgrade prompt — the
// authoritative gate is `tierAllows(..., "complianceExport")`.
const COMPLIANCE_EXPORT_MIN_TIER: Record<HouseType, string> = {
  traditional: "Professional",
  oxford: "Plus",
};

// ─────────────────────────────────────────────────────────────────────────────
// complianceExport (RG-SPEC-09)
//
// Court/drug-court compliance export is the Professional+ differentiator. It
// turns captured drug-test and meeting-attendance data into a court-ready CSV
// artifact. The tier gate stays in place so the value ladder is real and the
// client can render the correct messaging:
//   • caller's tier lacks the capability → "upgrade_required" (which tier unlocks it)
//   • caller's tier includes it          → real CSV export ({ available: true })
//
// The export is read-only — it writes nothing. PII safety: only ids + counts are
// logged, never resident names, test results, or CSV contents.
// ─────────────────────────────────────────────────────────────────────────────
export const complianceExport = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required");

  const { houseId, residentId, startDate, endDate } = parseInput(
    complianceExportSchema,
    request.data,
  ) as z.infer<typeof complianceExportSchema>;

  const house = await getHouse(houseId);
  if (!house) throw new HttpsError("not-found", "House not found");

  if (house.superAdminId !== request.auth.uid) {
    throw new HttpsError(
      "permission-denied",
      "Only the house owner can export compliance data",
    );
  }

  const operator = await getUser(house.superAdminId);
  const sub = operator?.subscriptionMetadata;
  const tier = sub?.tier as TierKey | undefined;
  const houseType = (sub?.houseType ?? house.houseType) as HouseType;

  let entitled = false;
  if (tier) {
    try {
      entitled = tierAllows(houseType, tier, "complianceExport");
    } catch {
      // Unknown tier/houseType combo ⇒ treat as not entitled.
      entitled = false;
    }
  }

  if (!entitled) {
    const requiredTier =
      COMPLIANCE_EXPORT_MIN_TIER[houseType] ??
      COMPLIANCE_EXPORT_MIN_TIER.traditional;
    logger.info("complianceExport: upgrade required", {
      houseId,
      status: "upgrade_required",
    });
    return {
      available: false,
      status: "upgrade_required" as const,
      feature: "complianceExport",
      requiredTier,
      spec: "RG-SPEC-09",
      message: `Compliance export is available on the ${requiredTier} plan and higher. Upgrade to enable court-ready exports.`,
    };
  }

  // ── Entitled: build the real CSV export ────────────────────────────────────
  // Resolve the resident scope.
  let residents: ResidentRecord[];
  if (residentId) {
    const guest = (await getGuest(residentId)) as ResidentRecord | undefined;
    if (!guest || guest.houseId !== houseId) {
      throw new HttpsError("not-found", "Resident not found in this house");
    }
    residents = [{ ...guest, id: residentId }];
  } else {
    residents = (await getGuestsForHouse(houseId)) as ResidentRecord[];
  }

  const lines: string[] = [];
  let drugTestCount = 0;
  let meetingCount = 0;

  for (const resident of residents) {
    const rid = resident.id ?? residentId ?? "";

    // Profile header block.
    lines.push(toCsvRow(["Resident", residentLabel(resident)]));
    lines.push(toCsvRow(["Move-in", resident.moveInDate ?? ""]));
    lines.push(toCsvRow(["Intake", resident.intakeDate ?? ""]));
    lines.push(toCsvRow(["Move-out", resident.moveOutDate ?? ""]));
    lines.push(toCsvRow(["Legal status", resident.legalStatus ?? "none"]));
    lines.push(toCsvRow(["Current phase", resident.phase ?? ""]));
    lines.push("");

    // Drug tests.
    const tests = (await getDrugTestsForGuest(rid)) as DrugTest[];
    const filteredTests = tests.filter((t) =>
      inWindow(t.testDate ?? "", startDate, endDate),
    );
    lines.push("Drug Tests");
    lines.push(
      toCsvRow([
        "Test Date",
        "Result",
        "Type",
        "Substances",
        "Observer",
        "Random",
        "Notes",
      ]),
    );
    for (const t of filteredTests) {
      lines.push(
        toCsvRow([
          t.testDate ?? "",
          t.result ?? "",
          t.testType ?? "",
          (t.substancesDetected ?? []).join("; "),
          t.observerName ?? t.observedBy ?? "",
          t.isRandom === true,
          t.notes ?? "",
        ]),
      );
    }
    drugTestCount += filteredTests.length;
    lines.push("");

    // Meeting attendance.
    const meetings = (await getMeetingActivitiesForGuest(
      rid,
    )) as MeetingActivity[];
    const filteredMeetings = meetings.filter((m) =>
      inWindow(m.timestamp ?? m.loggedAt ?? "", startDate, endDate),
    );
    lines.push("Meeting Attendance");
    lines.push(toCsvRow(["Date", "Meeting", "Type", "Duration", "Verified"]));
    for (const m of filteredMeetings) {
      lines.push(
        toCsvRow([
          datePart(m.timestamp ?? m.loggedAt ?? ""),
          m.data?.meetingName ?? "",
          m.data?.meetingType ?? "",
          m.data?.duration ?? "",
          m.verified === true,
        ]),
      );
    }
    meetingCount += filteredMeetings.length;
    lines.push("");
  }

  const csv = lines.join("\n");

  logger.info("complianceExport: export generated", {
    houseId,
    residentId: residentId ?? null,
    counts: {
      residents: residents.length,
      drugTests: drugTestCount,
      meetings: meetingCount,
    },
  });

  return {
    available: true,
    format: "csv" as const,
    filename: `compliance-${houseId}${residentId ? "-" + residentId : ""}.csv`,
    csv,
    counts: {
      residents: residents.length,
      drugTests: drugTestCount,
      meetings: meetingCount,
    },
    spec: "RG-SPEC-09",
  };
});
