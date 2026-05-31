import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import { db } from "../utils/firebase";
import * as admin from "firebase-admin";
import { assertGroupActive } from "../utils/subscriptionGuard";

type ExportSection =
  | "members"
  | "transactions"
  | "meetings"
  | "announcements"
  | "milestones"
  | "service_positions"
  | "business_meetings";

interface ExportGroupDataData {
  groupId: string;
  format: "json" | "csv";
  sections: ExportSection[];
}

interface ExportGroupDataResult {
  downloadUrl: string;
  expiresAt: string;
  exportId: string;
  fileSizeBytes: number;
}

const MAX_EXPORTS_PER_DAY = 3;

export const exportGroupData = onCall(
  { region: "us-central1" },
  async (
    request: CallableRequest<ExportGroupDataData>,
  ): Promise<ExportGroupDataResult> => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Must be signed in");

    const { groupId, format, sections } = request.data;
    if (!groupId || !format || !sections || sections.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "groupId, format, and sections are required",
      );
    }

    const uid = request.auth.uid;

    // Check group exists and caller is admin with active subscription
    const groupSnap = await db.collection("groups").doc(groupId).get();
    if (!groupSnap.exists) throw new HttpsError("not-found", "Group not found");
    const groupData = groupSnap.data()!;

    if (!groupData.admins?.includes(uid)) {
      throw new HttpsError(
        "permission-denied",
        "Must be a group admin to export data",
      );
    }

    assertGroupActive(groupData);

    // Rate limiting: max 3 exports per 24 hours
    const oneDayAgo = admin.firestore.Timestamp.fromMillis(
      Date.now() - 24 * 60 * 60 * 1000,
    );
    const recentExportsSnap = await db
      .collection("exports")
      .doc(groupId)
      .collection("exports")
      .where("createdAt", ">=", oneDayAgo)
      .get();

    if (recentExportsSnap.size >= MAX_EXPORTS_PER_DAY) {
      throw new HttpsError(
        "resource-exhausted",
        `Maximum ${MAX_EXPORTS_PER_DAY} exports per 24 hours reached`,
      );
    }

    // Collect data for each section
    const exportData: Record<string, any[]> = {};

    for (const section of sections) {
      exportData[section] = await collectSectionData(groupId, section);
    }

    // Build export bundle
    const exportBundle = {
      exportVersion: "1.0",
      exportedAt: new Date().toISOString(),
      groupId,
      groupName: groupData.name,
      sections: exportData,
    };

    const exportId = db.collection("_").doc().id;
    const content =
      format === "json"
        ? JSON.stringify(exportBundle, null, 2)
        : convertToCSV(exportBundle);

    const contentBuffer = Buffer.from(content, "utf8");
    const fileSizeBytes = contentBuffer.length;

    // Upload to Firebase Storage
    const bucket = admin.storage().bucket();
    const extension = format === "json" ? "json" : "csv";
    const fileName = `group-exports/${groupId}/${exportId}.${extension}`;
    const file = bucket.file(fileName);

    await file.save(contentBuffer, {
      contentType: format === "json" ? "application/json" : "text/csv",
    });

    // Signed URL valid for 1 hour
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const [downloadUrl] = await file.getSignedUrl({
      action: "read",
      expires: expiresAt,
    });

    // Log export
    await db
      .collection("exports")
      .doc(groupId)
      .collection("exports")
      .doc(exportId)
      .set({
        exportId,
        groupId,
        format,
        sections,
        filePath: fileName,
        fileSizeBytes,
        requestedBy: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      });

    return {
      downloadUrl,
      expiresAt: expiresAt.toISOString(),
      exportId,
      fileSizeBytes,
    };
  },
);

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
        // Omit sensitive fields
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
        // Anonymize: omit userId
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

function convertToCSV(exportBundle: any): string {
  const lines: string[] = [
    `Export Version,${exportBundle.exportVersion}`,
    `Exported At,${exportBundle.exportedAt}`,
    `Group ID,${exportBundle.groupId}`,
    `Group Name,${exportBundle.groupName}`,
    ``,
  ];

  for (const [section, records] of Object.entries(exportBundle.sections)) {
    lines.push(`--- ${section.toUpperCase()} ---`);
    const arr = records as any[];
    if (arr.length > 0) {
      const headers = Object.keys(arr[0]);
      lines.push(headers.join(","));
      for (const record of arr) {
        lines.push(
          headers
            .map((h) => {
              const val = record[h];
              if (val === null || val === undefined) return "";
              const str =
                typeof val === "object"
                  ? JSON.stringify(val).replace(/,/g, ";")
                  : String(val).replace(/,/g, ";");
              // Prefix formula-triggering characters to prevent CSV injection
              return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
            })
            .join(","),
        );
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
