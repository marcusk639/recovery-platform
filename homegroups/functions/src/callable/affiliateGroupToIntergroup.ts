import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import { db } from "../utils/firebase";
import * as admin from "firebase-admin";
import { assertGroupActive } from "../utils/subscriptionGuard";
import { requireAuth } from "../utils/callableWrapper";

interface AffiliateGroupData {
  intergroupId: string;
  groupId: string;
}

interface AffiliateGroupResult {
  success: boolean;
}

export const affiliateGroupToIntergroup = onCall(
  { region: "us-central1" },
  async (
    request: CallableRequest<AffiliateGroupData>,
  ): Promise<AffiliateGroupResult> => {
    const uid = requireAuth(request);

    const { intergroupId, groupId } = request.data;
    if (!intergroupId || !groupId) {
      throw new HttpsError(
        "invalid-argument",
        "intergroupId and groupId are required",
      );
    }

    // Load intergroup document
    const intergroupRef = db.collection("intergroups").doc(intergroupId);
    const intergroupSnap = await intergroupRef.get();
    if (!intergroupSnap.exists) {
      throw new HttpsError("not-found", "Intergroup not found");
    }
    const intergroupData = intergroupSnap.data()!;

    // Check that caller is owner or admin of the intergroup
    if (!intergroupData.adminUids?.includes(uid)) {
      throw new HttpsError("permission-denied", "Must be an intergroup admin");
    }

    // Check that caller is also admin of the group
    const memberDoc = await db
      .collection("members")
      .doc(`${groupId}_${uid}`)
      .get();
    if (!memberDoc.exists || !memberDoc.data()?.isAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Must be an admin of the group being affiliated",
      );
    }

    // Check group limit for tier_a
    const currentCount: number = (intergroupData.affiliatedGroupIds || [])
      .length;
    if (currentCount >= intergroupData.maxGroups) {
      throw new HttpsError(
        "resource-exhausted",
        "Group limit reached. Upgrade to Unlimited tier to add more groups.",
      );
    }

    // Check that group is not already affiliated
    if ((intergroupData.affiliatedGroupIds || []).includes(groupId)) {
      throw new HttpsError(
        "already-exists",
        "Group is already affiliated with this intergroup",
      );
    }

    // Load group to get name
    const groupSnap = await db.collection("groups").doc(groupId).get();
    if (!groupSnap.exists) {
      throw new HttpsError("not-found", "Group not found");
    }
    assertGroupActive(groupSnap.data()!);
    const groupName = groupSnap.data()?.name ?? "";

    // Update intergroup: add groupId to affiliatedGroupIds
    await intergroupRef.update({
      affiliatedGroupIds: admin.firestore.FieldValue.arrayUnion(groupId),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update group: set orgId and orgName
    await db.collection("groups").doc(groupId).update({
      orgId: intergroupId,
      orgName: intergroupData.name,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`Group ${groupId} affiliated with intergroup ${intergroupId}`);
    return { success: true };
  },
);
