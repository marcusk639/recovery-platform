/**
 * A resident reads their own documents (owner decision, launch spec §4.1 item
 * 2: residents of a plan-required or lapsed house keep read-only access to
 * their own payment history and documents). "Their own" is a document whose
 * guestId is a guest record in the same house linked to the caller's account.
 * Everything else stays as it was: residents write nothing, and house admins
 * still read and manage the house's documents.
 *
 *   cd firebase && firebase emulators:exec --only firestore,storage,auth --project demo-test \
 *     "cd .. && npx jest --config jest.config.rules.js --no-coverage --forceExit residentDocuments"
 */
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { ADMIN, HOUSE, OTHER_RESIDENT, OWNER, RESIDENT, useRentRulesEnv } from './rentRulesHarness';

const rules = useRentRulesEnv('demo-resident-documents-rules-test');
const as = rules.as;
const OTHER_HOUSE = 'house999';
const OUTSIDER = 'outsider';

const record = (id: string, guestId?: string, houseId = HOUSE) => ({
  id,
  houseId,
  ...(guestId ? { guestId } : {}),
  fileName: `${id}.pdf`,
  storagePath: guestId
    ? `houses/${houseId}/guests/${guestId}/documents/${id}`
    : `houses/${houseId}/documents/${id}`,
  fileType: 'pdf',
  category: 'lease',
  uploadedBy: OWNER,
  createdAt: '2026-11-20T00:00:00.000Z',
});

beforeEach(async () => {
  await rules.env().withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'documents/dOwn'), record('dOwn', 'gResident'));
    await setDoc(doc(db, 'documents/dOther'), record('dOther', 'gOther'));
    await setDoc(doc(db, 'documents/dHouse'), record('dHouse'));
    // The resident's account on a guest record of another house, named by a
    // document of this house: not their record here.
    await setDoc(doc(db, 'guests/gElsewhere'), {
      userId: RESIDENT,
      houseId: OTHER_HOUSE,
      status: 'active',
    });
    await setDoc(doc(db, 'documents/dCrossed'), record('dCrossed', 'gElsewhere'));
    await setDoc(doc(db, 'guests/gOutsider'), {
      userId: OUTSIDER,
      houseId: OTHER_HOUSE,
      status: 'active',
    });
  });
});

const read = (uid: string, id: string) => getDoc(doc(as(uid), `documents/${id}`));
const ownList = (uid: string, guestId: string) =>
  getDocs(
    query(
      collection(as(uid), 'documents'),
      where('houseId', '==', HOUSE),
      where('guestId', '==', guestId),
      orderBy('createdAt', 'desc'),
    ),
  );
const houseList = (uid: string) =>
  getDocs(
    query(
      collection(as(uid), 'documents'),
      where('houseId', '==', HOUSE),
      orderBy('createdAt', 'desc'),
    ),
  );
const outsiderDb = () =>
  rules
    .env()
    .authenticatedContext(OUTSIDER, { guest: { [OTHER_HOUSE]: true } })
    .firestore();

describe('documents: a resident reads their own', () => {
  it('reads their own document', () => assertSucceeds(read(RESIDENT, 'dOwn')));
  it('lists their own documents, as the Documents screen does', () =>
    assertSucceeds(ownList(RESIDENT, 'gResident')));
});

describe('documents: a resident reads nothing else', () => {
  it("is refused another resident's document", () => assertFails(read(RESIDENT, 'dOther')));
  it("is refused a list of another resident's documents", () =>
    assertFails(ownList(RESIDENT, 'gOther')));
  it('is refused a house-level document', () => assertFails(read(RESIDENT, 'dHouse')));
  it("is refused the house's documents list", () => assertFails(houseList(RESIDENT)));
  it('is refused a document naming their guest record of another house', () =>
    assertFails(read(RESIDENT, 'dCrossed')));
  it('another resident is refused this one', () => assertFails(read(OTHER_RESIDENT, 'dOwn')));
});

describe('documents: a resident writes nothing', () => {
  it('cannot create a record for themselves', () =>
    assertFails(setDoc(doc(as(RESIDENT), 'documents/dNew'), record('dNew', 'gResident'))));
  it('cannot change their own document', () =>
    assertFails(updateDoc(doc(as(RESIDENT), 'documents/dOwn'), { fileName: 'x.pdf' })));
  it('cannot delete their own document', () =>
    assertFails(deleteDoc(doc(as(RESIDENT), 'documents/dOwn'))));
});

describe('documents: house admins are unchanged', () => {
  it('the owner reads a resident document', () => assertSucceeds(read(OWNER, 'dOwn')));
  it('a manager reads a resident document', () => assertSucceeds(read(ADMIN, 'dOther')));
  it("a manager lists the house's documents", () => assertSucceeds(houseList(ADMIN)));
  it("a manager lists a resident's documents", () => assertSucceeds(ownList(ADMIN, 'gResident')));
  it('a manager deletes a document', () =>
    assertSucceeds(deleteDoc(doc(as(ADMIN), 'documents/dHouse'))));
});

describe('documents: other people', () => {
  it('a resident of another house is refused', async () => {
    await assertFails(getDoc(doc(outsiderDb(), 'documents/dOwn')));
  });
  it('a resident of another house is refused even with their own guest id', async () => {
    await rules.env().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'documents/dPlanted'), record('dPlanted', 'gOutsider'));
    });
    await assertFails(getDoc(doc(outsiderDb(), 'documents/dPlanted')));
  });
  it('a signed-out caller is refused', () =>
    assertFails(getDoc(doc(rules.env().unauthenticatedContext().firestore(), 'documents/dOwn'))));
});
