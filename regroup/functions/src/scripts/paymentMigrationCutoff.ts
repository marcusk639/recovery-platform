/**
 * The #82 deploy cutoff — the one input migratePaymentAmountsToCents cannot
 * infer from a stored document.
 *
 * That migration tells a dollars document from a cents one by which code
 * wrote `amount` last. That separates WRITERS but not ERAS: after the #82
 * webhook change deploys, the webhook writes cents, and a post-deploy webhook
 * document is byte-identical in every inspected field to a pre-deploy one
 * holding dollars. Three webhook shapes — the payment_failed write, the
 * missing-metadata partial write and the guest_missing quarantine — cannot
 * carry `rentAppliedAmountCents`, so nothing else can break the tie for them.
 * The cutoff is what stops the migration multiplying real cents by 100.
 *
 * WHICH TIMESTAMP DATES THE WRITE
 * `updatedAt`, falling back to `createdAt` only when `updatedAt` is absent.
 * The payment_failed shape (webhooks/stripeWebhook.ts) writes `updatedAt` and
 * no `createdAt` at all, and it is one of the three shapes with no other
 * witness. `createdAt` is also a Firestore Timestamp from the webhook but an
 * ISO string from mobile, whereas `updatedAt` is only ever written by server
 * code as a Timestamp. Neither parsing yields null, and the caller reports the
 * document rather than guessing.
 */

export const DEPLOYED_AT_FLAG = '--deployed-at=';

/** Epoch milliseconds, or null when the value is not a usable instant. */
function toMillis(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value === null || typeof value !== 'object') return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : null;
  }
  // Firestore Timestamp, duck-typed: a snapshot read in a test is a plain
  // object, not an instance of the admin SDK's Timestamp class.
  const stamp = value as { toMillis?: unknown; toDate?: unknown };
  if (typeof stamp.toMillis === 'function') {
    const ms = (stamp.toMillis as () => unknown)();
    return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
  }
  if (typeof stamp.toDate === 'function') {
    const date = (stamp.toDate as () => unknown)();
    if (date instanceof Date && Number.isFinite(date.getTime())) return date.getTime();
  }
  return null;
}

/**
 * When `amount` was last written, in epoch ms, or null when the document
 * carries no timestamp this migration is willing to trust.
 */
export function lastAmountWriteAt(data: Record<string, unknown>): number | null {
  return toMillis(data.updatedAt !== undefined ? data.updatedAt : data.createdAt);
}

/**
 * Reads the mandatory `--deployed-at=<ISO>` cutoff out of argv.
 *
 * A flag that is present but nonsense (`--deployed-at=monday`) is the
 * dangerous case: `Date.parse` yields NaN, every `>=` against NaN is false,
 * and the migration would convert everything with the guard nominally
 * satisfied. So an unparseable value, and a cutoff in the future, are both
 * refusals — raised before Firestore is touched.
 */
export function parseDeployedAt(
  argv: string[],
  now: number = Date.now(),
): { cutoff: number } | { error: string } {
  const flag = argv.find((arg) => arg.startsWith(DEPLOYED_AT_FLAG));
  if (flag === undefined) {
    return {
      error:
        'Refusing to run: --deployed-at=<ISO timestamp> is required. Pass the instant the ' +
        '#82 webhook change went live; webhook documents written at or after it are reported ' +
        'rather than converted, because their unit cannot be told apart from a pre-#82 one.',
    };
  }
  const raw = flag.slice(DEPLOYED_AT_FLAG.length).trim();
  const cutoff = Date.parse(raw);
  if (!Number.isFinite(cutoff)) {
    return {
      error:
        `Refusing to run: --deployed-at=${raw || '<empty>'} is not a parseable timestamp. ` +
        'Use an ISO 8601 instant, e.g. --deployed-at=2026-10-16T18:30:00Z.',
    };
  }
  if (cutoff > now) {
    return {
      error:
        `Refusing to run: --deployed-at=${raw} is in the future. The cutoff must be the ` +
        'deploy that already happened — a later one re-opens the 100x defect for every ' +
        'document written in between.',
    };
  }
  return { cutoff };
}
