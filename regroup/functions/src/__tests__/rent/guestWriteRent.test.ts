// What a guest write means for rent (join, move, re-activation), against an
// in-memory store with a stamped weekly house.

jest.mock('firebase-functions/v2', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: require('../helpers/memFirestore').fieldValue,
}));
jest.mock('../../api/firestore', () => require('../helpers/memFirestore').apiFirestore);
jest.mock('../../util/notifications', () => ({ sendNotification: jest.fn() }));

import { apiFirestore, mem, memDb } from '../helpers/memFirestore';
import { account, at, charges, guest, H, house, owed } from '../helpers/rentFixtures';
import { chargeResident } from '../../rent/chargeResident';
import { rentOnGuestWrite } from '../../rent/guestWriteRent';

type Data = Record<string, unknown>;
const g = (): Data => mem.get('guests/g1') ?? {};
const created = (now: Date) => ({
  guestId: 'g1',
  after: g(),
  afterCreateTimeMs: now.getTime(),
  eventTime: now.toISOString(),
  now,
});

beforeEach(() => mem.reset());

it('a new resident created Wed Nov 18 is charged $125.00 by the trigger step', async () => {
  house();
  guest();
  await expect(rentOnGuestWrite(created(at('2026-11-18')))).resolves.toMatchObject({
    status: 'charged',
    totalCents: 12500,
  });
  expect(owed()).toBe(12500);
});

it('a create with no moveInDate gets one from its createTime', async () => {
  house();
  guest({ moveInDate: undefined });
  const now = at('2026-11-18');
  await rentOnGuestWrite(created(now));
  expect(g().moveInDate).toBe(now.toISOString());
  expect(charges()).toEqual(['rentCharges/g1_2026-11-18']);
});

it('an imported resident with no moveInDate is not charged until the next full period', async () => {
  // Charging on since Wed Nov 11 at $175/week; imported Thu Nov 12 (spec §2: $0 until Mon Nov 16).
  house();
  const now = at('2026-11-12');
  guest({ moveInDate: undefined, importedAt: now.toISOString() });
  await expect(rentOnGuestWrite(created(now))).resolves.toMatchObject({ reason: 'not-due' });
  expect(charges()).toEqual([]);
  expect(owed()).toBe(0);
  await chargeResident('g1', at('2026-11-16'));
  expect(charges()).toEqual(['rentCharges/g1_2026-11-16']);
  expect(mem.get('rentCharges/g1_2026-11-16')?.amountCents).toBe(17500);
});

it('a create keeps a moveInDate the record already has', async () => {
  house();
  guest({ moveInDate: '2026-11-19' });
  await rentOnGuestWrite(created(at('2026-11-19')));
  expect(g().moveInDate).toBe('2026-11-19');
});

it('a redelivered create event charges once', async () => {
  house();
  guest();
  const e = created(at('2026-11-18'));
  await rentOnGuestWrite(e);
  await rentOnGuestWrite(e);
  expect(charges()).toHaveLength(1);
  expect(owed()).toBe(12500);
});

it("a stats update returns 'none' and does no reads", async () => {
  house();
  guest();
  const tx = jest.spyOn(memDb, 'runTransaction');
  const houseDoc = jest.spyOn(apiFirestore.houseCollection, 'doc');
  const config = jest.spyOn(apiFirestore, 'rentConfigRef');
  const before = { ...g(), points: 1 };
  await expect(
    rentOnGuestWrite({
      guestId: 'g1',
      before,
      after: { ...before, points: 2 },
      eventTime: at('2026-11-18').toISOString(),
    }),
  ).resolves.toBe('none');
  expect(tx).not.toHaveBeenCalled();
  expect(houseDoc).not.toHaveBeenCalled();
  expect(config).not.toHaveBeenCalled();
  expect(mem.writes).toEqual([]);
  jest.restoreAllMocks();
});

it("the rentOwed write from a charge returns 'none'", async () => {
  house();
  guest();
  await expect(
    rentOnGuestWrite({
      guestId: 'g1',
      before: g(),
      after: { ...g(), rentOwed: 12500, rentDueDate: '2026-11-18' },
      eventTime: at('2026-11-18').toISOString(),
    }),
  ).resolves.toBe('none');
});

it('re-activation on Wed Dec 2 after a discharge charges from Dec 2, not from the last chargedThrough', async () => {
  house();
  guest();
  account({ chargedThrough: '2026-11-15' });
  const now = at('2026-12-02');
  await rentOnGuestWrite({
    guestId: 'g1',
    before: { ...g(), status: 'discharged' },
    after: g(),
    eventTime: now.toISOString(),
    now,
  });
  expect(mem.get('rentAccounts/g1')?.reactivatedOn).toBe('2026-12-02');
  expect(charges()).toEqual(['rentCharges/g1_2026-12-02']);
  expect(mem.get('rentCharges/g1_2026-12-02')?.amountCents).toBe(12500);
});

it('a move to another house records joinedOn and keeps chargedThrough', async () => {
  house({}, 'A');
  house({ timezone: 'America/Los_Angeles' }, 'B');
  guest({ houseId: 'B' });
  account({ houseId: 'A', chargedThrough: '2026-11-22' });
  // Thu Nov 19, 23:30 in Los Angeles (already Nov 20 in UTC and New York).
  const now = new Date('2026-11-20T07:30:00Z');
  await expect(
    rentOnGuestWrite({
      guestId: 'g1',
      before: { ...g(), houseId: 'A' },
      after: g(),
      eventTime: now.toISOString(),
      now,
    }),
  ).resolves.toMatchObject({ reason: 'not-due' });
  expect(mem.get('rentAccounts/g1')).toMatchObject({
    houseId: 'B',
    houseJoinedAtMs: now.getTime(),
    joinedOn: '2026-11-19',
    reactivatedOn: null,
    chargedThrough: '2026-11-22',
  });
  expect(charges()).toEqual([]);
});

it('a discharged write charges nothing', async () => {
  house();
  guest({ status: 'discharged' });
  await expect(
    rentOnGuestWrite({
      guestId: 'g1',
      before: { ...g(), status: 'active' },
      after: g(),
      eventTime: at('2026-11-18').toISOString(),
    }),
  ).resolves.toBe('none');
  expect(charges()).toEqual([]);
});

it('a deleted record does nothing', async () => {
  await expect(
    rentOnGuestWrite({ guestId: 'g1', before: { houseId: H }, eventTime: 'x' }),
  ).resolves.toBe('none');
});

it('a discharge records inactiveSince on an existing account', async () => {
  house();
  guest({ status: 'discharged' });
  account({ chargedThrough: '2026-11-22' });
  const now = at('2026-11-20');
  await expect(
    rentOnGuestWrite({
      guestId: 'g1',
      before: { ...g(), status: 'active' },
      after: g(),
      eventTime: now.toISOString(),
      now,
    }),
  ).resolves.toBe('none');
  expect(mem.get('rentAccounts/g1')?.inactiveSince).toBe('2026-11-20');
});

it('a discharge with no account writes nothing', async () => {
  house();
  guest({ status: 'discharged' });
  await rentOnGuestWrite({
    guestId: 'g1',
    before: { ...g(), status: 'active' },
    after: g(),
    eventTime: at('2026-11-20').toISOString(),
  });
  expect(mem.paths('rentAccounts/')).toEqual([]);
});

it('linking a record to an account lets the resident see its charges', async () => {
  house();
  guest({ userId: '' });
  await chargeResident('g1', at('2026-11-18'));
  expect(mem.get('rentCharges/g1_2026-11-18')?.guestUserId).toBeNull();
  await expect(
    rentOnGuestWrite({
      guestId: 'g1',
      before: g(),
      after: { ...g(), userId: 'u9' },
      eventTime: at('2026-11-19').toISOString(),
    }),
  ).resolves.toBe('none');
  expect(mem.get('rentCharges/g1_2026-11-18')?.guestUserId).toBe('u9');
});
