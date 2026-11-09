/**
 * Firestore Security Rules Tests: staffNotes/{noteId} (issue #196)
 *
 * The collection had no rule, so every read and write was refused, and the
 * Staff Notes and Shift Log screens showed "no notes" while saving nothing.
 * services/staffNotes.ts adds, pins and deletes notes, and lists them by
 * houseId + type (+ guestId for a resident's notes).
 *
 * Needs a Firestore emulator. FIRESTORE_EMULATOR_HOST, which
 * `firebase emulators:exec` sets, overrides the default 127.0.0.1:8080:
 *
 *   cd firebase && firebase emulators:exec --only firestore --project demo-test \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/staffNotes.rules.test.ts"
 */

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ID = 'demo-staff-notes-rules-test';
const [FIRESTORE_HOST, FIRESTORE_PORT] = (
  process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'
).split(':');
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

const HOUSE = 'house123';
const OTHER_HOUSE = 'house999';
const GUEST = 'guest1';
const OTHER_GUEST = 'guest9';
const NOTE = 'note1';

let testEnv: RulesTestEnvironment;

const staff = (uid = 'staffUid') => testEnv.authenticatedContext(uid, { admin: { [HOUSE]: true } });
const owner = () => testEnv.authenticatedContext('ownerUid', { superAdmin: { [HOUSE]: true } });
const otherStaff = () =>
  testEnv.authenticatedContext('otherUid', { admin: { [OTHER_HOUSE]: true } });
const resident = () => testEnv.authenticatedContext('residentUid', { guest: { [HOUSE]: true } });

const residentNote = (overrides: Record<string, unknown> = {}) => ({
  houseId: HOUSE,
  type: 'resident_note',
  guestId: GUEST,
  content: 'Came home late, talked it through.',
  authorId: 'staffUid',
  authorName: 'Staff Member',
  createdAt: '2026-11-09T12:00:00.000Z',
  pinned: false,
  ...overrides,
});
const shiftLog = (overrides: Record<string, unknown> = {}) => {
  const { guestId: _guestId, ...rest } = residentNote({ type: 'shift_log' });
  return { ...rest, ...overrides };
};
const notes = (ctx: ReturnType<RulesTestEnvironment['authenticatedContext']>) =>
  collection(ctx.firestore(), 'staffNotes');

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(RULES_PATH, 'utf8'),
      host: FIRESTORE_HOST,
      port: Number(FIRESTORE_PORT),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `guests/${GUEST}`), {
      houseId: HOUSE,
      userId: 'residentUid',
    });
    await setDoc(doc(ctx.firestore(), `guests/${OTHER_GUEST}`), {
      houseId: OTHER_HOUSE,
      userId: 'otherResident',
    });
    await setDoc(doc(ctx.firestore(), `staffNotes/${NOTE}`), residentNote());
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

describe('staffNotes read', () => {
  it("lets a house's staff read a note and list a resident's notes", async () => {
    await assertSucceeds(getDoc(doc(staff().firestore(), `staffNotes/${NOTE}`)));
    const q = query(
      notes(staff()),
      where('houseId', '==', HOUSE),
      where('type', '==', 'resident_note'),
      where('guestId', '==', GUEST),
    );
    const snap = await assertSucceeds(getDocs(q));
    expect(snap.size).toBe(1);
  });

  it('lets an owner list the shift log', async () => {
    await assertSucceeds(
      getDocs(
        query(notes(owner()), where('houseId', '==', HOUSE), where('type', '==', 'shift_log')),
      ),
    );
  });

  it('BLOCKS a resident from reading notes, even about themselves', async () => {
    await assertFails(getDoc(doc(resident().firestore(), `staffNotes/${NOTE}`)));
    await assertFails(
      getDocs(
        query(
          notes(resident()),
          where('houseId', '==', HOUSE),
          where('type', '==', 'resident_note'),
        ),
      ),
    );
  });

  it("BLOCKS another house's staff and a signed-out user", async () => {
    await assertFails(getDoc(doc(otherStaff().firestore(), `staffNotes/${NOTE}`)));
    await assertFails(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), `staffNotes/${NOTE}`)),
    );
  });

  it('BLOCKS a list that is not scoped to the house', async () => {
    await assertFails(getDocs(query(notes(staff()), where('type', '==', 'resident_note'))));
  });
});

describe('staffNotes create', () => {
  it('lets staff add a resident note and a shift log as themselves', async () => {
    await assertSucceeds(addDoc(notes(staff()), residentNote()));
    await assertSucceeds(addDoc(notes(staff()), shiftLog()));
  });

  it('lets an owner add a note', async () => {
    await assertSucceeds(addDoc(notes(owner()), residentNote({ authorId: 'ownerUid' })));
  });

  it('BLOCKS a note written as someone else', async () => {
    await assertFails(addDoc(notes(staff()), residentNote({ authorId: 'ownerUid' })));
  });

  it('BLOCKS a resident and another house from adding notes', async () => {
    await assertFails(addDoc(notes(resident()), residentNote({ authorId: 'residentUid' })));
    await assertFails(addDoc(notes(otherStaff()), residentNote({ authorId: 'otherUid' })));
  });

  it('BLOCKS a resident note about someone in another house', async () => {
    await assertFails(addDoc(notes(staff()), residentNote({ guestId: OTHER_GUEST })));
    await assertFails(addDoc(notes(staff()), residentNote({ guestId: 'no-such-guest' })));
  });

  it('BLOCKS a resident note with no resident, and a shift log with one', async () => {
    const { guestId: _guestId, ...noResident } = residentNote();
    await assertFails(addDoc(notes(staff()), noResident));
    await assertFails(addDoc(notes(staff()), shiftLog({ guestId: GUEST })));
  });

  it('BLOCKS empty or over-long content', async () => {
    await assertFails(addDoc(notes(staff()), residentNote({ content: '' })));
    await assertFails(addDoc(notes(staff()), residentNote({ content: 'x'.repeat(1001) })));
    await assertSucceeds(addDoc(notes(staff()), residentNote({ content: 'x'.repeat(1000) })));
  });

  it('BLOCKS a note that starts pinned, an unknown type, or an extra field', async () => {
    await assertFails(addDoc(notes(staff()), residentNote({ pinned: true })));
    await assertFails(addDoc(notes(staff()), residentNote({ type: 'incident' })));
    await assertFails(addDoc(notes(staff()), residentNote({ severity: 'high' })));
  });
});

describe('staffNotes update', () => {
  it('lets staff pin and unpin a note', async () => {
    await assertSucceeds(
      updateDoc(doc(staff('anotherStaff').firestore(), `staffNotes/${NOTE}`), { pinned: true }),
    );
    await assertSucceeds(
      updateDoc(doc(staff().firestore(), `staffNotes/${NOTE}`), { pinned: false }),
    );
  });

  it('BLOCKS changing what a note says or who wrote it', async () => {
    await assertFails(
      updateDoc(doc(staff().firestore(), `staffNotes/${NOTE}`), { content: 'rewritten' }),
    );
    await assertFails(
      updateDoc(doc(staff().firestore(), `staffNotes/${NOTE}`), { authorId: 'ownerUid' }),
    );
    await assertFails(
      updateDoc(doc(staff().firestore(), `staffNotes/${NOTE}`), {
        pinned: true,
        content: 'rewritten',
      }),
    );
  });

  it('BLOCKS a pinned flag that is not true or false', async () => {
    await assertFails(updateDoc(doc(staff().firestore(), `staffNotes/${NOTE}`), { pinned: 'yes' }));
  });

  it('BLOCKS residents and another house from pinning', async () => {
    await assertFails(
      updateDoc(doc(resident().firestore(), `staffNotes/${NOTE}`), { pinned: true }),
    );
    await assertFails(
      updateDoc(doc(otherStaff().firestore(), `staffNotes/${NOTE}`), { pinned: true }),
    );
  });
});

describe('staffNotes delete', () => {
  it("lets a house's staff delete a note", async () => {
    await assertSucceeds(deleteDoc(doc(staff('anotherStaff').firestore(), `staffNotes/${NOTE}`)));
  });

  it('BLOCKS residents and another house from deleting', async () => {
    await assertFails(deleteDoc(doc(resident().firestore(), `staffNotes/${NOTE}`)));
    await assertFails(deleteDoc(doc(otherStaff().firestore(), `staffNotes/${NOTE}`)));
  });
});
