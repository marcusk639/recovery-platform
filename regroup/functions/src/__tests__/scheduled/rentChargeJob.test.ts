// The hourly rent job against an in-memory store: which houses and residents it
// charges, on whose local date, and that one failure or a stop switch is contained.

jest.mock('firebase-functions/v2', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: unknown) => handler,
}));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: require('../helpers/memFirestore').fieldValue,
}));
jest.mock('../../api/firestore', () => require('../helpers/memFirestore').apiFirestore);
jest.mock('../../util/notifications', () => ({ sendNotification: jest.fn() }));

import { mem } from '../helpers/memFirestore';
import { account, charges, guest, house } from '../helpers/rentFixtures';
import * as charge from '../../rent/chargeResident';
import { runRentCharges } from '../../scheduled/rentChargeJob';

const MONDAY = new Date('2026-11-16T17:00:00Z');

beforeEach(() => {
  mem.reset();
  jest.restoreAllMocks();
});

it('charges a due resident in each stamped house', async () => {
  house({}, 'A');
  house({ rentFrequency: 'monthly' }, 'B');
  guest({ houseId: 'A', moveInDate: '2026-11-16' }, 'a1');
  guest({ houseId: 'B', moveInDate: '2026-11-16' }, 'b1');
  await expect(runRentCharges(MONDAY)).resolves.toEqual({
    houses: 2,
    charged: 2,
    skipped: 0,
    failed: 0,
  });
  expect(charges()).toEqual(['rentCharges/a1_2026-11-16', 'rentCharges/b1_2026-11-16']);
});

it("skips a house whose rentFrequency is 'both'", async () => {
  house({ rentFrequency: 'both' }, 'A');
  guest({ houseId: 'A' }, 'a1');
  await expect(runRentCharges(MONDAY)).resolves.toMatchObject({ houses: 0, charged: 0 });
  expect(charges()).toEqual([]);
});

it('skips a house on a schedule that was never stamped', async () => {
  house({ rentChargesStartDate: null, rentChargesStartedAtMs: null }, 'A');
  guest({ houseId: 'A' }, 'a1');
  await expect(runRentCharges(MONDAY)).resolves.toMatchObject({ houses: 0 });
});

describe('local dates', () => {
  const weekly = () => account({ chargeFrom: '2026-11-11', chargedThrough: '2026-11-15' });
  it("a house with timezone '' is charged on New York dates", async () => {
    house({ timezone: '' });
    guest();
    weekly();
    await runRentCharges(new Date('2026-11-16T04:30:00Z')); // Sun 23:30 in New York
    expect(charges()).toEqual([]);
    await runRentCharges(new Date('2026-11-16T05:30:00Z')); // Mon 00:30
    expect(charges()).toEqual(['rentCharges/g1_2026-11-16']);
  });

  it("a house in 'Pacific/Honolulu' is charged after its own midnight", async () => {
    house({ timezone: 'Pacific/Honolulu' });
    guest();
    weekly();
    await runRentCharges(new Date('2026-11-16T09:30:00Z')); // Sun 23:30 in Honolulu
    expect(charges()).toEqual([]);
    await runRentCharges(new Date('2026-11-16T10:30:00Z')); // Mon 00:30
    expect(charges()).toEqual(['rentCharges/g1_2026-11-16']);
  });
});

describe('records with no account', () => {
  it('a resident created 10 minutes ago without an account is left to the trigger', async () => {
    house();
    const spy = jest.spyOn(charge, 'chargeResident');
    mem.seedAt(
      'guests/g1',
      { houseId: 'H', status: 'active', moveInDate: '2026-11-16' },
      MONDAY.getTime() - 10 * 60 * 1000,
    );
    await runRentCharges(MONDAY);
    expect(spy).not.toHaveBeenCalled();
    expect(charges()).toEqual([]);
  });

  it('a resident with no account whose record changed in the last hour is left to the trigger', async () => {
    house();
    const spy = jest.spyOn(charge, 'chargeResident');
    mem.seedAt(
      'guests/g1',
      { houseId: 'H', status: 'active', moveInDate: '2026-11-16' },
      MONDAY.getTime() - 90 * 24 * 3600 * 1000,
      MONDAY.getTime() - 5 * 60 * 1000,
    );
    await runRentCharges(MONDAY);
    expect(spy).not.toHaveBeenCalled();
  });

  it('a resident with no account created 2 hours ago is charged', async () => {
    house();
    mem.seedAt(
      'guests/g1',
      { houseId: 'H', status: 'active', moveInDate: '2026-11-16' },
      MONDAY.getTime() - 2 * 3600 * 1000,
    );
    await runRentCharges(MONDAY);
    expect(charges()).toEqual(['rentCharges/g1_2026-11-16']);
  });
});

it('not-due accounts make no transaction', async () => {
  house();
  guest();
  account({ chargeFrom: '2026-11-11', chargedThrough: '2026-11-22' });
  const spy = jest.spyOn(charge, 'chargeResident');
  await expect(runRentCharges(MONDAY)).resolves.toMatchObject({ houses: 1, charged: 0 });
  expect(spy).not.toHaveBeenCalled();
});

it('an account anchored to an older start is re-checked even when not due', async () => {
  house({ rentChargesStartDate: '2026-11-14' });
  guest();
  account({ anchoredTo: '2026-11-01', chargedThrough: '2026-11-22' });
  const spy = jest.spyOn(charge, 'chargeResident');
  await runRentCharges(MONDAY);
  expect(spy).toHaveBeenCalledWith('g1', MONDAY);
});

it('discharged residents are not visited', async () => {
  house();
  guest({ status: 'discharged' });
  const spy = jest.spyOn(charge, 'chargeResident');
  await runRentCharges(MONDAY);
  expect(spy).not.toHaveBeenCalled();
});

it('the stop switch stops the run', async () => {
  house();
  guest();
  mem.seed('config/rentCharges', { paused: true });
  await expect(runRentCharges(MONDAY)).resolves.toEqual({
    houses: 0,
    charged: 0,
    skipped: 0,
    failed: 0,
  });
  expect(charges()).toEqual([]);
});

it("one resident's failure does not stop the others", async () => {
  house();
  guest({ moveInDate: '2026-11-16' }, 'g1');
  guest({ moveInDate: '2026-11-16' }, 'g2');
  const real = charge.chargeResident;
  jest
    .spyOn(charge, 'chargeResident')
    .mockImplementation((id, now) =>
      id === 'g1' ? Promise.reject(new Error('boom')) : real(id, now),
    );
  await expect(runRentCharges(MONDAY)).resolves.toMatchObject({ charged: 1, failed: 1 });
  expect(charges()).toEqual(['rentCharges/g2_2026-11-16']);
});
