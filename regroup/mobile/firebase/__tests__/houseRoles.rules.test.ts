/**
 * Firestore Security Rules Tests — tier inputs clients must not control.
 *
 * The server reads a staff member's tier only from house-roles/{houseId}_{uid}
 * (server-only) plus ownerId / the superAdmin claim (functions
 * util/houseRoles). These rules keep the other inputs out of client hands:
 *  - houseType (picks admission and voting rules) is server-only for every
 *    client, the owner included; createHouses and setOxfordEnabled set it;
 *  - house-roles cannot be read or written by clients;
 *  - admins docs: a client creates only its OWN doc, for one house where the
 *    server recorded it as a manager or owner, with no owner access; updates
 *    keep the user and can only remove houses.
 *
 *   cd firebase && firebase emulators:exec --only firestore --project demo-rules \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/houseRoles.rules.test.ts"
 */
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const H = 'houseA';
let testEnv: RulesTestEnvironment;

const seed = (p: string, data: Record<string, unknown>) =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), p), data);
  });
const db = (uid: string, claims: Record<string, unknown>) =>
  testEnv.authenticatedContext(uid, claims).firestore();
const OWNER = { superAdmin: { [H]: true }, admin: { [H]: true } };
const MANAGER = { admin: { [H]: true } };
const PEER = { admin: { [H]: true }, guest: { [H]: true } };
const RESIDENT = { guest: { [H]: true } };

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-house-roles-rules',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});
afterAll(() => testEnv.cleanup());
beforeEach(() =>
  seed(`houses/${H}`, { id: H, ownerId: 'owner', houseType: 'traditional', currentCapacity: 3 }),
);
afterEach(() => testEnv.clearFirestore());

describe('houseType is server-only', () => {
  it.each([
    ['the owner (superAdmin)', 'owner', OWNER],
    ['a manager', 'manager', MANAGER],
    ['a peer leader', 'pl', PEER],
    ['a resident', 'res', RESIDENT],
  ])('DENIES %s changing houseType', async (_label, uid, claims) => {
    await assertFails(updateDoc(doc(db(uid, claims), `houses/${H}`), { houseType: 'oxford' }));
  });

  it('ALLOWS a whole-house write that leaves houseType as it is (app spread)', async () => {
    const d = db('res', RESIDENT);
    const house = (await getDoc(doc(d, `houses/${H}`))).data()!;
    await assertSucceeds(
      updateDoc(doc(d, `houses/${H}`), { ...house, currentCapacity: house.currentCapacity + 1 }),
    );
  });
});

describe('ownerId is server-only', () => {
  it.each([
    ['a superAdmin co-owner', 'co', OWNER],
    ['a manager', 'manager', MANAGER],
    ['a peer leader', 'pl', PEER],
    ['a resident', 'res', RESIDENT],
  ])('DENIES %s changing ownerId', async (_label, uid, claims) => {
    await assertFails(updateDoc(doc(db(uid, claims), `houses/${H}`), { ownerId: uid }));
  });
});

describe('house-roles records are server-only', () => {
  it('DENIES client reads and writes, even by the owner', async () => {
    await seed(`house-roles/${H}_pl`, { tier: 'peerLeader' });
    await assertFails(getDoc(doc(db('pl', PEER), `house-roles/${H}_pl`)));
    await assertFails(getDoc(doc(db('owner', OWNER), `house-roles/${H}_pl`)));
    await assertFails(setDoc(doc(db('pl', PEER), `house-roles/${H}_pl`), { tier: 'manager' }));
  });
});

describe('admins docs', () => {
  const adminDoc = (userId: string, extra: Record<string, unknown> = {}) => ({
    userId,
    houseIds: [H],
    superAdmin: [],
    ...extra,
  });

  it('DENIES a peer leader creating an admins doc for themselves', async () => {
    await seed(`house-roles/${H}_pl`, { tier: 'peerLeader' });
    await assertFails(setDoc(doc(db('pl', PEER), 'admins/pl'), adminDoc('pl')));
  });

  it('DENIES an admin-claim holder with no role record (before the backfill)', async () => {
    await assertFails(setDoc(doc(db('pl', PEER), 'admins/pl'), adminDoc('pl')));
  });

  it('ALLOWS a manager creating their own doc after the redeem (SignUpForm admin path)', async () => {
    await seed(`house-roles/${H}_mgr`, { tier: 'manager' });
    await assertSucceeds(setDoc(doc(db('mgr', MANAGER), 'admins/a1'), adminDoc('mgr')));
  });

  it('DENIES a doc for someone else, owner access, or several houses', async () => {
    await seed(`house-roles/${H}_mgr`, { tier: 'manager' });
    const d = db('mgr', MANAGER);
    await assertFails(setDoc(doc(d, 'admins/a2'), adminDoc('other')));
    await assertFails(setDoc(doc(d, 'admins/a2'), adminDoc('mgr', { superAdmin: [H] })));
    await assertFails(setDoc(doc(d, 'admins/a2'), adminDoc('mgr', { houseIds: [H, 'houseB'] })));
  });

  it('updates keep the user and can only remove houses', async () => {
    await seed('admins/a1', adminDoc('mgr', { houseIds: [H, 'houseB'], firstName: 'M' }));
    const self = db('mgr', MANAGER);
    await assertSucceeds(updateDoc(doc(self, 'admins/a1'), { firstName: 'Max' }));
    await assertFails(updateDoc(doc(self, 'admins/a1'), { houseIds: [H, 'houseB', 'houseC'] }));
    await assertFails(updateDoc(doc(self, 'admins/a1'), { superAdmin: [H] }));
    await assertFails(updateDoc(doc(self, 'admins/a1'), { userId: 'other' }));
    // House settings removing this admin from a house.
    await assertSucceeds(updateDoc(doc(db('owner', OWNER), 'admins/a1'), { houseIds: ['houseB'] }));
  });
});
