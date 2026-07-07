import * as functionsV1 from "firebase-functions/v1";
import { db } from "../../utils/firebase";
import * as admin from "firebase-admin";

/**
 * onUserCreated — Auth trigger
 *
 * When a new user signs up, checks their email domain against the SSO domain index.
 * If a match is found and SSO is enabled, auto-joins the user to the configured group.
 */
export const onUserCreated = functionsV1.auth.user().onCreate(async (user) => {
  const email = user.email;
  if (!email || !email.includes("@")) return;

  const domain = email.split("@")[1].toLowerCase();

  // Check SSO domain index
  const ssoDoc = await db.collection("sso_domain_index").doc(domain).get();
  if (!ssoDoc.exists || !ssoDoc.data()?.enabled) return;

  const { intergroupId, autoJoinGroupId, intergroupName } = ssoDoc.data()!;

  // Auto-join the group
  const groupRef = db.collection("groups").doc(autoJoinGroupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) {
    console.warn(
      `SSO auto-join: group ${autoJoinGroupId} not found for domain ${domain}`,
    );
    return;
  }

  const memberId = `${autoJoinGroupId}_${user.uid}`;

  // Check if member already exists (e.g., user had account before SSO was configured)
  const existingMemberSnap = await db.collection("members").doc(memberId).get();
  if (existingMemberSnap.exists) {
    console.log(
      `SSO: user ${user.uid} already member of group ${autoJoinGroupId}`,
    );
  } else {
    await db
      .collection("members")
      .doc(memberId)
      .set({
        id: memberId,
        groupId: autoJoinGroupId,
        userId: user.uid,
        displayName: user.displayName ?? email.split("@")[0],
        showPhoneNumber: false,
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        isAdmin: false,
        isTreasurer: false,
        roles: ["member"],
        showSobrietyDate: false,
      });
  }

  // Sync user document: add group to homeGroups
  await db
    .collection("users")
    .doc(user.uid)
    .set(
      {
        homeGroups: admin.firestore.FieldValue.arrayUnion(autoJoinGroupId),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  // Write SSO join log
  await db
    .collection("sso_join_log")
    .doc(intergroupId)
    .collection("events")
    .add({
      userId: user.uid,
      displayName: user.displayName ?? email.split("@")[0],
      domain,
      joinedAt: admin.firestore.FieldValue.serverTimestamp(),
      groupId: autoJoinGroupId,
    });

  console.log(
    `SSO: auto-joined user ${user.uid} to group ${autoJoinGroupId} via intergroup ${intergroupId}`,
  );
});
