import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import { stripe } from "../utils/stripe";
import { APP_BASE_URL } from "../utils/appConfig";

interface AccountLinkData {
  groupId: string;
}

export const createStripeAccountLink = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 60 },
  async (request: CallableRequest<AccountLinkData>) => {
    const { groupId } = request.data;
    const userId = request.auth?.uid;

    if (!stripe) {
      throw new HttpsError("internal", "Stripe not configured.");
    }
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }
    if (!groupId) {
      throw new HttpsError("invalid-argument", "Missing required parameters.");
    }

    try {
      const groupRef = db.collection("groups").doc(groupId);
      const groupSnap = await groupRef.get();

      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "Group not found.");
      }
      const groupData = groupSnap.data()!;

      const admins = groupData.admins || groupData.adminUids || [];
      if (!admins.includes(userId)) {
        throw new HttpsError(
          "permission-denied",
          "Only group admins can connect Stripe.",
        );
      }

      let accountId = groupData.stripeConnectAccountId;
      if (!accountId) {
        logger.info(`Creating new Stripe Connect account for group ${groupId}`);
        const account = await stripe.accounts.create(
          {
            type: "express",
            metadata: { groupId },
            capabilities: {
              transfers: {
                requested: true,
              },
            },
          },
          { idempotencyKey: `connect-acct-${groupId}` },
        );
        accountId = account.id;
        await groupRef.update({ stripeConnectAccountId: accountId });
        logger.info(
          `Stripe Connect account ${accountId} created for group ${groupId}`,
        );
      } else {
        logger.info(
          `Using existing Stripe Connect account ${accountId} for group ${groupId}`,
        );
      }

      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${APP_BASE_URL}/stripe-redirect?groupId=${groupId}&type=refresh`,
        return_url: `${APP_BASE_URL}/stripe-redirect?groupId=${groupId}&type=return`,
        type: "account_onboarding",
        collect: "eventually_due",
      });

      logger.info(`Created account link for ${accountId}`);
      return { url: accountLink.url };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error(
        `Error creating Stripe account link for group ${groupId}:`,
        error,
      );
      throw new HttpsError("internal", "Failed to create Stripe onboarding link.");
    }
  },
);
