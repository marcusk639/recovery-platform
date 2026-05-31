import {
  User,
  NotificationSettings,
  PrivacySettings,
  FirestoreDocument,
  OnboardingData,
} from '../types';
import {UserDocument} from '../types/schema';
import {firebase} from '@react-native-firebase/auth';
import firestore, {
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import Auth from '@react-native-firebase/auth';
/**
 * User model for managing user data
 */
export class UserModel {
  private static instance: UserModel;

  private constructor() {}

  static getInstance(): UserModel {
    if (!UserModel.instance) {
      UserModel.instance = new UserModel();
    }
    return UserModel.instance;
  }

  static async getCurrentUser(): Promise<User | null> {
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) return null;

    const userDoc = await firestore()
      .collection('users')
      .doc(currentUser.uid)
      .get();
    if (!userDoc.exists) return null;

    return {
      uid: currentUser.uid,
      ...(userDoc.data() as Omit<User, 'uid'>),
    };
  }

  static getCurrentAuthUser() {
    return Auth().currentUser;
  }

  /**
   * Convert a Firestore user document to a User object
   */
  static fromFirestore(doc: FirestoreDocument<UserDocument>): User {
    const data = doc.data();
    // Default to empty objects if nested settings are undefined in Firestore
    const notificationSettingsData = data.notificationSettings ?? {};
    const privacySettingsData = data.privacySettings ?? {};
    const sponsorSettingsData = data.sponsorSettings ?? {
      isAvailable: false,
      maxSponsees: 3,
      requirements: ['30 days sober', 'Working the steps'],
      bio: '',
    };

    return {
      uid: doc.id,
      email: data.email ?? '',
      displayName: data.displayName ?? 'Anonymous',
      recoveryDate: data.sobrietyStartDate?.toDate().toISOString(), // Use sobrietyStartDate from schema
      createdAt: data.createdAt?.toDate() ?? new Date(),
      updatedAt: data.updatedAt?.toDate() ?? new Date(),
      lastLogin: data.lastLogin?.toDate() ?? new Date(),
      notificationSettings: {
        meetings: notificationSettingsData.meetings ?? true,
        announcements: notificationSettingsData.announcements ?? true,
        celebrations: notificationSettingsData.celebrations ?? true,
        groupChatMentions: notificationSettingsData.groupChatMentions, // Keep undefined if not set
        allowPushNotifications: notificationSettingsData.allowPushNotifications, // Keep undefined if not set
      },
      privacySettings: {
        // Note: showRecoveryDate is now nested in schema, map accordingly
        showRecoveryDate: privacySettingsData.showRecoveryDate ?? false,
        allowDirectMessages: privacySettingsData.allowDirectMessages ?? true,
        // Map showPhoneNumber from nested privacy settings in schema
        showPhoneNumber: privacySettingsData.showPhoneNumber ?? false,
      },
      sponsorSettings: {
        isAvailable: sponsorSettingsData.isAvailable ?? false,
        requirements: sponsorSettingsData.requirements ?? [
          '30 days sober',
          'Working the steps',
        ],
        bio: sponsorSettingsData.bio ?? '',
      },
      homeGroups: data.homeGroups ?? [],
      role: data.role ?? 'user',
      favoriteMeetings: data.favoriteMeetings ?? [],
      photoUrl: data.photoUrl ?? null,
      phoneNumber: data.phoneNumber ?? null,
      fcmTokens: data.fcmTokens ?? [],
      stripeCustomerId: data.stripeCustomerId ?? undefined,
      // Onboarding data
      onboardingComplete: data.onboardingComplete ?? false,
      onboardingData: data.onboardingData
        ? {
            intent: data.onboardingData.intent,
            groupId: data.onboardingData.groupId ?? null,
            action: data.onboardingData.action,
            completedAt:
              data.onboardingData.completedAt?.toMillis() ?? Date.now(),
          }
        : undefined,
    };
  }

  /**
   * Convert a User object to a Firestore document
   */
  static toFirestore(user: Partial<User>): Partial<UserDocument> {
    const firestoreData: Partial<UserDocument> = {};

    // Map basic fields
    if (user.uid !== undefined) firestoreData.uid = user.uid;
    if (user.email !== undefined) firestoreData.email = user.email;
    if (user.displayName !== undefined)
      firestoreData.displayName = user.displayName;
    if (user.photoUrl !== undefined) firestoreData.photoUrl = user.photoUrl;
    if (user.phoneNumber !== undefined)
      firestoreData.phoneNumber = user.phoneNumber;
    if (user.fcmTokens !== undefined) firestoreData.fcmTokens = user.fcmTokens;
    if (user.homeGroups !== undefined)
      firestoreData.homeGroups = user.homeGroups;
    if (user.role !== undefined) firestoreData.role = user.role;
    if (user.favoriteMeetings !== undefined)
      firestoreData.favoriteMeetings = user.favoriteMeetings;

    // Map dates (use sobrietyStartDate for Firestore)
    if (user.recoveryDate) {
      try {
        firestoreData.sobrietyStartDate = firestore.Timestamp.fromDate(
          new Date(user.recoveryDate),
        );
      } catch (e) {
        console.warn('Invalid recovery date');
      }
    }
    if (user.createdAt) {
      try {
        firestoreData.createdAt = firestore.Timestamp.fromDate(
          new Date(user.createdAt),
        );
      } catch (e) {
        console.warn('Invalid createdAt date');
      }
    }
    if (user.updatedAt) {
      try {
        firestoreData.updatedAt = firestore.Timestamp.fromDate(
          new Date(user.updatedAt),
        );
      } catch (e) {
        console.warn('Invalid updatedAt date');
      }
    }
    if (user.lastLogin) {
      try {
        firestoreData.lastLogin = firestore.Timestamp.fromDate(
          new Date(user.lastLogin),
        );
      } catch (e) {
        console.warn('Invalid lastLogin date');
      }
    }

    // Map nested settings (only include if provided in partial User)
    if (user.notificationSettings !== undefined) {
      firestoreData.notificationSettings = user.notificationSettings; // Pass the whole object or handle partial updates if needed
    }
    if (user.privacySettings !== undefined) {
      firestoreData.privacySettings = user.privacySettings; // Pass the whole object
    }
    if (user.sponsorSettings !== undefined) {
      firestoreData.sponsorSettings = user.sponsorSettings;
    }

    // Map onboarding data
    if (user.onboardingComplete !== undefined) {
      firestoreData.onboardingComplete = user.onboardingComplete;
    }
    if (user.onboardingData !== undefined) {
      firestoreData.onboardingData = user.onboardingData
        ? {
            intent: user.onboardingData.intent,
            groupId: user.onboardingData.groupId,
            action: user.onboardingData.action,
            completedAt: firestore.Timestamp.fromMillis(
              user.onboardingData.completedAt,
            ),
          }
        : undefined;
    }

    return firestoreData;
  }

  /**
   * Check if a user is a super admin
   * @returns Promise that resolves to true if the user is a super admin
   */
  static async isSuperAdmin(): Promise<boolean> {
    const currentUser = Auth().currentUser;

    if (!currentUser) {
      return false;
    }

    try {
      // Get user claims from custom auth function or document
      const idTokenResult = await currentUser.getIdTokenResult(true);
      return !!idTokenResult.claims.superAdmin;
    } catch (error) {
      console.error('Error checking super admin status:', error);
      return false;
    }
  }

  /**
   * Get a user by ID
   */
  static async getById(uid: string): Promise<User | null> {
    try {
      const doc = await firestore().collection('users').doc(uid).get();

      if (!doc.exists) {
        return null;
      }

      return UserModel.fromFirestore({
        id: doc.id,
        data: () => doc.data() as UserDocument,
      });
    } catch (error) {
      console.error('Error getting user:', error);
      throw error;
    }
  }

  /**
   * Create a new user
   */
  static async create(userData: Partial<User>): Promise<User> {
    try {
      const currentUser = firebase.auth().currentUser;

      if (!currentUser) {
        throw new Error('No authenticated user');
      }

      const now = new Date();
      const defaultUser: User = {
        uid: currentUser.uid,
        email: currentUser.email || '',
        displayName: currentUser.displayName || 'Anonymous',
        photoUrl: currentUser.photoURL || null,
        phoneNumber: currentUser.phoneNumber || null, // Add default phone
        fcmTokens: [], // Add default fcmTokens
        createdAt: now,
        updatedAt: now,
        lastLogin: now,
        notificationSettings: {
          // Initialize all notification settings
          meetings: true,
          announcements: true,
          celebrations: true,
          groupChatMentions: true, // Default new settings
          allowPushNotifications: true,
        },
        privacySettings: {
          // Initialize all privacy settings
          showRecoveryDate: false,
          allowDirectMessages: true,
          showPhoneNumber: false, // Default showPhoneNumber
        },
        homeGroups: [],
        role: 'user',
        favoriteMeetings: [],
      };

      const newUser = {...defaultUser, ...userData};

      await firestore()
        .collection('users')
        .doc(newUser.uid)
        .set(UserModel.toFirestore(newUser));

      return newUser;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  /**
   * Update a user
   */
  static async update(uid: string, userData: Partial<User>): Promise<User> {
    try {
      const userRef = firestore().collection('users').doc(uid);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new Error('User not found');
      }

      const existingData = userDoc.data() as UserDocument;

      // Prepare the update, merging nested settings carefully
      const updatePayload: Partial<UserDocument> = {};

      // Map basic fields directly from userData
      if (userData.uid !== undefined) updatePayload.uid = userData.uid;
      if (userData.email !== undefined) updatePayload.email = userData.email;
      if (userData.displayName !== undefined)
        updatePayload.displayName = userData.displayName;
      if (userData.photoUrl !== undefined)
        updatePayload.photoUrl = userData.photoUrl;
      if (userData.phoneNumber !== undefined)
        updatePayload.phoneNumber = userData.phoneNumber;
      if (userData.fcmTokens !== undefined)
        updatePayload.fcmTokens = userData.fcmTokens;
      if (userData.homeGroups !== undefined)
        updatePayload.homeGroups = userData.homeGroups;
      if (userData.role !== undefined) updatePayload.role = userData.role;
      if (userData.favoriteMeetings !== undefined)
        updatePayload.favoriteMeetings = userData.favoriteMeetings;

      // Map dates
      if (userData.recoveryDate !== undefined) {
        // Handles null or string
        try {
          updatePayload.sobrietyStartDate = userData.recoveryDate
            ? firestore.Timestamp.fromDate(new Date(userData.recoveryDate))
            : null;
        } catch (e) {
          if (__DEV__)
            console.warn('UserModel: failed to parse recoveryDate', e);
        }
      }
      // Always update updatedAt
      updatePayload.updatedAt = firestore.Timestamp.fromDate(new Date());
      // Don't update createdAt or lastLogin here usually

      // Merge nested notification settings
      if (userData.notificationSettings) {
        updatePayload.notificationSettings = {
          ...(existingData.notificationSettings ?? {}), // Start with existing or empty
          ...userData.notificationSettings, // Overwrite with new values
        };
      }

      // Merge nested privacy settings
      if (userData.privacySettings) {
        updatePayload.privacySettings = {
          ...(existingData.privacySettings ?? {}), // Start with existing or empty
          ...userData.privacySettings, // Overwrite with new values
        };
      }

      if (userData.sponsorSettings) {
        updatePayload.sponsorSettings = {
          ...(existingData.sponsorSettings ?? {}), // Start with existing or empty
          ...userData.sponsorSettings, // Overwrite with new values
        };
      }

      // Perform the update with the merged payload
      await userRef.update(updatePayload);

      // Get the updated document
      const updatedDoc = await userRef.get();
      if (!updatedDoc.exists) throw new Error('User not found after update');
      return UserModel.fromFirestore({
        id: updatedDoc.id,
        data: () => updatedDoc.data() as UserDocument,
      });
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  /**
   * Add a favorite meeting
   */
  static async addFavoriteMeeting(
    uid: string,
    meetingId: string,
  ): Promise<string[]> {
    try {
      const userRef = firestore().collection('users').doc(uid);

      await userRef.update({
        favoriteMeetings: firestore.FieldValue.arrayUnion(meetingId),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });

      const updatedDoc = await userRef.get();
      const userData = updatedDoc.data() as UserDocument;

      return userData.favoriteMeetings || [];
    } catch (error) {
      console.error('Error adding favorite meeting:', error);
      throw error;
    }
  }

  /**
   * Remove a favorite meeting
   */
  static async removeFavoriteMeeting(
    uid: string,
    meetingId: string,
  ): Promise<string[]> {
    try {
      const userRef = firestore().collection('users').doc(uid);

      await userRef.update({
        favoriteMeetings: firestore.FieldValue.arrayRemove(meetingId),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });

      const updatedDoc = await userRef.get();
      const userData = updatedDoc.data() as UserDocument;

      return userData.favoriteMeetings || [];
    } catch (error) {
      console.error('Error removing favorite meeting:', error);
      throw error;
    }
  }

  /**
   * Sync user profile from Firebase Auth to Firestore
   * This ensures that any changes made directly to the auth profile
   * (like photoURL) are reflected in our Firestore user document
   */
  static async syncUserProfileFromAuth(uid: string): Promise<User | null> {
    try {
      const currentUser = firebase.auth().currentUser;

      if (!currentUser || currentUser.uid !== uid) {
        throw new Error('User not authenticated or ID mismatch');
      }

      const userRef = firestore().collection('users').doc(uid);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        console.warn(
          'User document not found in Firestore when syncing from auth',
        );
        return null;
      }

      const updates: Partial<User> = {
        updatedAt: new Date(),
      };

      // Only update fields that exist in auth and have values
      if (currentUser.displayName) {
        updates.displayName = currentUser.displayName;
      }

      if (currentUser.email) {
        updates.email = currentUser.email;
      }

      if (currentUser.photoURL) {
        updates.photoUrl = currentUser.photoURL;
      }

      // Update the document with auth profile data
      await userRef.update(UserModel.toFirestore(updates));

      // Get the updated document
      const updatedDoc = await userRef.get();
      return UserModel.fromFirestore({
        id: updatedDoc.id,
        data: () => updatedDoc.data() as UserDocument,
      });
    } catch (error) {
      console.error('Error syncing user profile from auth:', error);
      return null;
    }
  }

  /**
   * Update user's photo URL in both Firestore and Auth profile
   */
  static async updatePhotoURL(
    uid: string,
    photoUrl: string,
  ): Promise<User | null> {
    try {
      const currentUser = firebase.auth().currentUser;

      if (!currentUser || currentUser.uid !== uid) {
        throw new Error('User not authenticated or ID mismatch');
      }

      // Update auth profile first
      await currentUser.updateProfile({
        photoURL: photoUrl,
      });

      // Then update Firestore document
      const userRef = firestore().collection('users').doc(uid);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new Error('User document not found');
      }

      const updates: Partial<User> = {
        photoUrl: photoUrl,
        updatedAt: new Date(),
      };

      await userRef.update(UserModel.toFirestore(updates));

      // Get the updated document
      const updatedDoc = await userRef.get();
      return UserModel.fromFirestore({
        id: updatedDoc.id,
        data: () => updatedDoc.data() as UserDocument,
      });
    } catch (error) {
      console.error('Error updating user photo URL:', error);
      throw error;
    }
  }

  /**
   * Get user's onboarding status from Firestore
   */
  static async getOnboardingStatus(
    uid: string,
  ): Promise<{complete: boolean; data: OnboardingData | null}> {
    try {
      const doc = await firestore().collection('users').doc(uid).get();

      if (!doc.exists) {
        return {complete: false, data: null};
      }

      const data = doc.data() as any;
      const onboardingComplete = data.onboardingComplete ?? false;
      const onboardingData = data.onboardingData
        ? {
            intent: data.onboardingData.intent,
            groupId: data.onboardingData.groupId ?? null,
            action: data.onboardingData.action,
            completedAt:
              data.onboardingData.completedAt?.toMillis() ?? Date.now(),
          }
        : null;

      return {complete: onboardingComplete, data: onboardingData};
    } catch (error) {
      console.error('Error getting onboarding status:', error);
      return {complete: false, data: null};
    }
  }

  /**
   * Set user's onboarding status in Firestore
   */
  static async setOnboardingComplete(
    uid: string,
    onboardingData: OnboardingData,
  ): Promise<void> {
    try {
      const userRef = firestore().collection('users').doc(uid);

      await userRef.update({
        onboardingComplete: true,
        onboardingData: {
          intent: onboardingData.intent,
          groupId: onboardingData.groupId,
          action: onboardingData.action,
          completedAt: firestore.Timestamp.fromMillis(
            onboardingData.completedAt,
          ),
        },
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });

      if (__DEV__) console.log(`Onboarding completed for user ${uid}`);
    } catch (error) {
      console.error('Error setting onboarding status:', error);
      throw error;
    }
  }

  /**
   * Update user's last activity timestamp
   * @param uid User ID
   * @param activityType Optional type of activity for logging
   */
  static async updateLastActivity(
    uid: string,
    activityType?: string,
  ): Promise<void> {
    try {
      const userRef = firestore().collection('users').doc(uid);
      const now = firestore.Timestamp.now();

      const updateData: any = {
        lastActivityAt: now,
        updatedAt: now,
      };

      // Update specific activity log fields based on type
      if (activityType === 'group_action') {
        updateData['activityLog.lastGroupAction'] = now;
      } else if (activityType === 'chat_message') {
        updateData['activityLog.lastChatMessage'] = now;
      } else if (activityType === 'meeting_attendance') {
        updateData['activityLog.lastMeetingAttendance'] = now;
      }

      await userRef.update(updateData);
    } catch (error) {
      console.error('Error updating last activity:', error);
      // Don't throw - activity tracking shouldn't block main functionality
    }
  }

  /**
   * Update user's last login timestamp
   * Call this when user opens the app
   */
  static async updateLastLogin(uid: string): Promise<void> {
    try {
      const userRef = firestore().collection('users').doc(uid);
      const now = firestore.Timestamp.now();

      await userRef.update({
        lastLoginAt: now,
        lastActivityAt: now,
        updatedAt: now,
      });
    } catch (error) {
      console.error('Error updating last login:', error);
    }
  }

  /**
   * Get user's activity info for admin status determination
   */
  static async getActivityInfo(uid: string): Promise<{
    lastActivityAt: Date | null;
    lastLoginAt: Date | null;
    activityLog: {
      lastGroupAction: Date | null;
      lastChatMessage: Date | null;
      lastMeetingAttendance: Date | null;
    };
  }> {
    try {
      const userDoc = await firestore().collection('users').doc(uid).get();

      if (!userDoc.exists) {
        return {
          lastActivityAt: null,
          lastLoginAt: null,
          activityLog: {
            lastGroupAction: null,
            lastChatMessage: null,
            lastMeetingAttendance: null,
          },
        };
      }

      const data = userDoc.data();
      return {
        lastActivityAt: data?.lastActivityAt?.toDate() || null,
        lastLoginAt: data?.lastLoginAt?.toDate() || null,
        activityLog: {
          lastGroupAction: data?.activityLog?.lastGroupAction?.toDate() || null,
          lastChatMessage: data?.activityLog?.lastChatMessage?.toDate() || null,
          lastMeetingAttendance:
            data?.activityLog?.lastMeetingAttendance?.toDate() || null,
        },
      };
    } catch (error) {
      console.error('Error getting activity info:', error);
      return {
        lastActivityAt: null,
        lastLoginAt: null,
        activityLog: {
          lastGroupAction: null,
          lastChatMessage: null,
          lastMeetingAttendance: null,
        },
      };
    }
  }

  /**
   * Add an FCM token to the user's token list.
   * Ensures the token is only added if it doesn't already exist.
   */
  static async addFcmToken(uid: string, token: string): Promise<void> {
    try {
      const userRef = firestore().collection('users').doc(uid);

      // Update using arrayUnion to avoid duplicates
      await userRef.update({
        fcmTokens: firestore.FieldValue.arrayUnion(token),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });
      if (__DEV__) console.log(`FCM token added/updated for user ${uid}`);
    } catch (error) {
      // Log error but don't necessarily throw, as failing to save a token
      // might not be a critical app failure, though it impacts notifications.
      console.error(`Error adding FCM token for user ${uid}:`, error);
      // Optionally re-throw if you want the thunk to reject:
      // throw new Error('Failed to update FCM token in Firestore.');
    }
  }
}

export default UserModel;
