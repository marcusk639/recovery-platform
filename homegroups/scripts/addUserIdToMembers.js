#!/usr/bin/env node

const admin = require("firebase-admin");
const path = require("path");
const readline = require("readline");
const fs = require("fs");
const { program } = require("commander");
const serviceAccount = require("./recovery-connect.json");

// Set up command line options
program
  .name("addUserIdToMembers")
  .description(
    "Ensure all member documents have userId field extracted from their ID"
  )
  .option("-m, --migrate", "Run migration")
  .option(
    "-d, --dry-run",
    "Show what would be migrated without actually updating"
  )
  .option("-s, --service-account <path>", "Path to service account JSON file")
  .parse(process.argv);

const options = program.opts();

// If no options provided, show help
if (!options.migrate) {
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

// Function to add userId field to member documents
async function addUserIdToMembers({ dryRun = false } = {}) {
  console.log("Starting member userId migration...");

  // Track migration progress
  const migrationResults = {
    totalMembersChecked: 0,
    membersUpdated: 0,
    membersSkipped: 0,
    failedMembers: [],
  };

  try {
    // Get all members from top-level collection
    const membersSnapshot = await admin.firestore().collection("members").get();
    migrationResults.totalMembersChecked = membersSnapshot.size;
    console.log(`Found ${membersSnapshot.size} member documents to process`);

    // Batch processing for performance
    const batchSize = 500;
    let batch = admin.firestore().batch();
    let operationCount = 0;
    let batchCount = 0;

    // Process each member document
    for (const memberDoc of membersSnapshot.docs) {
      const docId = memberDoc.id;
      const memberData = memberDoc.data();

      try {
        // Extract userId from document ID (format: groupId_userId)
        const docIdParts = docId.split("_");

        // Ensure the document ID has the expected format
        if (docIdParts.length < 2) {
          console.warn(
            `Document ID ${docId} doesn't match expected format (groupId_userId). Skipping.`
          );
          migrationResults.membersSkipped++;
          continue;
        }

        // The userId should be everything after the first underscore
        // This handles cases where the userId itself might contain underscores
        const groupId = docIdParts[0];
        const userId = docIdParts.slice(1).join("_");

        // Check if userId already exists and is correct
        if (memberData.userId === userId) {
          // Document already has correct userId field
          migrationResults.membersSkipped++;
          continue;
        }

        console.log(
          `Updating member document ${docId}: Setting userId to ${userId}`
        );

        if (dryRun) {
          console.log(
            `DRY RUN: Would set userId=${userId} for document ${docId}`
          );
          migrationResults.membersUpdated++;
          continue;
        }

        // Update the document with the extracted userId
        batch.update(memberDoc.ref, { userId: userId });
        operationCount++;
        migrationResults.membersUpdated++;

        // If batch gets too large, commit and start a new one
        if (operationCount >= batchSize) {
          await batch.commit();
          console.log(
            `Committed batch ${++batchCount} with ${operationCount} operations`
          );
          batch = admin.firestore().batch();
          operationCount = 0;
        }
      } catch (error) {
        console.error(`Error processing member document ${docId}:`, error);
        migrationResults.failedMembers.push(docId);
      }
    }

    // Commit any remaining operations
    if (operationCount > 0 && !dryRun) {
      await batch.commit();
      console.log(
        `Committed final batch ${++batchCount} with ${operationCount} operations`
      );
    }

    console.log("\nMigration summary:");
    console.log(
      `Total member documents checked: ${migrationResults.totalMembersChecked}`
    );
    console.log(`Members updated: ${migrationResults.membersUpdated}`);
    console.log(
      `Members skipped (already had correct userId): ${migrationResults.membersSkipped}`
    );
    console.log(`Failed members: ${migrationResults.failedMembers.length}`);

    if (dryRun) {
      console.log("\nTHIS WAS A DRY RUN. No documents were modified.");
    }

    // Save migration results to file for reference
    if (!dryRun) {
      fs.writeFileSync(
        `userId-migration-results-${new Date()
          .toISOString()
          .replace(/[:.]/g, "-")}.json`,
        JSON.stringify(migrationResults, null, 2)
      );
    }

    return migrationResults;
  } catch (error) {
    console.error("Error in migration:", error);
    throw error;
  }
}

// Main execution
async function main() {
  try {
    if (options.migrate) {
      if (!options.dryRun) {
        const confirmed = await confirm(
          "This will update member documents to ensure they have a userId field. Continue?"
        );
        if (!confirmed) {
          console.log("Migration cancelled.");
          process.exit(0);
        }
      }

      await addUserIdToMembers({ dryRun: options.dryRun });
    }

    console.log("Done!");
    process.exit(0);
  } catch (error) {
    console.error("Error executing script:", error);
    process.exit(1);
  }
}

main();
