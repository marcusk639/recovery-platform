import { HttpsError } from "firebase-functions/v2/https";
import type { Transaction } from "firebase-admin/firestore";
import { db } from "./firebase";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

/**
 * Firestore-backed fixed-window rate limiter. An in-memory counter is not
 * safe here — Cloud Functions instances are not guaranteed to be reused
 * between calls, so state must live outside the process.
 *
 * Throws HttpsError("resource-exhausted") once `key` has been passed
 * MAX_REQUESTS_PER_WINDOW times within the current WINDOW_MS window.
 */
export async function enforceRateLimit(key: string): Promise<void> {
  const ref = db.collection("_rateLimits").doc(key);
  const now = Date.now();

  await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : undefined;
    const windowStart: number | undefined = data?.windowStart;
    const count: number = data?.count ?? 0;

    if (windowStart === undefined || now - windowStart >= WINDOW_MS) {
      tx.set(ref, { windowStart: now, count: 1 });
      return;
    }

    if (count >= MAX_REQUESTS_PER_WINDOW) {
      throw new HttpsError(
        "resource-exhausted",
        "Too many requests. Please try again shortly.",
      );
    }

    tx.set(ref, { windowStart, count: count + 1 });
  });
}

interface CallerRequest {
  rawRequest?: {
    ip?: string;
    headers?: Record<string, unknown>;
  };
}

/** Derives a per-caller identifier for rate-limiting unauthenticated callables. */
export function callerKey(request: CallerRequest): string {
  const xff = request.rawRequest?.headers?.["x-forwarded-for"];
  const forwarded =
    typeof xff === "string" ? xff.split(",")[0].trim() : undefined;
  return forwarded || request.rawRequest?.ip || "unknown";
}
