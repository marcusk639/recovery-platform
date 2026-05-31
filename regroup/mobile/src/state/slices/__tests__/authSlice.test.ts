/**
 * Auth Slice Tests
 *
 * Tests for Redux Toolkit authentication state management
 */

import authReducer, {
  loginStart,
  loginSuccess,
  loginFailure,
  logoutStart,
  logoutSuccess,
  updateUser,
  setInvitation,
  setToken,
  clearAuthError,
} from '../authSlice';
import { User } from '../../../entities/User';

describe('authSlice', () => {
  const initialState = {
    loggedIn: false,
    user: null,
    anonymous: false,
    invitation: null,
    token: null,
    loggingIn: false,
    loggingOut: false,
    loginFailed: false,
    error: null,
  };

  const mockUser: User = {
    uid: 'user123',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
  } as User;

  const mockToken = { claims: { admin: true } };

  describe('Login Actions', () => {
    it('should handle login start', () => {
      const state = authReducer(initialState, loginStart());
      expect(state.loggingIn).toBe(true);
      expect(state.loginFailed).toBe(false);
      expect(state.error).toBe(null);
    });

    it('should handle login success', () => {
      const state = authReducer(
        initialState,
        loginSuccess({ user: mockUser, token: mockToken }),
      );
      expect(state.loggedIn).toBe(true);
      expect(state.user).toEqual(mockUser);
      expect(state.token).toEqual(mockToken);
      expect(state.loggingIn).toBe(false);
      expect(state.loginFailed).toBe(false);
      expect(state.anonymous).toBe(false);
    });

    it('should handle anonymous login success', () => {
      const state = authReducer(
        initialState,
        loginSuccess({ user: mockUser, token: mockToken, anonymous: true }),
      );
      expect(state.loggedIn).toBe(true);
      expect(state.anonymous).toBe(true);
    });

    it('should handle login failure', () => {
      const error = { message: 'Invalid credentials' };
      const state = authReducer(initialState, loginFailure(error));
      expect(state.loggedIn).toBe(false);
      expect(state.loggingIn).toBe(false);
      expect(state.loginFailed).toBe(true);
      expect(state.error).toEqual(error);
    });

    it('should clear error when starting new login', () => {
      const stateWithError = {
        ...initialState,
        error: { message: 'Previous error' },
        loginFailed: true,
      };
      const state = authReducer(stateWithError, loginStart());
      expect(state.error).toBe(null);
      expect(state.loginFailed).toBe(false);
    });
  });

  describe('Logout Actions', () => {
    it('should handle logout start', () => {
      const state = authReducer(initialState, logoutStart());
      expect(state.loggingOut).toBe(true);
    });

    it('should handle logout success', () => {
      const loggedInState = {
        ...initialState,
        loggedIn: true,
        user: mockUser,
        token: mockToken,
        invitation: { id: 'invite123' } as any,
      };
      const state = authReducer(loggedInState, logoutSuccess());
      expect(state.loggedIn).toBe(false);
      expect(state.user).toBe(null);
      expect(state.token).toBe(null);
      expect(state.anonymous).toBe(false);
      expect(state.invitation).toBe(null);
      expect(state.loggingOut).toBe(false);
      expect(state.error).toBe(null);
    });
  });

  describe('User Update Actions', () => {
    it('should update user fields', () => {
      const stateWithUser = {
        ...initialState,
        loggedIn: true,
        user: mockUser,
      };
      const updates = { firstName: 'Updated', lastName: 'Name' };
      const state = authReducer(stateWithUser, updateUser(updates));
      expect(state.user?.firstName).toBe('Updated');
      expect(state.user?.lastName).toBe('Name');
      expect(state.user?.uid).toBe('user123'); // Unchanged fields preserved
    });

    it('should not update if user is null', () => {
      const state = authReducer(
        initialState,
        updateUser({ firstName: 'Updated' }),
      );
      expect(state.user).toBe(null);
    });
  });

  describe('Invitation Actions', () => {
    it('should set invitation', () => {
      const invitation = { id: 'invite123', houseId: 'house456' } as any;
      const state = authReducer(initialState, setInvitation(invitation));
      expect(state.invitation).toEqual(invitation);
    });

    it('should clear invitation', () => {
      const stateWithInvitation = {
        ...initialState,
        invitation: { id: 'invite123' } as any,
      };
      const state = authReducer(stateWithInvitation, setInvitation(null));
      expect(state.invitation).toBe(null);
    });
  });

  describe('Token Actions', () => {
    it('should set token', () => {
      const state = authReducer(initialState, setToken(mockToken));
      expect(state.token).toEqual(mockToken);
    });
  });

  describe('Error Handling', () => {
    it('should clear auth error', () => {
      const stateWithError = {
        ...initialState,
        error: { message: 'Error' },
        loginFailed: true,
      };
      const state = authReducer(stateWithError, clearAuthError());
      expect(state.error).toBe(null);
      expect(state.loginFailed).toBe(false);
    });
  });

  describe('Initial State', () => {
    it('should return initial state', () => {
      const state = authReducer(undefined, { type: 'unknown' });
      expect(state).toEqual(initialState);
    });
  });

  describe('State Immutability', () => {
    it('should not mutate the original state', () => {
      const state = authReducer(initialState, loginStart());
      expect(state).not.toBe(initialState);
      expect(initialState.loggingIn).toBe(false);
    });
  });
});
