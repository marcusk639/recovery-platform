/**
 * Firestore Security Rules Tests — invited self-create needs an admission ticket
 *
 * Owner rule: a resident never adds themselves to a house. A resident's own
 * guest doc is allowed only with an unused, unexpired server-written ticket
 * at admission-tickets/{uid}_{houseId} (written by redeemInvitation), and
 * only with exactly what the app's SignUpForm writes. Admin and peer-leader
 * creates are unchanged. Residents cannot delete guest docs.
 *
 * SIGNUP_PAYLOAD replays what the app sends today: `new Guest()` defaults
 * (mobile/src/entities/Guest.tsx + BaseEntity), mapUserToGuest
 * (firstName, lastName, userId, houseId, phoneNumber, email), then
 * isAdmin = invitation role is senior-peer and phase = the invitation's
 * initialPhase ("" when none). Undefined optional fields are dropped
 * (ignoreUndefinedProperties). mobile SignUpForm/__tests__/selfCreatePayload
 * keeps this in step with the entity.
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
import { deleteDoc, doc, getDoc, setDoc, Timestamp, writeBatch } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const H = 'houseA';
const OTHER = 'houseB';
const UID = 'invitee';
const DAY = 24 * 3600 * 1000;
let testEnv: RulesTestEnvironment;

const SIGNUP_PAYLOAD = (extra: Record<string, unknown> = {}) => ({
  id: 'g1',
  createdAt: '2026-10-27T12:00:00.000Z',
  updatedAt: '2026-10-27T12:00:00.000Z',
  userId: UID,
  houseId: H,
  displayName: '',
  firstName: 'New',
  lastName: 'Resident',
  email: 'new@example.com',
  phoneNumber: '555-0100',
  sobrietyDate: '',
  drugOfChoice: '',
  phase: '',
  step: 1,
  status: 'active',
  isAdmin: false,
  infoEntered: false,
  hasJob: false,
  rentOwed: 0,
  choreFees: 0,
  dailyHabit: 0,
  supporters: [],
  jobs: [],
  version: 0,
  ...extra,
});

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
  it('ALLOWS the old-build SignUpForm batch exactly as the app writes it (guest doc + capacity bump)', async () => {
    await ticket();
    const db = invitee();
    const batch = writeBatch(db);
    batch.update(doc(db, `houses/${H}`), { currentCapacity: 4 });
    batch.set(doc(db, 'guests/g1'), SIGNUP_PAYLOAD());
    await assertSucceeds(batch.commit());
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
