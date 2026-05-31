import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import { db } from "../../utils/firebase";

interface SponsorSettings {
  isAvailable: boolean;
  bio?: string;
  requirements?: string[];
  maxSponsees?: number;
}

interface UserData {
  sponsorSettings?: SponsorSettings;
}

/**
 * Cloud Function triggered when a user document is updated
 * Syncs sponsorSettings to all member documents for that user
 */
export const onUserSponsorSettingsUpdate = functionsV1.firestore
  .document("users/{userId}")
  .onUpdate(async (change, context) => {
    const { userId } = context.params;
    const beforeData = change.before.data() as UserData;
    const afterData = change.after.data() as UserData;

    // Check if sponsorSettings actually changed
    const beforeSettings = JSON.stringify(beforeData.sponsorSettings || {});
    const afterSettings = JSON.stringify(afterData.sponsorSettings || {});

    if (beforeSettings === afterSettings) {
      // No change to sponsorSettings, skip
      return;
    }

    functions.logger.info(`Syncing sponsorSettings for user ${userId}`, {
      before: beforeData.sponsorSettings,
      after: afterData.sponsorSettings,
    });

    try {
      // Find all member documents for this user
      const memberDocs = await db
        .collection("members")
        .where("userId", "==", userId)
        .get();

      if (memberDocs.empty) {
        functions.logger.info(`No member documents found for user ${userId}`);
        return;
      }

      // Batch update all member documents
      const batch = db.batch();
      let updateCount = 0;

      memberDocs.forEach((doc) => {
        batch.update(doc.ref, {
          sponsorSettings: afterData.sponsorSettings || null,
          sponsorSettingsUpdatedAt: new Date(),
        });
        updateCount++;
      });

      await batch.commit();

      functions.logger.info(
        `Successfully synced sponsorSettings to ${updateCount} member documents for user ${userId}`
      );
    } catch (error) {
      functions.logger.error(
        `Error syncing sponsorSettings for user ${userId}:`,
        error
      );
      throw error;
    }
  });
