/**
 * One-off audit: find groups showing the write-ordering corruption
 * signature from before the Wave 8 fix — isClaimed true, admins
 * non-empty, but stripeSubscriptionId null. Read-only; does not
 * repair anything (this is a detection tool, not a migration).
 *
 * Background: prior to the Wave 8 fix, requestAdminAccessWithSubscription
 * could grant admins/isClaimed and only later (non-atomically) write the
 * Stripe subscription fields, so a crash or error between those two writes
 * could leave a group permanently claimed with no linked subscription.
 * The fix makes both writes happen atomically in one transaction, but it
 * does not retroactively repair groups already affected. Run this once,
 * shortly after the fix deploys, to find any such pre-existing groups for
 * manual follow-up.
 *
 * Run with: npx ts-node auditCorruptedGroupClaims.ts (from homegroups/scripts/)
 */
import * as admin from "firebase-admin";
import { CONFIG } from "./shared-types";

function initializeFirebaseAdmin(): admin.app.App {
  try {
    console.log("Initializing Firebase Admin SDK...");
    return admin.initializeApp({
      credential: admin.credential.cert(require(CONFIG.SERVICE_ACCOUNT_PATH)),
    });
  } catch (error: any) {
    console.error("Firebase Admin SDK initialization failed:", error);
    process.exit(1);
  }
}

async function auditCorruptedGroupClaims() {
  const app = initializeFirebaseAdmin();
  const db = admin.firestore(app);

  const groupsRef = db.collection(CONFIG.GROUPS_COLLECTION);

  console.log(
    "Querying groups where isClaimed=true and stripeSubscriptionId=null...",
  );

  const snapshot = await groupsRef
    .where("isClaimed", "==", true)
    .where("stripeSubscriptionId", "==", null)
    .get();

  if (snapshot.empty) {
    console.log("No groups found matching the corruption signature.");
    return;
  }

  // Firestore has no native "array non-empty" query, so filter admins
  // client-side to exclude groups that are legitimately mid-flight on a
  // first claim attempt (isClaimed could theoretically be true with no
  // admins yet in some transitional states — filter those out here).
  const corruptedGroups = snapshot.docs.filter((doc) => {
    const admins = doc.data().admins;
    return Array.isArray(admins) && admins.length > 0;
  });

  if (corruptedGroups.length === 0) {
    console.log(
      `Found ${snapshot.size} group(s) with isClaimed=true, stripeSubscriptionId=null, ` +
        "but none had a non-empty admins array. No corruption signature detected.",
    );
    return;
  }

  console.log(
    `Found ${corruptedGroups.length} group(s) matching the corruption signature ` +
      "(isClaimed=true, admins non-empty, stripeSubscriptionId=null):",
  );
  for (const doc of corruptedGroups) {
    const data = doc.data();
    console.log(
      `  ${doc.id}: admins=${JSON.stringify(data.admins)}, subscriptionStatus=${data.subscriptionStatus}`,
    );
  }
  console.log(
    "\nFor each group above, manually look up the admin's Stripe customer by userId/email " +
      "and relink stripeSubscriptionId if a valid subscription exists.",
  );
}

auditCorruptedGroupClaims()
  .then(() => {
    console.log("Audit script finished successfully.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Audit script failed:", error);
    process.exit(1);
  });
