// The house trigger that records the day rent charging turned on, against an
// in-memory store. The stamp lives in server-only rentHouseStates/{houseId}, never
// on the house doc, so the app's whole-house writes can't trip over it. It decides
// from the current house doc, not the event.

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
const stamp = { startDate: '2026-11-01', startedAtMs: 42 };
const state = () => mem.get(`rentHouseStates/${H}`);
const seedStamp = () => mem.seed(`rentHouseStates/${H}`, stamp);

beforeEach(() => {
  mem.reset();
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
});
afterEach(() => jest.useRealTimers());

it('turning weekly on stamps today in the house zone', async () => {
  mem.seed(`houses/${H}`, on);
  await run(event(off, on));
  expect(state()).toMatchObject({ startDate: '2026-11-09', startedAtMs: NOW.getTime() });
});

it('a retried event stamps the time the change happened, not the retry', async () => {
  mem.seed(`houses/${H}`, on);
  const changedAt = '2026-11-09T20:00:00.000Z'; // 14:00 in Chicago
  await run({ ...event(off, on), time: changedAt });
  expect(state()).toMatchObject({ startDate: '2026-11-09', startedAtMs: Date.parse(changedAt) });
});

// On (Nov 9 14:00, retried), off (cleared Nov 9 20:00), back on: the retry of the
// first 'on' lands before the second 'on' is processed. Its event time is older than
// the clear, so it must not date the start back over the time charging was off.
it("a retried 'on' older than the last clear stamps the current time, not its own", async () => {
  mem.seed(`houses/${H}`, on);
  mem.seed(`rentHouseStates/${H}`, {
    startDate: null,
    startedAtMs: null,
    clearedAtMs: Date.parse('2026-11-10T02:00:00.000Z'),
  });
  await run({ ...event(off, on), time: '2026-11-09T20:00:00.000Z' });
  expect(state()).toMatchObject({ startDate: '2026-11-09', startedAtMs: NOW.getTime() });
});

it("an 'on' after the last clear still stamps its own time", async () => {
  mem.seed(`houses/${H}`, on);
  mem.seed(`rentHouseStates/${H}`, {
    startDate: null,
    startedAtMs: null,
    clearedAtMs: Date.parse('2026-11-09T18:00:00.000Z'),
  });
  const changedAt = '2026-11-09T20:00:00.000Z';
  await run({ ...event(off, on), time: changedAt });
  expect(state()).toMatchObject({ startedAtMs: Date.parse(changedAt) });
});

it('turning off records when it was cleared', async () => {
  mem.seed(`houses/${H}`, off);
  seedStamp();
  await run(event(on, off));
  expect(state()).toMatchObject({ startDate: null, clearedAtMs: NOW.getTime() });
});

it('a late event that did not itself turn charging on stamps the current time', async () => {
  // A timezone edit made while charging was off, delivered after charging came on.
  mem.seed(`houses/${H}`, on);
  await run({
    ...event(off, { ...off, timezone: 'America/Denver' }),
    time: '2026-11-01T12:00:00.000Z',
  });
  expect(state()).toMatchObject({ startDate: '2026-11-09', startedAtMs: NOW.getTime() });
});

it('the trigger never writes the house doc', async () => {
  mem.seed(`houses/${H}`, on);
  await run(event(off, on));
  expect(mem.writes.filter((w) => w.path.startsWith('houses/'))).toEqual([]);
});

it('a house created with charging on is stamped', async () => {
  mem.seed(`houses/${H}`, on);
  await run(event(undefined, on));
  expect(state()?.startDate).toBe('2026-11-09');
});

it('turning off clears the stamp', async () => {
  mem.seed(`houses/${H}`, off);
  seedStamp();
  await run(event(on, off));
  expect(state()).toMatchObject({ startDate: null, startedAtMs: null });
});

it('a price change while on keeps the stamp', async () => {
  const after = { ...on, weeklyRent: 200 };
  mem.seed(`houses/${H}`, after);
  seedStamp();
  await run(event(on, after));
  expect(state()).toMatchObject(stamp);
});

it('a schedule switch while on keeps the stamp', async () => {
  const after = { ...on, rentFrequency: 'monthly' };
  mem.seed(`houses/${H}`, after);
  seedStamp();
  await run(event(on, after));
  expect(state()).toMatchObject(stamp);
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
  mem.seed(`houses/${H}`, on);
  seedStamp();
  await run(event(on, off));
  expect(state()).toMatchObject(stamp);
});

it("'both' never stamps", async () => {
  mem.seed(`houses/${H}`, off);
  await run(event({ ...off, weeklyRent: 100 }, off));
  expect(state()).toBeUndefined();
});

it('a price above the limit is off and never stamps', async () => {
  mem.seed(`houses/${H}`, { ...on, weeklyRent: 17500 });
  await expect(syncRentChargeStart(H, NOW)).resolves.toBe('unchanged');
  expect(state()).toBeUndefined();
});

it('an Oxford house never stamps: its dues are the equal expense share', async () => {
  mem.seed(`houses/${H}`, { ...on, houseType: 'oxford' });
  await expect(syncRentChargeStart(H, NOW)).resolves.toBe('unchanged');
  expect(state()).toBeUndefined();
});

it('syncRentChargeStart reports what it did', async () => {
  mem.seed(`houses/${H}`, on);
  await expect(syncRentChargeStart(H, NOW)).resolves.toBe('stamped');
  await expect(syncRentChargeStart(H, NOW)).resolves.toBe('unchanged');
  mem.seed(`houses/${H}`, off);
  await expect(syncRentChargeStart(H, NOW)).resolves.toBe('cleared');
});
