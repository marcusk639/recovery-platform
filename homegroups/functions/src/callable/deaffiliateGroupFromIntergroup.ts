import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import { db } from "../utils/firebase";
import * as admin from "firebase-admin";
import { requireAuth } from "../utils/callableWrapper";

interface DeaffiliateGroupData {
  intergroupId: string;
  groupId: string;
}

interface DeaffiliateGroupResult {
  success: boolean;
}

export const deaffiliateGroupFromIntergroup = onCall(
  { region: "us-central1" },
  async (
    request: CallableRequest<DeaffiliateGroupData>,
  ): Promise<DeaffiliateGroupResult> => {
    const uid = requireAuth(request);

    const { intergroupId, groupId } = request.data;
    if (!intergroupId || !groupId) {
      throw new HttpsError(
        "invalid-argument",
        "intergroupId and groupId are required",
      );
    }

    // Load intergroup — only owner can deaffiliate
    const intergroupRef = db.collection("intergroups").doc(intergroupId);
    const intergroupSnap = await intergroupRef.get();
    if (!intergroupSnap.exists) {
      throw new HttpsError("not-found", "Intergroup not found");
    }
    const intergroupData = intergroupSnap.data()!;

    // Check ownership via members subcollection
    const ownerMemberSnap = await intergroupRef
      .collection("members")
      .doc(uid)
      .get();
    if (!ownerMemberSnap.exists || ownerMemberSnap.data()?.role !== "owner") {
      throw new HttpsError(
        "permission-denied",
        "Only the intergroup owner can remove affiliated groups",
      );
    }

    // Remove groupId from affiliatedGroupIds
    await intergroupRef.update({
      affiliatedGroupIds: admin.firestore.FieldValue.arrayRemove(groupId),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Remove orgId from the group document
    await db.collection("groups").doc(groupId).update({
      orgId: admin.firestore.FieldValue.delete(),
      orgName: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(
      `Group ${groupId} deaffiliated from intergroup ${intergroupId}`,
    );
    return { success: true };
  },
);
