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
  // Output format. Defaults to "csv" when omitted (handled in code).
  format: z.enum(["csv", "pdf"]).optional(),
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

// In-memory per-resident export bundle. Both the CSV and PDF renderers consume
// this shared structure so the two formats can never drift apart.
interface ResidentExport {
  resident: ResidentRecord;
  tests: DrugTest[];
  meetings: MeetingActivity[];
}

interface ExportData {
  residents: ResidentExport[];
  counts: { residents: number; drugTests: number; meetings: number };
}

// Gathers, per resident, the profile + window-filtered drug tests and meeting
// activities. Returns the shared structure plus running counts. The only place
// that touches Firestore for the entitled branch.
async function gatherExportData(
  residents: ResidentRecord[],
  residentId: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
): Promise<ExportData> {
  const bundles: ResidentExport[] = [];
  let drugTestCount = 0;
  let meetingCount = 0;

  for (const resident of residents) {
    const rid = resident.id ?? residentId ?? "";

    const tests = (await getDrugTestsForGuest(rid)) as DrugTest[];
    const filteredTests = tests.filter((t) =>
      inWindow(t.testDate ?? "", startDate, endDate),
    );

    const meetings = (await getMeetingActivitiesForGuest(
      rid,
    )) as MeetingActivity[];
    const filteredMeetings = meetings.filter((m) =>
      inWindow(m.timestamp ?? m.loggedAt ?? "", startDate, endDate),
    );

    drugTestCount += filteredTests.length;
    meetingCount += filteredMeetings.length;

    bundles.push({
      resident,
      tests: filteredTests,
      meetings: filteredMeetings,
    });
  }

  return {
    residents: bundles,
    counts: {
      residents: residents.length,
      drugTests: drugTestCount,
      meetings: meetingCount,
    },
  };
}

// Renders the shared export data as the court-ready CSV string. This is the
// original CSV layout — output is byte-for-byte unchanged.
function renderCsv(data: ExportData): string {
  const lines: string[] = [];

  for (const { resident, tests, meetings } of data.residents) {
    // Profile header block.
    lines.push(toCsvRow(["Resident", residentLabel(resident)]));
    lines.push(toCsvRow(["Move-in", resident.moveInDate ?? ""]));
    lines.push(toCsvRow(["Intake", resident.intakeDate ?? ""]));
    lines.push(toCsvRow(["Move-out", resident.moveOutDate ?? ""]));
    lines.push(toCsvRow(["Legal status", resident.legalStatus ?? "none"]));
    lines.push(toCsvRow(["Current phase", resident.phase ?? ""]));
    lines.push("");

    // Drug tests.
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
    for (const t of tests) {
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
    lines.push("");

    // Meeting attendance.
    lines.push("Meeting Attendance");
    lines.push(toCsvRow(["Date", "Meeting", "Type", "Duration", "Verified"]));
    for (const m of meetings) {
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
    lines.push("");
  }

  return lines.join("\n");
}

// Renders the shared export data as a court-ready PDF buffer.
//
// pdfkit is lazy-loaded here so the CSV and upgrade_required paths never pay its
// cold-start cost. Only the built-in Helvetica fonts are used (no external font
// files). The doc stream is collected into a single Buffer.
//
// v1 returns the PDF inline as base64. For large multi-resident exports a future
// improvement is to write the buffer to Cloud Storage and return a short-lived
// signed URL instead of inlining the bytes.
async function renderPdf(
  data: ExportData,
  houseId: string,
  startDate: string | undefined,
  endDate: string | undefined,
): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;

  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Report header.
    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .text(`Compliance Report — ${houseId}`);
    if (startDate || endDate) {
      doc
        .font("Helvetica")
        .fontSize(10)
        .text(`Period: ${startDate ?? "—"} to ${endDate ?? "—"}`);
    }

    data.residents.forEach((bundle, index) => {
      if (index > 0) doc.addPage();
      const { resident, tests, meetings } = bundle;

      // Resident title.
      doc.moveDown();
      doc.font("Helvetica-Bold").fontSize(14).text(residentLabel(resident));

      // Profile block.
      doc.moveDown(0.5).font("Helvetica").fontSize(10);
      doc.text(`Move-in: ${resident.moveInDate ?? "—"}`);
      doc.text(`Intake: ${resident.intakeDate ?? "—"}`);
      doc.text(`Move-out: ${resident.moveOutDate ?? "—"}`);
      doc.text(`Legal status: ${resident.legalStatus ?? "none"}`);
      doc.text(`Current phase: ${resident.phase ?? "—"}`);

      // Drug tests.
      doc.moveDown().font("Helvetica-Bold").fontSize(12).text("Drug Tests");
      doc.font("Helvetica").fontSize(9);
      if (tests.length === 0) {
        doc.text("No drug tests in range.");
      } else {
        for (const t of tests) {
          const substances = (t.substancesDetected ?? []).join("; ");
          doc.text(
            [
              t.testDate ?? "—",
              t.result ?? "—",
              t.testType ?? "—",
              substances || "—",
              t.observerName ?? t.observedBy ?? "—",
              t.isRandom === true ? "Random" : "Scheduled",
              t.notes ?? "",
            ]
              .filter((part) => part !== "")
              .join(" · "),
          );
        }
      }

      // Meeting attendance.
      doc
        .moveDown()
        .font("Helvetica-Bold")
        .fontSize(12)
        .text("Meeting Attendance");
      doc.font("Helvetica").fontSize(9);
      if (meetings.length === 0) {
        doc.text("No meetings in range.");
      } else {
        for (const m of meetings) {
          doc.text(
            [
              datePart(m.timestamp ?? m.loggedAt ?? "") || "—",
              m.data?.meetingName ?? "—",
              m.data?.meetingType ?? "—",
              m.data?.duration != null ? String(m.data.duration) : "—",
              m.verified === true ? "Verified" : "Unverified",
            ].join(" · "),
          );
        }
      }
    });

    doc.end();
  });
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

  const {
    houseId,
    residentId,
    startDate,
    endDate,
    format: requestedFormat,
  } = parseInput(complianceExportSchema, request.data) as z.infer<
    typeof complianceExportSchema
  >;
  const format = requestedFormat ?? "csv";

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

  // ── Entitled: build the real export ─────────────────────────────────────────
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

  // Gather the shared in-memory structure once; both renderers consume it.
  const data = await gatherExportData(
    residents,
    residentId,
    startDate,
    endDate,
  );

  logger.info("complianceExport: export generated", {
    houseId,
    residentId: residentId ?? null,
    format,
    counts: data.counts,
  });

  const filenameBase = `compliance-${houseId}${
    residentId ? "-" + residentId : ""
  }`;

  if (format === "pdf") {
    const buffer = await renderPdf(data, houseId, startDate, endDate);
    return {
      available: true,
      format: "pdf" as const,
      filename: `${filenameBase}.pdf`,
      pdfBase64: buffer.toString("base64"),
      counts: data.counts,
      spec: "RG-SPEC-09",
    };
  }

  return {
    available: true,
    format: "csv" as const,
    filename: `${filenameBase}.csv`,
    csv: renderCsv(data),
    counts: data.counts,
    spec: "RG-SPEC-09",
  };
});
