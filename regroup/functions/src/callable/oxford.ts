import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { z } from "zod";
import { STRIPE_SECRET_KEY, TierKey } from "../config";
import {
  swapSubscriptionItemPrice,
  getSubscriptionItemInterval,
} from "../api/stripe";
import { resolveTierPriceId } from "../util/tierPricing";
import { enforceHouseEntitlement } from "../util/entitlement";
import {
  getHouse,
  getUser,
  houseCollection,
  userCollection,
  guestCollection,
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

    // Changing the plan shape is product usage, not a route back to paying.
    // A lapsed operator should fix billing, not re-price their subscription.
    await enforceHouseEntitlement(house, houseId);

    const operatorId = house.superAdminId;
    const user = await getUser(operatorId);
    const meta = user?.subscriptionMetadata;
    if (!meta?.subscriptionItemId || !meta.tier) {
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

    // The tier model bills a single flat-fee line item; Oxford vs traditional is
    // a price swap on that item, resolved for the tier the operator is actually on.
    const subscriptionItemId = meta.subscriptionItemId;
    const tier = meta.tier as TierKey;
    const billingInterval = await getSubscriptionItemInterval(
      subscriptionItemId,
    );
    const newPriceId = resolveTierPriceId(
      enabled ? "oxford" : "traditional",
      tier,
      billingInterval,
    );
    const rollbackPriceId = resolveTierPriceId(
      enabled ? "traditional" : "oxford",
      tier,
      billingInterval,
    );

    // Step 1: Stripe swap. Firestore is never touched if this throws.
    await swapSubscriptionItemPrice(subscriptionItemId, newPriceId);
    logger.info("setOxfordEnabled: Stripe price swapped", {
      houseId,
      enabled,
      subscriptionItemId,
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
        await swapSubscriptionItemPrice(subscriptionItemId, rollbackPriceId);
        logger.info("setOxfordEnabled: Stripe rollback succeeded", { houseId });
      } catch (rollbackErr) {
        // Stripe is now out of sync with intended state. Operator must be notified.
        logger.error(
          "setOxfordEnabled: CRITICAL — Stripe rollback failed. Manual reconciliation required.",
          {
            houseId,
            operatorId,
            subscriptionItemId,
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

const castOxfordVoteSchema = z.object({
  houseId: z.string().min(1),
  voteId: z.string().min(1),
  choice: z.enum(["yes", "no", "abstain"]),
});

// ─────────────────────────────────────────────────────────────────────────────
// castOxfordVote
//
// The mobile client used to write votes/{voteId} directly from a client-side
// Firestore transaction, with only "isGuestOrAdmin(houseId) && houseOxfordActive"
// enforced by firestore.rules — no field-level scoping. Since anonymous ballots
// carry no signed identity in the vote document itself, a client (or a modified
// build, or a raw Firestore write) could set `results`/`voterIds` to anything:
// inflate a tally, remove its own guestId from `voterIds` to re-vote, or edit
// another guest's `individualVotes` entry. The client-side "already voted" check
// was real code, but it was never a security boundary — only this server-side
// path is, because it resolves the caller's guestId from `request.auth.uid`
// itself rather than trusting whatever guestId a mobile payload claims to be
// voting as. firestore.rules now denies direct client writes to `votes/{voteId}`
// entirely; this callable (Admin SDK) is the only writer.
// ─────────────────────────────────────────────────────────────────────────────
export const castOxfordVote = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required");

  const { houseId, voteId, choice } = parseInput(
    castOxfordVoteSchema,
    request.data,
  ) as {
    houseId: string;
    voteId: string;
    choice: "yes" | "no" | "abstain";
  };

  const house = await getHouse(houseId);
  if (!house) throw new HttpsError("not-found", "House not found");

  if (house.houseType !== "oxford") {
    throw new HttpsError(
      "failed-precondition",
      "Oxford voting is not active for this house",
    );
  }
  // Shared entitlement gate. Replaces an inline active/trialing check, which
  // denied a past_due house still inside its grace window and could not be
  // overridden by the paywall kill switch.
  await enforceHouseEntitlement(house, houseId);

  // The `guest` custom claim only proves the caller is A guest of this house
  // (houseId -> true), not which guest doc is theirs — resolve that server-side
  // rather than trusting a guestId the client might supply.
  const callerIsAdmin =
    request.auth.token.admin?.[houseId] === true ||
    request.auth.token.superAdmin?.[houseId] === true;
  const callerIsGuest = request.auth.token.guest?.[houseId] === true;
  if (!callerIsAdmin && !callerIsGuest) {
    throw new HttpsError("permission-denied", "Not a member of this house");
  }

  const guestSnap = await guestCollection
    .where("houseId", "==", houseId)
    .where("userId", "==", request.auth.uid)
    .limit(1)
    .get();
  if (guestSnap.empty) {
    throw new HttpsError(
      "permission-denied",
      "No guest record found for this house",
    );
  }
  const guestId = guestSnap.docs[0].id;

  const voteRef = houseCollection.doc(houseId).collection("votes").doc(voteId);

  await ratsFirestore.runTransaction(async (transaction) => {
    const voteDoc = await transaction.get(voteRef);
    if (!voteDoc.exists) {
      throw new HttpsError("not-found", `Vote ${voteId} not found`);
    }

    const voteData = voteDoc.data()!;
    const isAnonymous = voteData.isAnonymous ?? false;
    const voterIds: string[] = voteData.voterIds ?? [];
    const hasVoted = voterIds.includes(guestId);

    if (isAnonymous && hasVoted) {
      throw new HttpsError(
        "failed-precondition",
        "You have already voted on this poll.",
      );
    }

    const previousChoice = isAnonymous
      ? undefined
      : voteData.individualVotes?.[guestId];

    const updatedResults = { ...voteData.results };
    if (previousChoice) {
      updatedResults[previousChoice] =
        (updatedResults[previousChoice] || 1) - 1;
    }
    updatedResults[choice] = (updatedResults[choice] || 0) + 1;

    const updatePayload: Record<string, unknown> = {
      results: updatedResults,
    };
    if (!isAnonymous) {
      updatePayload[`individualVotes.${guestId}`] = choice;
    }
    if (!hasVoted) {
      updatePayload.voterIds = [...voterIds, guestId];
    }

    transaction.update(
      voteRef,
      updatePayload as FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
    );
  });

  logger.info("castOxfordVote: vote recorded", { houseId, voteId, guestId });
  return { success: true };
});
