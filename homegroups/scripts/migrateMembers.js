#!/usr/bin/env node

const admin = require("firebase-admin");
const path = require("path");
const readline = require("readline");
const fs = require("fs");
const { program } = require("commander");
const serviceAccount = require("./recovery-connect.json");

// Set up command line options
program
  .name("migrateMembers")
  .description(
    "Migrate group members from subcollections to top-level members collection"
  )
  .option("-m, --migrate", "Run migration")
  .option("-c, --cleanup", "Run cleanup after successful migration")
  .option("-s, --service-account <path>", "Path to service account JSON file")
  .option(
    "-d, --dry-run",
    "Show what would be migrated without actually migrating"
  )
  .parse(process.argv);

const options = program.opts();

// If no options provided, show help
if (!options.migrate && !options.cleanup) {
  program.help();
}

// Initialize Firebase Admin with service account if provided
if (serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} else {
  // Try to use application default credentials
  try {
    admin.initializeApp();
  } catch (error) {
    console.error("Error initializing Firebase Admin SDK:", error);
    console.error(
      "Please provide a service account file with --service-account option"
    );
    process.exit(1);
  }
}

// Function to confirm with user before proceeding
async function confirm(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}

// Function to migrate members
async function migrateMembers({ dryRun = false } = {}) {
  console.log("Starting member migration...");

  // Track migration progress
  const migrationResults = {
    totalGroups: 0,
    totalMembers: 0,
    failedGroups: [],
    failedMembers: [],
  };

  try {
    // Get all groups
    const groupsSnapshot = await admin.firestore().collection("groups").get();
    migrationResults.totalGroups = groupsSnapshot.size;
    console.log(`Found ${groupsSnapshot.size} groups to process`);

    if (dryRun) {
      console.log("DRY RUN: Would migrate members from these groups:");
      groupsSnapshot.docs.forEach((doc) =>
        console.log(`- ${doc.id}: ${doc.data().name || "Unnamed group"}`)
      );
      return migrationResults;
    }

    // Batch processing for performance
    const batchSize = 500;
    let batch = admin.firestore().batch();
    let operationCount = 0;
    let batchCount = 0;

    // Process each group
    for (const groupDoc of groupsSnapshot.docs) {
      const groupId = groupDoc.id;
      const groupName = groupDoc.data().name || "Unnamed group";
      console.log(`Processing group ${groupId}: ${groupName}`);

      try {
        // Get all members of this group
        const membersSnapshot = await admin
          .firestore()
          .collection("groups")
          .doc(groupId)
          .collection("members")
          .get();

        console.log(
          `Found ${membersSnapshot.size} members in group ${groupName}`
        );

        // Process each member
        for (const memberDoc of membersSnapshot.docs) {
          const userId = memberDoc.id;
          const memberData = memberDoc.data();
          const memberName = memberData.displayName || userId;

          try {
            // Create new document in top-level members collection
            const memberRef = admin
              .firestore()
              .collection("members")
              .doc(`${groupId}_${userId}`);

            // Prepare member data for new collection
            const newMemberData = {
              ...memberData,
              groupId: groupId,
            };

            // Add to batch
            batch.set(memberRef, newMemberData);
            operationCount++;
            migrationResults.totalMembers++;

            // If batch gets too large, commit and start a new one
            if (operationCount >= batchSize) {
              await batch.commit();
              console.log(
                `Committed batch ${++batchCount} with ${operationCount} operations`
              );
              batch = admin.firestore().batch();
              operationCount = 0;
            }
          } catch (memberError) {
            console.error(
              `Error migrating member ${userId} (${memberName}) in group ${groupId}:`,
              memberError
            );
            migrationResults.failedMembers.push({ groupId, userId });
          }
        }
      } catch (groupError) {
        console.error(`Error processing group ${groupId}:`, groupError);
        migrationResults.failedGroups.push(groupId);
      }
    }

    // Commit any remaining operations
    if (operationCount > 0) {
      await batch.commit();
      console.log(
        `Committed final batch ${++batchCount} with ${operationCount} operations`
      );
    }

    console.log("\nMigration summary:");
    console.log(`Total groups processed: ${migrationResults.totalGroups}`);
    console.log(`Total members migrated: ${migrationResults.totalMembers}`);
    console.log(`Failed groups: ${migrationResults.failedGroups.length}`);
    console.log(`Failed members: ${migrationResults.failedMembers.length}`);

    // Save migration results to file for reference
    fs.writeFileSync(
      `migration-results-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.json`,
      JSON.stringify(migrationResults, null, 2)
    );

    return migrationResults;
  } catch (error) {
    console.error("Error in migration:", error);
    throw error;
  }
}

// Function to cleanup member subcollections
async function cleanupMemberSubcollections() {
  console.log("\nStarting cleanup of member subcollections...");

  const confirmed = await confirm(
    "⚠️  WARNING: This will permanently delete all member subcollections. Are you sure?"
  );
  if (!confirmed) {
    console.log("Cleanup cancelled.");
    return;
  }

  // Require double confirmation
  const doubleConfirmed = await confirm(
    '⚠️  FINAL WARNING: This action cannot be undone. Type "yes" to confirm:'
  );
  if (!doubleConfirmed) {
    console.log("Cleanup cancelled.");
    return;
  }

  // Track cleanup progress
  const cleanupResults = {
    totalGroups: 0,
    totalMembersDeleted: 0,
    failedGroups: [],
  };

  try {
    // Get all groups
    const groupsSnapshot = await admin.firestore().collection("groups").get();
    cleanupResults.totalGroups = groupsSnapshot.size;
    console.log(`Found ${groupsSnapshot.size} groups to clean up`);

    // Process each group
    for (const groupDoc of groupsSnapshot.docs) {
      const groupId = groupDoc.id;
      const groupName = groupDoc.data().name || "Unnamed group";
      console.log(`Cleaning up group ${groupId}: ${groupName}`);

      try {
        // Get all members of this group
        const membersSnapshot = await admin
          .firestore()
          .collection("groups")
          .doc(groupId)
          .collection("members")
          .get();

        console.log(
          `Found ${membersSnapshot.size} members to delete in group ${groupName}`
        );

        // Delete each member document in subcollection
        const batch = admin.firestore().batch();
        let batchCount = 0;

        for (const memberDoc of membersSnapshot.docs) {
          const memberRef = admin
            .firestore()
            .collection("groups")
            .doc(groupId)
            .collection("members")
            .doc(memberDoc.id);

          batch.delete(memberRef);
          cleanupResults.totalMembersDeleted++;
          batchCount++;

          // Firestore has a limit of 500 operations per batch
          if (batchCount >= 500) {
            await batch.commit();
            batchCount = 0;
          }
        }

        // Commit remaining deletes
        if (batchCount > 0) {
          await batch.commit();
        }
      } catch (groupError) {
        console.error(`Error cleaning up group ${groupId}:`, groupError);
        cleanupResults.failedGroups.push(groupId);
      }
    }

    console.log("\nCleanup summary:");
    console.log(`Total groups processed: ${cleanupResults.totalGroups}`);
    console.log(`Total members deleted: ${cleanupResults.totalMembersDeleted}`);
    console.log(`Failed groups: ${cleanupResults.failedGroups.length}`);

    // Save cleanup results to file for reference
    fs.writeFileSync(
      `cleanup-results-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
      JSON.stringify(cleanupResults, null, 2)
    );

    return cleanupResults;
  } catch (error) {
    console.error("Error in cleanup:", error);
    throw error;
  }
}

// Main execution
async function main() {
  try {
    if (options.migrate) {
      await migrateMembers({ dryRun: options.dryRun });
    }

    if (options.cleanup) {
      await cleanupMemberSubcollections();
    }

    console.log("Done!");
    process.exit(0);
  } catch (error) {
    console.error("Error executing script:", error);
    process.exit(1);
  }
}

main();
