/**
 * `flaggedForReview` on an activity (server-only; no client reads or writes
 * it). Several checks can flag the same activity (selfDecisionCheck's
 * 'self_decision', the backfill's 'stamp_mismatch'), so reasons are merged,
 * never overwritten: the first flag's fields stay as they were (`reason`
 * keeps the first reason, for older readers) and `reasons` lists them all.
 */
type Data = Record<string, unknown>;

export interface ReviewFlag {
  reason: string;
  [detail: string]: unknown;
}

/** The merged flag, or null when it already carries this reason (no write needed). */
export function mergeReviewFlag(existing: unknown, add: ReviewFlag): Data | null {
  const prev = existing && typeof existing === 'object' ? (existing as Data) : undefined;
  if (!prev) return { ...add, reasons: [add.reason] };
  const reasons = Array.isArray(prev.reasons)
    ? (prev.reasons as unknown[]).filter((r): r is string => typeof r === 'string')
    : typeof prev.reason === 'string'
      ? [prev.reason]
      : [];
  if (reasons.includes(add.reason)) return null;
  return { ...prev, reasons: [...reasons, add.reason] };
}
