// Intake followed by an invite sign-up leaves two active records for one person.
// linkIntakeRecord moves the rent onto the invite record, so only one is charged.

jest.mock('firebase-functions/v2', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: require('../helpers/memFirestore').fieldValue,
}));
jest.mock('../../api/firestore', () => require('../helpers/memFirestore').apiFirestore);
jest.mock('../../util/notifications', () => ({ sendNotification: jest.fn() }));

import { apiFirestore, mem } from '../helpers/memFirestore';
import { account, at, charges, guest, house } from '../helpers/rentFixtures';
import { chargeResident } from '../../rent/chargeResident';
import { rentOnGuestWrite } from '../../rent/guestWriteRent';
import { linkIntakeRecord } from '../../rent/linkIntakeRecord';

const intake = (o: Record<string, unknown> = {}, id = 'gIntake') =>
  guest({ userId: '', email: 'Pat@Example.com ', rentOwed: 12500, ...o }, id);
const invite = (o: Record<string, unknown> = {}) =>
  guest({ userId: 'u1', email: 'pat@example.com', moveInDate: undefined, ...o }, 'gNew');
const doc = (id: string) => mem.get(`guests/${id}`) ?? {};

beforeEach(() => mem.reset());

it('an intake record with $125 owed and the same email (different case) is linked', async () => {
  house();
  intake({ rentDueDate: '2026-11-18', choreFees: 500 });
  mem.seed('rentAccounts/gIntake', {
    ...{ guestId: 'gIntake', houseId: 'H', anchoredTo: '2026-11-11' },
    chargeFrom: '2026-11-18',
    chargedThrough: '2026-11-22',
  });
  mem.seed('rentCharges/gIntake_2026-11-18', {
    guestId: 'gIntake',
    houseId: 'H',
    guestUserId: null,
  });
  invite();
  await expect(linkIntakeRecord('gNew')).resolves.toBe('linked');
  expect(doc('gNew')).toMatchObject({
    rentOwed: 12500,
    choreFees: 500,
    moveInDate: '2026-11-18',
    rentDueDate: '2026-11-18',
  });
  expect(doc('gIntake')).toMatchObject({ rentOwed: 0, choreFees: 0, rentLinkedTo: 'gNew' });
  expect(mem.get('rentAccounts/gIntake')).toBeUndefined();
  expect(mem.get('rentAccounts/gNew')).toMatchObject({
    guestId: 'gNew',
    chargedThrough: '2026-11-22',
  });
  expect(mem.get('rentCharges/gIntake_2026-11-18')?.guestUserId).toBe('u1');
});

it("after linking, the next chargeResident on the intake record is 'linked'", async () => {
  house();
  intake({ rentOwed: 0 });
  await chargeResident('gIntake', at('2026-11-18'));
  expect(doc('gIntake').rentOwed).toBe(12500);
  invite();
  const now = at('2026-11-18');
  await rentOnGuestWrite({
    guestId: 'gNew',
    after: doc('gNew'),
    afterCreateTimeMs: now.getTime(),
    eventTime: now.toISOString(),
    now,
  });
  await expect(chargeResident('gIntake', now)).resolves.toEqual({
    status: 'skipped',
    reason: 'linked',
  });
  expect(doc('gNew').rentOwed).toBe(12500);
  expect(charges()).toEqual(['rentCharges/gIntake_2026-11-18']);
  await chargeResident('gNew', at('2026-11-23'));
  expect(charges()).toEqual(['rentCharges/gIntake_2026-11-18', 'rentCharges/gNew_2026-11-23']);
});

it("two matching intake records are 'ambiguous' and nothing changes", async () => {
  house();
  intake({}, 'i1');
  intake({}, 'i2');
  invite();
  await expect(linkIntakeRecord('gNew')).resolves.toBe('ambiguous');
  expect(doc('gNew').rentOwed).toBe(0);
  expect(doc('i1').rentLinkedTo).toBeUndefined();
  expect(doc('i2').rentLinkedTo).toBeUndefined();
});

it('a match in another house is ignored', async () => {
  house();
  intake({ houseId: 'other' });
  invite();
  await expect(linkIntakeRecord('gNew')).resolves.toBe('none');
});

it('a discharged intake record is ignored', async () => {
  house();
  intake({ status: 'discharged' });
  invite();
  await expect(linkIntakeRecord('gNew')).resolves.toBe('none');
});

it('a record that already has an account is not an intake record', async () => {
  house();
  intake({ userId: 'someoneElse' });
  invite();
  await expect(linkIntakeRecord('gNew')).resolves.toBe('none');
});

it('a new record without email does nothing and makes no reads', async () => {
  house();
  intake();
  invite({ email: '' });
  const where = jest.spyOn(apiFirestore.guestCollection, 'where');
  const docRef = jest.spyOn(apiFirestore.guestCollection, 'doc');
  await expect(linkIntakeRecord('gNew', doc('gNew'))).resolves.toBe('none');
  expect(where).not.toHaveBeenCalled();
  expect(docRef).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

it('an account on the new record is kept and the intake one removed', async () => {
  house();
  intake();
  mem.seed('rentAccounts/gIntake', { guestId: 'gIntake', chargedThrough: '2026-11-22' });
  invite();
  account({ guestId: 'gNew', chargedThrough: '2026-11-29' });
  mem.seed('rentAccounts/gNew', { ...mem.get('rentAccounts/g1'), guestId: 'gNew' });
  await linkIntakeRecord('gNew');
  expect(mem.get('rentAccounts/gNew')?.chargedThrough).toBe('2026-11-29');
  expect(mem.get('rentAccounts/gIntake')).toBeUndefined();
});
