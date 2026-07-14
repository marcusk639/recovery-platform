/**
 * One-off audit: find groups showing the write-ordering corruption
 * signature from before the Wave 8 fix — isClaimed true, admins
 * non-empty, but stripeSubscriptionId missing or null. Read-only; does
 * not repair anything (this is a detection tool, not a migration).
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

  console.log("Querying groups where isClaimed=true...");

  // Firestore's `== null` filter matches only documents where the field is
  // EXPLICITLY set to null — it does NOT match documents where the field is
  // absent entirely. The corruption this script hunts for (a crash between
  // the "grant admin" write and the "write Stripe fields" write, back when
  // those were separate) leaves stripeSubscriptionId ABSENT, not null — so
  // a `.where("stripeSubscriptionId", "==", null)` filter would silently
  // return zero of the actual target documents. Query on isClaimed alone
  // and filter both stripeSubscriptionId-missing and admins-non-empty
  // client-side instead.
  const snapshot = await groupsRef.where("isClaimed", "==", true).get();

  if (snapshot.empty) {
    console.log("No claimed groups found.");
    return;
  }

  const corruptedGroups = snapshot.docs.filter((doc) => {
    const data = doc.data();
    const admins = data.admins;
    const hasNoSubscription =
      data.stripeSubscriptionId === null ||
      data.stripeSubscriptionId === undefined;
    return hasNoSubscription && Array.isArray(admins) && admins.length > 0;
  });

  if (corruptedGroups.length === 0) {
    console.log(
      `Found ${snapshot.size} claimed group(s), but none matched the corruption ` +
        "signature (missing/null stripeSubscriptionId with a non-empty admins array). " +
        "No corruption signature detected.",
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
