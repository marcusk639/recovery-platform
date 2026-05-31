import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import * as admin from "firebase-admin";

interface GrantSponsorStepAccessData {
  sponsorId: string;
  allow: boolean;
}

/**
 * Inner handler — exported separately so tests can call it directly without
 * needing to invoke it through the Firebase onCall wrapper.
 *
 * Input:  { sponsorId: string, allow: boolean }
 * Effect: Updates users/{userId}/stepProgress/current with { sponsorId, allowSponsorAccess }
 *         If allow == true, sends a push notification to the sponsor.
 */
export async function grantSponsorStepAccessHandler(
  request: CallableRequest<GrantSponsorStepAccessData>,
): Promise<{ success: boolean }> {
  const uid = request.auth?.uid;

  if (!uid) {
    throw new HttpsError("unauthenticated", "User must be logged in.");
  }

  const { sponsorId, allow } = request.data;

  if (!sponsorId) {
    throw new HttpsError("invalid-argument", "sponsorId is required.");
  }

  if (typeof allow !== "boolean") {
    throw new HttpsError("invalid-argument", "allow must be a boolean.");
  }

  // Verify an active sponsorship relationship exists before allowing access changes
  const sponsorshipSnap = await db
    .collection("sponsorships")
    .where("sponseeId", "==", uid)
    .where("sponsorId", "==", sponsorId)
    .where("status", "==", "active")
    .limit(1)
    .get();

  if (sponsorshipSnap.empty) {
    throw new HttpsError(
      "permission-denied",
      "No active sponsorship relationship found.",
    );
  }

  // Verify the caller has a stepProgress document
  const progressRef = db
    .collection("users")
    .doc(uid)
    .collection("stepProgress")
    .doc("current");

  const progressSnap = await progressRef.get();
  if (!progressSnap.exists) {
    throw new HttpsError(
      "not-found",
      "No step progress document found. Please start your step work first.",
    );
  }

  // Update the progress document
  await progressRef.set(
    {
      sponsorId,
      allowSponsorAccess: allow,
    },
    { merge: true },
  );

  // If granting access, send a push notification to the sponsor
  if (allow) {
    try {
      // Fetch caller's display name and sponsor's FCM tokens in parallel
      const [callerSnap, sponsorSnap] = await Promise.all([
        db.collection("users").doc(uid).get(),
        db.collection("users").doc(sponsorId).get(),
      ]);

      const callerName =
        (callerSnap.exists && callerSnap.data()?.displayName) || "Someone";
      const sponsorData = sponsorSnap.exists ? sponsorSnap.data() : null;
      const fcmTokens: string[] = sponsorData?.fcmTokens ?? [];

      if (fcmTokens.length > 0) {
        const { getMessaging } = require("firebase-admin/messaging");
        const messaging = getMessaging();

        // Send to each token (best-effort; ignore individual failures)
        const sendPromises = fcmTokens.map((token: string) =>
          messaging
            .send({
              token,
              notification: {
                title: "Step Work Shared",
                body: `${callerName} has shared their step work with you.`,
              },
              data: {
                type: "step_work_shared",
                sponseeId: uid,
              },
            })
            .catch((err: Error) => {
              logger.warn(
                `Failed to send step-share notification to token ${token}:`,
                err.message,
              );
            }),
        );

        await Promise.all(sendPromises);
      }
    } catch (notifError) {
      // Notification failure should not surface to caller
      logger.error(
        "Error sending sponsor step-share notification:",
        notifError,
      );
    }
  }

  return { success: true };
}

/**
 * Firebase Cloud Function export.
 */
export const grantSponsorStepAccess = onCall(grantSponsorStepAccessHandler);
