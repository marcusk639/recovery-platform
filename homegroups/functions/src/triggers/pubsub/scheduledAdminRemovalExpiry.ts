import * as functionsV1 from "firebase-functions/v1";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { db } from "../../utils/firebase";

export const scheduledAdminRemovalExpiry = functionsV1.pubsub
  .schedule("0 1 * * *")
  .timeZone("UTC")
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();

    const expiredSnapshot = await db
      .collection("admin_removal_requests")
      .where("status", "==", "pending")
      .where("expiresAt", "<=", now)
      .get();

    if (expiredSnapshot.empty) {
      functions.logger.info("No expired admin removal requests found.");
      return null;
    }

    const batch = db.batch();
    expiredSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        status: "expired",
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();
    functions.logger.info(`Marked ${expiredSnapshot.size} admin removal request(s) as expired.`);
    return null;
  });
