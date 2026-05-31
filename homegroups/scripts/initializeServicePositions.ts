#!/usr/bin/env ts-node

/**
 * Migration Script: Initialize Service Positions for Existing Groups
 *
 * This script:
 * 1. Queries all groups from Firestore
 * 2. Creates predefined service positions (Treasurer, Secretary) for each group
 *
 * Usage:
 *   npx ts-node initializeServicePositions.ts --dry-run    # Preview changes
 *   npx ts-node initializeServicePositions.ts --migrate    # Run migration
 */

import * as admin from "firebase-admin";
import { program } from "commander";

const serviceAccount = require("./recovery-connect.json");

// Predefined service positions
const PREDEFINED_POSITIONS = [
  {
    name: "Treasurer",
    description: "Manages the group's finances and treasury",
  },
  {
    name: "Secretary",
    description: "Handles group records and communications",
  },
];

interface MigrationStats {
  groupsProcessed: number;
  positionsCreated: number;
  errors: string[];
}

interface GroupData {
  id: string;
  name: string;
}

// Set up command line options
program
  .name("initializeServicePositions")
  .description("Initialize predefined service positions for existing groups")
  .option("-m, --migrate", "Run migration")
  .option(
    "-d, --dry-run",
    "Show what would be created without actually creating"
  )
  .option("-g, --group <groupId>", "Process only a specific group")
  .parse(process.argv);

const options = program.opts();

// If no options provided, show help
if (!options.migrate && !options.dryRun) {
  program.help();
}

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

/**
 * Create predefined service positions for a group
 */
async function createServicePositions(
  groupId: string,
  groupName: string,
  dryRun: boolean,
  stats: MigrationStats
): Promise<void> {
  const now = admin.firestore.Timestamp.now();
  const batch = db.batch();

  for (const position of PREDEFINED_POSITIONS) {
    const positionRef = db
      .collection("groups")
      .doc(groupId)
      .collection("servicePositions")
      .doc();

    const positionData = {
      groupId,
      name: position.name,
      description: position.description,
      commitmentLength: null,
      currentHolderId: null,
      currentHolderName: null,
      termStartDate: null,
      termEndDate: null,
      createdAt: now,
      updatedAt: now,
    };

    if (dryRun) {
      console.log(`    + Would create: ${position.name}`);
    } else {
      batch.set(positionRef, positionData);
      console.log(`    + Creating: ${position.name}`);
    }
  }

  if (!dryRun) {
    await batch.commit();
  }

  stats.positionsCreated += PREDEFINED_POSITIONS.length;
}

/**
 * Process a single group
 */
async function processGroup(
  group: GroupData,
  dryRun: boolean,
  stats: MigrationStats
): Promise<void> {
  const { id: groupId, name: groupName } = group;

  console.log(`\nProcessing group: "${groupName}" (${groupId})`);

  try {
    await createServicePositions(groupId, groupName, dryRun, stats);
    stats.groupsProcessed++;
  } catch (error) {
    const errorMsg = `Error processing group ${groupName} (${groupId}): ${error}`;
    console.error(`  ✗ ${errorMsg}`);
    stats.errors.push(errorMsg);
  }
}

/**
 * Main migration function
 */
async function runMigration(): Promise<void> {
  const dryRun = options.dryRun;
  const specificGroupId = options.group;

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Service Positions Migration Script");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Mode: ${dryRun ? "DRY RUN (no changes)" : "MIGRATION"}`);
  if (specificGroupId) {
    console.log(`  Target: Single group (${specificGroupId})`);
  } else {
    console.log("  Target: All groups");
  }
  console.log("═══════════════════════════════════════════════════════════\n");

  const stats: MigrationStats = {
    groupsProcessed: 0,
    positionsCreated: 0,
    errors: [],
  };

  try {
    if (specificGroupId) {
      const groupDoc = await db.collection("groups").doc(specificGroupId).get();
      if (!groupDoc.exists) {
        console.error(`Group not found: ${specificGroupId}`);
        process.exit(1);
      }

      const groupData = groupDoc.data() as GroupData;
      await processGroup(
        { id: groupDoc.id, name: groupData.name },
        dryRun,
        stats
      );
    } else {
      const groupsSnapshot = await db.collection("groups").get();
      console.log(`Found ${groupsSnapshot.docs.length} groups to process.\n`);

      for (const groupDoc of groupsSnapshot.docs) {
        const groupData = groupDoc.data() as GroupData;
        await processGroup(
          { id: groupDoc.id, name: groupData.name },
          dryRun,
          stats
        );
      }
    }

    // Print summary
    console.log(
      "\n═══════════════════════════════════════════════════════════"
    );
    console.log("  Migration Summary");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`  Groups processed:          ${stats.groupsProcessed}`);
    console.log(`  Service positions created: ${stats.positionsCreated}`);
    console.log(`  Errors:                    ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log("\n  Errors:");
      stats.errors.forEach((error) => console.log(`    - ${error}`));
    }

    console.log(
      "═══════════════════════════════════════════════════════════\n"
    );

    if (dryRun) {
      console.log("This was a dry run. No changes were made.");
      console.log("Run with --migrate to apply changes.\n");
    }
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

// Run the migration
runMigration()
  .then(() => {
    console.log("Migration script completed.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration script failed:", error);
    process.exit(1);
  });
