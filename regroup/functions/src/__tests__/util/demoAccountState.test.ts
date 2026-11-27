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
  type DemoAuth,
  type DemoUpdate,
} from '../../util/demoAccountState';
import { DEMO_ACCOUNT_EMAIL } from '../../util/demoAccount';

type Record = {
  uid: string;
  email?: string;
  phoneNumber?: string;
  providerData?: Array<{ providerId: string }>;
  multiFactor?: { enrolledFactors?: unknown[] };
  customClaims?: { [k: string]: unknown };
  tokensValidAfterTime?: string;
};

const notFound = () => Object.assign(new Error('gone'), { code: 'auth/user-not-found' });

/** An in-memory Auth holding one account (null once deleted). */
function fakeAuth(initial: Record | null) {
  const state: { user: Record | null } = { user: initial ? { ...initial } : null };
  const calls: string[] = [];
  const auth: DemoAuth = {
    getUser: jest.fn(async (uid: string) => {
      if (!state.user || uid !== state.user.uid) throw notFound();
      return { ...state.user };
    }),
    getUserByEmail: jest.fn(async (email: string) => {
      if (!state.user || email !== state.user.email) throw notFound();
      return { ...state.user };
    }),
    createUser: jest.fn(async (props: { uid: string; email: string }) => {
      calls.push('create');
      state.user = { uid: props.uid, email: props.email, tokensValidAfterTime: 'created' };
    }),
    setCustomUserClaims: jest.fn(async (_uid: string, claims: object | null) => {
      calls.push('claims');
      state.user!.customClaims = claims as Record['customClaims'];
    }),
    updateUser: jest.fn(async (_uid: string, props: DemoUpdate) => {
      calls.push('update');
      const u = state.user!;
      if (props.email) u.email = props.email;
      if (props.password) u.tokensValidAfterTime = 'after-restore';
      if (props.phoneNumber === null) delete u.phoneNumber;
      if (props.multiFactor) u.multiFactor = { enrolledFactors: [] };
      if (props.providersToUnlink) {
        u.providerData = (u.providerData ?? []).filter(
          (p) => !props.providersToUnlink!.includes(p.providerId),
        );
      }
    }),
    revokeRefreshTokens: jest.fn(async () => {
      calls.push('revoke');
    }),
  };
  return { auth, state, calls };
}

function fakeDb(seed: { [path: string]: object } = {}) {
  const docs: { [path: string]: object } = { ...seed };
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => ({ data: () => docs[`${name}/${id}`] }),
        set: async (data: object) => {
          docs[`${name}/${id}`] = data;
        },
      }),
    }),
  } as unknown as FirebaseFirestore.Firestore;
  return { db, docs };
}

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
    expect(docs['config/demoAccount']).toEqual({
      uid: 'demo1',
      tokensValidAfter: 't0',
      claims: { admin: { h1: true }, demo: true },
    });
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
