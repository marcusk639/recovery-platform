import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { z } from "zod";
import { STRIPE_SECRET_KEY } from "../config";
import {
  OXFORD_PRICE_ID,
  HOUSE_PRICE_ID,
  swapSubscriptionItemPrice,
} from "../api/stripe";
import {
  getHouse,
  getUser,
  houseCollection,
  userCollection,
  ratsFirestore,
} from "../api/firestore";
import { parseInput } from "../validation";

const setOxfordEnabledSchema = z.object({
  houseId: z.string().min(1),
  enabled: z.boolean(),
});

// ─────────────────────────────────────────────────────────────────────────────
// setOxfordEnabled
//
// Atomically toggles Oxford-House mode for a house and its operator:
//   1. Authorises — caller must be the house superAdminId (subscription owner)
//   2. Swaps Stripe subscription item price (HOUSE↔OXFORD) — Firestore untouched
//      if this fails
//   3. Batch-writes houseType + subscriptionMetadata.oxfordEnabled to Firestore
//   4. If Firestore batch fails, rolls back the Stripe price swap
//
// This is the single source of truth for Oxford billing state.
// Both the house doc (houseType: "oxford") and the user doc
// (subscriptionMetadata.oxfordEnabled: true) must agree — this CF is the only
// place that writes them together.
// ─────────────────────────────────────────────────────────────────────────────
export const setOxfordEnabled = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Login required");

    const { houseId, enabled } = parseInput(
      setOxfordEnabledSchema,
      request.data,
    ) as {
      houseId: string;
      enabled: boolean;
    };

    const house = await getHouse(houseId);
    if (!house) throw new HttpsError("not-found", "House not found");

    if (house.superAdminId !== request.auth.uid) {
      throw new HttpsError(
        "permission-denied",
        "Only the house owner can change the Oxford subscription",
      );
    }

    const operatorId = house.superAdminId;
    const user = await getUser(operatorId);
    if (!user?.subscriptionMetadata?.items?.houseItemId) {
      throw new HttpsError(
        "failed-precondition",
        "No active subscription — subscribe before enabling Oxford",
      );
    }

    const currentlyOxford = house.houseType === "oxford";
    if (currentlyOxford === enabled) {
      logger.info("setOxfordEnabled: no change needed", { houseId, enabled });
      return { success: true, changed: false };
    }

    const newPriceId = enabled ? OXFORD_PRICE_ID : HOUSE_PRICE_ID;
    const rollbackPriceId = enabled ? HOUSE_PRICE_ID : OXFORD_PRICE_ID;
    const houseItemId = user.subscriptionMetadata.items.houseItemId;

    // Step 1: Stripe swap. Firestore is never touched if this throws.
    await swapSubscriptionItemPrice(houseItemId, newPriceId);
    logger.info("setOxfordEnabled: Stripe price swapped", {
      houseId,
      enabled,
      houseItemId,
      newPriceId,
    });

    // Step 2: Atomic Firestore batch. Roll back Stripe if this fails.
    try {
      const batch = ratsFirestore.batch();
      batch.update(houseCollection.doc(houseId), {
        houseType: enabled ? "oxford" : "traditional",
      });
      batch.update(userCollection.doc(operatorId), {
        "subscriptionMetadata.oxfordEnabled": enabled,
        "subscriptionMetadata.lastUpdatedAt": new Date().toISOString(),
      });
      await batch.commit();
    } catch (firestoreErr) {
      logger.error(
        "setOxfordEnabled: Firestore batch failed — rolling back Stripe",
        {
          houseId,
          operatorId,
          error: (firestoreErr as Error).message,
        },
      );
      try {
        await swapSubscriptionItemPrice(houseItemId, rollbackPriceId);
        logger.info("setOxfordEnabled: Stripe rollback succeeded", { houseId });
      } catch (rollbackErr) {
        // Stripe is now out of sync with intended state. Operator must be notified.
        logger.error(
          "setOxfordEnabled: CRITICAL — Stripe rollback failed. Manual reconciliation required.",
          {
            houseId,
            operatorId,
            houseItemId,
            intendedPriceId: rollbackPriceId,
            rollbackError: (rollbackErr as Error).message,
          },
        );
      }
      throw new HttpsError("internal", "Failed to update Oxford status");
    }

    logger.info("setOxfordEnabled: complete", { houseId, operatorId, enabled });
    return { success: true, changed: true };
  },
);
