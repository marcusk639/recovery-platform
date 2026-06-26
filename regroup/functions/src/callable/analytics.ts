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
  // YYYY-MM-DD only; compared lexicographically (ISO sorts chronologically).
  // A loose string would let a malformed bound silently over/under-include
  // payments in the ROI window, so require the calendar-date shape.
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
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
  refundedAmountCents?: number; // cumulative refunds in CENTS (#35, charge.refunded)
  dueDate?: string; // YYYY-MM-DD due date captured at charge time (#34)
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
    } catch (err) {
      // Unknown tier/houseType combo ⇒ treat as not entitled. Log so a genuine
      // SUBSCRIPTION_TIERS misconfiguration (which would silently downgrade a
      // paying operator) is distinguishable from a real under-tier user.
      logger.error("rentRoiMetrics: tierAllows threw", {
        houseId,
        houseType,
        tier,
        err: (err as Error)?.message,
      });
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

  // #35 refund netting: refundedAmountCents is already integer cents (written by
  // the charge.refunded webhook). Net collected floors at 0 so heavy refunds
  // can't produce a negative figure.
  const refundedCents = filteredPayments.reduce(
    (sum, p) => sum + (p.refundedAmountCents ?? 0),
    0,
  );
  const collectedNetCents = Math.max(0, collectedGrossCents - refundedCents);

  // #34 on-time rate: only payments with a recorded dueDate are considered. A
  // payment is on-time when its payment date (createdAt) is on or before the
  // due date (YYYY-MM-DD lexical compare — ISO sorts chronologically).
  const duePayments = filteredPayments.filter(
    (p) => typeof p.dueDate === "string" && p.dueDate.length > 0,
  );
  const onTimePayments = duePayments.filter(
    (p) => toDateStr(p.createdAt) <= (p.dueDate as string).slice(0, 10),
  );
  const duePaymentCount = duePayments.length;
  const onTimeRatePct =
    duePaymentCount > 0
      ? Math.round((onTimePayments.length / duePaymentCount) * 100)
      : null;

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

  // Log only non-sensitive counts. Dollar aggregates (collected/outstanding)
  // and the overdue-resident count tied to a houseId are operationally
  // sensitive financial data and must not land in Cloud Functions logs — they
  // are returned to the entitled caller below instead.
  logger.info("rentRoiMetrics: metrics computed", {
    houseId,
    paymentCount,
    duePaymentCount,
    hasOutstanding: outstandingCents > 0,
    hasOverdue: overdueResidentCount > 0,
  });

  // Caveats: only surface notes that still apply.
  //   • #35 (gross-only) resolved — refunds now netted via collectedNetCents.
  //   • #34 (deferred on-time) resolved — on-time rate now computed from
  //     per-charge dueDate. If some windowed payments predate dueDate capture
  //     (or the guest had no due date), the rate covers only those with a
  //     recorded due date — flag that partial coverage.
  //   • hours-saved remains deferred.
  const caveats: string[] = [];
  if (duePaymentCount < paymentCount) {
    caveats.push(
      "on-time rate covers only payments with a recorded due date; payments without a captured dueDate are excluded",
    );
  }
  caveats.push("hours-saved is deferred (not yet computed)");

  return {
    available: true,
    spec: "RG-TRACK",
    period: {
      startDate: startDate ?? null,
      endDate: endDate ?? null,
    },
    collectedGrossCents,
    collectedNetCents,
    refundedCents,
    paymentCount,
    onTimeRatePct,
    duePaymentCount,
    outstandingCents,
    overdueResidentCount,
    caveats,
  };
});
