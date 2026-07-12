// functions/src/callable/upgradeIntergroupTier.ts
import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { APP_BASE_URL } from "../utils/appConfig";
import {
  stripe,
  productIdIntergroupB,
  getDefaultPriceForProduct,
} from "../utils/stripe";
import { logger } from "firebase-functions/v2";
import { requireAuth } from "../utils/callableWrapper";

interface UpgradeIntergroupTierData {
  intergroupId: string;
  pendingUpgradeSessionId?: string;
}

export async function upgradeIntergroupTierHandler(
  request: CallableRequest<UpgradeIntergroupTierData>,
): Promise<{ checkoutUrl: string }> {
  const userId = requireAuth(request);

  const { intergroupId, pendingUpgradeSessionId } = request.data ?? {};
  if (!intergroupId || typeof intergroupId !== "string") {
    throw new HttpsError("invalid-argument", "intergroupId is required.");
  }
  if (!productIdIntergroupB) {
    throw new HttpsError(
      "failed-precondition",
      "Intergroup tier_b product is not configured.",
    );
  }

  const db = admin.firestore();
  const intergroupRef = db.collection("intergroups").doc(intergroupId);
  const docSnap = await intergroupRef.get();

  if (!docSnap.exists) {
    throw new HttpsError("not-found", "Intergroup not found.");
  }

  const data = docSnap.data()!;

  const adminUids: string[] = data.adminUids ?? [];
  if (!adminUids.includes(userId)) {
    throw new HttpsError(
      "permission-denied",
      "Only an intergroup admin can upgrade the subscription.",
    );
  }
  if (data.tier === "tier_b") {
    throw new HttpsError(
      "failed-precondition",
      "This intergroup is already on the unlimited tier.",
    );
  }

  // Prevent duplicate checkout sessions from double-taps or retries
  if (pendingUpgradeSessionId) {
    throw new HttpsError(
      "already-exists",
      "An upgrade is already in progress. Please wait a few minutes before trying again.",
    );
  }

  const priceId = await getDefaultPriceForProduct(productIdIntergroupB);

  // Mark upgrade in progress before calling Stripe
  await intergroupRef.update({ pendingUpgradeSessionId: "pending" });

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: data.stripeCustomerId ?? undefined,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${APP_BASE_URL}/intergroup-success?intergroupId=${intergroupId}`,
    cancel_url: `${APP_BASE_URL}/intergroup-cancel`,
    metadata: {
      intergroupId,
      uid: userId,
      upgradeFrom: "tier_a",
      upgradeTo: "tier_b",
    },
  });

  logger.info(
    `upgradeIntergroupTier: checkout session created for intergroup ${intergroupId}`,
  );

  if (!session.url) {
    throw new HttpsError("internal", "Stripe did not return a checkout URL.");
  }
  return { checkoutUrl: session.url };
}

export const upgradeIntergroupTier = onCall(
  {
    cpu: 0.5,
    memory: "256MiB",
    timeoutSeconds: 60,
    region: "us-central1",
  },
  upgradeIntergroupTierHandler,
);
