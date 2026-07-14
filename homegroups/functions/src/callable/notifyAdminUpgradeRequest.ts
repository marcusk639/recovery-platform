import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import { getMessaging } from "firebase-admin/messaging";
import * as admin from "firebase-admin";
import { z } from "zod";
import { requireAuth, validateData } from "../utils/callableWrapper";

interface NotifyAdminUpgradeRequestData {
  groupId: string;
  featureName: string;
}

const notifyAdminUpgradeRequestSchema = z.object({
  groupId: z.string().min(1),
  featureName: z.string().min(1).max(100),
});

const RATE_LIMIT_HOURS = 24;

export const notifyAdminUpgradeRequest = onCall(
  async (request: CallableRequest<NotifyAdminUpgradeRequestData>) => {
    const userId = requireAuth(request);
    // groupId/featureName presence (plus a new featureName length cap) are
    // now enforced by notifyAdminUpgradeRequestSchema; the manual truthy
    // checks they replaced are gone. Rate-limit logic below is untouched.
    const { groupId, featureName } = validateData(
      notifyAdminUpgradeRequestSchema,
      request.data,
    );

    try {
      // Verify caller is a member of the group
      const memberSnap = await db
        .collection("members")
        .doc(`${groupId}_${userId}`)
        .get();

      if (!memberSnap.exists) {
        throw new HttpsError(
          "permission-denied",
          "You must be a member of this group.",
        );
      }

      // Rate-limit: check if the same user already sent a request in the last 24h
      const upgradeRequestRef = db
        .collection("groups")
        .doc(groupId)
        .collection("upgradeRequests")
        .doc(userId);

      const upgradeRequestSnap = await upgradeRequestRef.get();

      if (upgradeRequestSnap.exists) {
        const requestData = upgradeRequestSnap.data();
        const lastRequestAt: admin.firestore.Timestamp | undefined =
          requestData?.requestedAt;

        if (lastRequestAt) {
          const cutoff = new Date(
            Date.now() - RATE_LIMIT_HOURS * 60 * 60 * 1000,
          );
          if (lastRequestAt.toDate() > cutoff) {
            throw new HttpsError(
              "resource-exhausted",
              "You have already requested an upgrade in the last 24 hours. Please try again later.",
            );
          }
        }
      }

      // Write rate-limit timestamp (server-side, not client clock)
      await upgradeRequestRef.set({
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        featureName,
        userId,
      });

      // Fetch group to get admin UIDs and group name
      const groupSnap = await db.collection("groups").doc(groupId).get();
      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "Group not found.");
      }

      const groupData = groupSnap.data();
      const groupName: string = groupData?.name || "your group";
      const adminUids: string[] =
        groupData?.admins || groupData?.adminUids || [];

      if (adminUids.length === 0) {
        // No admins — nothing to notify; return gracefully
        logger.info(
          `Group ${groupId} has no admins to notify for upgrade request.`,
        );
        return {
          success: true,
          message: "No admins to notify.",
          adminCount: 0,
        };
      }

      // Fetch requesting member's display name for richer notification
      const memberData = memberSnap.data();
      const memberName: string = memberData?.displayName || "A member";

      // Fetch FCM tokens for each admin
      const adminUserSnaps = await db
        .collection("users")
        .where(
          admin.firestore.FieldPath.documentId(),
          "in",
          adminUids.slice(0, 10),
        )
        .get();

      const tokens: string[] = [];
      for (const adminDoc of adminUserSnaps.docs) {
        const adminData = adminDoc.data();
        const fcmTokens: string[] = adminData?.fcmTokens || [];
        // Only add tokens for admins who haven't opted out
        const allowPush =
          adminData?.notificationSettings?.allowPushNotifications !== false;
        if (allowPush) {
          tokens.push(...fcmTokens);
        }
      }

      if (tokens.length === 0) {
        logger.info(`No FCM tokens available for admins of group ${groupId}.`);
        return {
          success: true,
          message: "No admin tokens available.",
          adminCount: adminUids.length,
        };
      }

      // Send push notification to all admin tokens
      const message = {
        tokens,
        notification: {
          title: `Upgrade Request — ${groupName}`,
          body: `${memberName} is asking you to upgrade to access ${featureName}.`,
        },
        data: {
          type: "upgrade_request",
          groupId,
          featureName,
          requesterId: userId,
        },
      };

      const messaging = getMessaging();
      const sendResult = await messaging.sendEachForMulticast(message);

      logger.info(
        `Upgrade request notification sent to ${sendResult.successCount}/${tokens.length} tokens for group ${groupId}`,
      );

      return {
        success: true,
        message: `Notification sent to ${sendResult.successCount} admin device(s).`,
        adminCount: adminUids.length,
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error("Error in notifyAdminUpgradeRequest:", error);
      throw new HttpsError("internal", "Failed to send upgrade request.");
    }
  },
);
