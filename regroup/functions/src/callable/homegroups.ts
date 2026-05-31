import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { z } from "zod";
import { RATS_API_KEY } from "../config";
import { parseInput } from "../validation";

// RecoveryConnect endpoint — override via RC_MEETING_ATTENDANCE_URL env var
// for staging/local testing without changing code.
const RC_URL =
  process.env.RC_MEETING_ATTENDANCE_URL ??
  "https://us-central1-recovery-connect-prod.cloudfunctions.net/getMeetingAttendance";

const getMeetingAttendanceSchema = z.object({
  userId: z.string().min(1),
  groupId: z.string().min(1),
});

export interface CheckIn {
  instanceId: string;
  meetingId: string | null;
  scheduledAt: string | null;
  attendeeCount: number;
}

export interface MeetingAttendanceResult {
  userId: string;
  groupId: string;
  checkIns: CheckIn[];
  count: number;
  truncated: boolean;
}

/**
 * Asserts that the caller may access meeting attendance records for targetUserId.
 *
 * Allowed:
 *   - The resident themselves (uid === targetUserId)
 *   - Any house admin — verified by the presence of at least one entry in
 *     the `admin` custom claim. Claims are set by addGuestAuthorization /
 *     addAdminAuthorization and are up to 1 hour stale after role changes.
 */
function assertCanAccessAttendance(
  token: Record<string, unknown>,
  callerUid: string,
  targetUserId: string,
): void {
  if (callerUid === targetUserId) return;
  const adminClaims = token.admin as Record<string, unknown> | undefined;
  if (adminClaims && Object.keys(adminClaims).length > 0) return;
  throw new HttpsError(
    "permission-denied",
    "Only the resident or a house admin can view meeting attendance",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// getResidentMeetingAttendance
//
// RATS → RecoveryConnect bridge. Fetches meeting check-in history for a
// resident from RecoveryConnect's getMeetingAttendance HTTP endpoint.
//
// Authorization:
//   - Resident may fetch their own records (uid === userId)
//   - Any house admin (non-empty `admin` custom claim) may fetch for any resident
//
// The cross-project call is authenticated via a shared bearer token
// (RATS_API_KEY secret). Errors from RecoveryConnect are surfaced with
// appropriate HttpsError codes so callers get meaningful messages.
// ─────────────────────────────────────────────────────────────────────────────
export const getResidentMeetingAttendance = onCall(
  { secrets: [RATS_API_KEY] },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Login required");

    const { userId, groupId } = parseInput(
      getMeetingAttendanceSchema,
      request.data,
    ) as { userId: string; groupId: string };

    assertCanAccessAttendance(
      request.auth.token as Record<string, unknown>,
      request.auth.uid,
      userId,
    );

    const apiKey = process.env.RATS_API_KEY;
    if (!apiKey) {
      logger.error(
        "getResidentMeetingAttendance: RATS_API_KEY secret not available",
      );
      throw new HttpsError("internal", "Service configuration error");
    }

    const url = new URL(RC_URL);
    url.searchParams.set("userId", userId);
    url.searchParams.set("groupId", groupId);

    logger.info("getResidentMeetingAttendance: calling RC endpoint", {
      userId,
      groupId,
    });

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    } catch (networkErr) {
      logger.error("getResidentMeetingAttendance: network error", {
        error: (networkErr as Error).message,
      });
      throw new HttpsError("unavailable", "Could not reach attendance service");
    }

    if (response.status === 401) {
      logger.error(
        "getResidentMeetingAttendance: RC rejected API key — key mismatch or not set in RC project",
      );
      throw new HttpsError(
        "internal",
        "Attendance service authentication failed",
      );
    }

    if (!response.ok) {
      logger.error("getResidentMeetingAttendance: RC returned error", {
        status: response.status,
      });
      throw new HttpsError("internal", "Attendance service returned an error");
    }

    const data = (await response.json()) as MeetingAttendanceResult;

    logger.info("getResidentMeetingAttendance: success", {
      userId,
      groupId,
      count: data.count,
      truncated: data.truncated,
    });

    return data;
  },
);
