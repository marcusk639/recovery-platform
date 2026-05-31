import * as admin from "firebase-admin";
import * as geofire from "geofire-common";
import * as functions from "firebase-functions";

// Initialize Firebase Admin if not already initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// Config for the migration
interface MigrationConfig {
  dryRun?: boolean;
  batchSize?: number;
  logFrequency?: number;
  logLevel?: "debug" | "info" | "warn" | "error";
}

/**
 * Migration script to add geohashes to all existing groups
 * This is necessary for efficient location-based queries
 *
 * @param config Configuration options for the migration
 * @returns Summary statistics for the migration
 */
export async function migrateGeohashes(config: MigrationConfig = {}) {
  // Set defaults
  const {
    dryRun = false,
    batchSize = 500,
    logFrequency = 100,
    logLevel = "info",
  } = config;

  const logger = functions.logger;

  // Custom logger that respects log level
  const log = {
    debug: (message: string) => {
      if (logLevel === "debug") {
        console.log(`[DEBUG] ${message}`);
        logger.debug(message);
      }
    },
    info: (message: string) => {
      if (logLevel === "debug" || logLevel === "info") {
        console.log(`[INFO] ${message}`);
        logger.info(message);
      }
    },
    warn: (message: string) => {
      if (logLevel === "debug" || logLevel === "info" || logLevel === "warn") {
        console.warn(`[WARN] ${message}`);
        logger.warn(message);
      }
    },
    error: (message: string, error?: any) => {
      console.error(`[ERROR] ${message}`);
      if (error) console.error(error);
      logger.error(message, error);
    },
  };

  log.info(
    `Starting geohash migration for all groups${dryRun ? " (DRY RUN)" : ""}`
  );

  try {
    // Get all groups from Firestore
    const groupsSnapshot = await admin.firestore().collection("groups").get();

    log.info(`Found ${groupsSnapshot.size} groups total`);

    // Counters for tracking
    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Process in batches to avoid exceeding Firestore limits
    let batch = admin.firestore().batch();
    let batchCount = 0;

    for (const doc of groupsSnapshot.docs) {
      const groupId = doc.id;
      const groupData = doc.data();

      try {
        // Only process groups with latitude and longitude
        if (groupData.lat && groupData.lng) {
          // Skip if geohash already exists and matches
          if (groupData.geohash) {
            const existingGeohash = groupData.geohash;
            const calculatedGeohash = geofire.geohashForLocation([
              Number(groupData.lat),
              Number(groupData.lng),
            ]);

            if (existingGeohash === calculatedGeohash) {
              log.debug(
                `Group ${groupId} already has correct geohash: ${existingGeohash}`
              );
              skipped++;
              continue;
            }
          }

          // Generate geohash
          const lat = Number(groupData.lat);
          const lng = Number(groupData.lng);
          const geohash = geofire.geohashForLocation([lat, lng]);

          // In dry run mode, just log what would be updated
          if (dryRun) {
            log.info(
              `[DRY RUN] Would update group ${groupId} with geohash ${geohash}`
            );
            updated++;
          } else {
            // Add to batch update
            batch.update(doc.ref, {
              geohash,
              // Ensure lat/lng are stored as numbers (in case they were strings)
              lat,
              lng,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            log.debug(`Added geohash ${geohash} for group ${groupId}`);
            updated++;
            batchCount++;

            // Commit batch if we reach the limit
            if (batchCount >= batchSize) {
              log.info(`Committing batch of ${batchCount} updates...`);
              await batch.commit();
              batch = admin.firestore().batch();
              batchCount = 0;
              log.info(`Committed batch of ${batchSize} updates`);
            }
          }
        } else {
          log.warn(`Group ${groupId} missing lat/lng coordinates, skipping`);
          skipped++;
        }
      } catch (error) {
        log.error(`Error processing group ${groupId}:`, error);
        errors++;
      }

      processed++;

      // Log progress periodically
      if (processed % logFrequency === 0) {
        log.info(`Processed ${processed}/${groupsSnapshot.size} groups`);
      }
    }

    // Commit any remaining updates (if not in dry run)
    if (!dryRun && batchCount > 0) {
      log.info(`Committing final batch of ${batchCount} updates...`);
      await batch.commit();
      log.info(`Committed final batch of ${batchCount} updates`);
    }

    log.info(`Geohash migration completed${dryRun ? " (DRY RUN)" : ""}`);
    log.info(`Total processed: ${processed}`);
    log.info(`Updated: ${updated}`);
    log.info(`Skipped: ${skipped}`);
    log.info(`Errors: ${errors}`);

    return {
      success: true,
      processed,
      updated,
      skipped,
      errors,
      dryRun,
    };
  } catch (error) {
    logger.error("Migration failed:", error);
    throw error;
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  migrateGeohashes()
    .then((result) => {
      console.log("Migration completed:", result);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
}
