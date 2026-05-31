#!/usr/bin/env npx ts-node

/**
 * Migration Script: Backfill Member Documents and Sync Custom Claims
 *
 * This script:
 * 1. Backfills all member documents with userId, isTreasurer, and roles fields
 * 2. Syncs custom claims for all users based on their memberships
 *
 * Usage:
 *   npx ts-node migrateClaimsAndRoles.ts --dry-run    # Preview changes
 *   npx ts-node migrateClaimsAndRoles.ts              # Run migration
 *   npx ts-node migrateClaimsAndRoles.ts --verbose    # Verbose output
 */

import * as admin from "firebase-admin";
import * as path from "path";
import { program } from "commander";

// Load service account credentials
const serviceAccountPath = path.join(__dirname, "recovery-connect.json");
const serviceAccount = require(serviceAccountPath);

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const auth = admin.auth();

// CLI options
program
  .name("migrateClaimsAndRoles")
  .description("Backfill member documents and sync custom claims for all users")
  .option("-d, --dry-run", "Preview changes without applying them")
  .option("-v, --verbose", "Show detailed output")
  .option("--users-only", "Only sync claims, skip member document updates")
  .option("--members-only", "Only update member documents, skip claims sync")
  .option("--batch-size <number>", "Batch size for processing", "50")
  .option("--delay <number>", "Delay in ms between batches", "1000")
  .parse(process.argv);

const options = program.opts();
const isDryRun = options.dryRun || false;
const isVerbose = options.verbose || false;
const usersOnly = options.usersOnly || false;
const membersOnly = options.membersOnly || false;
const BATCH_SIZE = parseInt(options.batchSize, 10);
const DELAY_MS = parseInt(options.delay, 10);

interface MemberData {
  userId?: string;
  groupId: string;
  isAdmin?: boolean;
  isTreasurer?: boolean;
  roles?: string[];
}

interface GroupData {
  treasurers?: string[];
  admins?: string[];
}

interface CustomClaims {
  superAdmin?: boolean;
  memberGroups: string[];
  adminGroups: string[];
  treasurerGroups: string[];
}

interface MigrationStats {
  groupsWithMembers: number;
  membersProcessed: number;
  membersUpdated: number;
  membersWithMalformedIds: number;
  usersProcessed: number;
  usersSkippedNoAuth: number;
  claimsUpdated: number;
  claimsExceededLimit: number;
  errors: string[];
}

const stats: MigrationStats = {
  groupsWithMembers: 0,
  membersProcessed: 0,
  membersUpdated: 0,
  membersWithMalformedIds: 0,
  usersProcessed: 0,
  usersSkippedNoAuth: 0,
  claimsUpdated: 0,
  claimsExceededLimit: 0,
  errors: [],
};

function log(message: string, force = false): void {
  if (force || isVerbose) {
    console.log(message);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Step 1: Backfill member documents with userId, isTreasurer, and roles fields
 */
async function backfillMemberDocuments(): Promise<void> {
  console.log("\n📋 Step 1: Backfilling member documents...\n");

  // Get all member documents first
  const membersSnapshot = await db.collection("members").get();
  console.log(`Found ${membersSnapshot.size} member documents to process`);

  if (membersSnapshot.empty) {
    console.log("No members found. Skipping member document backfill.");
    return;
  }

  // Extract unique groupIds from member documents
  const uniqueGroupIds = new Set<string>();
  membersSnapshot.docs.forEach((doc) => {
    const memberId = doc.id;
    const parts = memberId.split("_");
    if (parts.length >= 2) {
      uniqueGroupIds.add(parts[0]);
    }
  });

  stats.groupsWithMembers = uniqueGroupIds.size;
  console.log(`Found ${uniqueGroupIds.size} unique groups with members`);

  // Only fetch treasurer data for groups that have members
  const groupTreasurers = new Map<string, string[]>();
  const groupIds = Array.from(uniqueGroupIds);

  // Firestore 'in' queries are limited to 30 items, so we batch
  const GROUP_BATCH_SIZE = 30;
  for (let i = 0; i < groupIds.length; i += GROUP_BATCH_SIZE) {
    const batchGroupIds = groupIds.slice(i, i + GROUP_BATCH_SIZE);
    const groupsSnapshot = await db
      .collection("groups")
      .where(admin.firestore.FieldPath.documentId(), "in", batchGroupIds)
      .get();

    groupsSnapshot.docs.forEach((doc) => {
      const data = doc.data() as GroupData;
      groupTreasurers.set(doc.id, data.treasurers || []);
    });

    log(
      `Loaded treasurer data batch ${Math.ceil(
        (i + 1) / GROUP_BATCH_SIZE
      )}/${Math.ceil(groupIds.length / GROUP_BATCH_SIZE)}`
    );
  }

  log(
    `Loaded treasurer data for ${groupTreasurers.size} groups (only those with members)`
  );

  const batches: admin.firestore.WriteBatch[] = [];
  let currentBatch = db.batch();
  let operationsInBatch = 0;

  for (const doc of membersSnapshot.docs) {
    stats.membersProcessed++;
    const memberId = doc.id;
    const data = doc.data() as MemberData;

    // Extract groupId and userId from document ID (format: {groupId}_{userId})
    const parts = memberId.split("_");
    if (parts.length < 2) {
      stats.membersWithMalformedIds++;
      stats.errors.push(`Malformed member ID: ${memberId}`);
      log(`⚠️  Malformed member ID: ${memberId}`);
      continue;
    }

    // Handle case where groupId or userId might contain underscores
    const groupId = parts[0];
    const userId = parts.slice(1).join("_");

    // Check if document needs updating
    const needsUpdate =
      !data.userId ||
      data.userId !== userId ||
      data.isTreasurer === undefined ||
      data.roles === undefined;

    if (!needsUpdate) {
      log(`✓ Member ${memberId} already up to date`);
      continue;
    }

    // Determine treasurer status from group document
    const treasurers = groupTreasurers.get(groupId) || [];
    const isTreasurer =
      treasurers.includes(userId) || data.isTreasurer === true;

    // Build roles array
    const roles: string[] = ["member"];
    if (data.isAdmin === true) {
      roles.push("admin");
    }
    if (isTreasurer) {
      roles.push("treasurer");
    }

    const updates: Partial<MemberData> = {
      userId: userId,
      groupId: groupId,
      isTreasurer: isTreasurer,
      roles: roles,
    };

    if (isDryRun) {
      log(
        `Would update ${memberId}: userId=${userId}, isTreasurer=${isTreasurer}, roles=${roles.join(
          ","
        )}`
      );
      stats.membersUpdated++;
    } else {
      currentBatch.update(doc.ref, updates);
      operationsInBatch++;
      stats.membersUpdated++;

      // Commit batch if it's full
      if (operationsInBatch >= 500) {
        batches.push(currentBatch);
        currentBatch = db.batch();
        operationsInBatch = 0;
      }
    }
  }

  // Add final batch if it has operations
  if (operationsInBatch > 0) {
    batches.push(currentBatch);
  }

  // Commit all batches
  if (!isDryRun && batches.length > 0) {
    console.log(`\nCommitting ${batches.length} batches...`);
    for (let i = 0; i < batches.length; i++) {
      await batches[i].commit();
      console.log(`  Committed batch ${i + 1}/${batches.length}`);
      if (i < batches.length - 1) {
        await sleep(DELAY_MS);
      }
    }
  }

  console.log(`\n✅ Member document backfill complete`);
  console.log(`   Processed: ${stats.membersProcessed}`);
  console.log(`   Updated: ${stats.membersUpdated}`);
  console.log(`   Malformed IDs: ${stats.membersWithMalformedIds}`);
}

/**
 * Step 2: Sync custom claims for all users
 */
async function syncAllUserClaims(): Promise<void> {
  console.log("\n🔐 Step 2: Syncing custom claims for all users...\n");

  // Get all users
  const usersSnapshot = await db.collection("users").get();
  const totalUsers = usersSnapshot.size;
  console.log(`Found ${totalUsers} users to process`);

  // Process users in batches to avoid rate limits
  const userDocs = usersSnapshot.docs;

  for (let i = 0; i < userDocs.length; i += BATCH_SIZE) {
    const batch = userDocs.slice(i, i + BATCH_SIZE);
    console.log(
      `\nProcessing users ${i + 1}-${Math.min(
        i + BATCH_SIZE,
        totalUsers
      )}/${totalUsers}`
    );

    const promises = batch.map(async (userDoc) => {
      const userId = userDoc.id;
      stats.usersProcessed++;

      try {
        // First check if user exists in Firebase Auth
        let authUser;
        try {
          authUser = await auth.getUser(userId);
        } catch (authError: any) {
          if (authError.code === "auth/user-not-found") {
            // User document exists in Firestore but not in Auth - skip
            stats.usersSkippedNoAuth++;
            log(
              `⏭️  Skipping user ${userId} - no Firebase Auth account (orphaned Firestore document)`
            );
            return;
          }
          throw authError; // Re-throw other auth errors
        }

        // Get all member documents for this user
        const membersSnapshot = await db
          .collection("members")
          .where("userId", "==", userId)
          .get();

        // Build claims from memberships
        const claims: CustomClaims = {
          memberGroups: [],
          adminGroups: [],
          treasurerGroups: [],
        };

        membersSnapshot.docs.forEach((doc) => {
          const data = doc.data() as MemberData;
          const groupId = data.groupId;

          if (groupId) {
            claims.memberGroups.push(groupId);

            if (data.isAdmin === true || data.roles?.includes("admin")) {
              claims.adminGroups.push(groupId);
            }

            if (
              data.isTreasurer === true ||
              data.roles?.includes("treasurer")
            ) {
              claims.treasurerGroups.push(groupId);
            }
          }
        });

        // Preserve existing superAdmin claim
        const existingSuperAdmin = authUser.customClaims?.superAdmin || false;

        const newClaims: CustomClaims = {
          ...claims,
          superAdmin: existingSuperAdmin,
        };

        // Check claims size
        const claimsJson = JSON.stringify(newClaims);
        if (claimsJson.length > 800) {
          log(
            `⚠️  User ${userId} claims approaching limit: ${claimsJson.length} bytes`
          );
        }

        if (claimsJson.length > 1000) {
          stats.claimsExceededLimit++;
          log(
            `❌ User ${userId} claims exceed limit. Truncating memberGroups.`
          );
          newClaims.memberGroups = [];
        }

        if (isDryRun) {
          log(
            `Would set claims for ${userId}: memberGroups=${claims.memberGroups.length}, adminGroups=${claims.adminGroups.length}, treasurerGroups=${claims.treasurerGroups.length}`
          );
        } else {
          await auth.setCustomUserClaims(userId, newClaims);
          log(
            `✓ Set claims for ${userId}: memberGroups=${claims.memberGroups.length}, adminGroups=${claims.adminGroups.length}, treasurerGroups=${claims.treasurerGroups.length}`
          );
        }

        stats.claimsUpdated++;
      } catch (error) {
        const errorMessage = `Error syncing claims for user ${userId}: ${error}`;
        stats.errors.push(errorMessage);
        log(`❌ ${errorMessage}`);
      }
    });

    await Promise.all(promises);

    // Add delay between batches to avoid rate limits
    if (i + BATCH_SIZE < userDocs.length) {
      log(`Waiting ${DELAY_MS}ms before next batch...`);
      await sleep(DELAY_MS);
    }
  }

  console.log(`\n✅ Claims sync complete`);
  console.log(`   Users processed: ${stats.usersProcessed}`);
  console.log(`   Claims updated: ${stats.claimsUpdated}`);
  console.log(`   Claims exceeded limit: ${stats.claimsExceededLimit}`);
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("🚀 Claims and Roles Migration Script");
  console.log("=".repeat(60));

  if (isDryRun) {
    console.log("\n⚠️  DRY RUN MODE - No changes will be made\n");
  }

  console.log(`Options:`);
  console.log(`  Batch size: ${BATCH_SIZE}`);
  console.log(`  Delay between batches: ${DELAY_MS}ms`);
  console.log(`  Verbose: ${isVerbose}`);
  console.log(`  Users only: ${usersOnly}`);
  console.log(`  Members only: ${membersOnly}`);

  const startTime = Date.now();

  try {
    // Step 1: Backfill member documents
    if (!usersOnly) {
      await backfillMemberDocuments();
    }

    // Step 2: Sync custom claims
    if (!membersOnly) {
      await syncAllUserClaims();
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("\n" + "=".repeat(60));
    console.log("📊 Migration Summary");
    console.log("=".repeat(60));
    console.log(`\nDuration: ${duration} seconds`);
    console.log(`\nGroups:`);
    console.log(`  Groups with members: ${stats.groupsWithMembers}`);
    console.log(`\nMember Documents:`);
    console.log(`  Processed: ${stats.membersProcessed}`);
    console.log(`  Updated: ${stats.membersUpdated}`);
    console.log(`  Malformed IDs: ${stats.membersWithMalformedIds}`);
    console.log(`\nUser Claims:`);
    console.log(`  Processed: ${stats.usersProcessed}`);
    console.log(`  Skipped (no Auth account): ${stats.usersSkippedNoAuth}`);
    console.log(`  Updated: ${stats.claimsUpdated}`);
    console.log(`  Exceeded limit: ${stats.claimsExceededLimit}`);

    if (stats.errors.length > 0) {
      console.log(`\n⚠️  Errors (${stats.errors.length}):`);
      stats.errors.slice(0, 10).forEach((err) => console.log(`  - ${err}`));
      if (stats.errors.length > 10) {
        console.log(`  ... and ${stats.errors.length - 10} more errors`);
      }
    }

    // Save results to file
    const resultsFile = `claims-migration-results-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`;
    const fs = require("fs");
    fs.writeFileSync(
      resultsFile,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          dryRun: isDryRun,
          duration: `${duration}s`,
          stats,
        },
        null,
        2
      )
    );
    console.log(`\nResults saved to: ${resultsFile}`);

    if (isDryRun) {
      console.log(
        "\n⚠️  This was a dry run. Run without --dry-run to apply changes."
      );
    } else {
      console.log("\n✅ Migration completed successfully!");
      console.log("\n📌 Next steps:");
      console.log(
        "   1. Verify claims in Firebase Console (Authentication > Users > User > Custom Claims)"
      );
      console.log(
        "   2. Deploy security rules with: firebase deploy --only firestore:rules"
      );
    }
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  }

  process.exit(0);
}

main();
