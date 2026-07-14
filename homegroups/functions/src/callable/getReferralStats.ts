import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import { requireAuth } from "../utils/callableWrapper";

export const getReferralStats = onCall(
  async (request: CallableRequest<Record<string, never>>) => {
    const userId = requireAuth(request);

    try {
      // Fetch user doc to get code
      const userSnap = await db.collection("users").doc(userId).get();
      const userData = userSnap.exists ? userSnap.data() : null;
      const code: string | null = userData?.referralCode || null;

      // If user has no code, return empty stats
      if (!code) {
        return {
          code: null,
          totalReferrals: 0,
          conversions: 0,
          rewardsEarned: 0,
        };
      }

      // Fetch all referrals where this user is the referrer
      const referralsSnap = await db
        .collection("referrals")
        .where("referrerId", "==", userId)
        .get();

      const referrals = referralsSnap.docs.map((doc) => doc.data());

      const totalReferrals = referrals.length;
      const conversions = referrals.filter(
        (r) => r.status === "converted",
      ).length;
      // Each conversion with rewardApplied = 1 month earned
      const rewardsEarned = referrals.filter(
        (r) => r.status === "converted" && r.rewardApplied === true,
      ).length;

      return {
        code,
        totalReferrals,
        conversions,
        rewardsEarned,
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error("Error in getReferralStats:", error);
      throw new HttpsError("internal", "Failed to fetch referral stats.");
    }
  },
);
