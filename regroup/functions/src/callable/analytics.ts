import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { z } from "zod";
import { HouseType, TierKey } from "../config";
import {
  getHouse,
  getUser,
  getGuestsForHouse,
  getSuccessfulPaymentsForHouse,
} from "../api/firestore";
import { tierAllows } from "../util/tierPricing";
import { parseInput } from "../validation";

const rentRoiMetricsSchema = z.object({
  houseId: z.string().min(1),
  // ISO/date strings; compared lexicographically (ISO sorts chronologically).
  // Avoid z.string().datetime() (deprecated) — validate loosely.
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// Lowest sellable tier whose `features.analytics` is true, per house type
// (justification §6b value ladder). Used only to phrase the upgrade prompt — the
// authoritative gate is `tierAllows(..., "analytics")`.
const ANALYTICS_MIN_TIER: Record<HouseType, string> = {
  traditional: "Professional",
  oxford: "Plus",
};

// Loosely-typed shapes for the docs we read. The callable owns the field
// contract — we deliberately do NOT import mobile entities.
interface PaymentRecord {
  amount?: number; // DOLLARS (paymentIntent.amount / 100)
  createdAt?: unknown; // Firestore Timestamp | ISO string | Date
}

interface GuestRecord {
  status?: string;
  rentOwed?: number; // integer CENTS (live balance)
  rentDueDate?: string; // YYYY-MM-DD (optional live field)
}

// Coerce a payment's createdAt (Firestore Timestamp, ISO string, or Date) to a
// YYYY-MM-DD string for the in-memory window filter. Returns "" if unparseable.
function toDateStr(v: unknown): string {
  if (!v) return "";
  // Firestore Timestamp with toDate()
  if (typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString().slice(0, 10);
  }
  // Firestore Timestamp serialized as { _seconds }
  const seconds = (v as { _seconds?: number })._seconds;
  if (typeof seconds === "number") {
    return new Date(seconds * 1000).toISOString().slice(0, 10);
  }
  // Native Date
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10);
  }
  // ISO / date string
  if (typeof v === "string") {
    return v.slice(0, 10);
  }
  return "";
}

// Inclusive [start, end] window check on a YYYY-MM-DD string. Empty bounds are
// treated as open-ended.
function inWindow(dateStr: string, start?: string, end?: string): boolean {
  if (!dateStr) return false;
  if (start && dateStr < start.slice(0, 10)) return false;
  if (end && dateStr > end.slice(0, 10)) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// rentRoiMetrics (issue #32 v1 — RG-TRACK)
//
// Surfaces rent-collection ROI for a house: gross collected in a window, plus a
// live snapshot of outstanding balances and overdue residents. Analytics is a
// Professional+/Plus+ differentiator, so the same tier gate as complianceExport
// applies:
//   • caller's tier lacks `analytics` → "upgrade_required" (which tier unlocks it)
//   • caller's tier includes it       → real metrics ({ available: true })
//
// Read-only — writes nothing. PII safety: only houseId + numeric aggregates are
// logged, never guest names or per-record data.
// ─────────────────────────────────────────────────────────────────────────────
export const rentRoiMetrics = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required");

  const { houseId, startDate, endDate } = parseInput(
    rentRoiMetricsSchema,
    request.data,
  ) as z.infer<typeof rentRoiMetricsSchema>;

  const house = await getHouse(houseId);
  if (!house) throw new HttpsError("not-found", "House not found");

  if (house.superAdminId !== request.auth.uid) {
    throw new HttpsError(
      "permission-denied",
      "Only the house owner can view rent ROI metrics",
    );
  }

  const operator = await getUser(house.superAdminId);
  const sub = operator?.subscriptionMetadata;
  const tier = sub?.tier as TierKey | undefined;
  const houseType = (sub?.houseType ?? house.houseType) as HouseType;

  let entitled = false;
  if (tier) {
    try {
      entitled = tierAllows(houseType, tier, "analytics");
    } catch {
      // Unknown tier/houseType combo ⇒ treat as not entitled.
      entitled = false;
    }
  }

  if (!entitled) {
    const requiredTier =
      ANALYTICS_MIN_TIER[houseType] ?? ANALYTICS_MIN_TIER.traditional;
    logger.info("rentRoiMetrics: upgrade required", {
      houseId,
      status: "upgrade_required",
    });
    return {
      available: false,
      status: "upgrade_required" as const,
      feature: "analytics",
      requiredTier,
      spec: "RG-TRACK",
      message: `Rent-collection analytics is available on the ${requiredTier} plan and higher. Upgrade to unlock ROI metrics.`,
    };
  }

  // ── Entitled: compute the metrics ──────────────────────────────────────────
  const payments = (await getSuccessfulPaymentsForHouse(
    houseId,
  )) as PaymentRecord[];
  const filteredPayments = payments.filter((p) =>
    inWindow(toDateStr(p.createdAt), startDate, endDate),
  );

  // amount is DOLLARS → cents; round per-payment to avoid float drift.
  const collectedGrossCents = filteredPayments.reduce(
    (sum, p) => sum + Math.round((p.amount ?? 0) * 100),
    0,
  );
  const paymentCount = filteredPayments.length;

  const guests = (await getGuestsForHouse(houseId)) as GuestRecord[];
  // Missing status ⇒ treat as active.
  const activeGuests = guests.filter(
    (g) => g.status === undefined || g.status === "active",
  );

  // rentOwed is already integer cents.
  const outstandingCents = activeGuests.reduce(
    (sum, g) => sum + (g.rentOwed ?? 0),
    0,
  );

  const todayStr = new Date().toISOString().slice(0, 10);
  const overdueResidentCount = activeGuests.filter(
    (g) =>
      (g.rentOwed ?? 0) > 0 &&
      typeof g.rentDueDate === "string" &&
      g.rentDueDate.length > 0 &&
      g.rentDueDate < todayStr,
  ).length;

  logger.info("rentRoiMetrics: metrics computed", {
    houseId,
    collectedGrossCents,
    paymentCount,
    outstandingCents,
    overdueResidentCount,
  });

  return {
    available: true,
    spec: "RG-TRACK",
    period: {
      startDate: startDate ?? null,
      endDate: endDate ?? null,
    },
    collectedGrossCents,
    paymentCount,
    outstandingCents,
    overdueResidentCount,
    caveats: [
      "collectedGrossCents is GROSS — refunds are not reflected in Firestore (Stripe-only)",
      "on-time rate and hours-saved are deferred: only a single current rentDueDate per guest exists (no per-charge due-date history)",
    ],
  };
});
