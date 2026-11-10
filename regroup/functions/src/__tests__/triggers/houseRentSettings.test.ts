// The house trigger that records the day rent charging turned on, against an
// in-memory store. It decides from the current house doc, not the event.

jest.mock('firebase-functions/v2', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_opts: unknown, handler: unknown) => handler,
}));
jest.mock('../../api/firestore', () => require('../helpers/memFirestore').apiFirestore);

import { mem, memDb } from '../helpers/memFirestore';
import {
  onHouseRentSettingsWrite,
  syncRentChargeStart,
} from '../../triggers/firestore/houseRentSettings';

type Data = Record<string, unknown>;
const run = onHouseRentSettingsWrite as unknown as (e: unknown) => Promise<void>;
const H = 'h1';
const NOW = new Date('2026-11-10T04:30:00Z'); // Nov 9, 22:30 in Chicago

const event = (before: Data | undefined, after: Data | undefined) => ({
  params: { houseId: H },
  data: {
    before: { exists: !!before, data: () => before },
    after: { exists: !!after, data: () => after },
  },
});
const off: Data = {
  rentFrequency: 'both',
  weeklyRent: 175,
  monthlyRent: 800,
  timezone: 'America/Chicago',
};
const on: Data = { ...off, rentFrequency: 'weekly' };
const stamp = { rentChargesStartDate: '2026-11-01', rentChargesStartedAtMs: 42 };
const stored = () => mem.get(`houses/${H}`);

beforeEach(() => {
  mem.reset();
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
});
afterEach(() => jest.useRealTimers());

it('turning weekly on stamps today in the house zone', async () => {
  mem.seed(`houses/${H}`, on);
  await run(event(off, on));
  expect(stored()).toMatchObject({
    rentChargesStartDate: '2026-11-09',
    rentChargesStartedAtMs: NOW.getTime(),
  });
});

it('a house created with charging on is stamped', async () => {
  mem.seed(`houses/${H}`, on);
  await run(event(undefined, on));
  expect(stored()?.rentChargesStartDate).toBe('2026-11-09');
});

it('turning off clears the stamp', async () => {
  const after = { ...off, ...stamp };
  mem.seed(`houses/${H}`, after);
  await run(event({ ...on, ...stamp }, after));
  expect(stored()).toMatchObject({ rentChargesStartDate: null, rentChargesStartedAtMs: null });
});

it('a price change while on keeps the stamp', async () => {
  const after = { ...on, ...stamp, weeklyRent: 200 };
  mem.seed(`houses/${H}`, after);
  await run(event({ ...on, ...stamp }, after));
  expect(stored()).toMatchObject(stamp);
});

it('a schedule switch while on keeps the stamp', async () => {
  const after = { ...on, ...stamp, rentFrequency: 'monthly' };
  mem.seed(`houses/${H}`, after);
  await run(event({ ...on, ...stamp }, after));
  expect(stored()).toMatchObject(stamp);
});

it('a write that changes no rent field does no reads', async () => {
  mem.seed(`houses/${H}`, on);
  const tx = jest.spyOn(memDb, 'runTransaction');
  await run(event({ ...on, health: 1 }, { ...on, health: 2 }));
  expect(tx).not.toHaveBeenCalled();
  expect(mem.writes).toEqual([]);
  tx.mockRestore();
});

it('a deleted house does nothing', async () => {
  const tx = jest.spyOn(memDb, 'runTransaction');
  await run(event(on, undefined));
  expect(tx).not.toHaveBeenCalled();
  tx.mockRestore();
});

it('events out of order converge', async () => {
  // The house went off then back on; the "off" event is delivered last.
  mem.seed(`houses/${H}`, { ...on, ...stamp });
  await run(event({ ...on, ...stamp }, off));
  expect(stored()).toMatchObject(stamp);
});

it("'both' never stamps", async () => {
  mem.seed(`houses/${H}`, off);
  await run(event({ ...off, weeklyRent: 100 }, off));
  expect(stored()?.rentChargesStartDate).toBeUndefined();
});

it('a price above the limit is off and never stamps', async () => {
  const after = { ...on, weeklyRent: 17500 };
  mem.seed(`houses/${H}`, after);
  await expect(syncRentChargeStart(H, NOW)).resolves.toBe('unchanged');
  expect(stored()?.rentChargesStartDate).toBeUndefined();
});

it('syncRentChargeStart reports what it did', async () => {
  mem.seed(`houses/${H}`, on);
  await expect(syncRentChargeStart(H, NOW)).resolves.toBe('stamped');
  await expect(syncRentChargeStart(H, NOW)).resolves.toBe('unchanged');
  mem.seed(`houses/${H}`, { ...off, ...stamp });
  await expect(syncRentChargeStart(H, NOW)).resolves.toBe('cleared');
});
