import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db, messaging } from "../utils/firebase"; // Import db and messaging
import * as admin from "firebase-admin";

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: admin.firestore.Timestamp;
  groupId: string;
  mentionedUserIds?: string[];
}

interface SendMentionData {
  groupId: string;
  messageId: string;
  message: ChatMessage;
}

export const sendMentionNotifications = onCall(
  async (request: CallableRequest<SendMentionData>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }
    const callerId = request.auth.uid;

    const snap = request.data;
    if (!snap || !snap.groupId || !snap.messageId || !snap.message) {
      logger.error("Invalid mention notification request data");
      throw new HttpsError(
        "invalid-argument",
        "Missing required mention data.",
      );
    }

    if (typeof snap.groupId !== "string" || snap.groupId.trim() === "") {
      throw new HttpsError("invalid-argument", "Invalid groupId.");
    }
    if (typeof snap.messageId !== "string" || snap.messageId.trim() === "") {
      throw new HttpsError("invalid-argument", "Invalid messageId.");
    }

    const { groupId, messageId } = snap;

    // Verify the caller is a member of the group before trusting anything
    // else about this request — membership doc IDs are {groupId}_{userId}.
    const memberSnap = await db
      .collection("members")
      .doc(`${groupId}_${callerId}`)
      .get();
    if (!memberSnap.exists) {
      throw new HttpsError(
        "permission-denied",
        "You are not a member of this group.",
      );
    }

    // Derive sender identity server-side — never trust client-supplied
    // senderId/senderName, which would let any caller spoof another user.
    const callerDoc = await db.collection("users").doc(callerId).get();
    const senderName = callerDoc.data()?.displayName || "Someone";
    const messageText = snap.message.text || "";

    logger.info(
      `New message ${messageId} in group ${groupId}. Checking for mentions.`,
    );

    // mentionedUserIds still comes from client data (the message payload),
    // but recipients are cross-checked against actual group membership below
    // so an attacker can't target arbitrary UIDs outside the group.
    const rawMentionedUserIds = snap.message.mentionedUserIds ?? [];
    const candidateRecipients = rawMentionedUserIds.filter(
      (uid) => uid !== callerId,
    );
    if (candidateRecipients.length === 0) {
      logger.info("No valid recipients found for mention notification.");
      return { success: true, sentCount: 0 };
    }

    const recipientMemberSnaps = await Promise.all(
      candidateRecipients.map((uid) =>
        db.collection("members").doc(`${groupId}_${uid}`).get(),
      ),
    );
    const recipients = candidateRecipients.filter(
      (_, i) => recipientMemberSnaps[i].exists,
    );
    if (recipients.length === 0) {
      logger.info(
        "No valid in-group recipients found for mention notification.",
      );
      return { success: true, sentCount: 0 };
    }
    logger.info(`Recipients for notification: ${recipients.join(", ")}`);

    const tokens: string[] = [];
    const userPromises = recipients.map((userId) =>
      db.collection("users").doc(userId).get(),
    );
    const userDocs = await Promise.all(userPromises);
    userDocs.forEach((doc) => {
      if (doc.exists) {
        const userData = doc.data();
        const groupNotificationEnabled =
          userData?.notificationSettings?.groupChatMentions !== false;
        const globalEnabled =
          userData?.notificationSettings?.allowPushNotifications !== false;
        if (
          groupNotificationEnabled &&
          globalEnabled &&
          userData?.fcmTokens &&
          Array.isArray(userData.fcmTokens)
        ) {
          tokens.push(...userData.fcmTokens);
        }
      }
    });
    if (tokens.length === 0) {
      logger.info("No valid FCM tokens found for recipients.");
      return { success: true, sentCount: 0 }; // Return successfully if no tokens
    }

    const groupSnap = await db.collection("groups").doc(groupId).get();
    const groupName = groupSnap.data()?.name || "a group";
    const truncatedMessage =
      messageText.length > 100
        ? messageText.substring(0, 97) + "..."
        : messageText;

    // Use imported messaging service
    try {
      const response = await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: `New Mention in ${groupName}`,
          body: `${senderName}: ${truncatedMessage}`,
        },
        data: {
          type: "chat_mention",
          groupId: groupId,
          messageId: messageId,
          senderName: senderName,
        },
        // Add APNS/Android config if needed
      });
      logger.info(`Sent ${response.successCount} mention notifications.`);
      if (response.failureCount > 0) {
        logger.warn(
          `Failed to send ${response.failureCount} mention notifications.`,
        );
        // Additional logging of failures if desired
      }
      return { success: true, sentCount: response.successCount };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error("Error sending push notification:", error);
      throw new HttpsError("internal", "Failed to send mention notifications.");
    }
  },
);
