/**
 * Activity Tracking Service
 *
 * Tracks user activity for admin inactivity detection and auto-claim functionality.
 * Activity is used to determine if admins are active, inactive, or dormant.
 */

import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import {AdminActivityStatus} from '../types';

// Inactivity thresholds in days
export const ACTIVITY_THRESHOLDS = {
  ACTIVE: 30, // 0-30 days = active
  INACTIVE: 60, // 30-60 days = inactive
  // 60+ days = dormant
};

// Auto-approve delay for inactive admins (in days)
export const AUTO_APPROVE_DELAY_DAYS = 7;

/**
 * Activity types that can be tracked
 */
export type ActivityType =
  | 'login'
  | 'group_action' // Admin actions like editing group, approving members
  | 'chat_message'
  | 'meeting_attendance'
  | 'announcement_posted'
  | 'member_managed'; // Approving/removing members

/**
 * Track user activity
 * Call this when a user performs a trackable action
 */
export async function trackActivity(
  userId: string,
  activityType: ActivityType,
  groupId?: string,
): Promise<void> {
  try {
    const now = firestore.Timestamp.now();
    const userRef = firestore().collection('users').doc(userId);

    // Build update object based on activity type
    const updateData: any = {
      lastActivityAt: now,
      updatedAt: now,
    };

    // Update specific activity log fields
    switch (activityType) {
      case 'login':
        updateData.lastLoginAt = now;
        break;
      case 'group_action':
      case 'member_managed':
      case 'announcement_posted':
        updateData['activityLog.lastGroupAction'] = now;
        break;
      case 'chat_message':
        updateData['activityLog.lastChatMessage'] = now;
        break;
      case 'meeting_attendance':
        updateData['activityLog.lastMeetingAttendance'] = now;
        break;
    }

    // Update user document
    await userRef.update(updateData);

    // If this is a group-specific action and user is admin, update group's adminDetails
    if (
      groupId &&
      ['group_action', 'member_managed', 'announcement_posted'].includes(
        activityType,
      )
    ) {
      await updateAdminActivityInGroup(userId, groupId, now);
    }
  } catch (error) {
    console.error('Error tracking activity:', error);
    // Don't throw - activity tracking should not block main functionality
  }
}

/**
 * Update admin activity in a specific group
 */
async function updateAdminActivityInGroup(
  userId: string,
  groupId: string,
  timestamp: FirebaseFirestoreTypes.Timestamp,
): Promise<void> {
  try {
    const groupRef = firestore().collection('groups').doc(groupId);
    const groupDoc = await groupRef.get();

    if (!groupDoc.exists) return;

    const groupData = groupDoc.data();
    const adminDetails = groupData?.adminDetails || [];

    // Find and update this admin's details
    const updatedAdminDetails = adminDetails.map((admin: any) => {
      if (admin.uid === userId) {
        return {
          ...admin,
          lastActiveAt: timestamp,
          activityStatus: 'active',
        };
      }
      return admin;
    });

    // Check if admin exists in adminDetails, if not add them
    const adminExists = adminDetails.some((admin: any) => admin.uid === userId);
    if (!adminExists && groupData?.admins?.includes(userId)) {
      updatedAdminDetails.push({
        uid: userId,
        addedAt: timestamp,
        lastActiveAt: timestamp,
        activityStatus: 'active',
      });
    }

    await groupRef.update({
      adminDetails: updatedAdminDetails,
      updatedAt: timestamp,
    });
  } catch (error) {
    console.error('Error updating admin activity in group:', error);
  }
}

/**
 * Calculate the number of days since a timestamp
 */
export function calculateInactivityDays(
  lastActivityAt: Date | FirebaseFirestoreTypes.Timestamp | null | undefined,
): number {
  if (!lastActivityAt) {
    return Infinity; // No activity recorded = very inactive
  }

  const lastActivity =
    lastActivityAt instanceof Date
      ? lastActivityAt
      : lastActivityAt.toDate();

  const now = new Date();
  const diffMs = now.getTime() - lastActivity.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Get activity status based on inactivity days
 */
export function getActivityStatus(inactivityDays: number): AdminActivityStatus {
  if (inactivityDays <= ACTIVITY_THRESHOLDS.ACTIVE) {
    return 'active';
  } else if (inactivityDays <= ACTIVITY_THRESHOLDS.INACTIVE) {
    return 'inactive';
  } else {
    return 'dormant';
  }
}

/**
 * Get activity status for a specific admin in a group
 */
export async function getAdminActivityStatus(
  groupId: string,
  adminId: string,
): Promise<{
  status: AdminActivityStatus;
  lastActiveAt: Date | null;
  inactivityDays: number;
}> {
  try {
    const groupRef = firestore().collection('groups').doc(groupId);
    const groupDoc = await groupRef.get();

    if (!groupDoc.exists) {
      return {status: 'dormant', lastActiveAt: null, inactivityDays: Infinity};
    }

    const groupData = groupDoc.data();
    const adminDetails = groupData?.adminDetails || [];

    // Find this admin's details
    const adminInfo = adminDetails.find((admin: any) => admin.uid === adminId);

    if (adminInfo?.lastActiveAt) {
      const lastActiveAt = adminInfo.lastActiveAt.toDate();
      const inactivityDays = calculateInactivityDays(lastActiveAt);
      const status = getActivityStatus(inactivityDays);

      return {status, lastActiveAt, inactivityDays};
    }

    // If no adminDetails, fall back to user's general activity
    const userDoc = await firestore().collection('users').doc(adminId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      const lastActivityAt = userData?.lastActivityAt?.toDate() || null;
      const inactivityDays = calculateInactivityDays(lastActivityAt);
      const status = getActivityStatus(inactivityDays);

      return {status, lastActiveAt: lastActivityAt, inactivityDays};
    }

    return {status: 'dormant', lastActiveAt: null, inactivityDays: Infinity};
  } catch (error) {
    console.error('Error getting admin activity status:', error);
    return {status: 'dormant', lastActiveAt: null, inactivityDays: Infinity};
  }
}

/**
 * Get the most active admin's status for a group
 * Used to determine escalation level for admin requests
 */
export async function getMostActiveAdminStatus(groupId: string): Promise<{
  mostActiveAdmin: {uid: string; status: AdminActivityStatus} | null;
  allAdminsStatus: AdminActivityStatus;
  inactivityDays: number;
}> {
  try {
    const groupRef = firestore().collection('groups').doc(groupId);
    const groupDoc = await groupRef.get();

    if (!groupDoc.exists) {
      return {
        mostActiveAdmin: null,
        allAdminsStatus: 'dormant',
        inactivityDays: Infinity,
      };
    }

    const groupData = groupDoc.data();
    const admins = groupData?.admins || [];

    if (admins.length === 0) {
      return {
        mostActiveAdmin: null,
        allAdminsStatus: 'dormant',
        inactivityDays: Infinity,
      };
    }

    // Get activity status for all admins
    const adminStatuses = await Promise.all(
      admins.map(async (adminId: string) => {
        const status = await getAdminActivityStatus(groupId, adminId);
        return {uid: adminId, ...status};
      }),
    );

    // Find the most active admin (lowest inactivity days)
    const mostActive = adminStatuses.reduce((best, current) => {
      return current.inactivityDays < best.inactivityDays ? current : best;
    });

    return {
      mostActiveAdmin: {uid: mostActive.uid, status: mostActive.status},
      allAdminsStatus: mostActive.status,
      inactivityDays: mostActive.inactivityDays,
    };
  } catch (error) {
    console.error('Error getting most active admin status:', error);
    return {
      mostActiveAdmin: null,
      allAdminsStatus: 'dormant',
      inactivityDays: Infinity,
    };
  }
}

/**
 * Format inactivity days for display
 */
export function formatInactivityDisplay(inactivityDays: number): string {
  if (inactivityDays === Infinity || inactivityDays < 0) {
    return 'Never active';
  }
  if (inactivityDays === 0) {
    return 'Active today';
  }
  if (inactivityDays === 1) {
    return 'Active yesterday';
  }
  if (inactivityDays < 7) {
    return `Active ${inactivityDays} days ago`;
  }
  if (inactivityDays < 30) {
    const weeks = Math.floor(inactivityDays / 7);
    return `Active ${weeks} week${weeks > 1 ? 's' : ''} ago`;
  }
  if (inactivityDays < 365) {
    const months = Math.floor(inactivityDays / 30);
    return `Active ${months} month${months > 1 ? 's' : ''} ago`;
  }
  const years = Math.floor(inactivityDays / 365);
  return `Active ${years} year${years > 1 ? 's' : ''} ago`;
}

/**
 * Track login activity for current user
 * Call this when app is opened or user authenticates
 */
export async function trackLogin(): Promise<void> {
  const currentUser = auth().currentUser;
  if (currentUser) {
    await trackActivity(currentUser.uid, 'login');
  }
}

// Import type for Firestore Timestamp
import {FirebaseFirestoreTypes} from '@react-native-firebase/firestore';

