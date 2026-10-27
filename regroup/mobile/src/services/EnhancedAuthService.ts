// Enhanced authentication service with security improvements
import { auth } from "../../firebase-setup";
import { logException } from "../util/logging";
import { FirebaseAuthTypes } from "@react-native-firebase/auth";
import { SimpleValidationService } from "./SimpleValidationService";
import { getCurrentTime } from "../util/display";

export interface AuthResult {
  success: boolean;
  user?: FirebaseAuthTypes.User;
  error?: string;
  requiresEmailVerification?: boolean;
}

export interface SignUpData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export class EnhancedAuthService {
  /**
   * Enhanced sign in with email and password
   */
  static async signInWithEmail(
    email: string,
    password: string
  ): Promise<AuthResult> {
    try {
      // Rate limiting
      if (
        !SimpleValidationService.checkRateLimit(`signin_${email}`, 5, 60000)
      ) {
        return {
          success: false,
          error: "Too many sign-in attempts. Please try again later.",
        };
      }

      // Validate inputs
      const emailValidation = SimpleValidationService.validateEmail(email);
      if (!emailValidation.isValid) {
        return {
          success: false,
          error: emailValidation.error,
        };
      }

      if (!password || password.length < 1) {
        return {
          success: false,
          error: "Password is required",
        };
      }

      // Sanitize email
      const sanitizedEmail = SimpleValidationService.sanitizeString(email);

      // Attempt sign in
      const userCredential = await auth.signInWithEmailAndPassword(
        sanitizedEmail,
        password
      );

      if (!userCredential.user) {
        return {
          success: false,
          error: "Sign in failed. Please check your credentials.",
        };
      }

      // Email verification is intentionally disabled app-wide (see
      // services/users.tsx's convertFirebaseUserToRatsUser, which hardcodes
      // `emailVerified: true` on every user record). A real Firebase
      // account's actual emailVerified flag is not a reliable signal here —
      // gating sign-in on it would incorrectly lock out real users whose
      // accounts were never sent a verification email in the first place.
      // This gate used to exist here and was removed 2026-07-04 as a
      // fix, not a feature change — it was never actually reachable in
      // production since this whole class was disconnected from the live
      // login path until that same date.

      return {
        success: true,
        user: userCredential.user,
      };
    } catch (error: any) {
      logException(error);

      // Handle specific Firebase errors
      switch (error.code) {
        case "auth/user-not-found":
          return {
            success: false,
            error: "No account found with this email address.",
          };
        case "auth/wrong-password":
          return {
            success: false,
            error: "Incorrect password. Please try again.",
          };
        case "auth/invalid-email":
          return {
            success: false,
            error: "Invalid email address format.",
          };
        case "auth/user-disabled":
          return {
            success: false,
            error: "This account has been disabled. Please contact support.",
          };
        case "auth/too-many-requests":
          return {
            success: false,
            error: "Too many failed attempts. Please try again later.",
          };
        default:
          return {
            success: false,
            error: "Sign in failed. Please try again.",
          };
      }
    }
  }

  /**
   * Enhanced sign up with email and password
   */
  static async signUpWithEmail(data: SignUpData): Promise<AuthResult> {
    try {
      // Rate limiting
      if (
        !SimpleValidationService.checkRateLimit(
          `signup_${data.email}`,
          3,
          300000
        )
      ) {
        return {
          success: false,
          error: "Too many sign-up attempts. Please try again later.",
        };
      }

      // Validate and sanitize all inputs
      const validation = SimpleValidationService.validateAndSanitizeUserInput({
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
      });

      if (!validation.isValid) {
        return {
          success: false,
          error: validation.errors.join(", "),
        };
      }

      // Create user account
      const userCredential = await auth.createUserWithEmailAndPassword(
        validation.sanitized.email,
        validation.sanitized.password
      );

      if (!userCredential.user) {
        return {
          success: false,
          error: "Account creation failed. Please try again.",
        };
      }

      // Update user profile
      await userCredential.user.updateProfile({
        displayName: `${validation.sanitized.firstName} ${validation.sanitized.lastName}`,
      });

      // Email verification removed - users are automatically verified

      return {
        success: true,
        user: userCredential.user,
        requiresEmailVerification: false,
      };
    } catch (error: any) {
      logException(error);

      // Handle specific Firebase errors
      switch (error.code) {
        case "auth/email-already-in-use":
          return {
            success: false,
            error: "An account with this email already exists.",
          };
        case "auth/invalid-email":
          return {
            success: false,
            error: "Invalid email address format.",
          };
        case "auth/weak-password":
          return {
            success: false,
            error: "Password is too weak. Please choose a stronger password.",
          };
        case "auth/operation-not-allowed":
          return {
            success: false,
            error: "Email/password accounts are not enabled.",
          };
        default:
          return {
            success: false,
            error: "Account creation failed. Please try again.",
          };
      }
    }
  }

  /**
   * Enhanced anonymous sign in
   */
  static async signInAnonymously(): Promise<AuthResult> {
    try {
      // Rate limiting for anonymous sign in
      if (
        !SimpleValidationService.checkRateLimit("anonymous_signin", 10, 60000)
      ) {
        return {
          success: false,
          error: "Too many anonymous sign-in attempts. Please try again later.",
        };
      }

      const userCredential = await auth.signInAnonymously();

      if (!userCredential.user) {
        return {
          success: false,
          error: "Anonymous sign in failed. Please try again.",
        };
      }

      return {
        success: true,
        user: userCredential.user,
      };
    } catch (error: any) {
      logException(error);
      return {
        success: false,
        error: "Anonymous sign in failed. Please try again.",
      };
    }
  }

  /**
   * Enhanced password reset
   */
  static async sendPasswordResetEmail(email: string): Promise<AuthResult> {
    try {
      // Rate limiting
      if (
        !SimpleValidationService.checkRateLimit(`reset_${email}`, 3, 300000)
      ) {
        return {
          success: false,
          error: "Too many password reset attempts. Please try again later.",
        };
      }

      // Validate email
      const emailValidation = SimpleValidationService.validateEmail(email);
      if (!emailValidation.isValid) {
        return {
          success: false,
          error: emailValidation.error,
        };
      }

      // Sanitize email
      const sanitizedEmail = SimpleValidationService.sanitizeString(email);

      await auth.sendPasswordResetEmail(sanitizedEmail);

      return {
        success: true,
      };
    } catch (error: any) {
      logException(error);

      switch (error.code) {
        case "auth/user-not-found":
          return {
            success: false,
            error: "No account found with this email address.",
          };
        case "auth/invalid-email":
          return {
            success: false,
            error: "Invalid email address format.",
          };
        default:
          return {
            success: false,
            error: "Password reset failed. Please try again.",
          };
      }
    }
  }

  /**
   * Email verification removed - no longer needed
   */
  static async sendEmailVerification(): Promise<AuthResult> {
    // Email verification has been disabled
    return {
      success: true,
    };
  }

  /**
   * Enhanced sign out
   */
  static async signOut(): Promise<AuthResult> {
    try {
      await auth.signOut();
      return {
        success: true,
      };
    } catch (error: any) {
      logException(error);
      return {
        success: false,
        error: "Sign out failed. Please try again.",
      };
    }
  }

  /**
   * Get current user with validation
   */
  static getCurrentUser(): FirebaseAuthTypes.User | null {
    try {
      return auth.currentUser;
    } catch (error) {
      logException(error);
      return null;
    }
  }

  /**
   * Check if user is authenticated
   */
  static isAuthenticated(): boolean {
    const user = this.getCurrentUser();
    return user !== null && !user.isAnonymous;
  }

  /**
   * Check if user is anonymous
   */
  static isAnonymous(): boolean {
    const user = this.getCurrentUser();
    return user !== null && user.isAnonymous;
  }

  /**
   * Check if email is verified
   */
  static isEmailVerified(): boolean {
    const user = this.getCurrentUser();
    return user !== null && user.emailVerified;
  }

  /**
   * Reload user data
   */
  static async reloadUser(): Promise<AuthResult> {
    try {
      const user = auth.currentUser;
      if (!user) {
        return {
          success: false,
          error: "No user is currently signed in.",
        };
      }

      await user.reload();
      return {
        success: true,
        user: auth.currentUser || undefined,
      };
    } catch (error: any) {
      logException(error);
      return {
        success: false,
        error: "Failed to reload user data.",
      };
    }
  }
}
