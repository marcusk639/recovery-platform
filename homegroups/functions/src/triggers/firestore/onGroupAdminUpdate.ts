import * as functions from "firebase-functions/v1";
import { db } from "../../utils/firebase";
import {
  stripe,
  productIdGroup,
  getDefaultPriceForProduct,
} from "../../utils/stripe";
import * as admin from "firebase-admin";

export const onGroupAdminUpdate = functions.firestore
  .document("groups/{groupId}")
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    const groupId = context.params.groupId;

    const beforeAdmins = beforeData.admins || [];
    const afterAdmins = afterData.admins || [];

    // Sync member documents: update isAdmin field for all affected members
    const adminsAdded = afterAdmins.filter(
      (adminId) => !beforeAdmins.includes(adminId)
    );
    const adminsRemoved = beforeAdmins.filter(
      (adminId) => !afterAdmins.includes(adminId)
    );

    // Update member documents for newly added admins
    if (adminsAdded.length > 0) {
      const batch = db.batch();
      let updateCount = 0;
      for (const adminId of adminsAdded) {
        const memberRef = db.collection("members").doc(`${groupId}_${adminId}`);
        const memberSnap = await memberRef.get();
        if (memberSnap.exists) {
          batch.update(memberRef, { isAdmin: true });
          updateCount++;
          console.log(
            `Syncing member document: set isAdmin=true for ${groupId}_${adminId}`
          );
        } else {
          console.warn(
            `Member document ${groupId}_${adminId} does not exist. ` +
              `User may need to join the group first.`
          );
        }
      }
      if (updateCount > 0) {
        await batch.commit();
        console.log(
          `Synced ${updateCount} member document(s) for new admins in group ${groupId}`
        );
      }
    }

    // Update member documents for removed admins
    if (adminsRemoved.length > 0) {
      const batch = db.batch();
      let updateCount = 0;
      for (const adminId of adminsRemoved) {
        const memberRef = db.collection("members").doc(`${groupId}_${adminId}`);
        const memberSnap = await memberRef.get();
        if (memberSnap.exists) {
          batch.update(memberRef, { isAdmin: false });
          updateCount++;
          console.log(
            `Syncing member document: set isAdmin=false for ${groupId}_${adminId}`
          );
        }
      }
      if (updateCount > 0) {
        await batch.commit();
        console.log(
          `Synced ${updateCount} member document(s) for removed admins in group ${groupId}`
        );
      }
    }

    // Only proceed with subscription creation if admins were added (not removed)
    const hasNewAdmins = adminsAdded.length > 0;

    if (!hasNewAdmins) {
      return; // No new admins added, skip subscription creation
    }

    // Only create subscription if group doesn't already have one
    if (
      afterData.stripeSubscriptionId &&
      afterData.subscriptionStatus === "active"
    ) {
      console.log(
        `Group ${groupId} already has an active subscription, skipping creation.`
      );
      return;
    }

    try {
      console.log(
        `New admin(s) added to group ${groupId}. Creating subscription (flat rate).`
      );

      // Create or get Stripe customer
      let customerId = afterData.stripeCustomerId;
      if (!customerId) {
        console.log(`Creating Stripe customer for group ${groupId}`);
        const customer = await stripe.customers.create({
          name: afterData.name,
          metadata: { groupId: groupId },
        });
        customerId = customer.id;
      }

      // Get the default price for the group product
      if (!productIdGroup) {
        console.warn(
          `Stripe product ID for groups is not configured. Skipping subscription creation.`
        );
        return;
      }
      const groupPriceId = await getDefaultPriceForProduct(productIdGroup);
      console.log(
        `Using group price ${groupPriceId} from product ${productIdGroup}`
      );

      // Create subscription with trial period (flat rate)
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [
          {
            price: groupPriceId,
            quantity: 1, // Flat rate subscription (no per-member pricing)
          },
        ],
        metadata: {
          groupId: groupId,
          createdBy: "admin_assignment_trigger",
        },
        // Set trial period for new groups
        trial_period_days: 7, // 7-day free trial
        // Don't require payment method immediately
        payment_behavior: "default_incomplete",
        // Allow subscription to be created without payment method
        expand: ["latest_invoice.payment_intent"],
      });

      // Update group with subscription info
      await change.after.ref.update({
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        stripePriceIdGroup: groupPriceId,
        stripeProductIdGroup: productIdGroup,
        stripeSubscriptionItemId: subscription.items.data[0]?.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(
        `Successfully created subscription ${subscription.id} for group ${groupId} (flat rate)`
      );
    } catch (error) {
      console.error(`Error creating subscription for group ${groupId}:`, error);

      // Don't throw the error to avoid retrying the function
      // The subscription can be created manually if needed
    }
  });
