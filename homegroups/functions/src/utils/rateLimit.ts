import { createHash } from "crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { Timestamp, type Transaction } from "firebase-admin/firestore";
import { db } from "./firebase";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

// TTL retention for `_rateLimits` documents. Deliberately independent of
// WINDOW_MS (the 60s rate-limit window): retention must comfortably outlive
// the active window so docs remain readable/updatable during their brief
// active life, while still being garbage-collected well after they go
// stale. This only sets the `expireAt` field on each doc — it does not by
// itself enable TTL deletion. A TTL policy keyed on `expireAt` must still be
// configured for the `_rateLimits` collection group in the Firebase Console
// (or via `gcloud firestore fields ttls update`) as a separate ops step.
const RATE_LIMIT_TTL_MS = 60 * 60 * 1000;

/**
 * `key` often embeds caller-supplied data (e.g. an X-Forwarded-For header
 * value on an unauthenticated callable), so it cannot be trusted as a literal
 * Firestore document ID: `.doc(path)` treats "/" as a path separator, letting
 * unsanitized input steer the write into arbitrary nested collections instead
 * of a flat key. Hashing collapses any input to a fixed-length hex string,
 * which is safe as a document ID and still maps the same caller to the same
 * bucket.
 */
function toDocId(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Firestore-backed fixed-window rate limiter. An in-memory counter is not
 * safe here — Cloud Functions instances are not guaranteed to be reused
 * between calls, so state must live outside the process.
 *
 * Throws HttpsError("resource-exhausted") once `key` has been passed
 * MAX_REQUESTS_PER_WINDOW times within the current WINDOW_MS window.
 */
export async function enforceRateLimit(key: string): Promise<void> {
  const ref = db.collection("_rateLimits").doc(toDocId(key));
  const now = Date.now();

  await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : undefined;
    const windowStart: number | undefined = data?.windowStart;
    const count: number = data?.count ?? 0;

    const expireAt = Timestamp.fromMillis(now + RATE_LIMIT_TTL_MS);

    if (windowStart === undefined || now - windowStart >= WINDOW_MS) {
      tx.set(ref, { windowStart: now, count: 1, expireAt });
      return;
    }

    if (count >= MAX_REQUESTS_PER_WINDOW) {
      throw new HttpsError(
        "resource-exhausted",
        "Too many requests. Please try again shortly.",
      );
    }

    tx.set(ref, { windowStart, count: count + 1, expireAt });
  });
}

interface CallerRequest {
  rawRequest?: {
    ip?: string;
    headers?: Record<string, unknown>;
  };
}

function sanitizeKeyPart(s: string): string {
  return s.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

/**
 * Derives a per-caller identifier for rate-limiting unauthenticated callables.
 * Prefers the framework-resolved connecting IP (request.rawRequest.ip) over
 * the client-supplied X-Forwarded-For header, since an unauthenticated caller
 * can set X-Forwarded-For to anything — trusting its first entry directly
 * would let an attacker defeat the rate limit by sending a fresh fake value
 * on every request. Falls back to X-Forwarded-For's LAST entry (the one
 * closest to our own infrastructure) only when .ip is unavailable. The
 * result is sanitized because it's used as a Firestore document ID, which
 * cannot contain "/" or certain other characters.
 */
export function callerKey(request: CallerRequest): string {
  const ip = request.rawRequest?.ip;
  if (ip) return sanitizeKeyPart(ip);

  const xff = request.rawRequest?.headers?.["x-forwarded-for"];
  const last =
    typeof xff === "string" ? xff.split(",").pop()?.trim() : undefined;
  return sanitizeKeyPart(last || "unknown");
}
