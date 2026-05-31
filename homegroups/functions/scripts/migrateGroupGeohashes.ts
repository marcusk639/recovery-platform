#!/usr/bin/env ts-node

/**
 * Migration script to add geohashes to all existing groups
 *
 * This script should be run from the functions directory:
 * cd functions
 * npx ts-node scripts/migrateGroupGeohashes.ts
 *
 * Options:
 * --production : Run against production environment
 * --dry-run    : Show what would be updated without making changes
 * --debug      : Show debug logs
 * --batch=N    : Set batch size (default: 500)
 */

import * as admin from "firebase-admin";
import * as path from "path";
import { migrateGeohashes } from "../src/migrations/migrateGeohashes";

// Parse command line arguments
const args = process.argv.slice(2);
const isProduction = args.includes("--production");
const isDryRun = args.includes("--dry-run");
const isDebug = args.includes("--debug");

// Get batch size if specified
let batchSize = 500;
const batchArg = args.find((arg) => arg.startsWith("--batch="));
if (batchArg) {
  const batchValue = parseInt(batchArg.split("=")[1], 10);
  if (!isNaN(batchValue) && batchValue > 0) {
    batchSize = batchValue;
  }
}

// Determine service account path
const serviceAccountPath = isProduction
  ? path.resolve(__dirname, "../service-account-prod.json")
  : path.resolve(__dirname, "../service-account-dev.json");

// Initialize Firebase Admin with the appropriate service account
try {
  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath)),
  });
  console.log(
    `Initialized Firebase Admin with ${
      isProduction ? "production" : "development"
    } credentials`
  );
} catch (error: any) {
  console.error(`Failed to initialize Firebase Admin: ${error.message}`);
  console.error(`Make sure ${serviceAccountPath} exists and is valid`);
  console.log("\nUsage:");
  console.log("  npx ts-node scripts/migrateGroupGeohashes.ts [options]");
  console.log("\nOptions:");
  console.log("  --production  Run against production environment");
  console.log(
    "  --dry-run     Show what would be updated without making changes"
  );
  console.log("  --debug       Show debug logs");
  console.log("  --batch=N     Set batch size (default: 500)");
  process.exit(1);
}

async function runMigration() {
  console.log("=========================================================");
  console.log("Starting geohash migration...");
  console.log("=========================================================");
  console.log("Environment: " + (isProduction ? "PRODUCTION" : "DEVELOPMENT"));
  console.log(
    "Mode:        " + (isDryRun ? "DRY RUN (no changes)" : "LIVE RUN")
  );
  console.log("Logging:     " + (isDebug ? "DEBUG" : "INFO"));
  console.log("Batch size:  " + batchSize);
  console.log("--------------------------------------------------------");
  console.log("This script will:");
  console.log("- Find all groups in Firestore");
  console.log("- Generate geohashes for groups with lat/lng coordinates");
  if (!isDryRun) {
    console.log("- Update the groups with the generated geohashes");
  } else {
    console.log("- Show what would be updated (without making changes)");
  }
  console.log("- Skip groups that already have correct geohashes");
  console.log("=========================================================");

  try {
    const startTime = Date.now();
    const result = await migrateGeohashes({
      dryRun: isDryRun,
      batchSize,
      logLevel: isDebug ? "debug" : "info",
    });
    const duration = (Date.now() - startTime) / 1000;

    console.log("\n=========================================================");
    console.log(
      `Migration completed ${isDryRun ? "(DRY RUN)" : "successfully"}!`
    );
    console.log("=========================================================");
    console.log(`Total processed: ${result.processed} groups`);
    console.log(`Updated: ${result.updated} groups`);
    console.log(`Skipped: ${result.skipped} groups`);
    console.log(`Errors: ${result.errors} groups`);
    console.log(`Duration: ${duration.toFixed(2)} seconds`);
    console.log("=========================================================");

    return result;
  } catch (error: any) {
    console.error(
      "\n========================================================="
    );
    console.error("Migration failed!");
    console.error("=========================================================");
    console.error(`Error: ${error.message}`);
    console.error("Stack trace:");
    console.error(error.stack);
    console.error("=========================================================");
    process.exit(1);
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log("Migration complete!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Unhandled error in migration script:", error);
      process.exit(1);
    });
}
