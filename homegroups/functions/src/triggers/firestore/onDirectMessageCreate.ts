import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import { db, messaging } from "../../utils/firebase";

interface DirectMessageData {
  senderId: string;
  senderName: string;
  text?: string;
  sentAt: FirebaseFirestore.Timestamp;
}

interface UserData {
  fcmTokens?: string[];
  displayName?: string;
  notificationSettings?: {
    allowPushNotifications?: boolean;
  };
  mutedThreads?: string[];
}

interface ThreadData {
  participants: string[];
}

/**
 * Cloud Function triggered when a new direct message is created.
 * Sends a push notification to the recipient, unless they have muted
 * the thread. The check uses the recipient's mutedThreads array in their
 * user document.
 *
 * Firestore path:
 *   direct_message_threads/{threadId}/messages/{messageId}
 */
export const onDirectMessageCreate = functionsV1.firestore
  .document(
    "direct_message_threads/{threadId}/messages/{messageId}"
  )
  .onCreate(async (snap, context) => {
    const { threadId, messageId } = context.params;
    const messageData = snap.data() as DirectMessageData;
    const senderId = messageData.senderId;

    functions.logger.info(
      `New DM ${messageId} in thread ${threadId} from ${senderId}`
    );

    try {
      // Get thread document to determine recipient
      const threadDoc = await db
        .collection("direct_message_threads")
        .doc(threadId)
        .get();

      if (!threadDoc.exists) {
        functions.logger.warn(`Thread ${threadId} not found`);
        return null;
      }

      const threadData = threadDoc.data() as ThreadData;
      const participants: string[] = threadData.participants || [];

      // Determine recipient (the participant who is NOT the sender)
      const recipientId = participants.find((uid) => uid !== senderId);
      if (!recipientId) {
        functions.logger.info(
          `No recipient found in thread ${threadId} (participants: ${participants.join(", ")})`
        );
        return null;
      }

      // Fetch recipient's user document
      const recipientDoc = await db
        .collection("users")
        .doc(recipientId)
        .get();

      if (!recipientDoc.exists) {
        functions.logger.warn(`Recipient user ${recipientId} not found`);
        return null;
      }

      const recipientData = recipientDoc.data() as UserData;

      // Check if recipient has muted this thread
      const mutedThreads: string[] = recipientData.mutedThreads || [];
      if (mutedThreads.includes(threadId)) {
        functions.logger.info(
          `Thread ${threadId} is muted by ${recipientId}, skipping push notification`
        );
        return null;
      }

      // Check notification preferences
      const pushEnabled =
        recipientData.notificationSettings?.allowPushNotifications !== false;
      if (!pushEnabled) {
        functions.logger.info(
          `Push notifications disabled for recipient ${recipientId}`
        );
        return null;
      }

      // Get FCM tokens
      const tokens: string[] = recipientData.fcmTokens || [];
      if (tokens.length === 0) {
        functions.logger.info(
          `No FCM tokens found for recipient ${recipientId}`
        );
        return null;
      }

      // Build notification payload
      const senderName = messageData.senderName || "Someone";
      const messageText = messageData.text || "Sent you a message";
      const truncatedText =
        messageText.length > 100
          ? messageText.substring(0, 97) + "..."
          : messageText;

      // Send notification
      const response = await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: senderName,
          body: truncatedText,
        },
        data: {
          type: "direct_message",
          threadId,
          messageId,
          senderId,
          senderName,
        },
        android: {
          priority: "high",
          notification: {
            channelId: "direct_messages",
            priority: "high",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            },
          },
        },
      });

      functions.logger.info(
        `Sent ${response.successCount} DM notifications for thread ${threadId}`
      );

      if (response.failureCount > 0) {
        functions.logger.warn(
          `Failed to send ${response.failureCount} DM notifications for thread ${threadId}`
        );
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            functions.logger.warn(
              `Failed token ${idx}: ${resp.error?.message}`
            );
          }
        });
      }

      return null;
    } catch (error) {
      functions.logger.error(
        `Error sending DM notification for thread ${threadId}:`,
        error
      );
      return null;
    }
  });
