import {
  userCollection,
  app,
  addNotification,
  getUser,
} from "../api/firestore";
import { User } from "../entities/User";
import admin from "firebase-admin";
import { InviteEmailPayload } from "../entities/Email";
import { Notification } from "../entities/Notification";
import { getTodaysDate } from "./date";
import { logger } from "firebase-functions";
import { BatchResponse } from "firebase-admin/lib/messaging/messaging-api";

interface SendNotificationParams {
  recipientId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function sendNotification(
  params: SendNotificationParams
): Promise<void> {
  const { recipientId, title, body, data } = params;
  try {
    const user = await getUser(recipientId);

    if (user === undefined || user === null) {
      throw new Error("User is undefined.");
    }

    const result = await admin.messaging(app).sendEachForMulticast({
      tokens: user.messagingToken,
      data: {
        notifee: JSON.stringify({
          body,
          title,
          data,
          android: {
            channelId: "default",
          },
        }),
      },
    });

    const tokensToRemove = await getInvalidTokensFromResult(result, user);
    await removeTokens(tokensToRemove, user);
  } catch (error) {
    logger.error(error);
  }
}

async function getInvalidTokensFromResult(
  result: BatchResponse,
  user: User
): Promise<string[]> {
  const tokensToRemove: string[] = [];
  result.responses.forEach((response, index) => {
    const error = response.error;
    if (error) {
      logger.error(
        "Failure sending notification to",
        user.messagingToken[index],
        error
      );
      // Cleanup the tokens that are not registered anymore.
      if (
        error.code === "messaging/invalid-registration-token" ||
        error.code === "messaging/registration-token-not-registered"
      ) {
        tokensToRemove.push(user.messagingToken[index]);
      }
    } else {
      logger.info("MESSAGE SENT!", response);
    }
  });

  return tokensToRemove;
}

async function removeTokens(
  tokensToRemove: string[],
  user: User
): Promise<void> {
  if (tokensToRemove && tokensToRemove.length) {
    logger.info("Updating user tokens for id", user.uid);
    user.messagingToken = user.messagingToken.filter(
      (token) => !tokensToRemove.includes(token)
    );
    await userCollection
      .doc(user.uid)
      .update({ messagingToken: user.messagingToken });
    logger.info("User tokens updated");
  }
}

/**
 * Creates a notification record for an invited admin and persists it to Firestore.
 */
export async function createInviteNotification(
  user: User,
  invite: InviteEmailPayload
) {
  const notification: Notification = {
    userId: user.uid,
    message: "You have been invited to help manage a home!",
    subject: "Admin Invite",
    date: getTodaysDate(),
    type: "invite",
    read: false,
  };
  return addNotification(notification);
}

// ---------------------------------------------------------------------------
// sendFcmToHouseAdmins — send FCM notifications to all admins of a house
//
// Used by Stripe webhook handlers and scheduled notifications (e.g. overdue
// rent). Errors are logged but never rethrown — notification failures must
// not surface as fatal errors for the caller.
//
// Admin identification follows the canonical pattern used in
// `triggers/firestore/index.ts`: read the house document and union the
// admin/owner id fields. Per-user FCM tokens live in `messagingToken`
// (string[]) on the user document — see `entities/User.ts`.
// ---------------------------------------------------------------------------

interface HouseAdminFields {
  adminIds?: string[];
  adminId?: string;
  superAdminIds?: string[];
  superAdminId?: string;
  ownerId?: string;
}

interface UserMessagingFields {
  messagingToken?: string[] | string;
}

export async function sendFcmToHouseAdmins(
  houseId: string,
  title: string,
  body: string
): Promise<void> {
  try {
    const db = admin.firestore();

    const houseDoc = await db.collection("houses").doc(houseId).get();
    if (!houseDoc.exists) {
      logger.info("sendFcmToHouseAdmins: house not found", { houseId });
      return;
    }

    const houseData = (houseDoc.data() ?? {}) as HouseAdminFields;

    // Build deduplicated set of admin user IDs from the canonical house fields.
    const adminUserIdSet = new Set<string>(
      [
        ...(houseData.adminIds ?? []),
        ...(houseData.adminId ? [houseData.adminId] : []),
        ...(houseData.superAdminIds ?? []),
        ...(houseData.superAdminId ? [houseData.superAdminId] : []),
        ...(houseData.ownerId ? [houseData.ownerId] : []),
      ].filter(Boolean)
    );

    if (adminUserIdSet.size === 0) {
      logger.info("sendFcmToHouseAdmins: no admin IDs on house", { houseId });
      return;
    }

    // Fetch admin user docs in parallel.
    const userDocs = await Promise.all(
      Array.from(adminUserIdSet).map((uid) =>
        db.collection("users").doc(uid).get()
      )
    );

    // Collect FCM tokens — canonical field is `messagingToken` (string[]).
    const tokens: string[] = [];
    userDocs.forEach((doc) => {
      if (!doc.exists) return;
      const userData = (doc.data() ?? {}) as UserMessagingFields;
      const messagingToken = userData.messagingToken;
      if (!messagingToken) return;
      if (Array.isArray(messagingToken)) {
        tokens.push(...messagingToken.filter(Boolean));
      } else if (typeof messagingToken === "string") {
        tokens.push(messagingToken);
      }
    });

    if (tokens.length === 0) {
      logger.info("sendFcmToHouseAdmins: no FCM tokens for admins", {
        houseId,
      });
      return;
    }

    const messaging = admin.messaging();
    await Promise.allSettled(
      tokens.map((token) =>
        messaging
          .send({
            token,
            notification: { title, body },
            android: { notification: { channelId: "default" } },
          })
          .catch((err: Error) => {
            logger.warn("sendFcmToHouseAdmins: token send failed (non-fatal)", {
              houseId,
              err: err.message,
            });
          })
      )
    );
  } catch (err) {
    logger.warn("sendFcmToHouseAdmins error (non-fatal)", {
      houseId,
      err: (err as Error).message,
    });
  }
}
