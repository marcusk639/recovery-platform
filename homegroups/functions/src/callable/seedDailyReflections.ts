import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db } from "../utils/firebase";
import { REFLECTIONS_365 } from "../utils/reflectionsLibrary";
import { requireAuth } from "../utils/callableWrapper";

interface SeedInput {
  force?: boolean;
}

interface SeedOutput {
  seeded: number;
  skipped: number;
}

/**
 * seedDailyReflections — one-time admin-only CF to seed daily_reflections collection
 *
 * Auth: must be platform admin (role === 'admin' custom claim)
 * Writes daily_reflections/{dayOfYear padded to 3 digits}
 * If doc already exists and force !== true, skips (idempotent)
 */
export const seedDailyReflections = onCall(
  async (request: CallableRequest<SeedInput>): Promise<SeedOutput> => {
    const uid = requireAuth(request);

    // Only super admins can seed. Check the superAdmin JWT claim (the
    // authoritative privilege source) rather than the mutable users/{uid}.role
    // field — setUserAsSuperAdmin writes role:"superAdmin", so the old
    // role==="admin" comparison locked out every real super admin.
    if (!request.auth?.token?.superAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Only super admins can seed daily reflections.",
      );
    }

    const force = request.data?.force === true;

    if (!force) {
      const checkDoc = await db
        .collection("daily_reflections")
        .doc("001")
        .get();
      if (checkDoc.exists) {
        return {
          seeded: 0,
          skipped: REFLECTIONS_365.length,
          message: "Already seeded. Use force: true to re-seed.",
        } as any;
      }
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    let seeded = 0;
    const skipped = 0;

    // Write in batches of 500 (Firestore batch limit)
    const batchSize = 499;
    for (
      let batchStart = 0;
      batchStart < REFLECTIONS_365.length;
      batchStart += batchSize
    ) {
      const batch = db.batch();
      const chunk = REFLECTIONS_365.slice(batchStart, batchStart + batchSize);

      for (let i = 0; i < chunk.length; i++) {
        const dayOfYear = batchStart + i + 1; // 1-indexed
        const docId = dayOfYear.toString().padStart(3, "0");
        const docRef = db.collection("daily_reflections").doc(docId);

        const reflection = chunk[i];
        const docData = {
          dayOfYear,
          title: reflection.title,
          body: reflection.body,
          theme: reflection.theme,
          tags: reflection.tags,
          source: "original",
          createdAt: now,
          updatedAt: now,
        };

        batch.set(docRef, docData);
        seeded++;
      }

      await batch.commit();
    }

    logger.info(`Seeded ${seeded} reflections, skipped ${skipped}`);

    return { seeded, skipped };
  },
);
