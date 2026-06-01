import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import * as admin from "firebase-admin";
import { sendEmail } from "../utils/email";

interface SendInviteEmailData {
  groupId: string;
  inviteeEmail: string;
  inviteCode: string;
}

export const sendGroupInviteEmail = onCall(
  {
    cpu: 0.5,
    memory: "512MiB",
    timeoutSeconds: 60,
    region: "us-east1",
  },
  async (request: CallableRequest<SendInviteEmailData>) => {
    const { groupId, inviteeEmail, inviteCode } = request.data;
    const inviterUid = request.auth?.uid;

    if (!inviterUid) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }
    if (!groupId || !inviteeEmail || !inviteCode) {
      throw new HttpsError("invalid-argument", "Missing required fields.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteeEmail)) {
      throw new HttpsError("invalid-argument", "Invalid email format.");
    }

    try {
      const groupRef = db.collection("groups").doc(groupId);
      const inviteQuery = db
        .collection("groupInvites")
        .where("code", "==", inviteCode)
        .where("groupId", "==", groupId)
        .limit(1);
      const userRef = db.collection("users").doc(inviterUid);

      const [groupSnap, inviteSnap, userSnap] = await Promise.all([
        groupRef.get(),
        inviteQuery.get(),
        userRef.get(),
      ]);

      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "Group not found.");
      }
      if (inviteSnap.empty) {
        throw new HttpsError(
          "not-found",
          `Invite code ${inviteCode} invalid for this group.`,
        );
      }

      const groupData = groupSnap.data();
      const inviteData = inviteSnap.docs[0].data();
      const userData = userSnap.data();

      // Check if user is a member of the group (any member can send invites)
      const memberRef = db
        .collection("members")
        .doc(`${groupId}_${inviterUid}`);
      const memberSnap = await memberRef.get();

      if (!memberSnap.exists) {
        throw new HttpsError(
          "permission-denied",
          "You must be a member of this group to send invites.",
        );
      }

      if (inviteData.status !== "pending") {
        throw new HttpsError(
          "failed-precondition",
          `Invite code already ${inviteData.status}.`,
        );
      }
      if (inviteData.expiresAt.toDate() < new Date()) {
        await inviteSnap.docs[0].ref.update({ status: "expired" });
        throw new HttpsError("failed-precondition", "Invite code has expired.");
      }

      const universalLinkBase = "https://homegroups-app.com/";
      const link = `${universalLinkBase}join?code=${inviteCode}`;
      const inviterName = userData?.displayName || "A member";
      const groupName = groupData?.name || "the group";
      const subject = `Invitation to join ${groupName} on Homegroups`;
      const emailBody = `
            <p>Hello,</p>
            <p>${inviterName} has invited you to join the homegroup "${groupName}" on the Homegroups app.</p>
            <p>Homegroups helps groups stay connected and organized while respecting anonymity.</p>
            <p>To join the group, download the Homegroups app and use the invite code below, or click the link:</p>
            <p style="font-size: 1.5em; font-weight: bold; margin: 15px 0; letter-spacing: 2px;">${inviteCode}</p>
            <p><a href="${link}" style="display: inline-block; padding: 10px 15px; background-color: #2196F3; color: white; text-decoration: none; border-radius: 5px;">Join Group Now</a></p>
            <p>If the button doesn't work, copy and paste this link into your browser: <br/> ${link}</p>
            <p>This invite code expires in 7 days.</p>
            <p>If you did not expect this invitation, please ignore this email.</p>
            <br/>
            <p>Sincerely,</p>
            <p>The Homegroups Team</p>
        `;

      // Send Email
      await sendEmail({
        to: inviteeEmail,
        subject,
        html: emailBody,
      });

      await inviteSnap.docs[0].ref.update({
        emailSentTo: inviteeEmail,
        emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info("Invite email sent", { groupId, inviterUid });
      return { success: true };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error("Error in sendGroupInviteEmail", { error });
      throw new HttpsError("internal", "Failed to send group invite email.");
    }
  },
);
