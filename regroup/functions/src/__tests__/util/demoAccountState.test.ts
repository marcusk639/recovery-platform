// The demo account's claim and its restore (S5, REV-A8; owner decision
// 2026-11-27): the guards read a server-set claim, and the restore puts the
// account's sign-in back however it was changed, or recreates it.
jest.mock('firebase-admin', () => ({}));
jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  DEMO_ACCOUNT_PASSWORD,
  markDemoAccount,
  restoreDemoAccount,
  squattedEmail,
  type DemoUpdate,
} from '../../util/demoAccountState';
import { fakeAuth, fakeDb, notFound } from '../helpers/demoAuthFake';
import { DEMO_ACCOUNT_EMAIL } from '../../util/demoAccount';

const DEMO = {
  uid: 'demo1',
  email: DEMO_ACCOUNT_EMAIL,
  tokensValidAfterTime: 't0',
  providerData: [{ providerId: 'password' }],
};
const HOUSE_CLAIMS = { admin: { h1: true }, superAdmin: { h1: true } };
const SIGN_IN = { email: DEMO_ACCOUNT_EMAIL, password: DEMO_ACCOUNT_PASSWORD, emailVerified: true };

describe('markDemoAccount', () => {
  it('dry run writes nothing', async () => {
    const { auth } = fakeAuth({ ...DEMO, customClaims: { guest: { h1: true } } });
    const { db, docs } = fakeDb();
    await expect(markDemoAccount(db, auth, { apply: false })).resolves.toEqual({
      outcome: 'would-mark',
      uid: 'demo1',
      claimAdded: true,
    });
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
    expect(docs).toEqual({});
  });

  it('adds demo: true keeping the existing claims, stamps the refresh marker and records the account', async () => {
    const { auth, state } = fakeAuth({ ...DEMO, customClaims: { admin: { h1: true } } });
    const { db, docs } = fakeDb();
    await markDemoAccount(db, auth, { apply: true });
    expect(state.user!.customClaims).toEqual({ admin: { h1: true }, demo: true });
    expect(docs['claims-updates/demo1']).toBeDefined();
    // No password baseline: the first restore resets the password and takes it.
    expect(docs['config/demoAccount']).toEqual({
      uid: 'demo1',
      tokensValidAfter: null,
      claims: { admin: { h1: true }, demo: true },
    });
  });

  it('a password changed before the mark is reset by the first restore, then left alone', async () => {
    // Its password has been public and unguarded: it may have been changed already.
    const { auth } = fakeAuth({ ...DEMO, tokensValidAfterTime: 'changed-before-mark' });
    const { db } = fakeDb();
    await markDemoAccount(db, auth, { apply: true });
    await expect(restoreDemoAccount(db, auth)).resolves.toMatchObject({
      outcome: 'restored',
      passwordChanged: true,
    });
    expect(auth.updateUser).toHaveBeenCalledWith('demo1', SIGN_IN);
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('demo1');
    await expect(restoreDemoAccount(db, auth)).resolves.toMatchObject({ outcome: 'intact' });
  });

  it('finds an account whose email was already changed by --uid', async () => {
    const { auth } = fakeAuth({ ...DEMO, email: 'attacker@example.com' });
    const { db } = fakeDb();
    await expect(markDemoAccount(db, auth, { apply: false })).resolves.toMatchObject({
      outcome: 'refused',
    });
    await expect(markDemoAccount(db, auth, { uid: 'demo1', apply: true })).resolves.toMatchObject({
      outcome: 'marked',
      uid: 'demo1',
    });
  });

  it('surfaces a lookup failure other than a missing account instead of calling it missing', async () => {
    const { auth } = fakeAuth(DEMO);
    const denied = Object.assign(new Error('no credentials'), { code: 'app/invalid-credential' });
    (auth.getUserByEmail as jest.Mock).mockRejectedValueOnce(denied);
    const { db, docs } = fakeDb();
    await expect(markDemoAccount(db, auth, { apply: true })).rejects.toBe(denied);
    expect(docs).toEqual({});
  });

  it('refuses to re-point an already marked project at another account found by the email', async () => {
    // The documented re-run after the functions deploy: if the demo email has
    // moved to another account by then, the email finds that account.
    const { auth } = fakeAuth({ ...DEMO, uid: 'other1' });
    const seed = { 'config/demoAccount': { uid: 'demo1', tokensValidAfter: 't0', claims: {} } };
    const { db, docs } = fakeDb(seed);
    for (const apply of [false, true]) {
      await expect(markDemoAccount(db, auth, { apply })).resolves.toMatchObject({
        outcome: 'refused',
      });
    }
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
    expect(docs).toEqual(seed);
  });

  it('re-marks the recorded account by the email (the idempotent re-run), or another one by --uid', async () => {
    const seed = { 'config/demoAccount': { uid: 'demo1', tokensValidAfter: 't0', claims: {} } };
    const same = fakeAuth({ ...DEMO, customClaims: { demo: true } });
    await expect(
      markDemoAccount(fakeDb(seed).db, same.auth, { apply: true }),
    ).resolves.toMatchObject({ outcome: 'marked', uid: 'demo1' });
    const other = fakeAuth({ ...DEMO, uid: 'other1' });
    await expect(
      markDemoAccount(fakeDb(seed).db, other.auth, { uid: 'other1', apply: true }),
    ).resolves.toMatchObject({ outcome: 'marked', uid: 'other1' });
  });
});

describe('restoreDemoAccount', () => {
  const configured = () =>
    fakeDb({
      'config/demoAccount': {
        uid: 'demo1',
        tokensValidAfter: 't0',
        claims: { ...HOUSE_CLAIMS, demo: true },
      },
    });

  it('does nothing before the owner has marked the account', async () => {
    const { auth } = fakeAuth(DEMO);
    const { db } = fakeDb();
    await expect(restoreDemoAccount(db, auth)).resolves.toEqual({ outcome: 'not-configured' });
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it('leaves an intact account alone (App Review stays signed in)', async () => {
    const { auth } = fakeAuth({ ...DEMO, customClaims: { demo: true } });
    const { db } = configured();
    await expect(restoreDemoAccount(db, auth)).resolves.toMatchObject({ outcome: 'intact' });
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('is idempotent: a second run after a restore changes nothing', async () => {
    const { auth, calls } = fakeAuth({
      ...DEMO,
      email: 'attacker@example.com',
      phoneNumber: '+15550100',
      customClaims: { demo: true },
    });
    const { db } = configured();
    await expect(restoreDemoAccount(db, auth)).resolves.toMatchObject({ outcome: 'restored' });
    const after = calls.length;
    await expect(restoreDemoAccount(db, auth)).resolves.toMatchObject({
      outcome: 'intact',
      claimAdded: false,
    });
    expect(calls.length).toBe(after);
  });

  it('puts back a changed email, resets the password and signs every session out', async () => {
    const { auth, state, calls } = fakeAuth({
      ...DEMO,
      email: 'attacker@example.com',
      customClaims: { demo: true },
    });
    const { db, docs } = configured();
    await expect(restoreDemoAccount(db, auth)).resolves.toMatchObject({
      outcome: 'restored',
      emailChanged: true,
      passwordChanged: false,
    });
    expect(auth.updateUser).toHaveBeenCalledWith('demo1', SIGN_IN);
    expect(calls).toEqual(['update', 'revoke']);
    expect(state.user!.email).toBe(DEMO_ACCOUNT_EMAIL);
    expect(docs['config/demoAccount']).toMatchObject({
      uid: 'demo1',
      tokensValidAfter: 'after-restore',
    });
  });

  it('resets a changed password (Auth bumps tokensValidAfterTime on every password change)', async () => {
    const { auth } = fakeAuth({
      ...DEMO,
      tokensValidAfterTime: 't1',
      customClaims: { demo: true },
    });
    const { db } = configured();
    await expect(restoreDemoAccount(db, auth)).resolves.toMatchObject({
      outcome: 'restored',
      emailChanged: false,
      passwordChanged: true,
    });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('demo1');
  });

  it('unlinks an added sign-in provider, keeping the password', async () => {
    const { auth, state } = fakeAuth({
      ...DEMO,
      providerData: [
        { providerId: 'password' },
        { providerId: 'google.com' },
        { providerId: 'apple.com' },
      ],
      customClaims: { demo: true },
    });
    const { db } = configured();
    await expect(restoreDemoAccount(db, auth)).resolves.toMatchObject({
      outcome: 'restored',
      providersUnlinked: ['google.com', 'apple.com'],
    });
    expect(auth.updateUser).toHaveBeenCalledWith('demo1', {
      ...SIGN_IN,
      providersToUnlink: ['google.com', 'apple.com'],
    });
    expect(state.user!.providerData).toEqual([{ providerId: 'password' }]);
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('demo1');
  });

  it('puts back an unlinked password provider (App Review signs in with the password)', async () => {
    const { auth, state } = fakeAuth({
      ...DEMO,
      providerData: [{ providerId: 'google.com' }],
      customClaims: { demo: true },
    });
    const { db } = configured();
    await expect(restoreDemoAccount(db, auth)).resolves.toMatchObject({
      outcome: 'restored',
      passwordMissing: true,
      providersUnlinked: ['google.com'],
    });
    expect(auth.updateUser).toHaveBeenCalledWith('demo1', {
      ...SIGN_IN,
      providersToUnlink: ['google.com'],
    });
    expect(state.user!.providerData).toEqual([{ providerId: 'password' }]);
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('demo1');
  });

  it('clears an added phone number (through phoneNumber, not providersToUnlink) and second factors', async () => {
    const { auth, state } = fakeAuth({
      ...DEMO,
      phoneNumber: '+15550100',
      providerData: [{ providerId: 'password' }, { providerId: 'phone' }],
      multiFactor: { enrolledFactors: [{ uid: 'f1' }] },
      customClaims: { demo: true },
    });
    const { db } = configured();
    await expect(restoreDemoAccount(db, auth)).resolves.toMatchObject({
      outcome: 'restored',
      phoneCleared: true,
      mfaCleared: true,
      providersUnlinked: [],
    });
    expect(auth.updateUser).toHaveBeenCalledWith('demo1', {
      ...SIGN_IN,
      phoneNumber: null,
      multiFactor: { enrolledFactors: null },
    });
    expect(state.user!.phoneNumber).toBeUndefined();
  });

  it('frees the demo email from an account that took it, then restores (the restore never sticks)', async () => {
    const { auth, state } = fakeAuth({
      ...DEMO,
      email: 'attacker@example.com',
      customClaims: { demo: true },
    });
    const squatter = { uid: 'squatter1', email: DEMO_ACCOUNT_EMAIL };
    const updates: Array<[string, object]> = [];
    (auth.updateUser as jest.Mock).mockImplementation(async (uid: string, props: DemoUpdate) => {
      updates.push([uid, props]);
      if (uid === 'demo1' && squatter.email === DEMO_ACCOUNT_EMAIL) {
        throw Object.assign(new Error('taken'), { code: 'auth/email-already-exists' });
      }
      if (uid === 'squatter1') squatter.email = props.email!;
      if (uid === 'demo1') state.user!.email = props.email;
    });
    (auth.getUserByEmail as jest.Mock).mockImplementation(async (email: string) => {
      if (email === squatter.email) return { ...squatter };
      throw notFound();
    });
    const { db } = configured();
    await expect(restoreDemoAccount(db, auth)).resolves.toMatchObject({
      outcome: 'restored',
      squatterUid: 'squatter1',
    });
    expect(updates[1]).toEqual([
      'squatter1',
      { email: squattedEmail('squatter1'), disabled: true },
    ]);
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('squatter1');
    expect(state.user!.email).toBe(DEMO_ACCOUNT_EMAIL);
  });

  it('recreates a deleted demo account at the same uid with its claims', async () => {
    const { auth, state, calls } = fakeAuth(null);
    const { db, docs } = configured();
    await expect(restoreDemoAccount(db, auth)).resolves.toEqual({
      outcome: 'recreated',
      uid: 'demo1',
    });
    expect(auth.createUser).toHaveBeenCalledWith({ uid: 'demo1', ...SIGN_IN });
    expect(state.user).toMatchObject({
      uid: 'demo1',
      email: DEMO_ACCOUNT_EMAIL,
      customClaims: { ...HOUSE_CLAIMS, demo: true },
    });
    expect(calls).toEqual(['create', 'claims']);
    expect(docs['claims-updates/demo1']).toBeDefined();
    expect(docs['config/demoAccount']).toMatchObject({ uid: 'demo1', tokensValidAfter: 'created' });
    // The next run finds it intact.
    await expect(restoreDemoAccount(db, auth)).resolves.toMatchObject({ outcome: 'intact' });
  });

  it('recreates with only the demo claim when none were recorded', async () => {
    const { auth, state } = fakeAuth(null);
    const { db } = fakeDb({ 'config/demoAccount': { uid: 'demo1', tokensValidAfter: 't0' } });
    await restoreDemoAccount(db, auth);
    expect(state.user!.customClaims).toEqual({ demo: true });
  });

  it('rethrows any other Auth error', async () => {
    const { auth } = fakeAuth({
      ...DEMO,
      email: 'attacker@example.com',
      customClaims: { demo: true },
    });
    (auth.updateUser as jest.Mock).mockRejectedValue(
      Object.assign(new Error('quota'), { code: 'auth/quota-exceeded' }),
    );
    const { db } = configured();
    await expect(restoreDemoAccount(db, auth)).rejects.toThrow('quota');
  });

  it('re-adds a missing demo claim, keeping the house claims', async () => {
    const { auth, state } = fakeAuth({ ...DEMO, customClaims: { guest: { h1: true } } });
    const { db } = configured();
    await expect(restoreDemoAccount(db, auth)).resolves.toMatchObject({
      outcome: 'intact',
      claimAdded: true,
    });
    expect(state.user!.customClaims).toEqual({ guest: { h1: true }, demo: true });
  });
});
