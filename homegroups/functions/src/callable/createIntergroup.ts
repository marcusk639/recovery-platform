import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import { APP_BASE_URL } from "../utils/appConfig";
import {
  stripe,
  productIdIntergroupA,
  productIdIntergroupB,
  getDefaultPriceForProduct,
} from "../utils/stripe";
import * as admin from "firebase-admin";
import { z } from "zod";
import { requireAuth, validateData } from "../utils/callableWrapper";

interface CreateIntergroupData {
  name: string;
  type: "intergroup" | "district" | "area" | "treatment_center";
  tier: "tier_a" | "tier_b";
  description?: string;
  contactEmail?: string;
  state?: string;
  country?: string;
  successUrl?: string;
  cancelUrl?: string;
}

interface CreateIntergroupResult {
  intergroupId: string;
  checkoutUrl: string;
}

// Server-side PII guard: reject names that look like email addresses. The
// client collects a facilityName input, but defense-in-depth prevents
// regression if a caller bypasses the UI.
const createIntergroupSchema = z.object({
  name: z
    .string()
    .min(1)
    .refine((n) => !n.includes("@"), {
      message: "name must not contain an email address",
    }),
  type: z.enum(["intergroup", "district", "area", "treatment_center"], {
    errorMap: () => ({
      message:
        "Invalid type. Must be one of: intergroup, district, area, treatment_center",
    }),
  }),
  tier: z.enum(["tier_a", "tier_b"]),
  description: z.string().optional(),
  contactEmail: z.string().email().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
});

const UNLIMITED_MAX_GROUPS = 9999;

// Window for idempotency check on duplicate Stripe customer creation.
// If a pending intergroup was created within this window, we reuse it instead of
// creating a new Stripe customer + checkout session.
const PENDING_INTERGROUP_REUSE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

export const createIntergroup = onCall(
  { region: "us-central1", memory: "512MiB", timeoutSeconds: 120, cpu: 1 },
  async (
    request: CallableRequest<CreateIntergroupData>,
  ): Promise<CreateIntergroupResult> => {
    const uid = requireAuth(request);

    // successUrl/cancelUrl are validated separately below via a server-side
    // origin allow-list — that's business-logic validation Zod can't express,
    // so they're intentionally read raw here rather than through the schema.
    const { successUrl, cancelUrl } = request.data;
    const validated = validateData(createIntergroupSchema, request.data);
    const { name, type, tier, description, contactEmail, state, country } =
      validated;

    // Update this list when switching domains — see docs/LAUNCH_BLOCKERS.md
    const ALLOWED_REDIRECT_ORIGINS = [
      APP_BASE_URL,
      "https://recovery-connect-cad4b.web.app",
      "https://recovery-connect-cad4b.firebaseapp.com",
      ...(process.env.NODE_ENV !== "production"
        ? ["http://localhost:3000"]
        : []),
    ];
    const isAllowedUrl = (url: string | undefined) => {
      if (!url) return true;
      try {
        const { origin } = new URL(url);
        return ALLOWED_REDIRECT_ORIGINS.includes(origin);
      } catch {
        return false;
      }
    };
    if (!isAllowedUrl(successUrl) || !isAllowedUrl(cancelUrl))
      throw new HttpsError("invalid-argument", "Invalid redirect URL");

    const productId =
      tier === "tier_a" ? productIdIntergroupA : productIdIntergroupB;
    if (!productId)
      throw new HttpsError("internal", "Intergroup product not configured");

    // Idempotency check: look for a recent pending intergroup created by this user.
    // If one exists with a still-valid pending checkout session, return that URL
    // instead of creating a duplicate Stripe customer + checkout session.
    const cutoffMs = Date.now() - PENDING_INTERGROUP_REUSE_WINDOW_MS;
    const cutoffTimestamp = admin.firestore.Timestamp.fromMillis(cutoffMs);
    const pendingQuery = await db
      .collection("intergroups")
      .where("createdBy", "==", uid)
      .where("subscriptionStatus", "==", "incomplete")
      .where("createdAt", ">=", cutoffTimestamp)
      .limit(1)
      .get();

    if (!pendingQuery.empty) {
      const pendingDoc = pendingQuery.docs[0];
      const pendingData = pendingDoc.data();
      const pendingSessionId = pendingData?.pendingCheckoutSessionId as
        string | undefined;

      if (pendingSessionId) {
        try {
          const existingSession =
            await stripe.checkout.sessions.retrieve(pendingSessionId);
          if (existingSession.url && existingSession.status === "open") {
            return {
              intergroupId: pendingDoc.id,
              checkoutUrl: existingSession.url,
            };
          }
        } catch {
          // Session retrieval failed — fall through to delete the stale doc
        }
      }

      // No usable pending session — delete the stale doc and proceed normally
      await pendingDoc.ref.delete();
    }

    // ──────────────────────────────────────────────────────────────────────
    // Saga: track each external/Firestore resource as it's created so we can
    // roll back in reverse order on any post-customer-creation failure. Before
    // this guard, a checkout-session error or Firestore write failure left
    // orphaned Stripe customers (and sometimes sessions) stranded in the
    // Stripe account with no Firestore record to recover them from.
    // ──────────────────────────────────────────────────────────────────────
    let stripeCustomerId: string | null = null;
    let stripeSessionId: string | null = null;
    let intergroupRef: FirebaseFirestore.DocumentReference | null = null;
    let intergroupDocCreated = false;

    try {
      // Get user info and resolve price in parallel with Stripe customer creation
      const [userDoc, [customer, priceId]] = await Promise.all([
        db.collection("users").doc(uid).get(),
        (async () => {
          const resolvedPriceId = await getDefaultPriceForProduct(productId);
          const createdCustomer = await stripe.customers.create({
            metadata: { uid, intergroupName: name },
          });
          return [createdCustomer, resolvedPriceId] as const;
        })(),
      ]);
      stripeCustomerId = customer.id;

      const userEmail =
        userDoc.data()?.email ?? request.auth.token.email ?? undefined;
      const userDisplayName = userDoc.data()?.displayName ?? "";
      const maxGroups = tier === "tier_a" ? 10 : UNLIMITED_MAX_GROUPS;

      // Generate the Firestore ID before creating the session (needed for metadata/URLs)
      intergroupRef = db.collection("intergroups").doc();
      const intergroupId = intergroupRef.id;

      // Create Stripe Checkout Session BEFORE writing to Firestore
      const session = await stripe.checkout.sessions.create({
        customer: customer.id,
        mode: "subscription",
        // Omitting payment_method_types lets Stripe use Dashboard-configured payment methods
        // (equivalent to automatic_payment_methods, compatible with Stripe SDK v20)
        line_items: [{ price: priceId, quantity: 1 }],
        success_url:
          successUrl ??
          `${APP_BASE_URL}/intergroup-success?intergroupId=${intergroupId}`,
        cancel_url: cancelUrl ?? `${APP_BASE_URL}/intergroup-cancel`,
        metadata: { intergroupId, uid, tier },
      });
      stripeSessionId = session.id;

      // Guard: Stripe must return a checkout URL before we commit anything to Firestore
      if (!session.url) {
        throw new HttpsError(
          "internal",
          "Stripe did not return a checkout URL.",
        );
      }

      // Only write to Firestore after Stripe succeeds
      await intergroupRef.set({
        id: intergroupId,
        name,
        type,
        tier,
        description: description ?? null,
        contactEmail: contactEmail ?? null,
        state: state ?? null,
        country: country ?? null,
        affiliatedGroupIds: [],
        maxGroups,
        adminUids: [uid],
        stripeCustomerId: customer.id,
        stripeProductIdIntergroup: productId,
        subscriptionStatus: "incomplete",
        pendingCheckoutSessionId: session.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: uid,
      });
      intergroupDocCreated = true;

      // Add creator as owner member
      await intergroupRef
        .collection("members")
        .doc(uid)
        .set({
          userId: uid,
          displayName: userDisplayName,
          email: userEmail ?? null,
          role: "owner",
          addedAt: admin.firestore.FieldValue.serverTimestamp(),
          addedBy: uid,
        });

      return { intergroupId, checkoutUrl: session.url };
    } catch (error) {
      // Best-effort rollback in reverse creation order. Each cleanup is
      // wrapped so a single failure doesn't block the rest — we always log
      // and propagate the ORIGINAL error so the client sees the real cause.
      if (intergroupDocCreated && intergroupRef) {
        try {
          await intergroupRef.delete();
        } catch (cleanupErr) {
          logger.warn(
            "createIntergroup rollback: failed to delete intergroup doc",
            { intergroupId: intergroupRef.id, cleanupErr },
          );
        }
      }
      if (stripeSessionId) {
        try {
          await stripe.checkout.sessions.expire(stripeSessionId);
        } catch (cleanupErr) {
          logger.warn(
            "createIntergroup rollback: failed to expire Stripe session",
            { stripeSessionId, cleanupErr },
          );
        }
      }
      if (stripeCustomerId) {
        try {
          await stripe.customers.del(stripeCustomerId);
        } catch (cleanupErr) {
          logger.warn(
            "createIntergroup rollback: failed to delete Stripe customer",
            { stripeCustomerId, cleanupErr },
          );
        }
      }

      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error("createIntergroup failed", { error });
      throw new HttpsError("internal", "Failed to create intergroup.");
    }
  },
);
