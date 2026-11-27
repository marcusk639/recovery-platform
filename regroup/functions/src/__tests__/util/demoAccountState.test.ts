// The demo account's claim and its restore (S5, REV-A8; owner decision
// 2026-11-27): the guards read a server-set claim, and a changed email or
// password is put back.
jest.mock('firebase-admin', () => ({}));
jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  DEMO_ACCOUNT_PASSWORD,
  markDemoAccount,
  restoreDemoAccount,
  type DemoAuth,
} from '../../util/demoAccountState';
import { DEMO_ACCOUNT_EMAIL } from '../../util/demoAccount';

type Record = {
  uid: string;
  email?: string;
  customClaims?: { [k: string]: unknown };
  tokensValidAfterTime?: string;
};

function fakeAuth(initial: Record) {
  const user: Record = { ...initial };
  const calls: string[] = [];
  const auth: DemoAuth = {
    getUser: jest.fn(async (uid: string) => {
      if (uid !== user.uid) throw new Error('auth/user-not-found');
      return { ...user };
    }),
    getUserByEmail: jest.fn(async (email: string) => {
      if (email !== user.email) throw new Error('auth/user-not-found');
      return { ...user };
    }),
    setCustomUserClaims: jest.fn(async (_uid: string, claims: object | null) => {
      calls.push('claims');
      user.customClaims = claims as Record['customClaims'];
    }),
    updateUser: jest.fn(async (_uid: string, props: { email: string }) => {
      calls.push('update');
      user.email = props.email;
      user.tokensValidAfterTime = 'after-restore';
    }),
    revokeRefreshTokens: jest.fn(async () => {
      calls.push('revoke');
    }),
  };
  return { auth, user, calls };
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

const DEMO = { uid: 'demo1', email: DEMO_ACCOUNT_EMAIL, tokensValidAfterTime: 't0' };

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
    const { auth, user } = fakeAuth({ ...DEMO, customClaims: { admin: { h1: true } } });
    const { db, docs } = fakeDb();
    await markDemoAccount(db, auth, { apply: true });
    expect(user.customClaims).toEqual({ admin: { h1: true }, demo: true });
    expect(docs['claims-updates/demo1']).toBeDefined();
    expect(docs['config/demoAccount']).toEqual({ uid: 'demo1', tokensValidAfter: 't0' });
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
    fakeDb({ 'config/demoAccount': { uid: 'demo1', tokensValidAfter: 't0' } });

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

  it('puts back a changed email, resets the password and signs every session out', async () => {
    const { auth, user, calls } = fakeAuth({
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
    expect(auth.updateUser).toHaveBeenCalledWith('demo1', {
      email: DEMO_ACCOUNT_EMAIL,
      password: DEMO_ACCOUNT_PASSWORD,
      emailVerified: true,
    });
    expect(calls).toEqual(['update', 'revoke']);
    expect(user.email).toBe(DEMO_ACCOUNT_EMAIL);
    expect(docs['config/demoAccount']).toEqual({ uid: 'demo1', tokensValidAfter: 'after-restore' });
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

  it('re-adds a missing demo claim, keeping the house claims', async () => {
    const { auth, user } = fakeAuth({ ...DEMO, customClaims: { guest: { h1: true } } });
    const { db } = configured();
    await expect(restoreDemoAccount(db, auth)).resolves.toMatchObject({
      outcome: 'intact',
      claimAdded: true,
    });
    expect(user.customClaims).toEqual({ guest: { h1: true }, demo: true });
  });
});
