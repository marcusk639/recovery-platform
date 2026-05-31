import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import { db, messaging } from "../../utils/firebase";
import { MeetingInstanceDocument } from "../../entities/Meeting";

interface MemberData {
  userId: string;
  name: string;
}

interface UserData {
  fcmTokens?: string[];
  notificationSettings?: {
    meetings?: boolean;
    allowPushNotifications?: boolean;
  };
}

/**
 * Get FCM tokens for all group members with meeting notifications enabled
 * Handles batching for groups with more than 10 members (Firestore 'in' query limit)
 *
 * NOTE: Members are stored in the top-level "members" collection with document IDs
 * formatted as {groupId}_{userId}. Query by groupId field.
 */
async function getGroupMemberTokens(groupId: string): Promise<string[]> {
  const membersSnapshot = await db
    .collection("members")
    .where("groupId", "==", groupId)
    .get();

  const memberUserIds = membersSnapshot.docs
    .map((doc) => {
      const data = doc.data() as MemberData;
      // Prefer userId from data; fallback to doc ID (format: {groupId}_{userId})
      if (data.userId) return data.userId;
      const parts = doc.id.split("_");
      return parts.length >= 2 ? parts.slice(1).join("_") : null;
    })
    .filter((id): id is string => Boolean(id));

  const tokens: string[] = [];

  // Batch in groups of 10 (Firestore 'in' query limit)
  for (let i = 0; i < memberUserIds.length; i += 10) {
    const batch = memberUserIds.slice(i, i + 10);

    if (batch.length === 0) continue;

    const usersSnapshot = await db
      .collection("users")
      .where("__name__", "in", batch)
      .get();

    usersSnapshot.docs.forEach((doc) => {
      const userData = doc.data() as UserData;
      const meetingsEnabled =
        userData.notificationSettings?.meetings !== false;
      const pushEnabled =
        userData.notificationSettings?.allowPushNotifications !== false;

      if (meetingsEnabled && pushEnabled && userData.fcmTokens?.length) {
        tokens.push(...userData.fcmTokens);
      }
    });
  }

  return tokens;
}

/**
 * Cloud Function triggered when a meeting instance is updated
 * Sends push notifications when:
 * - Meeting is cancelled
 * - Meeting time changes
 * - Meeting location changes
 */
export const onMeetingInstanceUpdate = functionsV1.firestore
  .document("meetingInstances/{instanceId}")
  .onUpdate(async (change, context) => {
    const instanceId = context.params.instanceId;
    const before = change.before.data() as MeetingInstanceDocument;
    const after = change.after.data() as MeetingInstanceDocument;

    // Check for significant changes
    const wasCancelled = !before.isCancelled && after.isCancelled;

    const timeChanged =
      before.scheduledAt?.toMillis() !== after.scheduledAt?.toMillis();

    const locationChanged =
      before.location !== after.location ||
      before.address !== after.address;

    // Skip if no significant change
    if (!wasCancelled && !locationChanged && !timeChanged) {
      return null;
    }

    const groupId = after.groupId;
    const meetingName = after.name;

    functions.logger.info(
      `Meeting instance ${instanceId} changed: cancelled=${wasCancelled}, time=${timeChanged}, location=${locationChanged}`
    );

    try {
      // Get group name
      const groupDoc = await db.collection("groups").doc(groupId).get();
      if (!groupDoc.exists) {
        functions.logger.error(`Group ${groupId} not found`);
        return null;
      }
      const groupName = groupDoc.data()?.name || "Your Group";

      // Get FCM tokens for group members
      const tokens = await getGroupMemberTokens(groupId);

      if (tokens.length === 0) {
        functions.logger.info(
          "No eligible FCM tokens found for meeting change notification"
        );
        return null;
      }

      // Build notification content
      let title: string;
      let body: string;

      if (wasCancelled) {
        title = `❌ Meeting Cancelled`;
        body = `${meetingName} has been cancelled.`;
        if (after.instanceNotice) {
          body += ` Note: ${after.instanceNotice}`;
        }
      } else if (timeChanged) {
        const newTime = after.scheduledAt?.toDate().toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });
        const newDate = after.scheduledAt?.toDate().toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
        title = `📅 Meeting Rescheduled`;
        body = `${meetingName} moved to ${newDate} at ${newTime}.`;
      } else if (locationChanged) {
        const newLocation = after.location || after.address || "a new location";
        title = `📍 Location Changed`;
        body = `${meetingName} has moved to ${newLocation}.`;
      } else {
        // Should not reach here
        return null;
      }

      // Send notifications
      const response = await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: `${title} - ${groupName}`,
          body,
        },
        data: {
          type: "meeting_change",
          groupId: groupId,
          instanceId: instanceId,
          changeType: wasCancelled
            ? "cancelled"
            : timeChanged
            ? "time_changed"
            : "location_changed",
        },
        android: {
          priority: "high",
          notification: {
            channelId: "meetings",
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
        `Sent ${response.successCount} meeting change notifications for instance ${instanceId}`
      );

      if (response.failureCount > 0) {
        functions.logger.warn(
          `Failed to send ${response.failureCount} meeting change notifications`
        );
        // Log specific failures for debugging
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            functions.logger.warn(
              `Failed to send to token ${idx}: ${resp.error?.message}`
            );
          }
        });
      }

      return null;
    } catch (error) {
      functions.logger.error(
        `Error sending meeting change notifications for instance ${instanceId}:`,
        error
      );
      return null;
    }
  });
