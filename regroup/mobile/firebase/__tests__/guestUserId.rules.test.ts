/**
 * Firestore Security Rules Tests — guests.userId is immutable once set.
 *
 * userId says whose record a guest doc is; activities, disputes (#141) and
 * claim cleanup trust it. An admin, a senior peer included, could rewrite it,
 * even on their own doc. Now no client may change a non-empty userId; an
 * admin may set it only on a doc that has none (linking an intake record),
 * and never to their own uid. Self-update still pins it.
 *
 *   cd firebase && firebase emulators:exec --only firestore --project demo-rules \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/guestUserId.rules.test.ts"
 */
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteField, doc, setDoc, updateDoc } from 'firebase/firestore';
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
const MANAGER = { admin: { [H]: true } };
const PEER = { admin: { [H]: true }, guest: { [H]: true } };
const RESIDENT = { guest: { [H]: true } };

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-guest-userid-rules',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});
afterAll(() => testEnv.cleanup());
beforeEach(async () => {
  await seed('guests/res', { houseId: H, userId: 'resident', status: 'active', firstName: 'R' });
  await seed('guests/peer-doc', { houseId: H, userId: 'peer', status: 'active' });
  await seed('guests/intake', { houseId: H, userId: '', firstName: 'I', status: 'active' });
  await seed('guests/intake-absent', { houseId: H, firstName: 'J', status: 'active' });
});
afterEach(() => testEnv.clearFirestore());

describe('guests.userId', () => {
  it('DENIES an admin changing a non-empty userId', async () => {
    await assertFails(updateDoc(doc(db('mgr', MANAGER), 'guests/res'), { userId: 'someone-else' }));
  });

  it('DENIES an admin clearing a non-empty userId', async () => {
    await assertFails(updateDoc(doc(db('mgr', MANAGER), 'guests/res'), { userId: '' }));
    await assertFails(updateDoc(doc(db('mgr', MANAGER), 'guests/res'), { userId: deleteField() }));
  });

  it("DENIES a senior peer changing their own doc's userId", async () => {
    await assertFails(
      updateDoc(doc(db('peer', PEER), 'guests/peer-doc'), { userId: 'someone-else' }),
    );
  });

  it('ALLOWS an admin linking an empty or absent intake doc to another account', async () => {
    await assertSucceeds(
      updateDoc(doc(db('mgr', MANAGER), 'guests/intake'), { userId: 'new-resident' }),
    );
    await assertSucceeds(
      updateDoc(doc(db('mgr', MANAGER), 'guests/intake-absent'), { userId: 'new-resident-2' }),
    );
  });

  it('DENIES an admin linking an intake doc to themselves', async () => {
    await assertFails(updateDoc(doc(db('mgr', MANAGER), 'guests/intake'), { userId: 'mgr' }));
    await assertFails(updateDoc(doc(db('peer', PEER), 'guests/intake'), { userId: 'peer' }));
  });

  it('DENIES a resident self-update of userId', async () => {
    await assertFails(updateDoc(doc(db('resident', RESIDENT), 'guests/res'), { userId: 'other' }));
  });

  it('ALLOWS the app writes that re-send the same userId (admin full-doc save, NewAccountForm self-update)', async () => {
    await assertSucceeds(
      updateDoc(doc(db('mgr', MANAGER), 'guests/res'), { userId: 'resident', status: 'inactive' }),
    );
    await assertSucceeds(
      updateDoc(doc(db('resident', RESIDENT), 'guests/res'), {
        userId: 'resident',
        firstName: 'Rae',
      }),
    );
  });
});

describe('staff create never self-links (no eviction-proof record of their own)', () => {
  it('DENIES a peer leader creating a doc for themselves through the staff branch', async () => {
    await assertFails(
      setDoc(doc(db('peer', PEER), 'guests/plself'), {
        houseId: H,
        userId: 'peer',
        status: 'active',
      }),
    );
    await assertFails(
      setDoc(doc(db('peer', PEER), 'guests/plself2'), {
        houseId: H,
        userId: 'peer',
        createdBy: 'peer',
        status: 'active',
      }),
    );
  });

  it('DENIES a manager creating a doc linked to themselves', async () => {
    await assertFails(
      setDoc(doc(db('mgr', MANAGER), 'guests/mself'), {
        houseId: H,
        userId: 'mgr',
        status: 'active',
      }),
    );
  });

  it('ALLOWS staff creating a doc for someone else, or an intake doc with no account', async () => {
    await assertSucceeds(
      setDoc(doc(db('mgr', MANAGER), 'guests/other'), {
        houseId: H,
        userId: 'newbie',
        status: 'active',
      }),
    );
    await assertSucceeds(
      setDoc(doc(db('peer', PEER), 'guests/intake2'), {
        houseId: H,
        firstName: 'K',
        status: 'active',
      }),
    );
  });
});

describe('moving a guest doc to another house', () => {
  it('needs an admin of both houses (confirmed, unchanged)', async () => {
    await assertFails(updateDoc(doc(db('mgr', MANAGER), 'guests/res'), { houseId: 'houseB' }));
    const both = { admin: { [H]: true, houseB: true } };
    await assertSucceeds(updateDoc(doc(db('op', both), 'guests/res'), { houseId: 'houseB' }));
  });

  it('a resident cannot move their own doc', async () => {
    await assertFails(
      updateDoc(doc(db('resident', RESIDENT), 'guests/res'), { houseId: 'houseB' }),
    );
  });
});
