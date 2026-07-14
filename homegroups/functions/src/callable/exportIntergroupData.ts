import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import { db } from "../utils/firebase";
import * as admin from "firebase-admin";
import { requireAuth } from "../utils/callableWrapper";

interface ExportIntergroupDataData {
  intergroupId: string;
  format: "json" | "csv";
  includeGroupDetails: boolean;
}

interface ExportIntergroupDataResult {
  downloadUrl: string;
  expiresAt: string;
  exportId: string;
}

export const exportIntergroupData = onCall(
  { region: "us-central1" },
  async (
    request: CallableRequest<ExportIntergroupDataData>,
  ): Promise<ExportIntergroupDataResult> => {
    const uid = requireAuth(request);

    const { intergroupId, format, includeGroupDetails } = request.data;
    if (!intergroupId || !format) {
      throw new HttpsError(
        "invalid-argument",
        "intergroupId and format are required",
      );
    }

    // Load intergroup — must be owner
    const intergroupRef = db.collection("intergroups").doc(intergroupId);
    const intergroupSnap = await intergroupRef.get();
    if (!intergroupSnap.exists)
      throw new HttpsError("not-found", "Intergroup not found");
    const intergroupData = intergroupSnap.data()!;

    const ownerMemberSnap = await intergroupRef
      .collection("members")
      .doc(uid)
      .get();
    if (!ownerMemberSnap.exists || ownerMemberSnap.data()?.role !== "owner") {
      throw new HttpsError(
        "permission-denied",
        "Only the intergroup owner can export data",
      );
    }

    const affiliatedGroupIds: string[] =
      intergroupData.affiliatedGroupIds || [];

    // Collect intergroup metadata
    const { stripeCustomerId, stripeSubscriptionId, ...safeIntergroupData } =
      intergroupData as any;
    const exportBundle: Record<string, any> = {
      exportVersion: "1.0",
      exportedAt: new Date().toISOString(),
      intergroupId,
      intergroupName: intergroupData.name,
      intergroup: safeIntergroupData,
      groups: {},
    };

    if (includeGroupDetails) {
      for (const groupId of affiliatedGroupIds) {
        const groupSnap = await db.collection("groups").doc(groupId).get();
        if (!groupSnap.exists) continue;

        const groupData = groupSnap.data()!;
        const {
          stripeCustomerId: _sc,
          stripeSubscriptionId: _ss,
          ...safeGroupData
        } = groupData as any;

        const members: any[] = [];
        const membersSnap = await db
          .collection("members")
          .where("groupId", "==", groupId)
          .get();
        membersSnap.docs.forEach((doc) => {
          const d = doc.data();
          const { fcmTokens, ...safe } = d as any;
          members.push(safe);
        });

        const transactions: any[] = [];
        const txSnap = await db
          .collection("transactions")
          .where("groupId", "==", groupId)
          .get();
        txSnap.docs.forEach((doc) => transactions.push(doc.data()));

        const meetings: any[] = [];
        const meetingsSnap = await db
          .collection("meetings")
          .where("groupId", "==", groupId)
          .get();
        meetingsSnap.docs.forEach((doc) => meetings.push(doc.data()));

        exportBundle.groups[groupId] = {
          ...safeGroupData,
          members,
          transactions,
          meetings,
        };
      }
    }

    const content = JSON.stringify(exportBundle, null, 2);
    const contentBuffer = Buffer.from(content, "utf8");

    const exportId = db.collection("_").doc().id;
    const bucket = admin.storage().bucket();
    const fileName = `intergroup-exports/${intergroupId}/${exportId}.json`;
    const file = bucket.file(fileName);

    await file.save(contentBuffer, { contentType: "application/json" });

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const [downloadUrl] = await file.getSignedUrl({
      action: "read",
      expires: expiresAt,
    });

    return { downloadUrl, expiresAt: expiresAt.toISOString(), exportId };
  },
);
