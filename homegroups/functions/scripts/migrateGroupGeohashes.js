#!/usr/bin/env node

/**
 * Migration script to add geohashes to all existing groups
 *
 * This script should be run from the functions directory:
 * cd functions
 * node scripts/migrateGroupGeohashes.js
 */

const admin = require("firebase-admin");
const { migrateGeohashes } = require("../lib/migrations/migrateGeohashes");

// Check if running in production mode
const isProduction = process.argv.includes("--production");
const serviceAccountPath = isProduction
  ? "./service-account-prod.json"
  : "./service-account-dev.json";

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
} catch (error) {
  console.error(`Failed to initialize Firebase Admin: ${error.message}`);
  console.error(`Make sure ${serviceAccountPath} exists and is valid`);
  console.log("\nUsage:");
  console.log(
    "  node scripts/migrateGroupGeohashes.js        # Run against development environment"
  );
  console.log(
    "  node scripts/migrateGroupGeohashes.js --production  # Run against production environment"
  );
  process.exit(1);
}

async function runMigration() {
  console.log("Starting geohash migration...");
  console.log("This script will:");
  console.log("- Find all groups in Firestore");
  console.log("- Generate geohashes for groups with lat/lng coordinates");
  console.log("- Update the groups with the generated geohashes");
  console.log("- Skip groups that already have correct geohashes\n");

  try {
    const startTime = Date.now();
    const result = await migrateGeohashes();
    const duration = (Date.now() - startTime) / 1000;

    console.log("\n=============================================");
    console.log("Migration completed successfully!");
    console.log("=============================================");
    console.log(`Total processed: ${result.processed} groups`);
    console.log(`Updated: ${result.updated} groups`);
    console.log(`Skipped: ${result.skipped} groups`);
    console.log(`Errors: ${result.errors} groups`);
    console.log(`Duration: ${duration.toFixed(2)} seconds`);
    console.log("=============================================");

    return result;
  } catch (error) {
    console.error("\n=============================================");
    console.error("Migration failed!");
    console.error("=============================================");
    console.error(`Error: ${error.message}`);
    console.error("Stack trace:");
    console.error(error.stack);
    console.error("=============================================");
    process.exit(1);
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log("Exiting migration script");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Unhandled error in migration script:", error);
      process.exit(1);
    });
}
