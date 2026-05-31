/**
 * Scheduled Admin Request Processor
 *
 * Runs periodically to process timed admin requests:
 * - Auto-approves requests that have passed their autoApproveAt date
 * - Sends reminder notifications for requests approaching auto-approval
 * - Updates admin activity statuses
 */

import * as functionsV1 from "firebase-functions/v1";
import * as functions from "firebase-functions";
import {db, messaging} from "../../utils/firebase";
import * as admin from "firebase-admin";

// Run every hour
const SCHEDULE = "every 1 hours";

// Notification reminder thresholds (days before auto-approve)
const REMINDER_THRESHOLDS = [3, 1]; // Send reminders at 3 days and 1 day

interface PendingAdminRequest {
  uid: string;
  requestedAt: admin.firestore.Timestamp;
  message?: string;
  requesterName?: string;
  autoApproveAt?: admin.firestore.Timestamp;
  escalationLevel: "normal" | "timed" | "instant";
  notificationsSent: number;
}

interface GroupDocument {
  id: string;
  name: string;
  admins: string[];
  adminUids?: string[];
  adminDetails?: {
    uid: string;
    addedAt: admin.firestore.Timestamp;
    lastActiveAt: admin.firestore.Timestamp;
    activityStatus: "active" | "inactive" | "dormant";
  }[];
  pendingAdminRequests: PendingAdminRequest[];
  isClaimed: boolean;
}

interface UserDocument {
  displayName?: string;
  fcmTokens?: string[];
  notificationSettings?: {
    allowPushNotifications?: boolean;
  };
}

/**
 * Process timed admin requests that have reached their auto-approve date
 */
export const scheduledAdminRequestProcessor = functionsV1.pubsub
  .schedule(SCHEDULE)
  .timeZone("America/Los_Angeles")
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();

    functions.logger.info("Starting admin request processing", {
      timestamp: now.toDate().toISOString(),
    });

    try {
      // Find all groups with pending admin requests
      const groupsSnapshot = await db
        .collection("groups")
        .where("pendingAdminRequests", "!=", [])
        .get();

      let autoApproved = 0;
      let remindersSent = 0;

      for (const groupDoc of groupsSnapshot.docs) {
        const groupData = groupDoc.data() as GroupDocument;
        const groupId = groupDoc.id;
        const pendingRequests = groupData.pendingAdminRequests || [];

        let updatedRequests = [...pendingRequests];
        let requestsChanged = false;

        for (let i = 0; i < pendingRequests.length; i++) {
          const request = pendingRequests[i];

          // Skip non-timed requests
          if (request.escalationLevel !== "timed" || !request.autoApproveAt) {
            continue;
          }

          const autoApproveTime = request.autoApproveAt.toMillis();
          const nowTime = now.toMillis();

          // Check if auto-approve time has passed
          if (nowTime >= autoApproveTime) {
            // Auto-approve this request
            await autoApproveRequest(groupId, groupData, request);
            autoApproved++;

            // Remove from pending requests
            updatedRequests = updatedRequests.filter(
              (r) => r.uid !== request.uid
            );
            requestsChanged = true;
          } else {
            // Check if we should send a reminder
            const daysUntilApprove =
              (autoApproveTime - nowTime) / (1000 * 60 * 60 * 24);

            for (const threshold of REMINDER_THRESHOLDS) {
              // Send reminder if we're within threshold and haven't sent this reminder yet
              if (
                daysUntilApprove <= threshold &&
                request.notificationsSent < REMINDER_THRESHOLDS.length -
                  REMINDER_THRESHOLDS.indexOf(threshold)
              ) {
                await sendReminderToAdmins(
                  groupId,
                  groupData,
                  request,
                  Math.ceil(daysUntilApprove)
                );

                // Update notification count
                updatedRequests[i] = {
                  ...request,
                  notificationsSent: request.notificationsSent + 1,
                };
                requestsChanged = true;
                remindersSent++;
                break;
              }
            }
          }
        }

        // Update the group if requests changed
        if (requestsChanged) {
          await db.collection("groups").doc(groupId).update({
            pendingAdminRequests: updatedRequests,
            updatedAt: now,
          });
        }
      }

      functions.logger.info("Admin request processing complete", {
        autoApproved,
        remindersSent,
        groupsProcessed: groupsSnapshot.size,
      });

      return null;
    } catch (error) {
      functions.logger.error("Error processing admin requests:", error);
      throw error;
    }
  });

/**
 * Auto-approve an admin request
 */
async function autoApproveRequest(
  groupId: string,
  groupData: GroupDocument,
  request: PendingAdminRequest
): Promise<void> {
  const now = admin.firestore.Timestamp.now();
  const batch = db.batch();

  // Add user to admins
  const groupRef = db.collection("groups").doc(groupId);
  batch.update(groupRef, {
    admins: admin.firestore.FieldValue.arrayUnion(request.uid),
    adminUids: admin.firestore.FieldValue.arrayUnion(request.uid),
    adminDetails: admin.firestore.FieldValue.arrayUnion({
      uid: request.uid,
      addedAt: now,
      lastActiveAt: now,
      activityStatus: "active",
    }),
    isClaimed: true,
    pendingAdminRequests: admin.firestore.FieldValue.arrayRemove(request),
    updatedAt: now,
  });

  // Update user's admin groups
  const userRef = db.collection("users").doc(request.uid);
  batch.update(userRef, {
    adminGroups: admin.firestore.FieldValue.arrayUnion(groupId),
    updatedAt: now,
  });

  await batch.commit();

  // Send notification to the new admin
  await sendApprovalNotification(
    request.uid,
    groupId,
    groupData.name,
    true // isAutoApproved
  );

  // Notify group members about the new admin
  await notifyGroupMembersOfNewAdmin(
    groupId,
    groupData,
    request.requesterName || "A user"
  );

  functions.logger.info("Auto-approved admin request", {
    groupId,
    userId: request.uid,
  });
}

/**
 * Send reminder notification to existing admins
 */
async function sendReminderToAdmins(
  groupId: string,
  groupData: GroupDocument,
  request: PendingAdminRequest,
  daysRemaining: number
): Promise<void> {
  const admins = groupData.admins || [];
  if (admins.length === 0) return;

  const tokens: string[] = [];

  for (const adminId of admins) {
    try {
      const userDoc = await db.collection("users").doc(adminId).get();
      if (!userDoc.exists) continue;

      const userData = userDoc.data() as UserDocument;
      if (
        userData.notificationSettings?.allowPushNotifications !== false &&
        userData.fcmTokens?.length
      ) {
        tokens.push(...userData.fcmTokens);
      }
    } catch {
      // Skip this admin
    }
  }

  if (tokens.length === 0) return;

  const urgencyText =
    daysRemaining <= 1 ? "URGENT: " : daysRemaining <= 3 ? "Reminder: " : "";

  await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: `${urgencyText}Admin Request Pending`,
      body: `${request.requesterName || "Someone"} requested admin access to ${
        groupData.name
      }. Auto-approves in ${daysRemaining} day${daysRemaining > 1 ? "s" : ""}.`,
    },
    data: {
      type: "admin_request_reminder",
      groupId,
      requesterId: request.uid,
      daysRemaining: String(daysRemaining),
    },
    android: {
      priority: "high",
      notification: {
        channelId: "admin_requests",
        priority: daysRemaining <= 1 ? "max" : "high",
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

  functions.logger.info("Sent admin request reminder", {
    groupId,
    requesterId: request.uid,
    daysRemaining,
    adminCount: admins.length,
  });
}

/**
 * Send notification to user about their request being approved
 */
async function sendApprovalNotification(
  userId: string,
  groupId: string,
  groupName: string,
  isAutoApproved: boolean
): Promise<void> {
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) return;

    const userData = userDoc.data() as UserDocument;
    const tokens = userData.fcmTokens || [];

    if (tokens.length === 0) return;

    const title = isAutoApproved
      ? "🎉 Admin Access Granted (Auto-Approved)"
      : "🎉 Admin Access Granted";
    const body = isAutoApproved
      ? `Your admin request for ${groupName} was auto-approved as no response was received.`
      : `You are now an admin of ${groupName}.`;

    await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title,
        body,
      },
      data: {
        type: "admin_request_approved",
        groupId,
        groupName,
        isAutoApproved: String(isAutoApproved),
      },
      android: {
        priority: "high",
        notification: {
          channelId: "admin_requests",
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
  } catch (error) {
    functions.logger.error("Error sending approval notification:", error);
  }
}

/**
 * Notify group members about a new admin
 */
async function notifyGroupMembersOfNewAdmin(
  groupId: string,
  groupData: GroupDocument,
  newAdminName: string
): Promise<void> {
  try {
    // Get members of the group
    const membersSnapshot = await db
      .collection("members")
      .where("groupId", "==", groupId)
      .get();

    if (membersSnapshot.empty) return;

    const tokens: string[] = [];
    const admins = groupData.admins || [];

    for (const memberDoc of membersSnapshot.docs) {
      const memberId = memberDoc.data().userId;
      if (!memberId || admins.includes(memberId)) continue;

      try {
        const userDoc = await db.collection("users").doc(memberId).get();
        if (!userDoc.exists) continue;

        const userData = userDoc.data() as UserDocument;
        if (
          userData.notificationSettings?.allowPushNotifications !== false &&
          userData.fcmTokens?.length
        ) {
          tokens.push(...userData.fcmTokens);
        }
      } catch {
        // Skip this member
      }
    }

    if (tokens.length === 0) return;

    await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: `New Admin for ${groupData.name}`,
        body: `${newAdminName} is now an admin of the group.`,
      },
      data: {
        type: "new_admin_announcement",
        groupId,
        groupName: groupData.name,
      },
      android: {
        priority: "normal",
        notification: {
          channelId: "group_updates",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
    });
  } catch (error) {
    functions.logger.error("Error notifying members of new admin:", error);
  }
}

