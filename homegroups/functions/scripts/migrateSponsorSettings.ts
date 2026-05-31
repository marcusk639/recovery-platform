import * as admin from "firebase-admin";
import * as path from "path";

// --- Configuration ---
const SERVICE_ACCOUNT_PATH = "./recovery-connect.json";
const BATCH_SIZE = 500;
const LOG_FREQUENCY = 100;

// --- Types ---
interface SponsorSettings {
  isAvailable: boolean;
  bio?: string;
  requirements?: string[];
  maxSponsees?: number;
}

interface UserData {
  sponsorSettings?: SponsorSettings;
}

interface MigrationConfig {
  dryRun?: boolean;
  verbose?: boolean;
}

interface MigrationResult {
  success: boolean;
  processed: number;
  updated: number;
  cleared: number;
  skipped: number;
  missingUser: number;
  errors: number;
  dryRun: boolean;
}

// --- Initialize Firebase ---
function initializeFirebase(): admin.app.App {
  const serviceAccount = require(path.resolve(SERVICE_ACCOUNT_PATH));
  console.log("🔧 Initializing Firebase Admin SDK...");
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// --- Logger ---
function createLogger(verbose: boolean) {
  return {
    debug: (message: string) => {
      if (verbose) {
        console.log(`[DEBUG] ${message}`);
      }
    },
    info: (message: string) => {
      console.log(`[INFO] ${message}`);
    },
    warn: (message: string) => {
      console.warn(`[WARN] ${message}`);
    },
    error: (message: string, error?: any) => {
      console.error(`[ERROR] ${message}`);
      if (error) console.error(error);
    },
  };
}

/**
 * Migration script to sync sponsorSettings from user documents to member documents
 * This ensures all existing member documents have the correct sponsorSettings
 * from their corresponding user documents
 */
async function migrateSponsorSettings(
  config: MigrationConfig = {}
): Promise<MigrationResult> {
  const { dryRun = false, verbose = false } = config;
  const log = createLogger(verbose);
  const db = admin.firestore();

  log.info(`Starting sponsorSettings migration${dryRun ? " (DRY RUN)" : ""}`);

  try {
    // Step 1: Get all users and build sponsorSettings map
    log.info("Fetching users...");
    const usersSnapshot = await db.collection("users").get();

    const userSponsorSettingsMap = new Map<string, SponsorSettings | null>();
    let usersWithSettings = 0;

    for (const doc of usersSnapshot.docs) {
      const userData = doc.data() as UserData;
      if (userData.sponsorSettings) {
        userSponsorSettingsMap.set(doc.id, userData.sponsorSettings);
        usersWithSettings++;
      } else {
        userSponsorSettingsMap.set(doc.id, null);
      }
    }

    log.info(
      `Found ${usersSnapshot.size} total users, ${usersWithSettings} with sponsorSettings`
    );

    // Step 2: Get all member documents
    log.info("Fetching member documents...");
    const membersSnapshot = await db.collection("members").get();

    log.info(`Found ${membersSnapshot.size} member documents total`);

    // Counters
    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let cleared = 0;
    let errors = 0;
    let missingUser = 0;

    // Process in batches
    let batch = db.batch();
    let batchCount = 0;

    for (const doc of membersSnapshot.docs) {
      const memberId = doc.id;
      const memberData = doc.data();
      const userId = memberData.userId;

      try {
        if (!userId) {
          log.warn(`Member ${memberId} has no userId, skipping`);
          skipped++;
          processed++;
          continue;
        }

        if (!userSponsorSettingsMap.has(userId)) {
          log.debug(
            `No user document found for member ${memberId} (userId: ${userId})`
          );
          missingUser++;
          processed++;
          continue;
        }

        const userSponsorSettings = userSponsorSettingsMap.get(userId);
        const currentMemberSettings = memberData.sponsorSettings;

        // Check if update is needed
        const userSettingsJson = JSON.stringify(userSponsorSettings || null);
        const memberSettingsJson = JSON.stringify(
          currentMemberSettings || null
        );

        if (userSettingsJson === memberSettingsJson) {
          log.debug(`Member ${memberId} already has correct sponsorSettings`);
          skipped++;
          processed++;
          continue;
        }

        // Update needed
        if (dryRun) {
          if (userSponsorSettings) {
            log.info(
              `[DRY RUN] Would update member ${memberId} with sponsorSettings from user ${userId}`
            );
            updated++;
          } else {
            log.info(
              `[DRY RUN] Would clear sponsorSettings from member ${memberId}`
            );
            cleared++;
          }
        } else {
          if (userSponsorSettings) {
            batch.update(doc.ref, {
              sponsorSettings: userSponsorSettings,
              sponsorSettingsUpdatedAt:
                admin.firestore.FieldValue.serverTimestamp(),
            });
            log.debug(`Queued sponsorSettings update for member ${memberId}`);
            updated++;
          } else {
            batch.update(doc.ref, {
              sponsorSettings: admin.firestore.FieldValue.delete(),
              sponsorSettingsUpdatedAt:
                admin.firestore.FieldValue.serverTimestamp(),
            });
            log.debug(`Queued sponsorSettings clear for member ${memberId}`);
            cleared++;
          }

          batchCount++;

          if (batchCount >= BATCH_SIZE) {
            log.info(`Committing batch of ${batchCount} updates...`);
            await batch.commit();
            batch = db.batch();
            batchCount = 0;
            log.info(`Committed batch successfully`);
          }
        }
      } catch (error) {
        log.error(`Error processing member ${memberId}:`, error);
        errors++;
      }

      processed++;

      if (processed % LOG_FREQUENCY === 0) {
        log.info(`Processed ${processed}/${membersSnapshot.size} members`);
      }
    }

    // Commit remaining updates
    if (!dryRun && batchCount > 0) {
      log.info(`Committing final batch of ${batchCount} updates...`);
      await batch.commit();
      log.info(`Committed final batch successfully`);
    }

    // Print summary
    console.log("\n========================================");
    console.log(
      `SponsorSettings migration completed${dryRun ? " (DRY RUN)" : ""}`
    );
    console.log("========================================");
    console.log(`Total members processed: ${processed}`);
    console.log(`Updated with sponsorSettings: ${updated}`);
    console.log(`Cleared sponsorSettings: ${cleared}`);
    console.log(`Skipped (already in sync): ${skipped}`);
    console.log(`Missing user documents: ${missingUser}`);
    console.log(`Errors: ${errors}`);
    console.log("========================================\n");

    return {
      success: true,
      processed,
      updated,
      cleared,
      skipped,
      missingUser,
      errors,
      dryRun,
    };
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}

// --- Main Entry Point ---
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run") || args.includes("-d");
  const verbose = args.includes("--verbose") || args.includes("-v");
  const help = args.includes("--help") || args.includes("-h");

  if (help) {
    console.log(`
Usage: npx ts-node migrateSponsorSettings.ts [options]

Options:
  -d, --dry-run    Preview changes without applying them
  -v, --verbose    Show detailed debug output
  -h, --help       Show this help message

Examples:
  npx ts-node migrateSponsorSettings.ts --dry-run    # Preview changes
  npx ts-node migrateSponsorSettings.ts              # Run migration
  npx ts-node migrateSponsorSettings.ts -d -v        # Dry run with verbose output
`);
    process.exit(0);
  }

  console.log("\n🔄 SponsorSettings Migration");
  console.log("============================");
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes will be made)" : "LIVE"}`);
  console.log(`Verbose: ${verbose ? "Yes" : "No"}\n`);

  // Initialize Firebase
  initializeFirebase();

  // Run migration
  try {
    const result = await migrateSponsorSettings({ dryRun, verbose });
    console.log("✅ Migration completed successfully");
    process.exit(result.errors > 0 ? 1 : 0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

main();
