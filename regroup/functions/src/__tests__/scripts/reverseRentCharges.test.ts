// Reversing rent charges by their records: dry run by default, refused while the
// job could re-charge the same days, newest first, and re-chargeable afterwards.

jest.mock('../../scripts/scriptBootstrap', () => ({}));
jest.mock('firebase-functions/v2', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: require('../helpers/memFirestore').fieldValue,
}));
jest.mock('../../api/firestore', () => require('../helpers/memFirestore').apiFirestore);
jest.mock('../../util/notifications', () => ({ sendNotification: jest.fn() }));
// Linking matches on the account's Auth email; u1 is Pat.
jest.mock('firebase-admin', () => ({
  auth: () => ({
    getUsers: jest.fn(async (ids: { uid: string }[]) => ({
      users: ids.filter(({ uid }) => uid === 'u1').map(({ uid }) => ({ uid, email: 'pat@example.com' })),
      notFound: [],
    })),
  }),
}));

import { mem } from '../helpers/memFirestore';
import { account, at, charges, guest, house, owed } from '../helpers/rentFixtures';
import { chargeResident } from '../../rent/chargeResident';
import { reverseRentCharges } from '../../scripts/reverseRentCharges';

const twoWeeks = async () => {
  house();
  guest({ moveInDate: '2026-11-16' });
  account({ chargeFrom: '2026-11-16', chargedThrough: '2026-11-15' });
  await chargeResident('g1', at('2026-11-23'));
  expect(charges()).toEqual(['rentCharges/g1_2026-11-16', 'rentCharges/g1_2026-11-23']);
  expect(owed()).toBe(35000);
};
const pause = (paused: boolean) => mem.seed('config/rentCharges', { paused });

beforeEach(() => mem.reset());

it('dry run reports and changes nothing', async () => {
  await twoWeeks();
  pause(true);
  const writes = mem.writes.length;
  await expect(reverseRentCharges({ houseId: 'H', apply: false })).resolves.toEqual({
    charges: 2,
    totalCents: 35000,
  });
  expect(mem.writes.length).toBe(writes);
  expect(owed()).toBe(35000);
});

it('apply reverses newest first and restores chargedThrough', async () => {
  await twoWeeks();
  pause(true);
  await expect(reverseRentCharges({ houseId: 'H', apply: true })).resolves.toEqual({
    charges: 2,
    totalCents: 35000,
  });
  expect(owed()).toBe(0);
  expect(charges()).toEqual([]);
  expect(mem.get('rentAccounts/g1')?.chargedThrough).toBe('2026-11-15');
  expect(mem.paths('rentChargeReversals/')).toHaveLength(2);
});

it('since limits the reversal to later charges', async () => {
  await twoWeeks();
  pause(true);
  await reverseRentCharges({ houseId: 'H', since: '2026-11-20', apply: true });
  expect(charges()).toEqual(['rentCharges/g1_2026-11-16']);
  expect(owed()).toBe(17500);
  expect(mem.get('rentAccounts/g1')?.chargedThrough).toBe('2026-11-22');
});

it('apply is refused while charging runs', async () => {
  await twoWeeks();
  await expect(reverseRentCharges({ houseId: 'H', apply: true })).resolves.toEqual({
    charges: 0,
    totalCents: 0,
    refused: 'not-paused',
  });
  expect(owed()).toBe(35000);
  expect(charges()).toHaveLength(2);
});

it('apply runs when the house has charging off', async () => {
  await twoWeeks();
  mem.seed('houses/H', { ...mem.get('houses/H'), rentFrequency: 'both' });
  await expect(reverseRentCharges({ houseId: 'H', apply: true })).resolves.toMatchObject({
    charges: 2,
  });
});

it('a reversed week can be charged again after un-pausing', async () => {
  await twoWeeks();
  pause(true);
  await reverseRentCharges({ houseId: 'H', guestId: 'g1', since: '2026-11-23', apply: true });
  pause(false);
  await chargeResident('g1', at('2026-11-23'));
  expect(charges()).toEqual(['rentCharges/g1_2026-11-16', 'rentCharges/g1_2026-11-23']);
  expect(owed()).toBe(35000);
});

it("a linked intake record's charges are reversed on the record the balance moved to", async () => {
  house();
  guest({ userId: '', email: 'pat@example.com', moveInDate: '2026-11-18' }, 'gIntake');
  await chargeResident('gIntake', at('2026-11-18'));
  guest({ userId: 'u1', email: 'pat@example.com', rentOwed: 0 }, 'gNew');
  const { linkIntakeRecord } = await import('../../rent/linkIntakeRecord');
  await linkIntakeRecord('gNew');
  expect(mem.get('guests/gNew')?.rentOwed).toBe(12500);
  pause(true);
  await reverseRentCharges({ houseId: 'H', apply: true });
  expect(mem.get('guests/gNew')?.rentOwed).toBe(0);
  expect(mem.get('guests/gIntake')?.rentOwed).toBe(0);
  expect(mem.get('rentAccounts/gNew')?.chargedThrough).toBe('2026-11-17');
});

it("filtering by the invite record includes the linked intake record's charges", async () => {
  house();
  guest({ userId: '', email: 'pat@example.com', moveInDate: '2026-11-18' }, 'gIntake');
  await chargeResident('gIntake', at('2026-11-18'));
  guest({ userId: 'u1', email: 'pat@example.com', rentOwed: 0 }, 'gNew');
  const { linkIntakeRecord } = await import('../../rent/linkIntakeRecord');
  await linkIntakeRecord('gNew');
  pause(true);
  await expect(
    reverseRentCharges({ houseId: 'H', guestId: 'gNew', apply: true }),
  ).resolves.toMatchObject({ charges: 1, totalCents: 12500 });
  expect(mem.get('guests/gNew')?.rentOwed).toBe(0);
});
