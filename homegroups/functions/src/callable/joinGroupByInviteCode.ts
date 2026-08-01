import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { db } from '../utils/firebase';
import * as admin from 'firebase-admin';
import { requireAuth } from '../utils/callableWrapper';

interface JoinGroupData {
  code: string;
}

export const joinGroupByInviteCode = onCall(
  {
    cpu: 0.5,
    memory: '512MiB',
    timeoutSeconds: 60,
    // No region pin: deploy to the default us-central1 to match the client. The client calls
    // functions().httpsCallable('joinGroupByInviteCode') with the default region
    // (EnterInviteCodeModal.tsx, App.tsx), so a us-west1 pin here made it unreachable
    // (NOT_FOUND) — every invite-code join failed.
  },
  async (request: CallableRequest<JoinGroupData>) => {
    const { code } = request.data;
    const userId = requireAuth(request);

    if (!code || typeof code !== 'string' || code.length !== 6) {
      throw new HttpsError('invalid-argument', 'Invalid invite code format.');
    }

    const normalizedCode = code.toUpperCase();

    try {
      const inviteQuery = db
        .collection('groupInvites')
        .where('code', '==', normalizedCode)
        .limit(1);
      const inviteSnap = await inviteQuery.get();

      if (inviteSnap.empty) {
        throw new HttpsError('not-found', `Invite code "${normalizedCode}" not found.`);
      }

      const inviteDoc = inviteSnap.docs[0];
      const inviteData = inviteDoc.data();
      const { groupId, status, expiresAt } = inviteData;

      if (status !== 'pending') {
        throw new HttpsError('failed-precondition', `This invite code has already been ${status}.`);
      }
      if (expiresAt.toDate() < new Date()) {
        await inviteDoc.ref.update({ status: 'expired' });
        throw new HttpsError('failed-precondition', 'This invite code has expired.');
      }

      const memberRef = db.collection('members').doc(`${groupId}_${userId}`);
      const memberSnap = await memberRef.get();

      if (memberSnap.exists) {
        logger.info('User already member of group; marking invite as used', {
          userId,
          groupId,
          inviteCode: normalizedCode,
        });
        await inviteDoc.ref.update({
          status: 'used',
          usedByUid: userId,
          usedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return {
          success: true,
          groupId: groupId,
          groupName: inviteData.groupName || 'Group',
          message: 'Already a member of this group.',
        };
      }

      const groupRef = db.collection('groups').doc(groupId);
      const userRef = db.collection('users').doc(userId);

      const [groupSnap, userSnap] = await Promise.all([groupRef.get(), userRef.get()]);

      // Verify group still exists
      if (!groupSnap.exists) {
        await inviteDoc.ref.update({ status: 'invalidated' });
        throw new HttpsError('not-found', 'This group no longer exists.');
      }

      if (!userSnap.exists) {
        throw new HttpsError('not-found', 'User profile not found.');
      }

      const groupData = groupSnap.data();
      const userData = userSnap.data();

      const batch = db.batch();
      const newMemberRef = db.collection('members').doc(`${groupId}_${userId}`);
      batch.set(newMemberRef, {
        userId: userId,
        groupId: groupId,
        displayName: userData?.displayName || 'Unknown User',
        email: userData?.email || null,
        photoURL: userData?.photoURL || null,
        isAdmin: false,
        isTreasurer: false,
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        sobrietyDate: userData?.sobrietyStartDate || null,
        showSobrietyDate: userData?.showSobrietyDate ?? false,
        showPhoneNumber: userData?.showPhoneNumber ?? false,
      });

      batch.update(groupRef, {
        memberCount: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      batch.update(inviteDoc.ref, {
        status: 'used',
        usedByUid: userId,
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
        joinCount: admin.firestore.FieldValue.increment(1),
      });
      batch.update(userRef, {
        homeGroups: admin.firestore.FieldValue.arrayUnion(groupId),
      });

      await batch.commit();

      const groupName = groupData?.name || inviteData.groupName || 'Group';
      logger.info('User joined group via invite code', {
        userId,
        groupId,
        groupName,
        inviteCode: normalizedCode,
      });
      return {
        success: true,
        groupId: groupId,
        groupName: groupName,
        message: 'Successfully joined group.',
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error('Error in joinGroupByInviteCode', { error });
      throw new HttpsError('internal', 'Failed to join group using invite code.');
    }
  },
);
