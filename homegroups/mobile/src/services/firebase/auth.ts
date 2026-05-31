import {auth, firestore} from './config';
import FirebaseAuth, {FirebaseAuthTypes} from '@react-native-firebase/auth';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {appleAuth} from '@invertase/react-native-apple-authentication';
import {LoginManager, AccessToken} from 'react-native-fbsdk-next';
import {Platform} from 'react-native';
import UserModel from '../../models/UserModel';
import {User} from '../../types';
import functions from '@react-native-firebase/functions';

export interface RegisterData {
  email: string;
  password: string;
  displayName: string;
  recoveryDate?: string;
}

export interface LoginData {
  email: string;
  password: string;
  rememberMe?: boolean;
}

// Register a new user with email and password
export const registerWithEmail = async (
  data: RegisterData,
): Promise<FirebaseAuthTypes.UserCredential> => {
  try {
    // Create user in Firebase Auth
    const userCredential = await auth.createUserWithEmailAndPassword(
      data.email,
      data.password,
    );

    // Update display name
    if (userCredential.user) {
      await userCredential.user.updateProfile({
        displayName: data.displayName,
      });

      // Create user profile using UserModel
      await UserModel.create({
        email: data.email,
        displayName: data.displayName,
        recoveryDate: data.recoveryDate,
      });
    }

    return userCredential;
  } catch (error) {
    console.error('Error registering user:', error);
    throw error;
  }
};

// Sign in with email and password
export const loginWithEmail = async (
  data: LoginData,
): Promise<FirebaseAuthTypes.UserCredential> => {
  try {
    const userCredential = await auth.signInWithEmailAndPassword(
      data.email,
      data.password,
    );

    // Update last login timestamp using UserModel
    if (userCredential.user) {
      await UserModel.update(userCredential.user.uid, {
        lastLogin: new Date(),
      });

      // Sync claims on login to ensure they're fresh
      // This runs in background - don't block login
      syncUserClaims().catch(err =>
        console.warn('Failed to sync claims on login:', err),
      );
    }

    return userCredential;
  } catch (error) {
    console.error('Error signing in:', error);
    throw error;
  }
};

// Sign out the current user
export const logoutUser = async (): Promise<void> => {
  try {
    await auth.signOut();
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

// Send password reset email
export const resetPassword = async (email: string): Promise<void> => {
  try {
    await auth.sendPasswordResetEmail(email);
  } catch (error) {
    console.error('Error sending reset email:', error);
    throw error;
  }
};

// Get the current user's profile data
export const getUserProfile = async (userId: string) => {
  try {
    return await UserModel.getById(userId);
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw error;
  }
};

/**
 * Force refresh the user's ID token to get updated custom claims
 * Call this after role changes (admin, treasurer, etc.)
 */
export const refreshAuthToken = async (): Promise<string | null> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.warn('No current user to refresh token for');
      return null;
    }

    // Force token refresh - this will fetch new custom claims
    const token = await currentUser.getIdToken(true);
    if (__DEV__) console.log('Auth token refreshed successfully');
    return token;
  } catch (error) {
    console.error('Error refreshing auth token:', error);
    throw error;
  }
};

/**
 * Manually sync user claims via Cloud Function
 * Useful when custom claims might be out of sync
 */
export const syncUserClaims = async (): Promise<{
  success: boolean;
  message: string;
}> => {
  try {
    const syncClaimsFunction = functions().httpsCallable('syncUserClaims');
    const result = await syncClaimsFunction({});

    // After syncing claims, refresh the token to apply them
    await refreshAuthToken();

    return result.data as {success: boolean; message: string};
  } catch (error) {
    console.error('Error syncing user claims:', error);
    throw error;
  }
};

/**
 * Get current user's custom claims
 * Returns the claims from the current ID token
 */
export const getUserClaims = async (): Promise<Record<string, any> | null> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return null;
    }

    const idTokenResult = await currentUser.getIdTokenResult();
    return idTokenResult.claims;
  } catch (error) {
    console.error('Error getting user claims:', error);
    return null;
  }
};

/**
 * Handle permission denied errors with automatic token refresh and retry
 * @param operation - The async operation to execute
 * @param retryOnce - Whether to retry after token refresh (default: true)
 */
export const withAutoTokenRefresh = async <T>(
  operation: () => Promise<T>,
  retryOnce: boolean = true,
): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    // Check if this is a permission denied error
    if (
      retryOnce &&
      (error.code === 'permission-denied' ||
        error.code === 'firestore/permission-denied' ||
        error.message?.includes('permission-denied'))
    ) {
      if (__DEV__)
        console.log(
          'Permission denied error detected, syncing claims and retrying...',
        );

      // First try just refreshing the token (fast path)
      await refreshAuthToken();

      try {
        // Retry the operation
        return await operation();
      } catch (retryError: any) {
        // If still permission denied, sync claims from server (slow path)
        if (
          retryError.code === 'permission-denied' ||
          retryError.code === 'firestore/permission-denied' ||
          retryError.message?.includes('permission-denied')
        ) {
          if (__DEV__)
            console.log(
              'Still permission denied after token refresh, syncing claims from server...',
            );
          await syncUserClaims();

          // Final retry after full claims sync
          return await operation();
        }
        throw retryError;
      }
    }

    // Re-throw if not a permission error or if retry already happened
    throw error;
  }
};

// Initialize Google Sign-In
GoogleSignin.configure({
  webClientId:
    '421876308052-keo1nq0auqhvlcutg356nfrqs2p45ho8.apps.googleusercontent.com',
  offlineAccess: true,
  iosClientId:
    '421876308052-keo1nq0auqhvlcutg356nfrqs2p45ho8.apps.googleusercontent.com',
  forceCodeForRefreshToken: true,
});

/**
 * Sign in with Google
 */
export const signInWithGoogle =
  async (): Promise<FirebaseAuthTypes.UserCredential> => {
    try {
      if (__DEV__) console.log('Starting Google Sign-In process...');

      // Get the user ID token
      if (Platform.OS === 'android') {
        if (__DEV__) console.log('Checking Play Services...');
        await GoogleSignin.hasPlayServices();
        if (__DEV__) console.log('Play Services check passed');
      }

      if (__DEV__) console.log('Attempting Google Sign-In...');
      const result = await GoogleSignin.signIn();
      if (__DEV__) console.log('Google Sign-In result:', result);

      const idToken = result.data?.idToken;
      if (__DEV__) console.log('ID Token received:', idToken ? 'Yes' : 'No');

      if (!idToken) {
        console.error('No ID token received from Google Sign-In');
        throw new Error('Google Sign-In failed - no ID token returned');
      }

      // Create a Google credential
      if (__DEV__) console.log('Creating Firebase credential...');
      const googleCredential =
        FirebaseAuth.GoogleAuthProvider.credential(idToken);

      // Sign in with the credential
      if (__DEV__) console.log('Signing in with Firebase...');
      const userCredential = await auth.signInWithCredential(googleCredential);
      if (__DEV__) console.log('Firebase sign-in successful');

      // Check if this is a new user
      if (userCredential.additionalUserInfo?.isNewUser) {
        if (__DEV__) console.log('New user detected, creating profile...');
        // Create user profile using UserModel
        await UserModel.create({
          email: userCredential.user.email || '',
          displayName: userCredential.user.displayName || '',
          photoUrl: userCredential.user.photoURL || null,
        });
        if (__DEV__) console.log('New user profile created');
      } else {
        if (__DEV__) console.log('Existing user, updating last login...');
        // Update last login time using UserModel
        await UserModel.update(userCredential.user.uid, {
          lastLogin: new Date(),
        });
        if (__DEV__) console.log('Last login updated');

        // Sync claims on login to ensure they're fresh
        syncUserClaims().catch(err =>
          console.warn('Failed to sync claims on Google login:', err),
        );
      }

      return userCredential;
    } catch (error) {
      console.error('Google sign in error:', error);
      throw error;
    }
  };

/**
 * Sign in with Apple
 */
export const signInWithApple =
  async (): Promise<FirebaseAuthTypes.UserCredential> => {
    // Apple Sign In is only available on iOS
    if (Platform.OS !== 'ios') {
      throw new Error('Apple Sign In is only supported on iOS devices');
    }

    try {
      // Start the Apple authentication flow
      const appleAuthRequestResponse = await appleAuth.performRequest({
        requestedOperation: appleAuth.Operation.LOGIN,
        requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
      });

      // Ensure Apple returned a user identityToken
      if (!appleAuthRequestResponse.identityToken) {
        throw new Error('Apple Sign-In failed - no identity token returned');
      }

      // Create a Firebase credential from the response
      const {identityToken, nonce} = appleAuthRequestResponse;
      const appleCredential = FirebaseAuth.AppleAuthProvider.credential(
        identityToken,
        nonce,
      );

      // Sign in with the credential
      const userCredential = await auth.signInWithCredential(appleCredential);

      // Apple doesn't always return the user's name, so we need to handle that
      if (
        userCredential.additionalUserInfo?.isNewUser &&
        appleAuthRequestResponse.fullName?.givenName
      ) {
        // Update the user's profile with their name
        await userCredential.user.updateProfile({
          displayName: appleAuthRequestResponse.fullName.givenName,
        });

        // Create user profile using UserModel
        await UserModel.create({
          email: userCredential.user.email || '',
          displayName: appleAuthRequestResponse.fullName.givenName,
        });
      } else if (!userCredential.additionalUserInfo?.isNewUser) {
        // Update last login time using UserModel
        await UserModel.update(userCredential.user.uid, {
          lastLogin: new Date(),
        });

        // Sync claims on login to ensure they're fresh
        syncUserClaims().catch(err =>
          console.warn('Failed to sync claims on Apple login:', err),
        );
      }

      return userCredential;
    } catch (error) {
      console.error('Apple sign in error:', error);
      throw error;
    }
  };

/**
 * Sign in with Facebook
 */
export const signInWithFacebook =
  async (): Promise<FirebaseAuthTypes.UserCredential> => {
    try {
      // Log in with Facebook SDK
      const result = await LoginManager.logInWithPermissions([
        'public_profile',
        'email',
      ]);

      if (result.isCancelled) {
        throw new Error('User cancelled the login process');
      }

      // Get the access token
      const data = await AccessToken.getCurrentAccessToken();

      if (!data) {
        throw new Error('Failed to get access token from Facebook');
      }

      // Create a Facebook credential
      const facebookCredential = FirebaseAuth.FacebookAuthProvider.credential(
        data.accessToken,
      );

      // Sign in with the credential
      const userCredential =
        await auth.signInWithCredential(facebookCredential);

      // Check if this is a new user
      if (userCredential.additionalUserInfo?.isNewUser) {
        // Create user profile using UserModel
        await UserModel.create({
          email: userCredential.user.email || '',
          displayName: userCredential.user.displayName || '',
          photoUrl: userCredential.user.photoURL || null,
        });
      } else {
        // Update last login time using UserModel
        await UserModel.update(userCredential.user.uid, {
          lastLogin: new Date(),
        });

        // Sync claims on login to ensure they're fresh
        syncUserClaims().catch(err =>
          console.warn('Failed to sync claims on Facebook login:', err),
        );
      }

      return userCredential;
    } catch (error) {
      console.error('Facebook sign in error:', error);
      throw error;
    }
  };
