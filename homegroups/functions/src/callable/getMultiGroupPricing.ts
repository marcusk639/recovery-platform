import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import { productIdGroup, getDefaultPriceForProduct } from "../utils/stripe";

// Multi-group discount price ID.
// Set the environment variable STRIPE_PRICE_ID_GROUP_ADDITIONAL to a Stripe
// price ID representing the $8/year discounted price for additional groups.
// If not set, the function still returns the correct pricing metadata but
// callers should create the actual discounted price in the Stripe dashboard
// before enabling purchases.
//
// NOTE: This is a function (not a constant) so that the env var is read at
// call time rather than module-load time, enabling per-request env flexibility
// and clean testability with jest.resetModules().
export function getMultiGroupPriceId(): string | undefined {
  return process.env.STRIPE_PRICE_ID_GROUP_ADDITIONAL;
}

/**
 * @deprecated Use getMultiGroupPriceId() instead.
 * Kept for backward compatibility — reads env at import time.
 */
export const MULTI_GROUP_PRICE_ID: string | undefined =
  process.env.STRIPE_PRICE_ID_GROUP_ADDITIONAL;

// Pricing constants (in USD)
const FULL_PRICE_USD = 12; // $12/year for first group
const ADDITIONAL_PRICE_USD = 8; // $8/year for additional groups

interface GetMultiGroupPricingData {
  // No input required — user ID taken from auth context
}

interface GetMultiGroupPricingResult {
  fullPriceId: string;
  additionalPriceId: string | null;
  fullPriceUsd: number;
  additionalPriceUsd: number;
  existingActiveGroupCount: number;
  isFirstGroup: boolean;
  recommendedPriceId: string;
  recommendedPriceUsd: number;
}

/**
 * Count active group subscriptions for a user.
 * A group counts if the user is listed in its `admins` array AND
 * the group has subscriptionStatus === 'active'.
 */
async function countActiveAdminGroups(userId: string): Promise<number> {
  // Query the members collection for groups where this user is isAdmin: true
  const membershipSnap = await db
    .collection("members")
    .where("userId", "==", userId)
    .where("isAdmin", "==", true)
    .get();

  if (membershipSnap.empty) {
    return 0;
  }

  // Gather distinct group IDs from member docs
  const groupIds = Array.from(
    new Set(
      membershipSnap.docs
        .map((doc) => doc.data().groupId as string | undefined)
        .filter((id): id is string => !!id),
    ),
  );

  if (groupIds.length === 0) {
    return 0;
  }

  // Check subscription status for each group in batches of 10 (Firestore `in` limit)
  let activeCount = 0;
  const BATCH_SIZE = 10;

  for (let i = 0; i < groupIds.length; i += BATCH_SIZE) {
    const batch = groupIds.slice(i, i + BATCH_SIZE);
    const groupsSnap = await db
      .collection("groups")
      .where("__name__", "in", batch)
      .where("subscriptionStatus", "==", "active")
      .get();
    activeCount += groupsSnap.size;
  }

  return activeCount;
}

export const getMultiGroupPricing = onCall(
  {
    cpu: 0.5,
    memory: "256MiB",
    timeoutSeconds: 30,
    region: "us-central1",
  },
  async (
    request: CallableRequest<GetMultiGroupPricingData>,
  ): Promise<GetMultiGroupPricingResult> => {
    const userId = request.auth?.uid;

    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }

    if (!productIdGroup) {
      throw new HttpsError(
        "failed-precondition",
        "Stripe product ID for groups is not configured.",
      );
    }

    try {
      // Fetch full-price ID from the default price on the product
      const fullPriceId = await getDefaultPriceForProduct(productIdGroup);

      // Count how many active group subscriptions this user already administers
      const existingActiveGroupCount = await countActiveAdminGroups(userId);

      const isFirstGroup = existingActiveGroupCount === 0;

      // Read at call time for consistency with createGroupSubscription
      const additionalPriceId = getMultiGroupPriceId() || null;
      const recommendedPriceId =
        isFirstGroup || !additionalPriceId ? fullPriceId : additionalPriceId;
      const recommendedPriceUsd = isFirstGroup
        ? FULL_PRICE_USD
        : ADDITIONAL_PRICE_USD;

      return {
        fullPriceId,
        additionalPriceId,
        fullPriceUsd: FULL_PRICE_USD,
        additionalPriceUsd: ADDITIONAL_PRICE_USD,
        existingActiveGroupCount,
        isFirstGroup,
        recommendedPriceId,
        recommendedPriceUsd,
      };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error("Error in getMultiGroupPricing:", error);

      throw new HttpsError("internal", "Failed to fetch multi-group pricing.");
    }
  },
);
