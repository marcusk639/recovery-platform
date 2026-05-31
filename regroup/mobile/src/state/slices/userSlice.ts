import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { User } from '../../entities/User';
import { Role } from '../../entities/Roles';
import { Invitation } from '../../entities/Invite';
import * as userService from '../../services/users';
import { getFirebaseUserFromUserCredential } from '../../util/user';
import { subscriptionStatus } from '../../util/subscription';
import { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { navigationRef } from '../../navigation/service';
import { CommonActions } from '@react-navigation/native';
import { Routes } from '../../navigation/types';

/**
 * User State Interface
 * Manages authentication and user data
 */
interface UserState {
  loggedIn: boolean;
  loading: boolean;
  updating: boolean;
  updatingFailed: boolean;
  updatingSuccessful: boolean;
  user: Partial<User> | null;
  loggingIn: boolean;
  loggingOut: boolean;
  creatingUser: boolean;
  accountVerifyFailed: boolean;
  error: any;
  houseCodeErrorMessage: string | null;
  signUpRole: Role | null;
  autoLoggingIn: boolean;
  anonLoggingIn: boolean;
  anonUser: Partial<User> | null;
  anonymous: boolean;
  invitation: Invitation | null;
  loginFailed: boolean;
  loggingOutSuccessful: boolean;
  token: any;
  subscriptionStatus?: string | null;
}

const initialState: UserState = {
  loggedIn: false,
  loading: true,
  updating: false,
  updatingFailed: false,
  updatingSuccessful: false,
  user: null,
  loggingIn: false,
  loggingOut: false,
  creatingUser: false,
  accountVerifyFailed: false,
  error: null,
  houseCodeErrorMessage: null,
  signUpRole: null,
  autoLoggingIn: false,
  anonLoggingIn: false,
  anonUser: null,
  anonymous: false,
  invitation: null,
  loginFailed: false,
  loggingOutSuccessful: false,
  token: { claims: {} },
  subscriptionStatus: null,
};

// Async Thunks
export const login = createAsyncThunk(
  'user/login',
  async (
    { email, password }: { email: string; password: string },
    { dispatch },
  ) => {
    let user: any = await userService.signInWithEmail(email, password);
    user = getFirebaseUserFromUserCredential(user);
    const userEntity = await userService.getUser(user.uid);
    const token = await userService.getAuthUser(true);
    dispatch(setSubscriptionStatus(subscriptionStatus(userEntity)));
    return { user: userEntity, token };
  },
);

export const anonymouslyLogin = createAsyncThunk(
  'user/anonymouslyLogin',
  async () => {
    let anonUser: any = await userService.anonymouslyLogin();
    anonUser = getFirebaseUserFromUserCredential(anonUser);
    let userEntity = await userService.getUser(anonUser.uid);
    if (userEntity === undefined) {
      userEntity = await userService.createAnonUser(anonUser);
    }
    return { user: userEntity };
  },
);

export const autoLogin = createAsyncThunk(
  'user/autoLogin',
  async (signedInUser: FirebaseAuthTypes.User) => {
    let userEntity = await userService.getUser(signedInUser.uid);
    if (!userEntity) {
      // Convert Firebase user to our User entity
      const convertedUser = userService.convertFirebaseUserToRatsUser({}, {
        user: signedInUser,
      } as FirebaseAuthTypes.UserCredential);
      userEntity = await userService.createAnonUser(convertedUser);
    }
    const token = await userService.getAuthUser(true);
    return { user: userEntity, token };
  },
);

export const logout = createAsyncThunk(
  'user/logout',
  async (_, { dispatch }) => {
    await userService.signOut();
    const result = await dispatch(anonymouslyLogin()).unwrap();

    // Reset navigation to landing screen
    setTimeout(() => {
      if (navigationRef.current) {
        navigationRef.current.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: Routes.InitialLanding }],
          }),
        );
      }
    }, 100);

    return result;
  },
);

export const updateUser = createAsyncThunk(
  'user/updateUser',
  async ({ user, updates }: { user: User; updates: Partial<User> }) => {
    const updatedUser = await userService.updateUser(user, updates);
    return updatedUser;
  },
);

export const createUser = createAsyncThunk(
  'user/createUser',
  async (userData: Partial<User>) => {
    const newUser = await userService.createUser(userData);
    return newUser;
  },
);

export const initialSignUp = createAsyncThunk(
  'user/initialSignUp',
  async ({
    user,
    potentialUserType,
  }: {
    user: Partial<User>;
    potentialUserType: string;
  }) => {
    const updatedUser = await userService.updateUser(user, {
      isAdmin: potentialUserType !== 'guest',
    });
    return updatedUser;
  },
);

export const requestAccountVerification = createAsyncThunk(
  'user/requestAccountVerification',
  async ({
    houseCode,
    firstName,
    lastName,
    userId,
  }: {
    houseCode: string;
    firstName: string;
    lastName: string;
    userId: string;
  }) => {
    await userService.requestAccountVerification(
      houseCode,
      firstName,
      lastName,
      userId,
    );
    return { houseCode, firstName, lastName, userId };
  },
);

// Slice
const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    loginFailed: state => {
      state.loginFailed = true;
      state.loading = false;
      state.loggingIn = false;
    },
    initializeInvitation: (state, action: PayloadAction<Invitation>) => {
      state.invitation = action.payload;
    },
    setSignUpRole: (state, action: PayloadAction<Role>) => {
      state.signUpRole = action.payload;
    },
    setSubscriptionStatus: (
      state,
      action: PayloadAction<string | undefined>,
    ) => {
      state.subscriptionStatus = action.payload;
    },
    clearError: state => {
      state.error = null;
      state.loginFailed = false;
      state.updatingFailed = false;
      state.accountVerifyFailed = false;
    },
    resetUserState: () => {
      return initialState;
    },
  },
  extraReducers: builder => {
    // Login
    builder
      .addCase(login.pending, state => {
        state.loggingIn = true;
        state.loading = false;
        state.loginFailed = false;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.loggedIn = true;
        state.loggingIn = false;
        state.loading = false;
        state.loginFailed = false;
        state.anonymous = false;
        state.error = null;
      })
      .addCase(login.rejected, (state, action) => {
        state.loggingIn = false;
        state.loading = false;
        state.loginFailed = true;
        state.error = action.error;
      });

    // Anonymous Login
    builder
      .addCase(anonymouslyLogin.pending, state => {
        state.anonLoggingIn = true;
        state.loading = false;
      })
      .addCase(anonymouslyLogin.fulfilled, (state, action) => {
        state.user = action.payload.user;
        state.anonUser = action.payload.user;
        state.loggedIn = true;
        state.anonLoggingIn = false;
        state.loading = false;
        state.anonymous = true;
        state.loginFailed = false;
      })
      .addCase(anonymouslyLogin.rejected, (state, action) => {
        state.anonLoggingIn = false;
        state.loading = false;
        state.loginFailed = true;
        state.error = action.error;
      });

    // Auto Login
    builder
      .addCase(autoLogin.pending, state => {
        state.autoLoggingIn = true;
        state.loading = false;
      })
      .addCase(autoLogin.fulfilled, (state, action) => {
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.loggedIn = true;
        state.anonymous = false;
        state.autoLoggingIn = false;
        state.loading = false;
        state.loginFailed = false;
      })
      .addCase(autoLogin.rejected, (state, action) => {
        state.autoLoggingIn = false;
        state.loading = false;
        state.loginFailed = true;
        state.error = action.error;
      });

    // Logout
    builder
      .addCase(logout.pending, state => {
        state.loggingOut = true;
        state.loggingOutSuccessful = false;
      })
      .addCase(logout.fulfilled, (state, action) => {
        state.user = action.payload.user;
        state.anonUser = action.payload.user;
        state.loggingOut = false;
        state.loggingOutSuccessful = true;
        state.loggedIn = true;
        state.anonymous = true;
      })
      .addCase(logout.rejected, (state, action) => {
        state.loggingOut = false;
        state.error = action.error;
      });

    // Update User
    builder
      .addCase(updateUser.pending, state => {
        state.updating = true;
        state.updatingSuccessful = false;
        state.updatingFailed = false;
      })
      .addCase(updateUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.updating = false;
        state.updatingSuccessful = true;
      })
      .addCase(updateUser.rejected, (state, action) => {
        state.updating = false;
        state.updatingFailed = true;
        state.error = action.error;
      });

    // Create User
    builder
      .addCase(createUser.pending, state => {
        state.creatingUser = true;
      })
      .addCase(createUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.creatingUser = false;
        state.loggedIn = true;
      })
      .addCase(createUser.rejected, (state, action) => {
        state.creatingUser = false;
        state.error = action.error;
      });

    // Account Verification
    builder
      .addCase(requestAccountVerification.pending, state => {
        state.accountVerifyFailed = false;
      })
      .addCase(requestAccountVerification.fulfilled, state => {
        state.accountVerifyFailed = false;
      })
      .addCase(requestAccountVerification.rejected, (state, action) => {
        state.accountVerifyFailed = true;
        state.error = action.error;
      });
  },
});

export const {
  loginFailed: loginFailedAction,
  initializeInvitation,
  setSignUpRole,
  setSubscriptionStatus,
  clearError,
  resetUserState,
} = userSlice.actions;

export default userSlice.reducer;
