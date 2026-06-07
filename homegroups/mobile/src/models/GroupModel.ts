import {
  HomeGroup,
  GroupMember,
  Meeting,
  AdminRequestEscalationLevel,
} from '../types';
import {
  FirestoreDocument,
  GroupDocument,
  SubscriptionStatus,
} from '../types/schema';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import {MemberModel} from './MemberModel';
import {MeetingModel} from './MeetingModel';
import {cloneDeep, zip} from 'lodash';
import {mapAsync} from '../utils/async';
import {UserModel} from './UserModel';
import {
  getMostActiveAdminStatus,
  getActivityStatus,
  AUTO_APPROVE_DELAY_DAYS,
  trackActivity,
} from '../services/activityTracker';

/**
 * Group model for managing group data
 */
export class GroupModel {
  /**
   * Convert a Firestore group document to a HomeGroup object
   */
  static fromFirestore(doc: FirestoreDocument<GroupDocument>): HomeGroup {
    const data = doc.data();
    const now = new Date(); // Default date if timestamps are missing
    return {
      id: doc.id,
      type: data.type || 'AA', // Default to AA if missing
      name: data.name || 'Unnamed Group',
      description: data.description || '',
      location: data.location || '',
      address: data.address,
      city: data.city,
      state: data.state,
      zip: data.zip,
      lat: data.lat,
      lng: data.lng,
      treasurers: data.treasurers || [],
      createdAt: data.createdAt ? data.createdAt.toDate() : now,
      updatedAt: data.updatedAt ? data.updatedAt.toDate() : now,
      foundedDate: data.foundedDate
        ? data.foundedDate.toDate().toISOString()
        : undefined,
      memberCount: data.memberCount || 0,
      admins: data.admins || [],
      isClaimed: data.isClaimed || false,
      pendingAdminRequests: data.pendingAdminRequests
        ? data.pendingAdminRequests.map(request => ({
            uid: request.uid,
            requestedAt: request.requestedAt.toDate(),
            message: request.message,
            requesterName: request.requesterName,
            autoApproveAt: request.autoApproveAt?.toDate(),
            escalationLevel: request.escalationLevel || 'normal',
            notificationsSent: request.notificationsSent || 0,
          }))
        : [],
      adminDetails: data.adminDetails
        ? data.adminDetails.map((admin: any) => ({
            uid: admin.uid,
            addedAt: admin.addedAt?.toDate() || now,
            lastActiveAt: admin.lastActiveAt?.toDate() || now,
            activityStatus: admin.activityStatus || 'active',
          }))
        : undefined,
      treasury: data.treasury || {
        balance: 0,
        prudentReserve: 0,
        monthlyIncome: 0,
        monthlyExpenses: 0,
        transactions: [],
        summary: {
          balance: 0,
          prudentReserve: 0,
          monthlyIncome: 0,
          monthlyExpenses: 0,
          lastUpdated: now,
        },
      },
      placeName: data.placeName,
      meetings: [], // Initialize with empty array, will be populated when needed
      stripeCustomerId: data.stripeCustomerId,
      stripeSubscriptionItemId: data.stripeSubscriptionItemId,
      stripeSubscriptionId: data.stripeSubscriptionId,
      subscriptionStatus: data.subscriptionStatus as SubscriptionStatus,
      subscriptionExpiresAt: data.subscriptionExpiresAt?.toDate() ?? null,
      stripeConnectAccountId: data.stripeConnectAccountId,
      paymentLinks: data.paymentLinks || undefined,
      publicProfileEnabled: data.publicProfileEnabled ?? true,
    };
  }

  /**
   * Convert a HomeGroup object to a Firestore document
   */
  static toFirestore(group: Partial<HomeGroup>): Partial<GroupDocument> {
    const firestoreData: Partial<GroupDocument> = {};

    if (group.name !== undefined) firestoreData.name = group.name;
    if (group.description !== undefined)
      firestoreData.description = group.description;
    if (group.foundedDate !== undefined) {
      firestoreData.foundedDate = group.foundedDate
        ? firestore.Timestamp.fromDate(new Date(group.foundedDate))
        : undefined;
    }
    // meetings is a client-side field, not stored in Firestore — skip it
    if (group.memberCount !== undefined)
      firestoreData.memberCount = group.memberCount;
    if (group.admins !== undefined) firestoreData.admins = group.admins;
    if (group.isClaimed !== undefined)
      firestoreData.isClaimed = group.isClaimed;

    if (group.pendingAdminRequests !== undefined) {
      firestoreData.pendingAdminRequests = group.pendingAdminRequests.map(
        request => ({
          uid: request.uid,
          requestedAt: firestore.Timestamp.fromDate(request.requestedAt),
          message: request.message,
          requesterName: request.requesterName,
          autoApproveAt: request.autoApproveAt
            ? firestore.Timestamp.fromDate(request.autoApproveAt)
            : undefined,
          escalationLevel: request.escalationLevel || 'normal',
          notificationsSent: request.notificationsSent || 0,
        }),
      );
    }

    if (group.createdAt !== undefined) {
      firestoreData.createdAt = firestore.Timestamp.fromDate(group.createdAt);
    }
    if (group.updatedAt !== undefined) {
      firestoreData.updatedAt = firestore.Timestamp.fromDate(group.updatedAt);
    }

    if (group.treasurers !== undefined) {
      firestoreData.treasurers = group.treasurers;
    }

    if (group.treasury !== undefined) {
      firestoreData.treasury = {
        balance: group.treasury.balance || 0,
        prudentReserve: group.treasury.prudentReserve || 0,
        monthlyIncome: group.treasury.monthlyIncome || 0,
        monthlyExpenses: group.treasury.monthlyExpenses || 0,
        transactions: group.treasury.transactions || [],
        summary: group.treasury.summary || {
          balance: 0,
          prudentReserve: 0,
          monthlyIncome: 0,
          monthlyExpenses: 0,
          lastUpdated: new Date(),
        },
      };
    }

    // Location information
    if (group.location !== undefined) firestoreData.location = group.location;
    if (group.address !== undefined) firestoreData.address = group.address;
    if (group.city !== undefined) firestoreData.city = group.city;
    if (group.state !== undefined) firestoreData.state = group.state;
    if (group.zip !== undefined) firestoreData.zip = group.zip;
    if (group.lat !== undefined) firestoreData.lat = group.lat;
    if (group.lng !== undefined) firestoreData.lng = group.lng;
    if (group.placeName !== undefined)
      firestoreData.placeName = group.placeName;
    if (group.type !== undefined) firestoreData.type = group.type;
    if (group.stripeCustomerId !== undefined)
      firestoreData.stripeCustomerId = group.stripeCustomerId;
    if (group.stripeSubscriptionItemId !== undefined)
      firestoreData.stripeSubscriptionItemId = group.stripeSubscriptionItemId;
    if (group.stripeSubscriptionId !== undefined)
      firestoreData.stripeSubscriptionId = group.stripeSubscriptionId;
    if (group.subscriptionStatus !== undefined)
      firestoreData.subscriptionStatus =
        group.subscriptionStatus as SubscriptionStatus;
    if (group.stripeConnectAccountId !== undefined)
      firestoreData.stripeConnectAccountId = group.stripeConnectAccountId;
    if (group.distanceInKm !== undefined)
      firestoreData.distanceInKm = group.distanceInKm;
    if (group.paymentLinks !== undefined)
      firestoreData.paymentLinks = group.paymentLinks;
    if (group.publicProfileEnabled !== undefined)
      firestoreData.publicProfileEnabled = group.publicProfileEnabled;

    return firestoreData;
  }

  /**
   * Get a group by ID
   */
  static async getById(id: string): Promise<HomeGroup | null> {
    try {
      const doc = await firestore().collection('groups').doc(id).get();
      if (!doc.exists) {
        return null;
      }
      return GroupModel.fromFirestore({
        id: doc.id,
        data: () => doc.data() as any,
      });
    } catch (error) {
      console.error('Error getting group by ID:', error);
      return null;
    }
  }

  /**
   * Create a new group
   */
  static async create(groupData: Partial<HomeGroup>): Promise<HomeGroup> {
    try {
      const currentUser = auth().currentUser;

      if (!currentUser) {
        throw new Error('No authenticated user');
      }

      const now = new Date();
      const defaultGroup: HomeGroup = {
        id: '',
        name: '',
        description: '',
        location: '',
        createdAt: now,
        updatedAt: now,
        memberCount: 1,
        admins: [currentUser.uid],
        isClaimed: true, // Initialize this field
        // @deprecated - treasurers are now managed via service positions.
        // This is kept for backward compatibility during migration.
        // New groups created via cloud function do NOT set this field.
        treasurers: [],
        treasury: {
          balance: 0,
          prudentReserve: 0,
          monthlyIncome: 0,
          monthlyExpenses: 0,
          transactions: [],
          summary: {
            balance: 0,
            prudentReserve: 0,
            monthlyIncome: 0,
            monthlyExpenses: 0,
            lastUpdated: now,
          },
        },
        type: 'AA',
        meetings: [], // Initialize with empty array
      };

      const newGroup = {...defaultGroup, ...groupData};
      const newGroupForFirestore = {...newGroup};
      // Remove ID field from the Firestore data
      if ('id' in newGroupForFirestore) {
        delete (newGroupForFirestore as {id?: string}).id;
      }

      let meetings = cloneDeep(newGroup.meetings);
      // Remove meetings from the Firestore data
      if ('meetings' in newGroupForFirestore) {
        delete (newGroupForFirestore as {meetings?: Meeting[]}).meetings;
      }

      const docRef = await firestore()
        .collection('groups')
        .add(GroupModel.toFirestore(newGroupForFirestore));

      // Add groupId to each meeting
      meetings = meetings?.map(meeting => ({
        ...meeting,
        groupId: docRef.id,
      }));
      await MeetingModel.createBatch(meetings || []);

      // Get user data
      const user = await UserModel.getById(currentUser.uid);

      if (!user) {
        throw new Error('User not found');
      }

      // Add current user as a member using the MemberModel
      await MemberModel.addMember(docRef.id, currentUser.uid, user, true);

      const createdGroup = await docRef.get();
      return {
        ...GroupModel.fromFirestore({
          id: createdGroup.id,
          data: () => createdGroup.data() as GroupDocument,
        }),
        id: docRef.id,
        meetings: meetings || [],
      };
    } catch (error) {
      console.error('Error creating group:', error);
      throw error;
    }
  }

  /**
   * Update a group
   */
  static async update(
    groupId: string,
    groupData: Partial<HomeGroup>,
  ): Promise<HomeGroup> {
    try {
      const groupRef = firestore().collection('groups').doc(groupId);
      const groupDoc = await groupRef.get();

      if (!groupDoc.exists) {
        throw new Error('Group not found');
      }

      const updatedFields = {
        ...groupData,
        updatedAt: new Date(),
      };

      await groupRef.update(GroupModel.toFirestore(updatedFields));

      const updatedDoc = await groupRef.get();
      return GroupModel.fromFirestore({
        id: updatedDoc.id,
        data: () => updatedDoc.data() as GroupDocument,
      });
    } catch (error) {
      console.error('Error updating group:', error);
      throw error;
    }
  }

  /**
   * Get group members
   */
  static async getMembers(groupId: string): Promise<GroupMember[]> {
    try {
      // Use MemberModel to get group members from top-level collection
      return MemberModel.getGroupMembers(groupId);
    } catch (error) {
      console.error('Error getting group members:', error);
      throw error;
    }
  }

  /**
   * Add a member to a group
   */
  static async addMember(
    groupId: string,
    userId: string,
    isAdmin: boolean = false,
  ): Promise<void> {
    try {
      const user = await UserModel.getById(userId);

      if (!user) {
        throw new Error('User not found');
      }

      // Use MemberModel to add member to top-level collection
      await MemberModel.addMember(groupId, userId, user, isAdmin);
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
      // Use MemberModel to remove member from top-level collection
      await MemberModel.removeMember(groupId, userId);
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
      // Use MemberModel to make user an admin
      await MemberModel.makeAdmin(groupId, userId);
    } catch (error) {
      console.error('Error making user admin:', error);
      throw error;
    }
  }

  static async completeDonation(
    groupId: string,
    amount: number,
    donationId: string,
  ): Promise<HomeGroup | null> {
    try {
      const groupRef = firestore().collection('groups').doc(groupId);
      const donationRef = groupRef.collection('donations').doc(donationId);

      // First check if the donation document exists
      const donationDoc = await donationRef.get();
      if (!donationDoc.exists) {
        console.error('Donation document not found:', donationId);
        throw new Error('Donation record not found');
      }

      // Update the group's treasury balance
      await groupRef.update({
        'treasury.balance': firestore.FieldValue.increment(amount),
        'treasury.monthlyIncome': firestore.FieldValue.increment(amount),
        'treasury.summary.monthlyIncome':
          firestore.FieldValue.increment(amount),
        'treasury.summary.lastUpdated': firestore.FieldValue.serverTimestamp(),
      });

      // Update the donation document
      await donationRef.update({
        status: 'completed',
        completedAt: firestore.FieldValue.serverTimestamp(),
      });

      return GroupModel.getById(groupId);
    } catch (error) {
      console.error('Error completing donation:', error);
      throw error;
    }
  }

  /**
   * Remove a user as admin of a group
   */
  static async removeAdmin(groupId: string, userId: string): Promise<void> {
    try {
      // Use MemberModel to remove user as admin
      await MemberModel.removeAdmin(groupId, userId);
    } catch (error) {
      console.error('Error removing user as admin:', error);
      throw error;
    }
  }

  /**
   * Update group information
   */
  static async updateGroupInfo(
    groupId: string,
    groupInfo: {
      name?: string;
      description?: string;
      meetings?: Meeting[];
      format?: string;
      isOnline?: boolean;
      location?: string;
      address?: string;
      onlineLink?: string;
    },
  ): Promise<void> {
    try {
      const groupRef = firestore().collection('groups').doc(groupId);

      // Check if group exists
      const groupDoc = await groupRef.get();

      if (!groupDoc.exists) {
        throw new Error('Group not found');
      }

      // Update group information
      await groupRef.update({
        ...groupInfo,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating group info:', error);
      throw error;
    }
  }

  /**
   * Delete a group
   */
  static async deleteGroup(groupId: string): Promise<void> {
    try {
      const groupRef = firestore().collection('groups').doc(groupId);

      // Check if group exists
      const groupDoc = await groupRef.get();

      if (!groupDoc.exists) {
        throw new Error('Group not found');
      }

      const groupData = groupDoc.data();

      // Get all members
      const membersSnapshot = await firestore()
        .collection('members')
        .where('groupId', '==', groupId)
        .get();

      const userIds = membersSnapshot.docs.map(doc => {
        const memberData = doc.data() as GroupMember;
        return memberData.userId;
      });

      // Batch write to remove group from all members' homeGroups
      const batch = firestore().batch();

      for (const userId of userIds) {
        const userRef = firestore().collection('users').doc(userId);
        batch.update(userRef, {
          homeGroups: firestore.FieldValue.arrayRemove(groupId),
          updatedAt: firestore.FieldValue.serverTimestamp(),
        });
      }

      // Commit batch
      await batch.commit();

      // Delete the group document
      await groupRef.delete();
    } catch (error) {
      console.error('Error deleting group:', error);
      throw error;
    }
  }

  /**
   * Get admin users for a group
   */
  /**
   * Get all admins for a group reliably
   * This uses the group.admins array as the source of truth and verifies
   * against member documents for consistency
   * @param groupId The ID of the group
   * @returns Promise that resolves to an array of admin members
   */
  static async getGroupAdmins(groupId: string): Promise<GroupMember[]> {
    try {
      const groupRef = firestore().collection('groups').doc(groupId);

      // Check if group exists
      const groupDoc = await groupRef.get();

      if (!groupDoc.exists) {
        throw new Error('Group not found');
      }

      const groupData = groupDoc.data();
      const adminIds = groupData?.admins || [];

      if (adminIds.length === 0) {
        return [];
      }

      // Get all members for the group
      const members = await this.getMembers(groupId);

      // Filter to only admins based on group.admins array (source of truth)
      // Note: group.admins stores userId (Firebase Auth UID), not memberId
      const admins = members.filter(member => {
        if (!member.userId) {
          console.warn(
            `Member ${member.id} in group ${groupId} has no userId. ` +
              `Cannot check admin status.`,
          );
          return false;
        }
        return adminIds.includes(member.userId);
      });

      // Verify consistency: check if any adminIds don't have corresponding members
      const adminIdsWithoutMembers = adminIds.filter(
        (adminId: string) => !members.some(m => m.userId === adminId),
      );

      if (adminIdsWithoutMembers.length > 0) {
        console.warn(
          `Group ${groupId} has admin IDs without member documents: ` +
            `${adminIdsWithoutMembers.join(', ')}`,
        );
      }

      return admins;
    } catch (error) {
      console.error('Error getting group admins:', error);
      throw error;
    }
  }

  /**
   * Update member role/position
   */
  static async updateMemberPosition(
    groupId: string,
    userId: string,
    position: string,
  ): Promise<void> {
    try {
      // Use MemberModel to update member position
      await MemberModel.updateMemberPosition(groupId, userId, position);
    } catch (error) {
      console.error('Error updating member position:', error);
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
      // Use MemberModel to check if user is a member
      return MemberModel.isGroupMember(groupId, userId);
    } catch (error) {
      console.error('Error checking if user is a member:', error);
      return false;
    }
  }

  /**
   * Check if user is an admin of the group
   */
  /**
   * Reliably check if a user is an admin of a group
   * This checks both the group.admins array (source of truth) and the member.isAdmin field
   * for consistency. The group.admins array is the authoritative source.
   * @param groupId The ID of the group
   * @param userId The ID of the user
   * @returns Promise that resolves to true if the user is an admin
   */
  static async isGroupAdmin(groupId: string, userId: string): Promise<boolean> {
    try {
      const groupRef = firestore().collection('groups').doc(groupId);
      const groupDoc = await groupRef.get();

      if (!groupDoc.exists) {
        return false;
      }

      const groupData = groupDoc.data();
      const adminIds = groupData?.admins || [];

      // Check the group.admins array (source of truth)
      const isInAdminsArray = adminIds.includes(userId);

      // Also check member document for consistency (but don't rely on it alone)
      // This helps identify cases where the member document is out of sync
      try {
        const memberRef = firestore()
          .collection('members')
          .doc(`${groupId}_${userId}`);
        const memberDoc = await memberRef.get();

        if (memberDoc.exists) {
          const memberData = memberDoc.data();
          const memberIsAdmin = memberData?.isAdmin || false;

          // If there's a mismatch, log a warning (but group.admins is authoritative)
          if (isInAdminsArray && !memberIsAdmin) {
            console.warn(
              `Admin status mismatch for user ${userId} in group ${groupId}: ` +
                `in group.admins but member.isAdmin is false. ` +
                `Consider syncing the member document.`,
            );
          } else if (!isInAdminsArray && memberIsAdmin) {
            console.warn(
              `Admin status mismatch for user ${userId} in group ${groupId}: ` +
                `member.isAdmin is true but not in group.admins. ` +
                `The group.admins array is authoritative.`,
            );
          }
        }
      } catch (memberError) {
        // If we can't check the member document, that's okay - group.admins is authoritative
        console.warn(
          `Could not check member document for admin status: ${memberError}`,
        );
      }

      // Return based on group.admins array (source of truth)
      return isInAdminsArray;
    } catch (error) {
      console.error('Error checking if user is an admin:', error);
      return false;
    }
  }

  /**
   * Get recent groups (useful for discovery)
   */
  static async getRecentGroups(limit: number = 10): Promise<HomeGroup[]> {
    try {
      const groupsSnapshot = await firestore()
        .collection('groups')
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      return groupsSnapshot.docs.map(doc =>
        this.fromFirestore({
          id: doc.id,
          data: () => doc.data() as GroupDocument,
        }),
      );
    } catch (error) {
      console.error('Error getting recent groups:', error);
      throw error;
    }
  }

  /**
   * Search groups by name
   * Uses multiple query variants to handle case-sensitivity in Firestore
   */
  static async searchGroups(
    query: string,
    limit: number = 10,
  ): Promise<HomeGroup[]> {
    try {
      // Firebase doesn't support native text search, so we'll use startAt/endAt with query
      // Firestore is case-sensitive, so we need to search with multiple casing variants

      const results: Map<string, HomeGroup> = new Map();

      // Generate query variants to handle different casing
      const queryVariants = [
        query.trim(), // Original query as entered
        query.trim().toLowerCase(), // All lowercase
        query.trim().charAt(0).toUpperCase() +
          query.trim().slice(1).toLowerCase(), // Title case
      ];

      // Remove duplicates
      const uniqueVariants = [...new Set(queryVariants)];

      // Search with each variant
      for (const variant of uniqueVariants) {
        if (results.size >= limit) break;

        const endQuery = variant + '\uf8ff'; // Unicode character for end of string

        const groupsSnapshot = await firestore()
          .collection('groups')
          .orderBy('name')
          .startAt(variant)
          .endAt(endQuery)
          .limit(limit - results.size)
          .get();

        groupsSnapshot.docs.forEach(doc => {
          if (!results.has(doc.id)) {
            results.set(
              doc.id,
              this.fromFirestore({
                id: doc.id,
                data: () => doc.data() as GroupDocument,
              }),
            );
          }
        });
      }

      return Array.from(results.values()).slice(0, limit);
    } catch (error) {
      console.error('Error searching groups:', error);
      throw error;
    }
  }

  /**
   * Get user's home groups
   */
  static async getUserGroups(userId: string): Promise<HomeGroup[]> {
    try {
      // Step 1: Get the user's memberships to find which groups they belong to
      const membersSnapshot = await firestore()
        .collection('members')
        .where('userId', '==', userId)
        .get();

      if (membersSnapshot.empty) {
        return []; // User isn't a member of any groups
      }

      // Step 2: Extract the group IDs from the memberships
      const groupIds = membersSnapshot.docs.map(doc => doc.data().groupId);

      if (groupIds.length === 0) {
        return [];
      }

      // Step 3: Fetch the actual group documents using these IDs
      const groupPromises = groupIds.map(groupId =>
        firestore().collection('groups').doc(groupId).get(),
      );

      const groupDocs = await Promise.all(groupPromises);

      // Step 4: Convert to HomeGroup objects, filtering out any that don't exist
      const groups = groupDocs
        .filter(doc => doc.exists)
        .map(doc =>
          this.fromFirestore({
            id: doc.id,
            data: () => doc.data() as GroupDocument,
          }),
        );

      // Batch fetch meetings for all groups — Firestore 'in' operator supports up to 30 items
      const BATCH_SIZE = 30;
      const allMeetings: Meeting[] = [];
      for (let i = 0; i < groupIds.length; i += BATCH_SIZE) {
        const chunk = groupIds.slice(i, i + BATCH_SIZE);
        const meetingsSnap = await firestore()
          .collection('meetings')
          .where('groupId', 'in', chunk)
          .get();
        allMeetings.push(
          ...meetingsSnap.docs.map(
            doc =>
              ({
                id: doc.id,
                ...doc.data(),
              } as Meeting),
          ),
        );
      }

      // Map meetings back to their groups
      const meetingsByGroupId = new Map<string, Meeting[]>();
      for (const meeting of allMeetings) {
        const gid = (meeting as any).groupId as string;
        meetingsByGroupId.set(gid, [
          ...(meetingsByGroupId.get(gid) ?? []),
          meeting,
        ]);
      }

      const groupsWithMeetings = groups.map(group => ({
        ...group,
        meetings: meetingsByGroupId.get(group.id) ?? [],
      }));

      // Sort groups by name
      return groupsWithMeetings.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error('Error getting user groups:', error);
      throw error;
    }
  }

  /**
   * Get all sobriety milestones for a group
   */
  static async getGroupMilestones(
    groupId: string,
    daysAhead: number = 30,
  ): Promise<
    {memberId: string; memberName: string; date: Date; years: number}[]
  > {
    try {
      // Get all members with sobriety dates from top-level members collection
      const membersWithDates: {id: string; name: string; sobrietyDate: Date}[] =
        [];

      const membersSnapshot = await firestore()
        .collection('members')
        .where('groupId', '==', groupId)
        .where('sobrietyDate', '!=', null)
        .get();

      membersSnapshot.docs.forEach(doc => {
        const memberData = doc.data();
        if (memberData.sobrietyDate && memberData.showSobrietyDate === true) {
          membersWithDates.push({
            id: doc.id,
            name: memberData.displayName,
            sobrietyDate: memberData.sobrietyDate.toDate(),
          });
        }
      });

      // Calculate upcoming milestones
      const today = new Date();
      const futureDate = new Date();
      futureDate.setDate(today.getDate() + daysAhead);

      const milestones: {
        memberId: string;
        memberName: string;
        date: Date;
        years: number;
      }[] = [];

      membersWithDates.forEach(member => {
        const sobrietyDate = member.sobrietyDate;

        // Calculate years of sobriety as of today
        const yearsFloat =
          (today.getTime() - sobrietyDate.getTime()) /
          (365.25 * 24 * 60 * 60 * 1000);
        const currentYears = Math.floor(yearsFloat);

        // Calculate the next anniversary date
        const nextAnniversary = new Date(sobrietyDate);
        nextAnniversary.setFullYear(
          sobrietyDate.getFullYear() + currentYears + 1,
        );

        // Check if the next anniversary is within our target period
        if (nextAnniversary >= today && nextAnniversary <= futureDate) {
          milestones.push({
            memberId: member.id,
            memberName: member.name,
            date: nextAnniversary,
            years: currentYears + 1,
          });
        }
      });

      // Sort by date
      return milestones.sort((a, b) => a.date.getTime() - b.date.getTime());
    } catch (error) {
      console.error('Error getting group milestones:', error);
      throw error;
    }
  }

  /**
   * Create a group from a meeting
   */
  static async createFromMeeting(meeting: Meeting): Promise<HomeGroup> {
    try {
      const currentUser = auth().currentUser;

      if (!currentUser) {
        throw new Error('No authenticated user');
      }

      // Check if meeting already has a group
      if (meeting.groupId) {
        throw new Error('This meeting already has an associated group');
      }

      const now = new Date();
      const groupData: Partial<HomeGroup> = {
        name: `${meeting.name} Group`,
        description: `A recovery group that meets at ${meeting.name}`,
        location: meeting.location,
        address: meeting.address,
        lat: meeting.lat,
        lng: meeting.lng,
        createdAt: now,
        updatedAt: now,
        memberCount: 1,
        admins: [currentUser.uid],
      };

      // Create group - this will also handle setting the geohash if lat/lng are provided
      const group = await GroupModel.create(groupData);

      // Update the meeting with the new group ID
      await firestore().collection('meetings').doc(meeting.id).update({
        groupId: group.id,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });

      return group;
    } catch (error) {
      console.error('Error creating group from meeting:', error);
      throw error;
    }
  }

  static async updateMeetingGroupId(
    meetingId: string,
    groupId: string,
  ): Promise<void> {
    try {
      const meetingRef = firestore().collection('meetings').doc(meetingId);
      await meetingRef.update({
        groupId: groupId,
      });
    } catch (error) {
      console.error('Error updating meeting group ID:', error);
      throw error;
    }
  }

  /**
   * Add a meeting to an existing group
   */
  static async addMeetingToGroup(
    groupId: string,
    meeting: Meeting,
  ): Promise<void> {
    try {
      const groupRef = firestore().collection('groups').doc(groupId);
      const groupDoc = await groupRef.get();

      if (!groupDoc.exists) {
        throw new Error('Group not found');
      }

      // Update the meeting with the group ID
      await this.updateMeetingGroupId(meeting.id!, groupId);
    } catch (error) {
      console.error('Error adding meeting to group:', error);
      throw error;
    }
  }

  /**
   * Search groups by location using Cloud Function
   * @param latitude User's latitude
   * @param longitude User's longitude
   * @param radius Radius in miles
   * @returns Promise<HomeGroup[]>
   */
  static async searchGroupsByLocation(
    latitude: number,
    longitude: number,
    radius: number,
  ): Promise<HomeGroup[]> {
    try {
      console.log(
        `Calling searchGroupsByLocation cloud function with lat=${latitude}, lng=${longitude}, radius=${radius}`,
      );

      // Call the Cloud Function to search groups by location
      const functions = firestore().app.functions('us-central1');
      const searchFunction = functions.httpsCallable<unknown, HomeGroup[]>(
        'searchGroupsByLocation',
      );

      const result = await searchFunction({
        lat: latitude,
        lng: longitude,
        radius: radius,
      });

      console.log(`Cloud function returned ${result.data?.length || 0} groups`);

      const groups = result.data || [];

      console.log(
        `Found ${groups.length} groups within ${radius} miles using cloud function`,
      );
      return groups;
    } catch (error) {
      console.error('Error searching groups by location:', error);
      throw error;
    }
  }

  /**
   * Get the current user's ID
   * @returns The current user's UID or null if not authenticated
   */
  static getCurrentUserId(): string | null {
    const currentUser = auth().currentUser;
    return currentUser ? currentUser.uid : null;
  }

  /**
   * Request admin access for a group
   * @param groupId The ID of the group
   * @param message Optional message explaining the connection to the group
   * @returns Promise that resolves when the request is submitted
   */
  /**
   * Request admin access with escalation based on current admin activity
   * @param groupId Group ID
   * @param message Optional message from requester
   * @returns Escalation info including level and auto-approve time
   */
  static async requestAdminAccess(
    groupId: string,
    message?: string,
  ): Promise<{
    escalationLevel: AdminRequestEscalationLevel;
    autoApproveAt?: Date;
    adminActivityStatus?: string;
  }> {
    const currentUser = auth().currentUser;

    if (!currentUser) {
      throw new Error('You must be logged in to request admin access');
    }

    const userId = currentUser.uid;
    const groupRef = firestore().collection('groups').doc(groupId);

    // Get the current group data
    const groupDoc = await groupRef.get();

    if (!groupDoc.exists) {
      throw new Error('Group not found');
    }

    const groupData = groupDoc.data();

    // Check if user is already an admin
    if (groupData?.admins?.includes(userId)) {
      throw new Error('You are already an admin of this group');
    }

    // Check if user already has a pending request
    const pendingRequests = groupData?.pendingAdminRequests || [];
    const existingRequest = pendingRequests.find(
      (req: any) => req.uid === userId,
    );

    if (existingRequest) {
      throw new Error('You already have a pending request for this group');
    }

    // Get requester's display name
    const requesterDoc = await firestore()
      .collection('users')
      .doc(userId)
      .get();
    const requesterName = requesterDoc.data()?.displayName || 'Unknown';

    // Determine escalation level based on admin activity
    let escalationLevel: AdminRequestEscalationLevel = 'normal';
    let autoApproveAt: Date | undefined;
    let adminActivityStatus = 'active';

    const admins = groupData?.admins || [];

    if (admins.length === 0) {
      // No admins - instant claim
      escalationLevel = 'instant';
      adminActivityStatus = 'dormant';
    } else {
      // Get most active admin's status
      const adminStatus = await getMostActiveAdminStatus(groupId);
      adminActivityStatus = adminStatus.allAdminsStatus;

      if (adminStatus.allAdminsStatus === 'dormant') {
        // All admins dormant (60+ days inactive) - instant claim
        escalationLevel = 'instant';
      } else if (adminStatus.allAdminsStatus === 'inactive') {
        // Admins inactive (30-60 days) - timed auto-approve
        escalationLevel = 'timed';
        const now = new Date();
        autoApproveAt = new Date(
          now.getTime() + AUTO_APPROVE_DELAY_DAYS * 24 * 60 * 60 * 1000,
        );
      }
      // else: active admins - normal flow
    }

    const now = firestore.Timestamp.now();

    if (escalationLevel === 'instant') {
      // Instant claim - use transaction to prevent race conditions
      await firestore().runTransaction(async transaction => {
        const groupSnapshot = await transaction.get(groupRef);
        const currentData = groupSnapshot.data();

        // Re-check if user is already admin (race condition check)
        if (currentData?.admins?.includes(userId)) {
          throw new Error('You are already an admin of this group');
        }

        // Update group document
        transaction.update(groupRef, {
          admins: firestore.FieldValue.arrayUnion(userId),
          adminUids: firestore.FieldValue.arrayUnion(userId),
          adminDetails: firestore.FieldValue.arrayUnion({
            uid: userId,
            addedAt: now,
            lastActiveAt: now,
            activityStatus: 'active',
          }),
          isClaimed: true,
          updatedAt: now,
        });

        // Update user's admin groups
        const userRef = firestore().collection('users').doc(userId);
        transaction.update(userRef, {
          adminGroups: firestore.FieldValue.arrayUnion(groupId),
          updatedAt: now,
        });
      });

      return {
        escalationLevel: 'instant',
        adminActivityStatus,
      };
    }

    // Create the request with escalation info
    const newRequest = {
      uid: userId,
      requestedAt: now,
      message: message || '',
      requesterName,
      escalationLevel,
      autoApproveAt: autoApproveAt
        ? firestore.Timestamp.fromDate(autoApproveAt)
        : null,
      notificationsSent: 0,
    };

    await groupRef.update({
      pendingAdminRequests: firestore.FieldValue.arrayUnion(newRequest),
      updatedAt: now,
    });

    return {
      escalationLevel,
      autoApproveAt,
      adminActivityStatus,
    };
  }

  /**
   * Get all groups with pending admin requests
   * For super admin use
   * @returns Promise that resolves to an array of groups with pending requests
   */
  static async getGroupsWithPendingRequests(): Promise<HomeGroup[]> {
    const isSuperAdmin = await UserModel.isSuperAdmin();

    if (!isSuperAdmin) {
      throw new Error('Only super admins can view pending requests');
    }

    const snapshot = await firestore()
      .collection('groups')
      .where('pendingAdminRequests', '!=', [])
      .get();

    return snapshot.docs.map(doc =>
      this.fromFirestore({
        id: doc.id,
        data: () => doc.data() as GroupDocument,
      }),
    );
  }

  /**
   * Approve an admin request
   * @param groupId The ID of the group
   * @param requestUid The UID of the user whose request is being approved
   * @returns Promise that resolves when the request is approved
   */
  static async approveAdminRequest(
    groupId: string,
    requestUid: string,
  ): Promise<void> {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('You must be logged in');
    }

    // Check if user is group admin or super admin
    const userIsGroupAdmin = await this.isGroupAdmin(groupId, currentUser.uid);
    const isSuperAdmin = await UserModel.isSuperAdmin();

    if (!userIsGroupAdmin && !isSuperAdmin) {
      throw new Error('Only group admins can approve requests');
    }

    const groupRef = firestore().collection('groups').doc(groupId);
    const groupDoc = await groupRef.get();

    if (!groupDoc.exists) {
      throw new Error('Group not found');
    }

    const groupData = groupDoc.data();
    const pendingRequests = groupData?.pendingAdminRequests || [];
    const requestIndex = pendingRequests.findIndex(
      (req: any) => req.uid === requestUid,
    );

    if (requestIndex === -1) {
      throw new Error('Request not found');
    }

    // Remove the request from pending
    const updatedRequests = [...pendingRequests];
    updatedRequests.splice(requestIndex, 1);

    // Add the user as an admin
    await firestore().runTransaction(async transaction => {
      transaction.update(groupRef, {
        pendingAdminRequests: updatedRequests,
        admins: firestore.FieldValue.arrayUnion(requestUid),
        isClaimed: true,
      });
    });

    // Update the member document to set isAdmin = true
    // This ensures consistency between group.admins and member.isAdmin
    const memberRef = firestore()
      .collection('members')
      .doc(`${groupId}_${requestUid}`);
    const memberDoc = await memberRef.get();

    if (memberDoc.exists) {
      await memberRef.update({
        isAdmin: true,
      });
      console.log(
        `Updated member document ${groupId}_${requestUid} to set isAdmin = true`,
      );
    } else {
      console.warn(
        `Member document ${groupId}_${requestUid} does not exist. ` +
          `User may need to join the group first.`,
      );
    }

    // Send notification to the requester
    try {
      const functions = require('@react-native-firebase/functions').default;
      await functions().httpsCallable('notifyAdminRequestResult')({
        groupId,
        requesterId: requestUid,
        approved: true,
      });
    } catch (notifyError) {
      // Don't fail the whole operation if notification fails
      console.warn('Failed to send approval notification:', notifyError);
    }

    // Track admin action for inactivity detection
    trackActivity(currentUser.uid, 'member_managed', groupId);
  }

  /**
   * Deny an admin request
   * @param groupId The ID of the group
   * @param requestUid The UID of the user whose request is being denied
   * @returns Promise that resolves when the request is denied
   */
  static async denyAdminRequest(
    groupId: string,
    requestUid: string,
  ): Promise<void> {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('You must be logged in');
    }

    // Check if user is group admin or super admin
    const userIsGroupAdmin = await this.isGroupAdmin(groupId, currentUser.uid);
    const isSuperAdmin = await UserModel.isSuperAdmin();

    if (!userIsGroupAdmin && !isSuperAdmin) {
      throw new Error('Only group admins can deny requests');
    }

    const groupRef = firestore().collection('groups').doc(groupId);
    const groupDoc = await groupRef.get();

    if (!groupDoc.exists) {
      throw new Error('Group not found');
    }

    const groupData = groupDoc.data();
    const pendingRequests = groupData?.pendingAdminRequests || [];
    const requestIndex = pendingRequests.findIndex(
      (req: any) => req.uid === requestUid,
    );

    if (requestIndex === -1) {
      throw new Error('Request not found');
    }

    // Remove the request from pending
    const updatedRequests = [...pendingRequests];
    updatedRequests.splice(requestIndex, 1);

    await groupRef.update({
      pendingAdminRequests: updatedRequests,
    });

    // Send notification to the requester
    try {
      const functions = require('@react-native-firebase/functions').default;
      await functions().httpsCallable('notifyAdminRequestResult')({
        groupId,
        requesterId: requestUid,
        approved: false,
      });
    } catch (notifyError) {
      // Don't fail the whole operation if notification fails
      console.warn('Failed to send denial notification:', notifyError);
    }

    // Track admin action for inactivity detection
    trackActivity(currentUser.uid, 'member_managed', groupId);
  }

  /**
   * Direct admin assignment (super admin only)
   */
  static async assignAdmin(groupId: string, userId: string): Promise<void> {
    try {
      // Check if current user is a super admin
      const isSuperAdmin = await UserModel.isSuperAdmin();
      if (!isSuperAdmin) {
        throw new Error('Only super admins can directly assign admins');
      }

      const groupRef = firestore().collection('groups').doc(groupId);
      const groupDoc = await groupRef.get();

      if (!groupDoc.exists) {
        throw new Error('Group not found');
      }

      // Update the group
      await groupRef.update({
        admins: firestore.FieldValue.arrayUnion(userId),
        isClaimed: true,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });

      // Update the member document to set isAdmin = true
      // This ensures consistency between group.admins and member.isAdmin
      const memberRef = firestore()
        .collection('members')
        .doc(`${groupId}_${userId}`);
      const memberDoc = await memberRef.get();

      if (memberDoc.exists) {
        await memberRef.update({
          isAdmin: true,
        });
        console.log(
          `Updated member document ${groupId}_${userId} to set isAdmin = true`,
        );
      } else {
        console.warn(
          `Member document ${groupId}_${userId} does not exist. ` +
            `User may need to join the group first.`,
        );
      }

      console.log('Admin assigned directly');
    } catch (error) {
      console.error('Error assigning admin:', error);
      throw error;
    }
  }

  /**
   * Check if a group is claimed (has admins)
   */
  static async isGroupClaimed(groupId: string): Promise<boolean> {
    try {
      const groupDoc = await firestore()
        .collection('groups')
        .doc(groupId)
        .get();

      if (!groupDoc.exists) {
        throw new Error('Group not found');
      }

      const groupData = groupDoc.data() as GroupDocument;
      return groupData.isClaimed || false;
    } catch (error) {
      console.error('Error checking if group is claimed:', error);
      return false;
    }
  }
}
