import {
  createSlice,
  createAsyncThunk,
  PayloadAction,
  createEntityAdapter,
  createSelector,
} from '@reduxjs/toolkit';
import auth, {FirebaseAuthTypes} from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {RootState} from '../types';
import {UserModel} from '../../models/UserModel';
import {MemberModel} from '../../models/MemberModel';
import {GroupModel} from '../../models/GroupModel';
// Note: UserModel now handles onboarding methods
import {UserDocument, Timestamp} from '../../types/schema';
import {
  Location,
  User,
  NotificationSettings,
  PrivacySettings,
  OnboardingData,
  OnboardingIntent,
} from '../../types';
import {Sponsorship, SponsorSettings} from '../../types/sponsorship';

// Re-export for convenience
export type {OnboardingData, OnboardingIntent};

// Onboarding storage keys (must match OnboardingScreen.tsx)
const ONBOARDING_STORAGE_KEYS = [
  '@onboarding_complete',
  '@onboarding_intent',
  '@onboarding_group_id',
  '@onboarding_action',
];

interface UserData {
  uid: string;
  id: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  homeGroups?: string[];
  adminGroups?: string[];
  phoneNumber?: string | null;
  showPhoneNumber?: boolean;
  showSobrietyDate?: boolean;
  sobrietyStartDate: string | null;
  subscriptionTier: 'free' | 'plus';
  subscriptionValidUntil: string | null;
  role?: 'user' | 'admin';
  favoriteMeetings?: string[];
  notificationSettings?: {
    meetings?: boolean;
    announcements?: boolean;
    celebrations?: boolean;
    sponsorship?: boolean;
    dailyReflections?: boolean;
    allowPushNotifications?: boolean;
  } | null;
  privacySettings?: {
    allowDirectMessages?: boolean;
    sponsorship?: boolean;
  } | null;
  fcmTokens?: string[];
  sponsorship?: Sponsorship;
  customerId?: string;
  sponsorSettings?: SponsorSettings;
}

// Define entity types
interface UserEntity extends UserData {
  id: string;
}

// Create entity adapter
const usersAdapter = createEntityAdapter<UserEntity>();

// Update action payload types
interface UpdateDisplayNamePayload {
  id: string;
  displayName: string;
}

interface UpdateSobrietyDatePayload {
  id: string;
  sobrietyStartDate: string | null;
}

interface UpdateUserPhotoPayload {
  id: string;
  photoURL: string | null;
}

interface UpdateUserPhoneNumberPayload {
  id: string;
  phoneNumber: string | null;
}

export interface AuthState {
  user: FirebaseAuthTypes.User | null;
  onboardingComplete: boolean | null; // null = not checked yet
  onboardingData: OnboardingData | null;
  users: ReturnType<typeof usersAdapter.getInitialState>;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  isAuthenticated: boolean;
  lastFetched: number | null;
  location: Location | null;
  pendingNavigation: {route: string; params: any} | null;
  loading: boolean;
}

const initialState: AuthState = {
  user: null,
  onboardingComplete: null,
  onboardingData: null,
  users: usersAdapter.getInitialState(),
  status: 'idle',
  error: null,
  isAuthenticated: false,
  lastFetched: null,
  location: null,
  pendingNavigation: null,
  loading: false,
};

const mapUserToSliceData = (
  user: User | UserDocument | Partial<User> | null | undefined,
): UserData | null => {
  if (!user || !user.uid) return null;

  const photoUrl = ('photoUrl' in user ? user.photoUrl : null) ?? null;

  const sobrietyStartDateISO =
    ('recoveryDate' in user
      ? user.recoveryDate
      : 'sobrietyStartDate' in user && user.sobrietyStartDate
        ? (user.sobrietyStartDate as Timestamp).toDate().toISOString()
        : null) ?? null;

  const notificationSettingsData = user.notificationSettings ?? {};
  const privacySettingsData = user.privacySettings ?? {};

  const adminGroups = 'adminGroups' in user ? user.adminGroups : undefined;
  const subscriptionTier =
    ('subscriptionTier' in user ? user.subscriptionTier : 'free') ?? 'free';
  const subscriptionValidUntilISO =
    ('subscriptionValidUntil' in user && user.subscriptionValidUntil
      ? (user.subscriptionValidUntil as Timestamp).toDate().toISOString()
      : null) ?? null;
  const fcmTokens = ('fcmTokens' in user ? user.fcmTokens : []) ?? [];
  const phoneNumber = ('phoneNumber' in user ? user.phoneNumber : null) ?? null;

  return {
    id: user.uid,
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: photoUrl,
    homeGroups: user.homeGroups ?? [],
    adminGroups: adminGroups,
    phoneNumber: phoneNumber,
    showPhoneNumber: privacySettingsData.showPhoneNumber ?? false,
    showSobrietyDate: privacySettingsData.showRecoveryDate ?? false,
    sobrietyStartDate: sobrietyStartDateISO as string | null,
    subscriptionTier: subscriptionTier as 'free' | 'plus',
    subscriptionValidUntil: subscriptionValidUntilISO,
    role: user.role ?? 'user',
    favoriteMeetings: user.favoriteMeetings ?? [],
    notificationSettings: {
      meetings: notificationSettingsData.meetings ?? true,
      announcements: notificationSettingsData.announcements ?? true,
      celebrations: notificationSettingsData.celebrations ?? true,
      ...((notificationSettingsData as any).groupChatMentions !== undefined && {
        groupChatMentions: (notificationSettingsData as any).groupChatMentions,
      }),
      ...((notificationSettingsData as any).allowPushNotifications !==
        undefined && {
        allowPushNotifications: (notificationSettingsData as any)
          .allowPushNotifications,
      }),
    },
    privacySettings: {
      allowDirectMessages: privacySettingsData.allowDirectMessages ?? true,
    },
    fcmTokens: fcmTokens,
    sponsorSettings: user.sponsorSettings ?? {
      isAvailable: false,
      requirements: ['30 days sober', 'Working the steps'],
      bio: '',
    },
  };
};

export const checkAuthState = createAsyncThunk(
  'auth/checkAuthState',
  async (_, {dispatch}) => {
    return new Promise<FirebaseAuthTypes.User | null>(resolve => {
      const subscriber = auth().onAuthStateChanged(user => {
        dispatch(setUser(user));
        if (user) {
          dispatch(fetchUserData(user.uid));
        } else {
        }
        resolve(user);
        subscriber();
      });
    });
  },
);

export const fetchUserData = createAsyncThunk<
  UserData | null,
  string,
  {rejectValue: string}
>('auth/fetchUserData', async (uid: string, {rejectWithValue}) => {
  try {
    const user: User | null = await UserModel.getById(uid);
    const userData = mapUserToSliceData(user);
    if (!userData) {
      console.warn(`No user document found or mapping failed for UID: ${uid}`);
    }
    return userData;
  } catch (error: any) {
    console.error('Fetch user data error (UserModel):', error);
    return rejectWithValue(error.message || 'Failed to fetch user data');
  }
});

export const updateDisplayName = createAsyncThunk<
  {id: string; displayName: string},
  {displayName: string},
  {state: RootState; rejectValue: string}
>(
  'auth/updateDisplayName',
  async ({displayName}, {getState, rejectWithValue}) => {
    const state = getState();
    const currentUser = state.auth.user;
    if (!currentUser) return rejectWithValue('User not logged in');

    try {
      const formattedName = displayName.trim();

      await currentUser.updateProfile({displayName: formattedName});
      await UserModel.update(currentUser.uid, {displayName: formattedName});
      await MemberModel.updateUserAcrossMemberships(currentUser.uid, {
        displayName: formattedName,
      });

      return {id: currentUser.uid, displayName: formattedName};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to update display name');
    }
  },
);

export const updateSobrietyDate = createAsyncThunk<
  {id: string; sobrietyStartDate: string | null},
  {date: Date | null},
  {state: RootState; rejectValue: string}
>('auth/updateSobrietyDate', async ({date}, {getState, rejectWithValue}) => {
  const state = getState();
  const currentUser = state.auth.user;
  if (!currentUser) return rejectWithValue('User not logged in');

  try {
    const dateISO = date ? date.toISOString() : null;
    await UserModel.update(currentUser.uid, {
      recoveryDate: dateISO || undefined,
    });

    return {id: currentUser.uid, sobrietyStartDate: dateISO};
  } catch (error: any) {
    return rejectWithValue(error.message || 'Failed to update sobriety date');
  }
});

export const updateUserPrivacySettings = createAsyncThunk<
  {
    userData: UserData | null;
  },
  {
    showSobrietyDate: boolean;
    allowDirectMessages: boolean;
    showPhoneNumber: boolean;
  },
  {state: RootState; rejectValue: string}
>(
  'auth/updateUserPrivacySettings',
  async (settings, {getState, rejectWithValue}) => {
    const state = getState();
    const currentUser = state.auth.user;
    if (!currentUser) return rejectWithValue('User not logged in');

    try {
      const userUpdatePayload: Partial<User> = {
        privacySettings: {
          showRecoveryDate: settings.showSobrietyDate,
          allowDirectMessages: settings.allowDirectMessages,
          showPhoneNumber: settings.showPhoneNumber,
        },
      };

      const updatedUser = await UserModel.update(
        currentUser.uid,
        userUpdatePayload,
      );

      const memberUpdates = {
        showSobrietyDate: settings.showSobrietyDate,
        showPhoneNumber: settings.showPhoneNumber,
      };
      await MemberModel.updateUserAcrossMemberships(
        currentUser.uid,
        memberUpdates,
      );

      return {
        userData: mapUserToSliceData(updatedUser),
      };
    } catch (error: any) {
      console.error('Error updating privacy settings (UserModel):', error);
      return rejectWithValue(
        error.message || 'Failed to update privacy settings',
      );
    }
  },
);

export const updateUserNotificationSettings = createAsyncThunk<
  {
    userData: UserData | null;
  },
  Partial<NotificationSettings>,
  {state: RootState; rejectValue: string}
>(
  'auth/updateNotificationSettings',
  async (
    settings: Partial<NotificationSettings>,
    {getState, rejectWithValue},
  ) => {
    const state = getState();
    const currentUser = state.auth.user;
    if (!currentUser) return rejectWithValue('User not logged in');

    try {
      const userUpdatePayload: Partial<User> = {
        notificationSettings: settings as NotificationSettings,
      };

      const updatedUser = await UserModel.update(
        currentUser.uid,
        userUpdatePayload,
      );

      return {
        userData: mapUserToSliceData(updatedUser),
      };
    } catch (error: any) {
      console.error('Error updating notification settings (UserModel):', error);
      return rejectWithValue(
        error.message || 'Failed to update notification settings',
      );
    }
  },
);

export const updateUserPhoto = createAsyncThunk<
  {id: string; photoURL: string | null},
  string,
  {state: RootState; rejectValue: string}
>('auth/updateUserPhoto', async (photoUrl, {getState, rejectWithValue}) => {
  const state = getState();
  const currentUser = state.auth.user;
  if (!currentUser) return rejectWithValue('User not logged in');

  try {
    await UserModel.updatePhotoURL(currentUser.uid, photoUrl);
    await MemberModel.updateUserAcrossMemberships(currentUser.uid, {
      photoUrl: photoUrl,
    });

    return {id: currentUser.uid, photoURL: photoUrl};
  } catch (error: any) {
    return rejectWithValue(error.message || 'Failed to update profile photo');
  }
});

export const signIn = createAsyncThunk(
  'auth/signIn',
  async (
    {email, password}: {email: string; password: string},
    {dispatch, rejectWithValue},
  ) => {
    try {
      const userCredential = await auth().signInWithEmailAndPassword(
        email,
        password,
      );
      dispatch(fetchUserData(userCredential.user.uid));
      return userCredential.user;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to sign in');
    }
  },
);

export const signUp = createAsyncThunk(
  'auth/signUp',
  async (
    {
      email,
      password,
      displayName,
    }: {email: string; password: string; displayName: string},
    {dispatch, rejectWithValue},
  ) => {
    try {
      const userCredential = await auth().createUserWithEmailAndPassword(
        email,
        password,
      );

      await userCredential.user.updateProfile({
        displayName,
      });

      await UserModel.create({
        uid: userCredential.user.uid,
        email,
        displayName,
        homeGroups: [],
      });

      dispatch(fetchUserData(userCredential.user.uid));
      return userCredential.user;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to sign up');
    }
  },
);

export const signOut = createAsyncThunk<
  null,
  string | undefined, // Optional userId to clear user-specific cache
  {rejectValue: string}
>('auth/signOut', async (userId, {rejectWithValue}) => {
  try {
    // Clear legacy onboarding data from AsyncStorage
    await AsyncStorage.multiRemove(ONBOARDING_STORAGE_KEYS);

    // Clear user-specific onboarding cache if userId provided
    if (userId) {
      await AsyncStorage.multiRemove([
        `@onboarding_complete_${userId}`,
        `@onboarding_data_${userId}`,
      ]);
    }

    // Sign out from Firebase
    await auth().signOut();
    return null;
  } catch (error: any) {
    return rejectWithValue(error.message || 'Failed to sign out');
  }
});

/**
 * Check onboarding status from Firestore (source of truth) with AsyncStorage cache
 */
export const checkOnboardingStatus = createAsyncThunk<
  {complete: boolean; data: OnboardingData | null},
  string, // userId
  {rejectValue: string}
>('auth/checkOnboardingStatus', async (userId, {rejectWithValue}) => {
  try {
    // First, try to get from Firestore (source of truth)
    const firestoreStatus = await UserModel.getOnboardingStatus(userId);

    if (firestoreStatus.complete) {
      // Cache the result in AsyncStorage for offline access
      await AsyncStorage.setItem(`@onboarding_complete_${userId}`, 'true');
      if (firestoreStatus.data) {
        await AsyncStorage.setItem(
          `@onboarding_data_${userId}`,
          JSON.stringify(firestoreStatus.data),
        );
      }
      return firestoreStatus;
    }

    // If Firestore says not complete, check AsyncStorage as fallback (offline case)
    // This handles the case where user completed onboarding offline
    const cachedComplete = await AsyncStorage.getItem(
      `@onboarding_complete_${userId}`,
    );

    if (cachedComplete === 'true') {
      const cachedDataStr = await AsyncStorage.getItem(
        `@onboarding_data_${userId}`,
      );
      const cachedData = cachedDataStr ? JSON.parse(cachedDataStr) : null;
      return {complete: true, data: cachedData};
    }

    // Neither Firestore nor cache has completion - user needs onboarding
    return {complete: false, data: null};
  } catch (error: any) {
    console.error('Error checking onboarding status:', error);

    // On error, fall back to AsyncStorage cache
    try {
      const cachedComplete = await AsyncStorage.getItem(
        `@onboarding_complete_${userId}`,
      );
      if (cachedComplete === 'true') {
        const cachedDataStr = await AsyncStorage.getItem(
          `@onboarding_data_${userId}`,
        );
        const cachedData = cachedDataStr ? JSON.parse(cachedDataStr) : null;
        return {complete: true, data: cachedData};
      }
    } catch (cacheError) {
      console.error('Error reading cache:', cacheError);
    }

    return rejectWithValue(
      error.message || 'Failed to check onboarding status',
    );
  }
});

/**
 * Complete onboarding and save to Firestore + AsyncStorage cache
 */
export const completeOnboarding = createAsyncThunk<
  OnboardingData,
  {
    userId: string;
    intent: OnboardingIntent;
    groupId: string | null;
    action?: 'create' | 'claim';
  },
  {rejectValue: string}
>(
  'auth/completeOnboarding',
  async ({userId, intent, groupId, action}, {rejectWithValue}) => {
    try {
      const onboardingData: OnboardingData = {
        intent,
        groupId,
        action,
        completedAt: Date.now(),
      };

      // Save to Firestore (source of truth)
      await UserModel.setOnboardingComplete(userId, onboardingData);

      // Cache in AsyncStorage for offline access
      await AsyncStorage.setItem(`@onboarding_complete_${userId}`, 'true');
      await AsyncStorage.setItem(
        `@onboarding_data_${userId}`,
        JSON.stringify(onboardingData),
      );

      // Also update legacy keys for backward compatibility
      await AsyncStorage.setItem(ONBOARDING_STORAGE_KEYS[0], 'true'); // @onboarding_complete
      await AsyncStorage.setItem('@onboarding_intent', intent);
      if (groupId) {
        await AsyncStorage.setItem('@onboarding_group_id', groupId);
      }
      if (action) {
        await AsyncStorage.setItem('@onboarding_action', action);
      }

      return onboardingData;
    } catch (error: any) {
      console.error('Error completing onboarding:', error);
      return rejectWithValue(error.message || 'Failed to complete onboarding');
    }
  },
);

/**
 * Compound thunk: Sign up, optionally join a group, and complete onboarding
 * This provides an atomic operation for the onboarding auth flow
 */
export const signUpAndCompleteOnboarding = createAsyncThunk<
  {
    user: any;
    onboardingData: OnboardingData;
  },
  {
    email: string;
    password: string;
    displayName: string;
    intent: OnboardingIntent;
    groupId?: string | null;
    action?: 'create' | 'claim';
  },
  {rejectValue: string}
>(
  'auth/signUpAndCompleteOnboarding',
  async (
    {email, password, displayName, intent, groupId, action},
    {dispatch, rejectWithValue},
  ) => {
    try {
      // Step 1: Create user account
      const userCredential = await auth().createUserWithEmailAndPassword(
        email,
        password,
      );

      await userCredential.user.updateProfile({
        displayName,
      });

      // Step 2: Create user profile in Firestore
      await UserModel.create({
        uid: userCredential.user.uid,
        email,
        displayName,
        homeGroups: groupId ? [groupId] : [],
      });

      // Step 3: Join group if specified
      if (groupId) {
        try {
          await GroupModel.addMember(groupId, userCredential.user.uid);

          // If claiming admin, submit admin request
          if (action === 'claim') {
            await GroupModel.requestAdminAccess(
              groupId,
              `Requested during onboarding by ${displayName}`,
            );
          }
        } catch (groupError: any) {
          console.warn(
            'Failed to join group during onboarding:',
            groupError.message,
          );
          // Don't fail the entire operation if group join fails
        }
      }

      // Step 4: Complete onboarding
      const onboardingData: OnboardingData = {
        intent,
        groupId: groupId || null,
        action,
        completedAt: Date.now(),
      };

      await UserModel.setOnboardingComplete(
        userCredential.user.uid,
        onboardingData,
      );

      // Cache in AsyncStorage
      await AsyncStorage.setItem(
        `@onboarding_complete_${userCredential.user.uid}`,
        'true',
      );
      await AsyncStorage.setItem(
        `@onboarding_data_${userCredential.user.uid}`,
        JSON.stringify(onboardingData),
      );

      // Update legacy keys
      await AsyncStorage.setItem(ONBOARDING_STORAGE_KEYS[0], 'true');
      await AsyncStorage.setItem('@onboarding_intent', intent);
      if (groupId) {
        await AsyncStorage.setItem('@onboarding_group_id', groupId);
      }
      if (action) {
        await AsyncStorage.setItem('@onboarding_action', action);
      }

      // Fetch user data for state update
      dispatch(fetchUserData(userCredential.user.uid));

      return {
        user: userCredential.user,
        onboardingData,
      };
    } catch (error: any) {
      console.error('Error in signUpAndCompleteOnboarding:', error);

      let errorMessage = 'Failed to complete sign up';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      } else if (error.message) {
        errorMessage = error.message;
      }

      return rejectWithValue(errorMessage);
    }
  },
);

export const updateUserPhoneNumber = createAsyncThunk<
  {id: string; phoneNumber: string | null},
  string | null,
  {state: RootState; rejectValue: string}
>(
  'auth/updateUserPhoneNumber',
  async (phoneNumber, {getState, rejectWithValue}) => {
    const state = getState();
    const currentUser = state.auth.user;
    if (!currentUser) return rejectWithValue('User not logged in');

    try {
      await UserModel.update(currentUser.uid, {phoneNumber});
      return {id: currentUser.uid, phoneNumber};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to update phone number');
    }
  },
);

export const updateFcmToken = createAsyncThunk<
  {id: string; fcmToken: string},
  {userId: string; token: string},
  {rejectValue: string}
>('auth/updateFcmToken', async ({userId, token}, {rejectWithValue}) => {
  try {
    await UserModel.addFcmToken(userId, token);
    return {id: userId, fcmToken: token};
  } catch (error: any) {
    return rejectWithValue(error.message || 'Failed to update FCM token');
  }
});

export const updateSponsorSettings = createAsyncThunk<
  {id: string; sponsorSettings: SponsorSettings},
  SponsorSettings,
  {state: RootState; rejectValue: string}
>(
  'auth/updateSponsorSettings',
  async (settings, {getState, rejectWithValue}) => {
    const state = getState();
    const currentUser = state.auth.user;
    if (!currentUser) return rejectWithValue('User not logged in');

    try {
      await UserModel.update(currentUser.uid, {
        sponsorSettings: settings,
      });
      await MemberModel.updateUserAcrossMemberships(currentUser.uid, {
        sponsorSettings: settings,
      });
      return {id: currentUser.uid, sponsorSettings: settings};
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to update sponsor settings',
      );
    }
  },
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: state => {
      state.error = null;
    },
    setUser: (state, action: PayloadAction<FirebaseAuthTypes.User | null>) => {
      state.user = action.payload;
      state.isAuthenticated = !!action.payload;
    },
    setLocation: (state, action: PayloadAction<Location | null>) => {
      state.location = action.payload;
    },
    setOnboardingComplete: (state, action: PayloadAction<boolean>) => {
      state.onboardingComplete = action.payload;
    },
    setOnboardingData: (
      state,
      action: PayloadAction<OnboardingData | null>,
    ) => {
      state.onboardingData = action.payload;
    },
    setPendingNavigation: (
      state,
      action: PayloadAction<{route: string; params: any} | null>,
    ) => {
      state.pendingNavigation = action.payload;
    },
    clearPendingNavigation: state => {
      state.pendingNavigation = null;
    },
    login: state => {
      state.isAuthenticated = true;
      state.error = null;
    },
    logout: state => {
      state.isAuthenticated = false;
      state.error = null;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(fetchUserData.pending, state => {
        state.status = 'loading';
      })
      .addCase(
        fetchUserData.fulfilled,
        (state, action: PayloadAction<UserData | null>) => {
          state.status = 'succeeded';
          if (action.payload) {
            usersAdapter.upsertOne(state.users, action.payload);
          }
          state.lastFetched = Date.now();
          state.error = null;
        },
      )
      .addCase(fetchUserData.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })

      .addCase(
        updateDisplayName.fulfilled,
        (state, action: PayloadAction<UpdateDisplayNamePayload>) => {
          if (state.users.entities[action.payload.id]) {
            usersAdapter.updateOne(state.users, {
              id: action.payload.id,
              changes: {displayName: action.payload.displayName},
            });
          }
          state.status = 'succeeded';
          state.error = null;
        },
      )
      .addCase(updateDisplayName.rejected, (state, action) => {
        state.error = action.payload as string;
        state.status = 'failed';
      })

      .addCase(
        updateSobrietyDate.fulfilled,
        (state, action: PayloadAction<UpdateSobrietyDatePayload>) => {
          if (state.users.entities[action.payload.id]) {
            usersAdapter.updateOne(state.users, {
              id: action.payload.id,
              changes: {sobrietyStartDate: action.payload.sobrietyStartDate},
            });
          }
          state.status = 'succeeded';
          state.error = null;
        },
      )
      .addCase(updateSobrietyDate.rejected, (state, action) => {
        state.error = action.payload as string;
        state.status = 'failed';
      })

      .addCase(updateUserPrivacySettings.fulfilled, (state, action) => {
        if (action.payload.userData) {
          usersAdapter.upsertOne(state.users, action.payload.userData);
        }
        state.status = 'succeeded';
        state.error = null;
      })
      .addCase(updateUserPrivacySettings.rejected, (state, action) => {
        state.error = action.payload as string;
        state.status = 'failed';
      })

      .addCase(updateUserNotificationSettings.fulfilled, (state, action) => {
        if (action.payload.userData) {
          usersAdapter.upsertOne(state.users, action.payload.userData);
        }
        state.status = 'succeeded';
        state.error = null;
      })
      .addCase(updateUserNotificationSettings.rejected, (state, action) => {
        state.error = action.payload as string;
        state.status = 'failed';
      })

      .addCase(
        updateUserPhoto.fulfilled,
        (state, action: PayloadAction<UpdateUserPhotoPayload>) => {
          if (state.users.entities[action.payload.id]) {
            usersAdapter.updateOne(state.users, {
              id: action.payload.id,
              changes: {photoURL: action.payload.photoURL},
            });
          }
          state.status = 'succeeded';
          state.error = null;
        },
      )
      .addCase(updateUserPhoto.rejected, (state, action) => {
        state.error =
          (action.payload as string) || 'Failed to update profile photo';
        state.status = 'failed';
      })

      .addCase(signIn.pending, state => {
        state.status = 'loading';
      })
      .addCase(signIn.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.isAuthenticated = true;
        state.error = null;
      })
      .addCase(signIn.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Failed to sign in';
      })

      .addCase(signUp.pending, state => {
        state.status = 'loading';
      })
      .addCase(signUp.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.isAuthenticated = true;
        state.error = null;
      })
      .addCase(signUp.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Failed to sign up';
      })

      .addCase(signOut.pending, state => {
        state.status = 'loading';
      })
      .addCase(signOut.fulfilled, state => {
        state.status = 'succeeded';
        // Reset onboarding state so new users see onboarding flow
        state.onboardingComplete = null;
        state.onboardingData = null;
        state.user = null;
        state.isAuthenticated = false;
      })
      .addCase(signOut.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Failed to sign out';
      })

      .addCase(updateUserPhoneNumber.pending, state => {
        state.status = 'loading';
      })
      .addCase(
        updateUserPhoneNumber.fulfilled,
        (state, action: PayloadAction<UpdateUserPhoneNumberPayload>) => {
          if (state.users.entities[action.payload.id]) {
            usersAdapter.updateOne(state.users, {
              id: action.payload.id,
              changes: {phoneNumber: action.payload.phoneNumber},
            });
          }
          state.status = 'succeeded';
          state.error = null;
        },
      )
      .addCase(updateUserPhoneNumber.rejected, (state, action) => {
        state.status = 'failed';
        state.error =
          (action.payload as string) || 'Failed to update phone number';
      })

      .addCase(updateFcmToken.fulfilled, (state, action) => {
        if (state.users.entities[action.payload.id]) {
          const currentTokens =
            state.users.entities[action.payload.id].fcmTokens || [];
          if (!currentTokens.includes(action.payload.fcmToken)) {
            state.users.entities[action.payload.id].fcmTokens = [
              ...currentTokens,
              action.payload.fcmToken,
            ];
          }
        }
      })
      .addCase(updateFcmToken.rejected, (state, action) => {
        console.error('FCM Token update failed (reducer):', action.payload);
      })

      .addCase(updateSponsorSettings.fulfilled, (state, action) => {
        if (state.users.entities[action.payload.id]) {
          state.users.entities[action.payload.id].sponsorSettings =
            action.payload.sponsorSettings;
        }
        state.status = 'succeeded';
        state.error = null;
      })
      .addCase(updateSponsorSettings.rejected, (state, action) => {
        state.error = action.payload as string;
        state.status = 'failed';
      })

      // Check onboarding status
      .addCase(checkOnboardingStatus.pending, state => {
        state.status = 'loading';
      })
      .addCase(checkOnboardingStatus.fulfilled, (state, action) => {
        state.onboardingComplete = action.payload.complete;
        state.onboardingData = action.payload.data;
        state.status = 'succeeded';
        state.error = null;
      })
      .addCase(checkOnboardingStatus.rejected, (state, action) => {
        // On error, default to showing onboarding
        state.onboardingComplete = false;
        state.status = 'failed';
        state.error = action.payload as string;
      })

      // Complete onboarding
      .addCase(completeOnboarding.pending, state => {
        state.status = 'loading';
      })
      .addCase(completeOnboarding.fulfilled, (state, action) => {
        state.onboardingComplete = true;
        state.onboardingData = action.payload;
        state.status = 'succeeded';
        state.error = null;
      })
      .addCase(completeOnboarding.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })

      // Sign up and complete onboarding (compound thunk)
      .addCase(signUpAndCompleteOnboarding.pending, state => {
        state.status = 'loading';
      })
      .addCase(signUpAndCompleteOnboarding.fulfilled, (state, action) => {
        state.onboardingComplete = true;
        state.onboardingData = action.payload.onboardingData;
        state.isAuthenticated = true;
        state.status = 'succeeded';
        state.error = null;
      })
      .addCase(signUpAndCompleteOnboarding.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });
  },
});

// Memoized selectors
const usersSelectors = usersAdapter.getSelectors<RootState>(
  state => state.auth.users,
);

export const selectUser = (state: RootState) => state.auth.user;
export const selectUserData = createSelector(
  [usersSelectors.selectAll, (state: RootState) => state.auth.user?.uid],
  (users, currentUserId) => {
    if (!currentUserId) return null;
    return users.find(user => user.id === currentUserId) || null;
  },
);
export const selectAuthStatus = (state: RootState) => state.auth.status;
export const selectAuthError = (state: RootState) => state.auth.error;
export const selectIsAuthenticated = (state: RootState) =>
  state.auth.isAuthenticated;
export const selectUserLocation = (state: RootState) => state.auth.location;
export const selectPendingNavigation = (state: RootState) =>
  state.auth.pendingNavigation;
export const selectOnboardingData = (state: RootState) =>
  state.auth.onboardingData;

export const {
  clearError,
  setUser,
  setLocation,
  setPendingNavigation,
  clearPendingNavigation,
  login,
  logout,
  setLoading,
  setError,
  setOnboardingComplete,
  setOnboardingData,
} = authSlice.actions;

export default authSlice.reducer;
