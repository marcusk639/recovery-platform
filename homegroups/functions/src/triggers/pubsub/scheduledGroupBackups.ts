import { onSchedule } from "firebase-functions/v2/scheduler";
import { db } from "../../utils/firebase";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

type ExportSection =
  | "members"
  | "transactions"
  | "meetings"
  | "announcements"
  | "milestones"
  | "service_positions"
  | "business_meetings";

const ALL_SECTIONS: ExportSection[] = [
  "members",
  "transactions",
  "meetings",
  "announcements",
  "milestones",
  "service_positions",
  "business_meetings",
];

/**
 * scheduledGroupBackups — runs 1st day of each month at 02:00 UTC
 * Backs up all active groups to Firebase Storage.
 */
export const scheduledGroupBackups = onSchedule(
  {
    schedule: "0 2 1 * *",
    timeZone: "UTC",
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 540,
  },
  async () => {
    logger.info("Starting monthly group backups");

    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Get all active groups
    const groupsSnap = await db
      .collection("groups")
      .where("subscriptionStatus", "==", "active")
      .get();

    const groups = groupsSnap.docs;
    logger.info(`Found ${groups.length} active groups to back up`);

    let successCount = 0;
    let failureCount = 0;

    // Process in batches of 10 with 200ms delay between batches
    const BATCH_SIZE = 10;
    for (let i = 0; i < groups.length; i += BATCH_SIZE) {
      const batch = groups.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(
        batch.map((groupDoc) =>
          backupGroup(groupDoc.id, groupDoc.data().name, period),
        ),
      ).then((results) => {
        results.forEach((result, idx) => {
          if (result.status === "fulfilled") {
            successCount++;
          } else {
            failureCount++;
            logger.error(
              `Backup failed for group ${batch[idx].id}:`,
              result.reason,
            );
          }
        });
      });

      if (i + BATCH_SIZE < groups.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    logger.info(
      `Monthly backup complete: ${successCount} succeeded, ${failureCount} failed`,
    );
  },
);

async function backupGroup(
  groupId: string,
  groupName: string,
  period: string,
): Promise<void> {
  const exportBundle: Record<string, any> = {
    exportVersion: "1.0",
    exportedAt: new Date().toISOString(),
    period,
    groupId,
    groupName,
    sections: {},
  };

  for (const section of ALL_SECTIONS) {
    try {
      exportBundle.sections[section] = await collectSectionData(
        groupId,
        section,
      );
    } catch (err) {
      logger.warn(`Failed to collect ${section} for group ${groupId}:`, err);
      exportBundle.sections[section] = [];
    }
  }

  const content = JSON.stringify(exportBundle, null, 2);
  const contentBuffer = Buffer.from(content, "utf8");
  const fileSizeBytes = contentBuffer.length;

  const bucket = admin.storage().bucket();
  const fileName = `group-backups/${groupId}/${period}.json`;
  const file = bucket.file(fileName);

  await file.save(contentBuffer, { contentType: "application/json" });

  // Clean up backups older than 13 months
  const [files] = await bucket.getFiles({
    prefix: `group-backups/${groupId}/`,
  });
  const sortedFiles = files
    .map((f) => ({ file: f, name: f.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (sortedFiles.length > 13) {
    const toDelete = sortedFiles.slice(0, sortedFiles.length - 13);
    for (const { file: oldFile } of toDelete) {
      await oldFile
        .delete()
        .catch((err) =>
          logger.warn(`Failed to delete old backup ${oldFile.name}:`, err),
        );
    }
  }

  // Write backup log
  await db
    .collection("groups")
    .doc(groupId)
    .collection("backups")
    .doc(period)
    .set({
      period,
      filePath: fileName,
      fileSizeBytes,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "success",
    });
}

async function collectSectionData(
  groupId: string,
  section: ExportSection,
): Promise<any[]> {
  switch (section) {
    case "members": {
      const snap = await db
        .collection("members")
        .where("groupId", "==", groupId)
        .get();
      return snap.docs.map((doc) => {
        const d = doc.data();
        const { fcmTokens, ...safe } = d as any;
        return safe;
      });
    }
    case "transactions": {
      const snap = await db
        .collection("transactions")
        .where("groupId", "==", groupId)
        .get();
      return snap.docs.map((doc) => doc.data());
    }
    case "meetings": {
      const snap = await db
        .collection("meetings")
        .where("groupId", "==", groupId)
        .get();
      return snap.docs.map((doc) => doc.data());
    }
    case "announcements": {
      const snap = await db
        .collection("groups")
        .doc(groupId)
        .collection("announcements")
        .get();
      return snap.docs.map((doc) => {
        const d = doc.data();
        const { readBy, ...safe } = d;
        return safe;
      });
    }
    case "milestones": {
      const snap = await db
        .collection("groups")
        .doc(groupId)
        .collection("milestones")
        .get();
      return snap.docs.map((doc) => {
        const d = doc.data();
        const { userId, ...safe } = d;
        return safe;
      });
    }
    case "service_positions": {
      const snap = await db
        .collection("groups")
        .doc(groupId)
        .collection("servicePositions")
        .get();
      return snap.docs.map((doc) => doc.data());
    }
    case "business_meetings": {
      const snap = await db
        .collection("business_meetings")
        .where("groupId", "==", groupId)
        .get();
      return snap.docs.map((doc) => doc.data());
    }
    default:
      return [];
  }
}
