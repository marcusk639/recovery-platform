import firestore from '@react-native-firebase/firestore';
import {GroupMember, User} from '../types';
import {GroupMemberDocument} from '../types/schema';
import auth from '@react-native-firebase/auth';
import {getRequiredDoc, scheduleTokenRefresh} from './modelHelpers';

/**
 * Member model for managing group membership data in top-level collection
 */
export class MemberModel {
  /**
   * Convert a Firestore member document to a GroupMember object
   */
  static fromFirestore(doc: any): GroupMember {
    const data = doc.data() as GroupMemberDocument;
    // Extract userId from doc ID if not in data (format: {groupId}_{userId})
    const docIdParts = doc.id.split('_');
    const userIdFromDoc =
      docIdParts.length >= 2 ? docIdParts.slice(1).join('_') : '';

    return {
      id: doc.id,
      groupId: data.groupId,
      userId: data.userId || userIdFromDoc,
      name: data.displayName,
      isAdmin: data.isAdmin || false,
      isTreasurer: data.isTreasurer || false,
      roles: data.roles || [data.isAdmin ? 'admin' : 'member'],
      position: data.position,
      sobrietyDate: data.sobrietyDate
        ? data.sobrietyDate.toDate().toISOString()
        : undefined,
      phoneNumber: data.phoneNumber,
      showSobrietyDate: data.showSobrietyDate ?? false,
      showPhoneNumber: data.showPhoneNumber ?? false,
      joinedAt: data.joinedAt ? data.joinedAt.toDate() : new Date(),
      email: data.email,
      photoUrl: data.photoUrl,
      sponsorSettings: data.sponsorSettings,
    };
  }

  /**
   * Convert a GroupMember object to a Firestore document
   */
  static toFirestore(
    member: Partial<GroupMember>,
  ): Partial<GroupMemberDocument> {
    const firestoreData: Partial<GroupMemberDocument> = {
      groupId: member.groupId || '',
    };

    // userId is now required - always set it
    if (member.userId) firestoreData.userId = member.userId;
    if (member.name) firestoreData.displayName = member.name;
    if (member.isAdmin !== undefined) firestoreData.isAdmin = member.isAdmin;
    if (member.isTreasurer !== undefined)
      firestoreData.isTreasurer = member.isTreasurer;
    if (member.roles !== undefined) firestoreData.roles = member.roles;
    if (member.position) firestoreData.position = member.position;
    if (member.sobrietyDate)
      firestoreData.sobrietyDate = firestore.Timestamp.fromDate(
        new Date(member.sobrietyDate),
      );
    if (member.phoneNumber !== undefined)
      firestoreData.phoneNumber = member.phoneNumber;
    if (member.showSobrietyDate !== undefined)
      firestoreData.showSobrietyDate = member.showSobrietyDate;
    if (member.showPhoneNumber !== undefined)
      firestoreData.showPhoneNumber = member.showPhoneNumber;
    if (member.joinedAt)
      firestoreData.joinedAt = firestore.Timestamp.fromDate(member.joinedAt);
    if (member.sponsorSettings !== undefined)
      firestoreData.sponsorSettings = member.sponsorSettings;

    return firestoreData;
  }

  /**
   * Get group members
   */
  static async getGroupMembers(groupId: string): Promise<GroupMember[]> {
    try {
      const membersSnapshot = await firestore()
        .collection('members')
        .where('groupId', '==', groupId)
        .get();

      return membersSnapshot.docs.map(doc => this.fromFirestore(doc));
    } catch (error) {
      console.error('Error getting group members:', error);
      throw error;
    }
  }

  /**
   * Get a member by userId
   */
  static async getMemberByUserId(userId: string): Promise<GroupMember | null> {
    try {
      const memberDoc = await firestore()
        .collection('members')
        .where('userId', '==', userId)
        .limit(1)
        .get();

      return memberDoc.docs.map(doc => this.fromFirestore(doc))[0] || null;
    } catch (error) {
      console.error('Error getting member by userId:', error);
      throw error;
    }
  }

  /**
   * Add a member to a group
   */
  static async addMember(
    groupId: string,
    userId: string,
    userData: User,
    isAdmin: boolean = false,
  ): Promise<void> {
    try {
      // Check if the membership already exists
      const membershipQuery = await firestore()
        .collection('members')
        .where('groupId', '==', groupId)
        .where('userId', '==', userId)
        .get();

      if (!membershipQuery.empty) {
        if (__DEV__) console.log('User is already a member of this group');
        return;
      }

      const authUser = auth().currentUser;
      const phoneNumber = authUser?.phoneNumber;

      // Get the photoURL from userData or from the auth user as fallback
      const photoUrl = userData?.photoUrl || authUser?.photoURL || null;

      // Add member to top-level members collection
      // Build roles array based on admin status
      const roles: string[] = isAdmin ? ['admin', 'member'] : ['member'];

      const memberDoc: GroupMember = {
        id: `${groupId}_${userId}`,
        userId: userId,
        groupId: groupId,
        name: userData?.displayName || authUser?.displayName || 'Anonymous',
        joinedAt: new Date(),
        sobrietyDate: userData?.recoveryDate,
        phoneNumber: userData?.phoneNumber || phoneNumber || undefined,
        email: userData?.email || authUser?.email || undefined,
        isAdmin: isAdmin,
        isTreasurer: false, // Default to false, will be updated when assigned
        roles: roles,
        showSobrietyDate: userData?.privacySettings?.showRecoveryDate ?? false,
        showPhoneNumber: userData?.privacySettings?.showPhoneNumber ?? false,
        photoUrl: photoUrl || undefined,
      };

      await firestore()
        .collection('members')
        .doc(`${groupId}_${userId}`)
        .set(MemberModel.toFirestore(memberDoc));

      // Update group memberCount
      await firestore()
        .collection('groups')
        .doc(groupId)
        .update({
          memberCount: firestore.FieldValue.increment(1),
          updatedAt: firestore.FieldValue.serverTimestamp(),
        });

      // Add group to user's homeGroups
      await firestore()
        .collection('users')
        .doc(userId)
        .update({
          homeGroups: firestore.FieldValue.arrayUnion(groupId),
          updatedAt: firestore.FieldValue.serverTimestamp(),
        });

      // If the current user joined the group, refresh their token to get new claims
      scheduleTokenRefresh(
        userId,
        auth().currentUser?.uid,
        'Token refresh after joining group',
      );
    } catch (error) {
      console.error('Error adding group member:', error);
      throw error;
    }
  }

  /**
   * Remove a member from a group
   */
  static async removeMember(groupId: string, userId: string): Promise<void> {
    try {
      // Check if membership exists
      const memberDocRef = firestore()
        .collection('members')
        .doc(`${groupId}_${userId}`);

      const memberDoc = await getRequiredDoc(
        'members',
        `${groupId}_${userId}`,
        'Member not found in this group',
      );

      const memberData = memberDoc.data() as GroupMemberDocument;

      // If member is admin, check if they're the last admin
      if (memberData.isAdmin) {
        const groupDoc = await firestore()
          .collection('groups')
          .doc(groupId)
          .get();

        const groupData = groupDoc.data();

        if (
          groupData &&
          groupData.admins.length === 1 &&
          groupData.admins[0] === userId
        ) {
          throw new Error('Cannot remove the last admin from a group');
        }

        // Remove user from admins array in group document
        await firestore()
          .collection('groups')
          .doc(groupId)
          .update({
            admins: firestore.FieldValue.arrayRemove(userId),
            updatedAt: firestore.FieldValue.serverTimestamp(),
          });
      }

      // Remove member document
      await memberDocRef.delete();

      // Update group memberCount
      await firestore()
        .collection('groups')
        .doc(groupId)
        .update({
          memberCount: firestore.FieldValue.increment(-1),
          updatedAt: firestore.FieldValue.serverTimestamp(),
        });

      // Remove group from user's homeGroups
      await firestore()
        .collection('users')
        .doc(userId)
        .update({
          homeGroups: firestore.FieldValue.arrayRemove(groupId),
          updatedAt: firestore.FieldValue.serverTimestamp(),
        });

      // If the current user left the group, refresh their token to remove claims
      scheduleTokenRefresh(
        userId,
        auth().currentUser?.uid,
        'Token refresh after leaving group',
      );
    } catch (error) {
      console.error('Error removing group member:', error);
      throw error;
    }
  }

  /**
   * Make a user an admin of a group
   */
  static async makeAdmin(groupId: string, userId: string): Promise<void> {
    try {
      const memberDocRef = firestore()
        .collection('members')
        .doc(`${groupId}_${userId}`);

      await getRequiredDoc(
        'members',
        `${groupId}_${userId}`,
        'Member not found in this group',
      );

      const groupRef = firestore().collection('groups').doc(groupId);
      const groupDoc = await groupRef.get();

      if (!groupDoc.exists) {
        throw new Error('Group not found');
      }

      // Get current admins array
      const groupData = groupDoc.data();
      const currentAdmins = groupData?.admins || [];

      // Check if user is already an admin
      if (currentAdmins.includes(userId)) {
        return; // Already an admin, nothing to do
      }

      // Add user to admins array in group document
      await groupRef.update({
        admins: firestore.FieldValue.arrayUnion(userId),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });

      // Update member document with admin status and roles
      await memberDocRef.update({
        isAdmin: true,
        roles: firestore.FieldValue.arrayUnion('admin'),
      });

      // If the current user was made admin, refresh their token to get new claims
      scheduleTokenRefresh(
        userId,
        auth().currentUser?.uid,
        'Token refresh after admin change',
      );
    } catch (error) {
      console.error('Error making user admin:', error);
      throw error;
    }
  }

  /**
   * Remove a user as admin of a group
   */
  static async removeAdmin(groupId: string, userId: string): Promise<void> {
    try {
      const memberDocRef = firestore()
        .collection('members')
        .doc(`${groupId}_${userId}`);

      await getRequiredDoc(
        'members',
        `${groupId}_${userId}`,
        'Member not found in this group',
      );

      const groupRef = firestore().collection('groups').doc(groupId);
      const groupDoc = await groupRef.get();

      if (!groupDoc.exists) {
        throw new Error('Group not found');
      }

      // Get current admins array
      const groupData = groupDoc.data();
      const currentAdmins = groupData?.admins || [];

      // Check if user is an admin
      if (!currentAdmins.includes(userId)) {
        return; // Not an admin, nothing to do
      }

      // Check if user is the last admin
      if (currentAdmins.length === 1 && currentAdmins[0] === userId) {
        throw new Error('Cannot remove the last admin from a group');
      }

      // Remove user from admins array in group document
      await groupRef.update({
        admins: firestore.FieldValue.arrayRemove(userId),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });

      // Update member document with admin status and roles
      await memberDocRef.update({
        isAdmin: false,
        roles: firestore.FieldValue.arrayRemove('admin'),
      });

      // If the current user lost admin, refresh their token to get new claims
      scheduleTokenRefresh(
        userId,
        auth().currentUser?.uid,
        'Token refresh after admin removal',
      );
    } catch (error) {
      console.error('Error removing user as admin:', error);
      throw error;
    }
  }

  /**
   * Update treasurer status for a member
   */
  static async updateTreasurerStatus(
    groupId: string,
    userId: string,
    isTreasurer: boolean,
  ): Promise<void> {
    try {
      const memberDocRef = firestore()
        .collection('members')
        .doc(`${groupId}_${userId}`);

      await getRequiredDoc(
        'members',
        `${groupId}_${userId}`,
        'Member not found in this group',
      );

      // Update treasurer status and roles
      if (isTreasurer) {
        await memberDocRef.update({
          isTreasurer: true,
          roles: firestore.FieldValue.arrayUnion('treasurer'),
        });
      } else {
        await memberDocRef.update({
          isTreasurer: false,
          roles: firestore.FieldValue.arrayRemove('treasurer'),
        });
      }

      // If the current user's treasurer status changed, refresh their token
      scheduleTokenRefresh(
        userId,
        auth().currentUser?.uid,
        'Token refresh after treasurer change',
      );
    } catch (error) {
      console.error('Error updating treasurer status:', error);
      throw error;
    }
  }

  /**
   * Check if user is a member of the group
   */
  static async isGroupMember(
    groupId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      // Check using both methods for compatibility during migration
      // First try the modern way with userId field
      const memberQuery = await firestore()
        .collection('members')
        .where('groupId', '==', groupId)
        .where('userId', '==', userId)
        .limit(1)
        .get();

      return !memberQuery.empty;
    } catch (error) {
      console.error('Error checking if user is a member:', error);
      return false;
    }
  }

  /**
   * Get all groups a user is a member of
   */
  static async getUserGroups(userId: string): Promise<string[]> {
    try {
      // Modern approach using userId field
      const membersSnapshot = await firestore()
        .collection('members')
        .where('userId', '==', userId)
        .get();

      return membersSnapshot.docs.map(doc => doc.data().groupId);
    } catch (error) {
      console.error('Error getting user groups:', error);
      throw error;
    }
  }

  /**
   * Update member position/role
   */
  static async updateMemberPosition(
    groupId: string,
    userId: string,
    position: string,
  ): Promise<void> {
    try {
      const memberDocRef = firestore()
        .collection('members')
        .doc(`${groupId}_${userId}`);

      await getRequiredDoc(
        'members',
        `${groupId}_${userId}`,
        'Member not found in this group',
      );

      // Update member position
      await memberDocRef.update({
        position: position,
      });
    } catch (error) {
      console.error('Error updating member position:', error);
      throw error;
    }
  }

  /**
   * Update sobriety date visibility
   */
  static async updateSobrietyDateVisibility(
    groupId: string,
    userId: string,
    showSobrietyDate: boolean,
  ): Promise<void> {
    try {
      const memberDocRef = firestore()
        .collection('members')
        .doc(`${groupId}_${userId}`);

      await getRequiredDoc(
        'members',
        `${groupId}_${userId}`,
        'Member not found in this group',
      );

      // Update sobriety date visibility
      await memberDocRef.update({
        showSobrietyDate: showSobrietyDate,
      });
    } catch (error) {
      console.error('Error updating sobriety date visibility:', error);
      throw error;
    }
  }

  /**
   * Get all memberships for a specific user
   */
  static async getUserMemberships(userId: string): Promise<GroupMember[]> {
    try {
      // Use the userId field for direct querying
      const membersSnapshot = await firestore()
        .collection('members')
        .where('userId', '==', userId)
        .get();

      if (__DEV__)
        console.log(
          `Found ${membersSnapshot.docs.length} memberships for user ${userId}`,
        );

      // Convert to GroupMember objects
      return membersSnapshot.docs.map(doc => this.fromFirestore(doc));
    } catch (error) {
      console.error('Error getting user memberships:', error);
      throw error;
    }
  }

  /**
   * Update user's information across all their memberships
   * Uses the most efficient approach possible with Firestore
   */
  static async updateUserAcrossMemberships(
    userId: string,
    userData: {
      displayName?: string;
      sobrietyDate?: string | null;
      photoUrl?: string;
      email?: string;
      showSobrietyDate?: boolean;
      phoneNumber?: string;
      showPhoneNumber?: boolean;
      sponsorSettings?: any;
    },
  ): Promise<void> {
    try {
      // Log the start of the operation for debugging
      if (__DEV__)
        console.log(`Updating membership documents for user ${userId}`);

      // Use the userId field for direct querying
      const membersSnapshot = await firestore()
        .collection('members')
        .where('userId', '==', userId)
        .get();

      if (__DEV__)
        console.log(
          `Found ${membersSnapshot.docs.length} member documents to update`,
        );

      // If no memberships found, exit early
      if (membersSnapshot.empty) {
        if (__DEV__) console.log('No memberships found for user', userId);
        return;
      }

      // Prepare the update object once - same update will be applied to all documents
      const updates: Record<string, any> = {};

      if (userData.displayName !== undefined) {
        updates.displayName = userData.displayName;
      }

      if (userData.sobrietyDate !== undefined) {
        updates.sobrietyDate = userData.sobrietyDate
          ? firestore.Timestamp.fromDate(new Date(userData.sobrietyDate))
          : null;
      }

      if (userData.photoUrl !== undefined) {
        updates.photoUrl = userData.photoUrl;
      }

      if (userData.email !== undefined) {
        updates.email = userData.email;
      }

      if (userData.showSobrietyDate !== undefined) {
        updates.showSobrietyDate = userData.showSobrietyDate;
      }

      if (userData.phoneNumber !== undefined) {
        updates.phoneNumber = userData.phoneNumber;
      }

      if (userData.showPhoneNumber !== undefined) {
        updates.showPhoneNumber = userData.showPhoneNumber;
      }

      if (userData.sponsorSettings !== undefined) {
        updates.sponsorSettings = userData.sponsorSettings;
      }

      // Only proceed if there are changes to make
      if (Object.keys(updates).length === 0) {
        if (__DEV__) console.log('No updates needed for member documents');
        return;
      }

      // Add timestamp for all updates
      updates.updatedAt = firestore.FieldValue.serverTimestamp();

      // Use a single batch update when possible (Firestore limit is 500 operations per batch)
      const batchSize = 500;
      const totalDocs = membersSnapshot.docs.length;

      if (totalDocs <= batchSize) {
        // If we have fewer than 500 documents, use a single batch
        const batch = firestore().batch();

        membersSnapshot.docs.forEach(doc => {
          batch.update(doc.ref, updates);
        });

        await batch.commit();
        if (__DEV__)
          console.log(
            `Successfully updated ${totalDocs} membership documents in a single batch`,
          );
      } else {
        // For larger sets, we need multiple batches
        let processed = 0;
        let batchCount = 0;

        while (processed < totalDocs) {
          const batch = firestore().batch();
          const end = Math.min(processed + batchSize, totalDocs);

          for (let i = processed; i < end; i++) {
            batch.update(membersSnapshot.docs[i].ref, updates);
          }

          await batch.commit();
          batchCount++;
          processed = end;

          if (__DEV__)
            console.log(
              `Batch ${batchCount}: Updated ${
                end - processed
              } documents (${processed}/${totalDocs} total)`,
            );
        }

        if (__DEV__)
          console.log(
            `Successfully updated ${totalDocs} membership documents in ${batchCount} batches`,
          );
      }
    } catch (error) {
      console.error('Error updating user memberships:', error);
      throw error;
    }
  }

  /**
   * Get all member documents for a specific user across all groups
   * This retrieves all membership documents where the user is a member,
   * efficiently querying based on document ID pattern ${groupId}_${userId}
   */
  static async getAllUserMemberDocuments(
    userId: string,
  ): Promise<GroupMember[]> {
    try {
      if (__DEV__)
        console.log(`Fetching all member documents for user: ${userId}`);

      const membersSnapshot = await firestore()
        .collection('members')
        .where('userId', '==', userId)
        .get();

      return membersSnapshot.docs.map(doc => this.fromFirestore(doc));
    } catch (error) {
      console.error('Error getting user member documents:', error);
      throw new Error(
        `Failed to get member documents for user ${userId}: ${error}`,
      );
    }
  }

  /**
   * Update a user's photo URL across all their member documents
   * This is useful when a user updates their profile photo
   */
  static async updateUserPhotoURL(
    userId: string,
    photoURL: string | null,
  ): Promise<void> {
    try {
      if (__DEV__)
        console.log(
          `Updating photo URL for user ${userId} across all member documents`,
        );

      const membersSnapshot = await firestore()
        .collection('members')
        .where('userId', '==', userId)
        .get();

      if (membersSnapshot.empty) {
        if (__DEV__)
          console.log(`No member documents found for user ${userId}`);
        return;
      }

      if (__DEV__)
        console.log(
          `Updating photo URL for ${membersSnapshot.size} member documents`,
        );

      // Batch update all documents
      const batch = firestore().batch();

      membersSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
          photoUrl: photoURL,
          updatedAt: firestore.FieldValue.serverTimestamp(),
        });
      });

      // Commit the batch
      await batch.commit();
      if (__DEV__)
        console.log(
          `Successfully updated photo URL for ${membersSnapshot.size} member documents`,
        );
    } catch (error) {
      console.error('Error updating user photo URL:', error);
      throw new Error(
        `Failed to update photo URL for user ${userId}: ${error}`,
      );
    }
  }

  /**
   * Update phone number visibility
   */
  static async updatePhoneNumberVisibility(
    groupId: string,
    userId: string,
    showPhoneNumber: boolean,
  ): Promise<void> {
    try {
      const memberDocRef = firestore()
        .collection('members')
        .doc(`${groupId}_${userId}`);

      await getRequiredDoc(
        'members',
        `${groupId}_${userId}`,
        'Member not found in this group',
      );

      // Update phone number visibility
      await memberDocRef.update({
        showPhoneNumber: showPhoneNumber,
      });
    } catch (error) {
      console.error('Error updating phone number visibility:', error);
      throw error;
    }
  }
}
