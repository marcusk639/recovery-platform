/**
 * Unit tests for EnhancedAuthService
 *
 * Tests cover:
 * - Happy paths: signIn, createAccount, signOut, resetPassword, anonymous sign-in
 * - Error paths: Firebase error codes surface correctly
 * - Validation: empty/malformed email & password rejected before hitting Firebase
 * - Rate limiting: repeated calls trigger the rate-limit guard
 * - State helpers: getCurrentUser, isAuthenticated, isAnonymous, isEmailVerified
 * - reloadUser: no-user guard and successful reload
 */

// ── Mocks (hoisted before all imports) ──────────────────────────────────────

// Prevent transitive import from util/display pulling in react-native-size-matters
jest.mock('../../util/display', () => ({
  getCurrentTime: jest.fn(() => '12:00:00'),
  getTodaysDate: jest.fn(() => '2024-01-01'),
  getDaysOfWeek: jest.fn(() => []),
  formatDate: jest.fn((d: string) => d),
}));

// firebase-setup is mapped by moduleNameMapper, but we provide an explicit
// mock here so individual tests can override auth methods per-test.
jest.mock('../../../firebase-setup', () => ({
  auth: {
    currentUser: null,
    signInWithEmailAndPassword: jest.fn(),
    createUserWithEmailAndPassword: jest.fn(),
    signOut: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
    signInAnonymously: jest.fn(),
  },
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { EnhancedAuthService } from '../EnhancedAuthService';
import { auth } from '../../../firebase-setup';
import { SimpleValidationService } from '../SimpleValidationService';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal mock Firebase user object */
function makeMockUser(overrides: Record<string, any> = {}) {
  return {
    uid: 'test-uid-123',
    email: 'test@example.com',
    emailVerified: true,
    isAnonymous: false,
    displayName: null,
    updateProfile: jest.fn(() => Promise.resolve()),
    reload: jest.fn(() => Promise.resolve()),
    ...overrides,
  };
}

/** Build a Firebase-style error with a code property */
function makeFirebaseError(code: string, message: string = code): Error {
  const err = new Error(message) as any;
  err.code = code;
  return err;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('EnhancedAuthService', () => {
  // Reset mocks and rate-limit state between tests
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the private rate-limit map so tests are isolated
    // @ts-ignore – accessing private member for test isolation
    SimpleValidationService['rateLimitMap'] = new Map();
    // Default: currentUser is null
    (auth as any).currentUser = null;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // signInWithEmail
  // ─────────────────────────────────────────────────────────────────────────

  describe('signInWithEmail', () => {
    it('returns success when credentials are valid and email is verified', async () => {
      const mockUser = makeMockUser({ emailVerified: true });
      (auth.signInWithEmailAndPassword as jest.Mock).mockResolvedValueOnce({
        user: mockUser,
      });

      const result = await EnhancedAuthService.signInWithEmail(
        'test@example.com',
        'Password1!',
      );

      expect(result.success).toBe(true);
      expect(result.user).toBe(mockUser);
      expect(auth.signInWithEmailAndPassword).toHaveBeenCalledWith(
        'test@example.com',
        'Password1!',
      );
    });

    it('returns failure when email is not verified', async () => {
      const mockUser = makeMockUser({ emailVerified: false });
      (auth.signInWithEmailAndPassword as jest.Mock).mockResolvedValueOnce({
        user: mockUser,
      });

      const result = await EnhancedAuthService.signInWithEmail(
        'test@example.com',
        'Password1!',
      );

      expect(result.success).toBe(false);
      expect(result.requiresEmailVerification).toBe(true);
      expect(result.error).toMatch(/verify your email/i);
    });

    it('returns failure when sign-in returns a null user', async () => {
      (auth.signInWithEmailAndPassword as jest.Mock).mockResolvedValueOnce({
        user: null,
      });

      const result = await EnhancedAuthService.signInWithEmail(
        'test@example.com',
        'Password1!',
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/check your credentials/i);
    });

    it('rejects empty email without calling Firebase', async () => {
      const result = await EnhancedAuthService.signInWithEmail('', 'Password1!');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(auth.signInWithEmailAndPassword).not.toHaveBeenCalled();
    });

    it('rejects malformed email without calling Firebase', async () => {
      const result = await EnhancedAuthService.signInWithEmail(
        'not-an-email',
        'Password1!',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(auth.signInWithEmailAndPassword).not.toHaveBeenCalled();
    });

    it('rejects empty password without calling Firebase', async () => {
      const result = await EnhancedAuthService.signInWithEmail(
        'test@example.com',
        '',
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/password is required/i);
      expect(auth.signInWithEmailAndPassword).not.toHaveBeenCalled();
    });

    it('surfaces auth/user-not-found as a friendly message', async () => {
      (auth.signInWithEmailAndPassword as jest.Mock).mockRejectedValueOnce(
        makeFirebaseError('auth/user-not-found'),
      );

      const result = await EnhancedAuthService.signInWithEmail(
        'nobody@example.com',
        'Password1!',
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/no account found/i);
    });

    it('surfaces auth/wrong-password as a friendly message', async () => {
      (auth.signInWithEmailAndPassword as jest.Mock).mockRejectedValueOnce(
        makeFirebaseError('auth/wrong-password'),
      );

      const result = await EnhancedAuthService.signInWithEmail(
        'test@example.com',
        'WrongPass1!',
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/incorrect password/i);
    });

    it('surfaces auth/user-disabled as a friendly message', async () => {
      (auth.signInWithEmailAndPassword as jest.Mock).mockRejectedValueOnce(
        makeFirebaseError('auth/user-disabled'),
      );

      const result = await EnhancedAuthService.signInWithEmail(
        'disabled@example.com',
        'Password1!',
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/disabled/i);
    });

    it('surfaces auth/too-many-requests as a friendly message', async () => {
      (auth.signInWithEmailAndPassword as jest.Mock).mockRejectedValueOnce(
        makeFirebaseError('auth/too-many-requests'),
      );

      const result = await EnhancedAuthService.signInWithEmail(
        'test@example.com',
        'Password1!',
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/too many failed attempts/i);
    });

    it('returns a generic error for unknown Firebase errors', async () => {
      (auth.signInWithEmailAndPassword as jest.Mock).mockRejectedValueOnce(
        makeFirebaseError('auth/network-request-failed', 'Network error'),
      );

      const result = await EnhancedAuthService.signInWithEmail(
        'test@example.com',
        'Password1!',
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/sign in failed/i);
    });

    it('blocks sign-in after exceeding rate limit', async () => {
      const mockUser = makeMockUser({ emailVerified: true });
      (auth.signInWithEmailAndPassword as jest.Mock).mockResolvedValue({
        user: mockUser,
      });

      // Exhaust the 5-attempt rate limit for this email
      for (let i = 0; i < 5; i++) {
        await EnhancedAuthService.signInWithEmail('ratelimit@example.com', 'Password1!');
      }

      // The 6th call should be blocked by rate limiting
      const blocked = await EnhancedAuthService.signInWithEmail(
        'ratelimit@example.com',
        'Password1!',
      );

      expect(blocked.success).toBe(false);
      expect(blocked.error).toMatch(/too many sign-in attempts/i);
      // Firebase must not be called on the blocked attempt
      expect(auth.signInWithEmailAndPassword).toHaveBeenCalledTimes(5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // signUpWithEmail
  // ─────────────────────────────────────────────────────────────────────────

  describe('signUpWithEmail', () => {
    const validSignUpData = {
      email: 'newuser@example.com',
      password: 'Password1!',
      firstName: 'John',
      lastName: 'Doe',
    };

    it('creates account and returns success on valid data', async () => {
      const mockUser = makeMockUser({ emailVerified: false });
      (auth.createUserWithEmailAndPassword as jest.Mock).mockResolvedValueOnce({
        user: mockUser,
      });

      const result = await EnhancedAuthService.signUpWithEmail(validSignUpData);

      expect(result.success).toBe(true);
      expect(result.user).toBe(mockUser);
      expect(result.requiresEmailVerification).toBe(false);
      expect(auth.createUserWithEmailAndPassword).toHaveBeenCalledWith(
        'newuser@example.com',
        'Password1!',
      );
      expect(mockUser.updateProfile).toHaveBeenCalledWith({
        displayName: 'John Doe',
      });
    });

    it('returns failure when validation rejects a weak password', async () => {
      const result = await EnhancedAuthService.signUpWithEmail({
        ...validSignUpData,
        password: 'weak',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(auth.createUserWithEmailAndPassword).not.toHaveBeenCalled();
    });

    it('returns failure when first name contains invalid characters', async () => {
      const result = await EnhancedAuthService.signUpWithEmail({
        ...validSignUpData,
        firstName: '<script>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(auth.createUserWithEmailAndPassword).not.toHaveBeenCalled();
    });

    it('surfaces auth/email-already-in-use as a friendly message', async () => {
      (auth.createUserWithEmailAndPassword as jest.Mock).mockRejectedValueOnce(
        makeFirebaseError('auth/email-already-in-use'),
      );

      const result = await EnhancedAuthService.signUpWithEmail(validSignUpData);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/already exists/i);
    });

    it('surfaces auth/weak-password as a friendly message', async () => {
      (auth.createUserWithEmailAndPassword as jest.Mock).mockRejectedValueOnce(
        makeFirebaseError('auth/weak-password'),
      );

      // Bypass local validation by using a password that passes local rules
      // but Firebase rejects
      const result = await EnhancedAuthService.signUpWithEmail(validSignUpData);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/too weak/i);
    });

    it('surfaces auth/operation-not-allowed as a friendly message', async () => {
      (auth.createUserWithEmailAndPassword as jest.Mock).mockRejectedValueOnce(
        makeFirebaseError('auth/operation-not-allowed'),
      );

      const result = await EnhancedAuthService.signUpWithEmail(validSignUpData);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not enabled/i);
    });

    it('returns a generic error for unknown Firebase sign-up errors', async () => {
      (auth.createUserWithEmailAndPassword as jest.Mock).mockRejectedValueOnce(
        makeFirebaseError('auth/network-request-failed'),
      );

      const result = await EnhancedAuthService.signUpWithEmail(validSignUpData);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/account creation failed/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // signOut
  // ─────────────────────────────────────────────────────────────────────────

  describe('signOut', () => {
    it('returns success on successful sign-out', async () => {
      (auth.signOut as jest.Mock).mockResolvedValueOnce(undefined);

      const result = await EnhancedAuthService.signOut();

      expect(result.success).toBe(true);
      expect(auth.signOut).toHaveBeenCalledTimes(1);
    });

    it('returns failure when Firebase sign-out throws', async () => {
      (auth.signOut as jest.Mock).mockRejectedValueOnce(new Error('network'));

      const result = await EnhancedAuthService.signOut();

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/sign out failed/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // sendPasswordResetEmail
  // ─────────────────────────────────────────────────────────────────────────

  describe('sendPasswordResetEmail', () => {
    it('sends reset email successfully for a valid address', async () => {
      (auth.sendPasswordResetEmail as jest.Mock).mockResolvedValueOnce(undefined);

      const result = await EnhancedAuthService.sendPasswordResetEmail(
        'user@example.com',
      );

      expect(result.success).toBe(true);
      expect(auth.sendPasswordResetEmail).toHaveBeenCalledWith('user@example.com');
    });

    it('rejects an invalid email without calling Firebase', async () => {
      const result = await EnhancedAuthService.sendPasswordResetEmail('bad-email');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(auth.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('rejects an empty email without calling Firebase', async () => {
      const result = await EnhancedAuthService.sendPasswordResetEmail('');

      expect(result.success).toBe(false);
      expect(auth.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('surfaces auth/user-not-found during password reset', async () => {
      (auth.sendPasswordResetEmail as jest.Mock).mockRejectedValueOnce(
        makeFirebaseError('auth/user-not-found'),
      );

      const result = await EnhancedAuthService.sendPasswordResetEmail(
        'nobody@example.com',
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/no account found/i);
    });

    it('surfaces auth/invalid-email from Firebase during password reset', async () => {
      (auth.sendPasswordResetEmail as jest.Mock).mockRejectedValueOnce(
        makeFirebaseError('auth/invalid-email'),
      );

      const result = await EnhancedAuthService.sendPasswordResetEmail(
        'test@example.com',
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid email/i);
    });

    it('blocks password reset after rate limit is exceeded', async () => {
      (auth.sendPasswordResetEmail as jest.Mock).mockResolvedValue(undefined);

      // Exhaust the 3-attempt limit
      for (let i = 0; i < 3; i++) {
        await EnhancedAuthService.sendPasswordResetEmail('limit@example.com');
      }

      const blocked = await EnhancedAuthService.sendPasswordResetEmail(
        'limit@example.com',
      );

      expect(blocked.success).toBe(false);
      expect(blocked.error).toMatch(/too many password reset attempts/i);
      expect(auth.sendPasswordResetEmail).toHaveBeenCalledTimes(3);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // signInAnonymously
  // ─────────────────────────────────────────────────────────────────────────

  describe('signInAnonymously', () => {
    it('returns success with the anonymous user', async () => {
      const mockUser = makeMockUser({ isAnonymous: true, emailVerified: false });
      (auth.signInAnonymously as jest.Mock).mockResolvedValueOnce({
        user: mockUser,
      });

      const result = await EnhancedAuthService.signInAnonymously();

      expect(result.success).toBe(true);
      expect(result.user).toBe(mockUser);
    });

    it('returns failure when anonymous sign-in returns null user', async () => {
      (auth.signInAnonymously as jest.Mock).mockResolvedValueOnce({ user: null });

      const result = await EnhancedAuthService.signInAnonymously();

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/anonymous sign in failed/i);
    });

    it('returns failure when Firebase throws during anonymous sign-in', async () => {
      (auth.signInAnonymously as jest.Mock).mockRejectedValueOnce(
        new Error('anonymous not enabled'),
      );

      const result = await EnhancedAuthService.signInAnonymously();

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/anonymous sign in failed/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // sendEmailVerification (disabled / no-op)
  // ─────────────────────────────────────────────────────────────────────────

  describe('sendEmailVerification', () => {
    it('always returns success (email verification is disabled)', async () => {
      const result = await EnhancedAuthService.sendEmailVerification();

      expect(result.success).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getCurrentUser / isAuthenticated / isAnonymous / isEmailVerified
  // ─────────────────────────────────────────────────────────────────────────

  describe('getCurrentUser', () => {
    it('returns null when no user is signed in', () => {
      (auth as any).currentUser = null;

      expect(EnhancedAuthService.getCurrentUser()).toBeNull();
    });

    it('returns the current user when one is signed in', () => {
      const mockUser = makeMockUser();
      (auth as any).currentUser = mockUser;

      expect(EnhancedAuthService.getCurrentUser()).toBe(mockUser);
    });
  });

  describe('isAuthenticated', () => {
    it('returns false when no user is signed in', () => {
      (auth as any).currentUser = null;

      expect(EnhancedAuthService.isAuthenticated()).toBe(false);
    });

    it('returns true for a non-anonymous, verified user', () => {
      (auth as any).currentUser = makeMockUser({
        isAnonymous: false,
        emailVerified: true,
      });

      expect(EnhancedAuthService.isAuthenticated()).toBe(true);
    });

    it('returns false for an anonymous user', () => {
      (auth as any).currentUser = makeMockUser({ isAnonymous: true });

      expect(EnhancedAuthService.isAuthenticated()).toBe(false);
    });
  });

  describe('isAnonymous', () => {
    it('returns false when no user is signed in', () => {
      (auth as any).currentUser = null;

      expect(EnhancedAuthService.isAnonymous()).toBe(false);
    });

    it('returns true for an anonymous user', () => {
      (auth as any).currentUser = makeMockUser({ isAnonymous: true });

      expect(EnhancedAuthService.isAnonymous()).toBe(true);
    });

    it('returns false for a non-anonymous user', () => {
      (auth as any).currentUser = makeMockUser({ isAnonymous: false });

      expect(EnhancedAuthService.isAnonymous()).toBe(false);
    });
  });

  describe('isEmailVerified', () => {
    it('returns false when no user is signed in', () => {
      (auth as any).currentUser = null;

      expect(EnhancedAuthService.isEmailVerified()).toBe(false);
    });

    it('returns true for a user whose email is verified', () => {
      (auth as any).currentUser = makeMockUser({ emailVerified: true });

      expect(EnhancedAuthService.isEmailVerified()).toBe(true);
    });

    it('returns false for a user whose email is not verified', () => {
      (auth as any).currentUser = makeMockUser({ emailVerified: false });

      expect(EnhancedAuthService.isEmailVerified()).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // reloadUser
  // ─────────────────────────────────────────────────────────────────────────

  describe('reloadUser', () => {
    it('returns failure when no user is currently signed in', async () => {
      (auth as any).currentUser = null;

      const result = await EnhancedAuthService.reloadUser();

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/no user is currently signed in/i);
    });

    it('reloads the current user and returns success', async () => {
      const mockUser = makeMockUser();
      (auth as any).currentUser = mockUser;

      const result = await EnhancedAuthService.reloadUser();

      expect(result.success).toBe(true);
      expect(mockUser.reload).toHaveBeenCalledTimes(1);
    });

    it('returns failure when user.reload() throws', async () => {
      const mockUser = makeMockUser({
        reload: jest.fn(() => Promise.reject(new Error('network error'))),
      });
      (auth as any).currentUser = mockUser;

      const result = await EnhancedAuthService.reloadUser();

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/failed to reload/i);
    });
  });
});
