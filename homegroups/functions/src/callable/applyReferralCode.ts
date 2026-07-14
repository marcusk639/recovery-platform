import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import * as admin from "firebase-admin";
import { stripe } from "../utils/stripe";
import { requireAuth } from "../utils/callableWrapper";

// Referred groups receive a 90-day extended trial instead of the standard trial
const REFERRAL_TRIAL_DAYS = 90;

interface ApplyReferralCodeData {
  code: string;
  groupId: string;
}

export const applyReferralCode = onCall(
  async (request: CallableRequest<ApplyReferralCodeData>) => {
    const { code, groupId } = request.data;
    const userId = requireAuth(request);

    if (!code || typeof code !== "string") {
      throw new HttpsError("invalid-argument", "Referral code is required.");
    }
    if (!groupId) {
      throw new HttpsError("invalid-argument", "Group ID is required.");
    }

    const normalizedCode = code.trim().toUpperCase();

    try {
      // Look up the referral code document (document ID = code)
      const codeSnap = await db
        .collection("referral_codes")
        .doc(normalizedCode)
        .get();

      if (!codeSnap.exists) {
        throw new HttpsError("not-found", "Referral code not found.");
      }

      const codeData = codeSnap.data()!;

      if (!codeData.isActive) {
        throw new HttpsError(
          "failed-precondition",
          "This referral code is no longer active.",
        );
      }

      // Prevent self-referral
      if (codeData.creatorId === userId) {
        throw new HttpsError(
          "failed-precondition",
          "You cannot use your own referral code.",
        );
      }

      // Prevent the same user from using a code twice
      const existingReferralSnap = await db
        .collection("referrals")
        .where("code", "==", normalizedCode)
        .where("referredUserId", "==", userId)
        .limit(1)
        .get();

      if (!existingReferralSnap.empty) {
        throw new HttpsError(
          "already-exists",
          "You have already used this referral code.",
        );
      }

      // Verify the group exists
      const groupSnap = await db.collection("groups").doc(groupId).get();
      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "Group not found.");
      }

      // Create the referral document
      const referralRef = db.collection("referrals").doc();
      const now = admin.firestore.FieldValue.serverTimestamp();

      await referralRef.set({
        id: referralRef.id,
        code: normalizedCode,
        referrerId: codeData.creatorId,
        referrerGroupId: codeData.creatorGroupId,
        referredUserId: userId,
        referredGroupId: groupId,
        status: "pending",
        rewardApplied: false,
        createdAt: now,
      });

      // Increment the uses counter on the referral code and store code on the group
      await Promise.all([
        db
          .collection("referral_codes")
          .doc(normalizedCode)
          .update({
            uses: admin.firestore.FieldValue.increment(1),
          }),
        // Store referralCode on the group for webhook lookup
        db.collection("groups").doc(groupId).update({
          referralCode: normalizedCode,
          referralTrialDays: REFERRAL_TRIAL_DAYS,
          updatedAt: now,
        }),
      ]);

      // If the referred group already has an active Stripe subscription in trialing
      // status, extend the trial to 90 days from now.
      const groupSnap2 = await db.collection("groups").doc(groupId).get();
      const groupData2 = groupSnap2.data();
      const stripeSubscriptionId = groupData2?.stripeSubscriptionId as
        string | undefined;

      if (stripeSubscriptionId) {
        try {
          const newTrialEnd =
            Math.floor(Date.now() / 1000) + REFERRAL_TRIAL_DAYS * 24 * 60 * 60;
          await stripe.subscriptions.update(stripeSubscriptionId, {
            trial_end: newTrialEnd,
            proration_behavior: "none",
          });
          logger.info(
            `Extended trial to ${REFERRAL_TRIAL_DAYS} days for group ${groupId} subscription ${stripeSubscriptionId}`,
          );
        } catch (stripeErr) {
          // Log but do not fail the referral code application
          logger.error(
            `Failed to extend trial for group ${groupId} subscription ${stripeSubscriptionId}:`,
            stripeErr,
          );
        }
      }

      logger.info(
        `Referral code ${normalizedCode} applied by user ${userId} for group ${groupId}`,
      );

      return { success: true, referralId: referralRef.id };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error("Error in applyReferralCode:", error);
      throw new HttpsError("internal", "Failed to apply referral code.");
    }
  },
);
