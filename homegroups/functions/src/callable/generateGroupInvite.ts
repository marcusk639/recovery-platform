import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import { APP_BASE_URL } from "../utils/appConfig";
import * as admin from "firebase-admin";
import { requireAuth } from "../utils/callableWrapper";

interface GenerateInviteData {
  groupId: string;
}

// Rate limiting constants
const MAX_PENDING_INVITES_PER_USER = 10;
const RATE_LIMIT_WINDOW_HOURS = 24;

// Characters for code generation (excludes confusing chars: I, O, 0, 1, L)
const CODE_CHARACTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MAX_CODE_GENERATION_ATTEMPTS = 10;

/**
 * Generates a random invite code
 */
function generateRandomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARACTERS.charAt(
      Math.floor(Math.random() * CODE_CHARACTERS.length),
    );
  }
  return code;
}

export const generateGroupInvite = onCall(
  async (request: CallableRequest<GenerateInviteData>) => {
    const { groupId } = request.data;
    const inviterUid = requireAuth(request);

    if (!groupId) {
      throw new HttpsError("invalid-argument", "Group ID is required.");
    }

    const webLinkBase = `${APP_BASE_URL}/`;

    try {
      // Fetch group and membership in parallel
      const [groupSnap, memberSnap] = await Promise.all([
        db.collection("groups").doc(groupId).get(),
        db.collection("members").doc(`${groupId}_${inviterUid}`).get(),
      ]);

      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "Group not found.");
      }

      if (!memberSnap.exists) {
        throw new HttpsError(
          "permission-denied",
          "You must be a member of this group to generate invites.",
        );
      }

      const groupData = groupSnap.data();

      // Rate limiting: Check for recent pending invites from this user
      const rateLimitWindowStart = new Date(
        Date.now() - RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000,
      );
      const recentInvitesSnap = await db
        .collection("groupInvites")
        .where("inviterUid", "==", inviterUid)
        .where("status", "==", "pending")
        .where(
          "createdAt",
          ">",
          admin.firestore.Timestamp.fromDate(rateLimitWindowStart),
        )
        .get();

      if (recentInvitesSnap.size >= MAX_PENDING_INVITES_PER_USER) {
        throw new HttpsError(
          "resource-exhausted",
          `You have reached the limit of ${MAX_PENDING_INVITES_PER_USER} pending invites. Please wait for existing invites to be used or expire.`,
        );
      }

      // Generate a unique code using a transaction to prevent race conditions
      let code: string = "";
      const expiresAt = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      );

      await db.runTransaction(async (transaction) => {
        // Try to generate a unique code
        let attempts = 0;
        let codeIsUnique = false;

        while (!codeIsUnique && attempts < MAX_CODE_GENERATION_ATTEMPTS) {
          code = generateRandomCode();

          // Check if code already exists
          const existingInviteSnap = await db
            .collection("groupInvites")
            .where("code", "==", code)
            .limit(1)
            .get();

          if (existingInviteSnap.empty) {
            codeIsUnique = true;
          }
          attempts++;
        }

        if (!codeIsUnique) {
          throw new HttpsError(
            "internal",
            "Unable to generate a unique invite code. Please try again.",
          );
        }

        // Create the invite document within the transaction
        const inviteRef = db.collection("groupInvites").doc();
        transaction.set(inviteRef, {
          code: code,
          groupId: groupId,
          groupName: groupData?.name || "Unknown Group",
          inviterUid: inviterUid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: expiresAt,
          status: "pending",
          // Invite analytics
          shareCount: 0,
          viewCount: 0,
          joinCount: 0,
          shareMethods: {},
        });
      });

      const link = `${webLinkBase}join?code=${code}`;

      logger.info(
        `Generated invite code ${code} and link ${link} for group ${groupId} by user ${inviterUid}`,
      );
      return { code, link };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error("Error in generateGroupInvite:", error);
      throw new HttpsError("internal", "Failed to generate group invite.");
    }
  },
);
