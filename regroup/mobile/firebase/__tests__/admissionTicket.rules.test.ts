/**
 * Firestore Security Rules Tests — invited self-create needs an admission ticket
 *
 * Owner rule: a resident never adds themselves to a house. A resident's own
 * guest doc is allowed only with an unused, unexpired server-written ticket
 * at admission-tickets/{uid}_{houseId} (written by redeemInvitation), and
 * only with exactly what the app's SignUpForm writes. Admin and peer-leader
 * creates are unchanged. Residents cannot delete guest docs.
 *
 * SIGNUP_PAYLOAD is the shared fixture firebase/fixtures/selfCreatePayload,
 * which the SignUp drift guard (src/screens/SignUp/__tests__/selfCreatePayload)
 * checks against the app's real builder, buildSelfCreateGuest.
 *
 *   cd firebase && firebase emulators:exec --only firestore --project demo-rules \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/admissionTicket.rules.test.ts"
 */
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';
import { selfCreatePayload } from '../fixtures/selfCreatePayload';

const H = 'houseA';
const OTHER = 'houseB';
const UID = 'invitee';
const DAY = 24 * 3600 * 1000;
let testEnv: RulesTestEnvironment;

// What this build sends (createdBy/updatedBy = the invitee); `legacy`
// is what builds before it send (no createdBy).
const SIGNUP_PAYLOAD = (extra: Record<string, unknown> = {}, legacy = false) =>
  selfCreatePayload(UID, H, extra, { legacy });

const seed = (path_: string, data: Record<string, unknown>) =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path_), data);
  });
const ticket = (extra: Record<string, unknown> = {}, houseId = H) =>
  seed(`admission-tickets/${UID}_${houseId}`, {
    invitationId: 'T',
    role: 'guest',
    initialPhase: '',
    used: false,
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + 7 * DAY),
    ...extra,
  });
const invitee = (claims: Record<string, unknown> = { guest: { [H]: true } }) =>
  testEnv.authenticatedContext(UID, claims).firestore();
const create = (db: ReturnType<typeof invitee>, data: Record<string, unknown>) =>
  setDoc(doc(db, `guests/${data.id}`), data);

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-admission-ticket-rules',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});
afterAll(() => testEnv.cleanup());
beforeEach(() => seed(`houses/${H}`, { id: H, currentCapacity: 3 }));
afterEach(() => testEnv.clearFirestore());

describe('invited self-create', () => {
  it('ALLOWS the old-build SignUpForm batch exactly as the app writes it (full-house spread + capacity bump)', async () => {
    await ticket();
    const db = invitee();
    // createGuest re-writes the whole house doc it read, with capacity + 1.
    const house = (await getDoc(doc(db, `houses/${H}`))).data()!;
    const batch = writeBatch(db);
    batch.update(doc(db, `houses/${H}`), { ...house, currentCapacity: house.currentCapacity + 1 });
    batch.set(doc(db, 'guests/g1'), SIGNUP_PAYLOAD({}, true));
    await assertSucceeds(batch.commit());
  });

  it('ALLOWS this build, which names the invitee in createdBy/updatedBy', async () => {
    await ticket();
    await assertSucceeds(create(invitee(), SIGNUP_PAYLOAD()));
  });

  it('DENIES a createdBy or updatedBy naming someone else, on either create branch', async () => {
    await ticket();
    await assertFails(create(invitee(), SIGNUP_PAYLOAD({ createdBy: 'owner' })));
    await assertFails(create(invitee(), SIGNUP_PAYLOAD({ updatedBy: 'owner' })));
    const staff = testEnv.authenticatedContext('staff', { admin: { [H]: true } }).firestore();
    await assertFails(
      setDoc(doc(staff, 'guests/intake2'), { houseId: H, status: 'active', createdBy: 'owner' }),
    );
    await assertSucceeds(
      setDoc(doc(staff, 'guests/intake2'), { houseId: H, status: 'active', createdBy: 'staff' }),
    );
  });

  it('DENIES changing createdBy, or an updatedBy naming someone else, on update', async () => {
    await seed('guests/g9', { userId: UID, houseId: H, status: 'active', createdBy: UID });
    const staff = testEnv.authenticatedContext('staff', { admin: { [H]: true } }).firestore();
    await assertFails(updateDoc(doc(staff, 'guests/g9'), { createdBy: 'staff' }));
    await assertFails(updateDoc(doc(staff, 'guests/g9'), { updatedBy: 'owner' }));
    await assertSucceeds(updateDoc(doc(staff, 'guests/g9'), { updatedBy: 'staff', step: 2 }));
    await assertFails(updateDoc(doc(invitee(), 'guests/g9'), { updatedBy: 'owner' }));
    await assertSucceeds(updateDoc(doc(invitee(), 'guests/g9'), { updatedBy: UID, firstName: 'N' }));
  });

  it('DENIES self-create with the claim but no ticket', async () => {
    await assertFails(create(invitee(), SIGNUP_PAYLOAD()));
  });

  it('DENIES self-create with a used ticket', async () => {
    await ticket({ used: true });
    await assertFails(create(invitee(), SIGNUP_PAYLOAD()));
  });

  it('DENIES self-create with an expired ticket', async () => {
    await ticket({ expiresAt: Timestamp.fromMillis(Date.now() - DAY) });
    await assertFails(create(invitee(), SIGNUP_PAYLOAD()));
  });

  it("DENIES self-create in another house with this house's ticket", async () => {
    await ticket();
    const db = invitee({ guest: { [H]: true, [OTHER]: true } });
    await assertFails(create(db, SIGNUP_PAYLOAD({ houseId: OTHER })));
  });

  it.each([
    ['a balance', { rentOwed: 5000 }],
    ['chore fees', { choreFees: 100 }],
    ['a status other than active', { status: 'inactive' }],
    ['auto-pay', { autoPayEnabled: true }],
    ['a Stripe customer', { stripeCustomerId: 'cus_x' }],
    ['a payment method', { defaultPaymentMethodId: 'pm_x' }],
    ['a membership mark', { membership: { status: 'verified', reason: 'claim' } }],
    ['a pending invitation', { pendingInvitation: 'T' }],
    ['a move-out date', { moveOutDate: '2026-01-01' }],
    ['roles', { roles: { admin: true } }],
  ])('DENIES self-create carrying %s', async (_label, extra) => {
    await ticket();
    await assertFails(create(invitee(), SIGNUP_PAYLOAD(extra)));
  });

  // A resident-only account (guest claim): isAdmin on its own doc needs a
  // senior-peer ticket. (An account that already holds the admin claim
  // creates through the unchanged staff branch.)
  it('isAdmin true is allowed only with a senior-peer ticket', async () => {
    await ticket();
    await assertFails(create(invitee(), SIGNUP_PAYLOAD({ isAdmin: true })));
    await ticket({ role: 'senior-peer' });
    await assertSucceeds(create(invitee(), SIGNUP_PAYLOAD({ isAdmin: true })));
  });

  it('a senior-peer ticket requires isAdmin true', async () => {
    await ticket({ role: 'senior-peer' });
    await assertFails(create(invitee(), SIGNUP_PAYLOAD({ isAdmin: false })));
  });

  it("phase must be the invitation's initialPhase when it has one", async () => {
    await ticket({ initialPhase: 'phase-2' });
    await assertFails(create(invitee(), SIGNUP_PAYLOAD({ phase: 'phase-4' })));
    await assertSucceeds(create(invitee(), SIGNUP_PAYLOAD({ phase: 'phase-2' })));
  });

  it('phase is strict: with no initialPhase the resident cannot pick one', async () => {
    await ticket();
    await assertFails(create(invitee(), SIGNUP_PAYLOAD({ phase: 'Phase 4' })));
    await assertFails(create(invitee(), SIGNUP_PAYLOAD({ phase: 4 })));
    await assertSucceeds(create(invitee(), SIGNUP_PAYLOAD({ phase: '' })));
  });

  it('phase is strict: an initialPhase cannot be dropped', async () => {
    await ticket({ initialPhase: 'p1' });
    const payload = SIGNUP_PAYLOAD();
    delete payload.phase;
    await assertFails(create(invitee(), payload));
  });

  it('clients can neither read nor write admission tickets', async () => {
    await ticket();
    const db = invitee();
    await assertFails(getDoc(doc(db, `admission-tickets/${UID}_${H}`)));
    await assertFails(setDoc(doc(db, `admission-tickets/${UID}_${OTHER}`), { used: false }));
  });
});

describe('admin and peer-leader create are unchanged', () => {
  it.each([
    ['a manager', { admin: { [H]: true } }],
    ['a peer leader (admin + guest claims)', { admin: { [H]: true }, guest: { [H]: true } }],
  ])('ALLOWS %s to create a resident doc, with no ticket', async (_label, claims) => {
    const db = testEnv.authenticatedContext('staff', claims).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'guests/intake1'), {
        houseId: H,
        firstName: 'A',
        status: 'active',
        rentOwed: 50000,
      }),
    );
  });
});

describe('deleting guest docs', () => {
  beforeEach(() => seed('guests/g1', { userId: UID, houseId: H, rentOwed: 150000 }));

  it('DENIES a resident deleting their own doc (it carries their balance)', async () => {
    await assertFails(deleteDoc(doc(invitee(), 'guests/g1')));
  });

  it('ALLOWS a house admin to delete a guest doc', async () => {
    const db = testEnv.authenticatedContext('staff', { admin: { [H]: true } }).firestore();
    await assertSucceeds(deleteDoc(doc(db, 'guests/g1')));
  });
});
