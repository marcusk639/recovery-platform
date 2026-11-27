/**
 * A signed-in user holding an invitation (launch P5 Task 3, fix rounds 1-2):
 * "Accept as this account" checks the account can take the role (before any
 * redeem, so no invitation or slot is spent), redeems the token, refreshes the
 * ID token so the new house claims apply, writes the membership records the
 * sign-up form writes (invitationMembership), reloads the user, clears the
 * invitation and resets to the user's start route. "Continue to the app"
 * clears it and resets. Runs against the real user slice and autoLogin thunk;
 * the callables, the users service and navigation are the seams.
 */
jest.mock('../../invitations', () => ({ redeemInvitation: jest.fn(), peekInvitation: jest.fn() }));
jest.mock('../../users', () => ({
  getAuthUser: jest.fn(),
  getUserFinishingSetup: jest.fn(),
  getUser: jest.fn(),
  createAnonUser: jest.fn(),
  convertFirebaseUserToRatsUser: jest.fn(),
}));
jest.mock('../../../navigation/improved-navigation-service', () => ({
  __esModule: true,
  default: { resetToStartRoute: jest.fn(), navigateToInvitation: jest.fn() },
}));

import { configureStore } from '@reduxjs/toolkit';
import { getAuth } from '@react-native-firebase/auth';
import userReducer, { initializeInvitation } from '../../../state/slices/userSlice';
import { peekInvitation, redeemInvitation } from '../../invitations';
import * as users from '../../users';
import navigationService from '../../../navigation/improved-navigation-service';
import { invitationFromAppLink } from '../invitationFromAppLink';
import { resetInvitationMembershipRetryState } from '../../invitationMembership';
import {
  acceptInvitationAsCurrentUser,
  acceptRefusal,
  invitationErrorMessage,
  leaveInvitation,
} from '../signedInInvitation';

const redeem = redeemInvitation as jest.Mock;
const peek = peekInvitation as jest.Mock;
const getAuthUser = users.getAuthUser as jest.Mock;
const getUser = users.getUser as jest.Mock;
const getUserFinishingSetup = users.getUserFinishingSetup as jest.Mock;
const resetToStartRoute = navigationService.resetToStartRoute as jest.Mock;
const auth = getAuth() as unknown as { currentUser: unknown };

const roleless = { uid: 'u-1', email: 'g@rats-e2e.com', firstName: 'Gia', isAnonymous: false };
const resident = { ...roleless, isGuest: true, houseId: 'h1', guestId: 'guest-1' };
const manager = { ...roleless, isAdmin: true, adminId: 'admin-1' };

/** A token invitation as SignUp leaves it after peekInvitation hydrated it. */
const hydrated = (type: string, houseId = 'h1') => ({
  ...invitationFromAppLink({ kind: 'invitation', token: 'tok-1' }),
  email: 'g@rats-e2e.com',
  type: type as any,
  houseId,
});

const writers = () => ({
  createGuest: jest.fn(() => Promise.resolve()),
  createAdmin: jest.fn(() => Promise.resolve()),
  updateUser: jest.fn(() => Promise.resolve()),
});

const setup = (user: Record<string, unknown>, invitation: any) => {
  const store = configureStore({ reducer: { user: userReducer } });
  store.dispatch({ type: 'user/autoLogin/fulfilled', payload: { user, token: {} } });
  store.dispatch(initializeInvitation(invitation));
  const w = writers();
  getUser.mockResolvedValue(user);
  const accept = () =>
    acceptInvitationAsCurrentUser(store.getState().user.invitation!, {
      dispatch: store.dispatch,
      user,
      writers: w,
      claimsDelayMs: 0,
    });
  return { store, w, accept };
};

const httpsError = (code: string, message: string) =>
  Object.assign(new Error(`[functions/${code}] ${message}`), { code: `functions/${code}` });

beforeEach(() => {
  jest.clearAllMocks();
  resetInvitationMembershipRetryState();
  auth.currentUser = { uid: 'u-1', isAnonymous: false };
  getAuthUser.mockResolvedValue({ claims: {} });
  redeem.mockResolvedValue({ houseId: 'h1', role: 'guest' });
  getUserFinishingSetup.mockImplementation(async () => ({
    user: { ...roleless, reloaded: true },
    setupRecoveryFailed: false,
  }));
});
afterEach(() => {
  auth.currentUser = null;
});

describe('acceptInvitationAsCurrentUser — supported cases', () => {
  it('a role-less account accepting a guest invitation becomes a resident of the house', async () => {
    const { store, w, accept } = setup(roleless, hydrated('guest'));
    expect(await accept()).toEqual({ ok: true });
    expect(redeem).toHaveBeenCalledWith('tok-1');
    expect(getAuthUser).toHaveBeenCalledWith(true);
    expect(w.createGuest).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-1', houseId: 'h1', isAdmin: false }),
    );
    expect(w.updateUser).toHaveBeenCalledWith(
      roleless,
      expect.objectContaining({ isGuest: true, houseId: 'h1' }),
    );
    expect((w.updateUser.mock.calls[0] as unknown[])[1]).not.toHaveProperty('isAdmin');
    expect(store.getState().user.invitation).toBeNull();
    expect(resetToStartRoute).toHaveBeenCalledWith(expect.objectContaining({ reloaded: true }));
  });

  it('a role-less account accepting a senior-peer invitation gets a peer-leader resident record', async () => {
    const { w, accept } = setup(roleless, hydrated('senior-peer'));
    expect(await accept()).toEqual({ ok: true });
    expect(w.createGuest).toHaveBeenCalledWith(expect.objectContaining({ isAdmin: true }));
    // Sign-up writes the user's isAdmin before createUser; the accept path must too.
    expect(w.updateUser).toHaveBeenCalledWith(
      roleless,
      expect.objectContaining({ isGuest: true, houseId: 'h1', isAdmin: true }),
    );
  });

  it('a role-less account accepting an admin invitation gets an admins record', async () => {
    const { w, accept } = setup(roleless, hydrated('admin'));
    expect(await accept()).toEqual({ ok: true });
    expect(w.createAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-1', houseIds: ['h1'] }),
    );
    expect(w.updateUser).toHaveBeenCalledWith(roleless, expect.objectContaining({ isAdmin: true }));
    expect(w.createGuest).not.toHaveBeenCalled();
  });

  it('a resident accepting an admin invitation keeps the resident record and gets an admins record', async () => {
    const { w, accept } = setup(resident, hydrated('admin'));
    expect(await accept()).toEqual({ ok: true });
    expect(w.createAdmin).toHaveBeenCalledWith(expect.objectContaining({ houseIds: ['h1'] }));
    expect(w.createGuest).not.toHaveBeenCalled();
  });

  it('writes the records after the token refresh, so the new claims apply to them', async () => {
    const order: string[] = [];
    getAuthUser.mockImplementation(async () => {
      order.push('token');
      return {};
    });
    const { w, accept } = setup(roleless, hydrated('admin'));
    w.createAdmin.mockImplementation(async () => {
      order.push('admin');
    });
    await accept();
    expect(order.indexOf('token')).toBeLessThan(order.indexOf('admin'));
  });

  it('reads the role and house with peekInvitation when the invitation is not hydrated yet', async () => {
    peek.mockResolvedValue({ houseId: 'h2', role: 'admin', invitedEmail: 'g@rats-e2e.com' });
    const { w, accept } = setup(
      roleless,
      invitationFromAppLink({ kind: 'invitation', token: 'tok-1' }),
    );
    expect(await accept()).toEqual({ ok: true });
    expect(peek).toHaveBeenCalledWith('tok-1');
    expect(w.createAdmin).toHaveBeenCalledWith(expect.objectContaining({ houseIds: ['h2'] }));
  });
});

describe('acceptInvitationAsCurrentUser — refused before any redeem', () => {
  it('refuses an admin invitation for an account that already has an admins record', async () => {
    const { store, w, accept } = setup(manager, hydrated('admin', 'h2'));
    const result = await accept();
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(/already a manager/i);
    expect(redeem).not.toHaveBeenCalled();
    expect(w.createAdmin).not.toHaveBeenCalled();
    expect(store.getState().user.invitation).not.toBeNull();
  });

  it.each(['guest', 'senior-peer'])(
    'refuses a %s invitation for a resident of a different house',
    async (role) => {
      const { w, accept } = setup(resident, hydrated(role, 'h2'));
      const result = await accept();
      expect(result.ok === false && result.message).toMatch(/resident of another house/i);
      expect(redeem).not.toHaveBeenCalled();
      expect(w.createGuest).not.toHaveBeenCalled();
    },
  );

  it('shows a peekInvitation refusal without redeeming', async () => {
    peek.mockRejectedValue(httpsError('failed-precondition', 'Invitation already redeemed'));
    const { accept } = setup(
      roleless,
      invitationFromAppLink({ kind: 'invitation', token: 'tok-1' }),
    );
    const result = await accept();
    expect(result.ok === false && result.message).toMatch(/already been used/);
    expect(redeem).not.toHaveBeenCalled();
  });
});

describe('acceptInvitationAsCurrentUser — fresh user read', () => {
  it('refuses on a role gained on another device (fresh doc, not the Redux user)', async () => {
    const { w, accept } = setup(roleless, hydrated('admin', 'h2'));
    getUser.mockResolvedValue(manager);
    const result = await accept();
    expect(getUser).toHaveBeenCalledWith('u-1');
    expect(result.ok === false && result.message).toMatch(/already a manager/i);
    expect(redeem).not.toHaveBeenCalled();
    expect(w.createAdmin).not.toHaveBeenCalled();
  });

  it('builds the membership from the fresh user doc', async () => {
    const { w, accept } = setup(roleless, hydrated('guest'));
    getUser.mockResolvedValue({ ...roleless, firstName: 'Fresh' });
    expect(await accept()).toEqual({ ok: true });
    expect(w.createGuest).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Fresh' }));
  });

  it.each([
    ['a missing user doc', null],
    ['a doc with no uid', { email: 'g@rats-e2e.com' }],
  ])('does not redeem when the fresh read returns %s', async (_n, doc) => {
    const { w, accept } = setup(roleless, hydrated('guest'));
    getUser.mockResolvedValue(doc);
    const result = await accept();
    expect(result.ok === false && result.message).toMatch(/couldn't accept/i);
    expect(redeem).not.toHaveBeenCalled();
    expect(w.createGuest).not.toHaveBeenCalled();
  });

  it('does not redeem when the fresh read fails', async () => {
    const { w, accept } = setup(roleless, hydrated('guest'));
    getUser.mockRejectedValue(new Error('offline'));
    const result = await accept();
    expect(result.ok).toBe(false);
    expect(redeem).not.toHaveBeenCalled();
    expect(w.createGuest).not.toHaveBeenCalled();
  });
});

describe('acceptRefusal', () => {
  it('allows the supported cases', () => {
    expect(acceptRefusal(roleless, { type: 'guest', houseId: 'h1' })).toBeNull();
    expect(acceptRefusal(roleless, { type: 'admin', houseId: 'h1' })).toBeNull();
    expect(acceptRefusal(resident, { type: 'admin', houseId: 'h1' })).toBeNull();
    // Same house: the server decides (it refuses a second resident record).
    expect(acceptRefusal(resident, { type: 'guest', houseId: 'h1' })).toBeNull();
  });

  it('refuses a role it does not handle', () => {
    expect(acceptRefusal(roleless, { type: 'supporter', houseId: 'h1' })).toMatch(
      /can't be accepted/i,
    );
  });
});

describe('acceptInvitationAsCurrentUser — failures', () => {
  it.each([
    [
      'permission-denied',
      'Invitation was issued to a different email address',
      /different email address/,
    ],
    ['failed-precondition', 'Invitation already redeemed', /already been used/],
    ['failed-precondition', 'Invitation has expired', /expired/],
    ['not-found', 'Invitation not found', /no longer valid/],
  ])(
    'shows a clear message for a %s refusal and keeps the invitation',
    async (code, msg, shown) => {
      redeem.mockRejectedValue(httpsError(code, msg));
      const { store, w, accept } = setup(roleless, hydrated('guest'));
      const result = await accept();
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.message).toMatch(shown);
      expect(store.getState().user.invitation).not.toBeNull();
      expect(getAuthUser).not.toHaveBeenCalled();
      expect(w.createGuest).not.toHaveBeenCalled();
      expect(resetToStartRoute).not.toHaveBeenCalled();
    },
  );

  it('keeps the invitation and asks for a retry when the records could not be written', async () => {
    const { store, w, accept } = setup(roleless, hydrated('admin'));
    w.createAdmin.mockRejectedValueOnce(new Error('permission denied'));
    const result = await accept();
    expect(result.ok === false && result.message).toMatch(/tap accept again/i);
    expect(store.getState().user.invitation).not.toBeNull();
    expect(resetToStartRoute).not.toHaveBeenCalled();
  });

  it('a retry after a partial write reuses the record already created (no second admins record)', async () => {
    const { store, w, accept } = setup(roleless, hydrated('admin'));
    w.updateUser.mockRejectedValueOnce(new Error('offline'));
    const first = await accept();
    expect(first.ok).toBe(false);
    expect(w.createAdmin).toHaveBeenCalledTimes(1);
    const created = (w.createAdmin.mock.calls[0] as unknown[])[0] as { id: string };

    expect(await accept()).toEqual({ ok: true });
    expect(w.createAdmin).toHaveBeenCalledTimes(1);
    // The user doc points at the record that was actually created.
    expect(w.updateUser).toHaveBeenLastCalledWith(
      roleless,
      expect.objectContaining({ isAdmin: true, adminId: created.id }),
    );
    expect(store.getState().user.invitation).toBeNull();
  });

  it('tells the user what to do if the setup keeps failing, not that a retry is always safe', async () => {
    const { w, accept } = setup(roleless, hydrated('guest'));
    w.updateUser.mockRejectedValueOnce(new Error('offline'));
    const result = await accept();
    expect(result.ok === false && result.message).toMatch(/house admin/i);
  });

  it('still leaves the invitation when the records were written but the reload failed', async () => {
    getUserFinishingSetup.mockRejectedValue(new Error('offline'));
    const { store, accept } = setup(roleless, hydrated('guest'));
    expect(await accept()).toEqual({ ok: true });
    expect(store.getState().user.invitation).toBeNull();
    expect(resetToStartRoute).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u-1' }));
  });
});

describe('acceptInvitationAsCurrentUser — reload failed after the records were written', () => {
  // The start route must follow the new membership, not the pre-accept user.
  it('resets with the user plus the membership just written', async () => {
    getUserFinishingSetup.mockRejectedValue(new Error('offline'));
    const { w, accept } = setup(roleless, hydrated('guest'));
    expect(await accept()).toEqual({ ok: true });
    const created = (w.createGuest.mock.calls[0] as unknown[])[0] as { id: string };
    expect(resetToStartRoute).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'u-1', isGuest: true, houseId: 'h1', guestId: created.id }),
    );
  });
});

describe('leaveInvitation ("Continue to the app")', () => {
  it('clears the invitation and resets to the start route without redeeming', () => {
    const { store } = setup(roleless, hydrated('guest'));
    leaveInvitation(store.dispatch, roleless);
    expect(store.getState().user.invitation).toBeNull();
    expect(resetToStartRoute).toHaveBeenCalledWith(roleless);
    expect(redeem).not.toHaveBeenCalled();
  });
});

describe('invitationErrorMessage', () => {
  it('falls back to a generic message for an unknown error', () => {
    expect(invitationErrorMessage(new Error('boom'))).toMatch(/couldn't accept/i);
    expect(invitationErrorMessage(undefined)).toMatch(/couldn't accept/i);
  });

  it('shows another failed-precondition reason from the server', () => {
    expect(
      invitationErrorMessage(
        httpsError('failed-precondition', 'You already have a resident record in this house'),
      ),
    ).toBe('You already have a resident record in this house');
  });

  it('reads a code without the functions/ prefix', () => {
    expect(invitationErrorMessage({ code: 'permission-denied', message: 'x' })).toMatch(
      /different email address/,
    );
  });
});
