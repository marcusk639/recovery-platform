// functions/src/http/getMeetingAttendance.ts
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { onRequest } from "firebase-functions/v2/https";
import { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";

// Fixed-salt used only to normalize string lengths before timingSafeEqual — not a secret.
const TIMING_SAFE_COMPARISON_SALT = "timing-safe-comparison-salt-v1";

/**
 * Constant-time string comparison resistant to timing attacks.
 *
 * Why HMAC instead of calling `timingSafeEqual` directly on the strings:
 *   `timingSafeEqual` requires both buffers to be the same length and throws
 *   otherwise. Passing the raw input through HMAC-SHA256 produces a fixed-size
 *   32-byte digest regardless of input length, so comparison works for any
 *   pair of inputs without leaking length information.
 *
 * Why this matters:
 *   A naive `a === b` (or even length-dependent comparison) can leak the
 *   prefix length of the expected value via timing side-channels. An attacker
 *   measuring response times across many requests could infer how many leading
 *   characters of their guess match the secret. Hashing inputs to a fixed-size
 *   digest first, then comparing digests with `timingSafeEqual`, prevents both
 *   the length leak and the byte-by-byte comparison leak.
 */
/* @visibleForTesting */
export function safeStringEqual(a: string, b: string): boolean {
  const ha = createHmac("sha256", TIMING_SAFE_COMPARISON_SALT)
    .update(a)
    .digest();
  const hb = createHmac("sha256", TIMING_SAFE_COMPARISON_SALT)
    .update(b)
    .digest();
  return timingSafeEqual(ha, hb);
}

export async function getMeetingAttendanceHandler(
  req: Request,
  res: Response,
): Promise<void> {
  // Auth: shared secret in Authorization header
  const apiKey = process.env.RATS_API_KEY;
  const authHeader = req.headers.authorization;
  if (
    !apiKey ||
    !authHeader ||
    !safeStringEqual(authHeader, `Bearer ${apiKey}`)
  ) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { userId, groupId } = req.query as Record<string, string | undefined>;

  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "userId query parameter is required" });
    return;
  }
  if (!groupId || typeof groupId !== "string") {
    res.status(400).json({ error: "groupId query parameter is required" });
    return;
  }

  try {
    const RESULT_LIMIT = 100;
    const db = admin.firestore();
    const snapshot = await db
      .collection("meetingInstances")
      .where("groupId", "==", groupId)
      .where("attendees", "array-contains", userId)
      .orderBy("scheduledAt", "desc")
      .limit(RESULT_LIMIT)
      .get();

    const checkIns = snapshot.docs.map((doc) => {
      const data = doc.data();
      const scheduledAt: Date | null = data.scheduledAt?.toDate?.() ?? null;
      return {
        instanceId: doc.id,
        meetingId: (data.meetingId as string) ?? null,
        scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
        attendeeCount: (data.attendeeCount as number) ?? 0,
      };
    });

    const truncated = checkIns.length === RESULT_LIMIT;

    logger.info(`getMeetingAttendance: returned ${checkIns.length} check-ins`, {
      method: req.method,
      path: req.path,
    });

    res.status(200).json({
      userId,
      groupId,
      checkIns,
      count: checkIns.length,
      truncated,
    });
  } catch (err) {
    logger.error("getMeetingAttendance error", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

export const getMeetingAttendance = onRequest(
  { cpu: 0.5, memory: "256MiB", timeoutSeconds: 30, region: "us-central1" },
  getMeetingAttendanceHandler,
);
