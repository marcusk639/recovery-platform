// In-memory Auth and Firestore fakes for the demo-account restore tests
// (util/demoAccountState.test.ts).
import type { DemoAuth, DemoUpdate } from '../../util/demoAccountState';

export type Record = {
  uid: string;
  email?: string;
  phoneNumber?: string;
  providerData?: Array<{ providerId: string }>;
  multiFactor?: { enrolledFactors?: unknown[] };
  customClaims?: { [k: string]: unknown };
  tokensValidAfterTime?: string;
};

export const notFound = () => Object.assign(new Error('gone'), { code: 'auth/user-not-found' });

/** An in-memory Auth holding one account (null once deleted). */
export function fakeAuth(initial: Record | null) {
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
      state.user = {
        uid: props.uid,
        email: props.email,
        tokensValidAfterTime: 'created',
        providerData: [{ providerId: 'password' }],
      };
    }),
    setCustomUserClaims: jest.fn(async (_uid: string, claims: object | null) => {
      calls.push('claims');
      state.user!.customClaims = claims as Record['customClaims'];
    }),
    updateUser: jest.fn(async (_uid: string, props: DemoUpdate) => {
      calls.push('update');
      const u = state.user!;
      if (props.email) u.email = props.email;
      if (props.password) {
        u.tokensValidAfterTime = 'after-restore';
        if (!(u.providerData ?? []).some((p) => p.providerId === 'password')) {
          u.providerData = [...(u.providerData ?? []), { providerId: 'password' }];
        }
      }
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

export function fakeDb(seed: { [path: string]: object } = {}) {
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
