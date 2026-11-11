/**
 * Tests for the `runWeeklyTransfers` helper and the `weeklyTransfers` wrapper.
 */
const mockScheduleOpts: unknown[] = [];
jest.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: jest.fn((opts: unknown, handler: unknown) => {
    mockScheduleOpts.push(opts);
    return handler;
  }),
}));

jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../api/firestore', () => ({
  houseCollection: { get: jest.fn() },
  app: {},
}));

jest.mock('../../util/guest', () => ({
  transferStats: jest.fn(async () => ({})),
  getFailedTransfers: jest.fn(() => []),
  getFailedHouses: jest.fn(() => []),
}));

import { runWeeklyTransfers } from '../../scheduled/weeklyTransfers';
import { weeklyTransfers } from '../../scheduled';
import { getFailedHouses, getFailedTransfers, transferStats } from '../../util/guest';
import { WEEKLY_TRANSFER_TIMEZONES } from '../../util/timezones';

const PASSES = WEEKLY_TRANSFER_TIMEZONES.length + 1;

// Like the real module, each transferStats call replaces what the getters return
// with that pass's leftovers, so reading them before the pass sees the wrong one.
type Leftovers = { residents?: number; houses?: string[] };
let lastPass: Leftovers = {};
const passLeavesBehind = (byTimezone: Record<string, Leftovers>) =>
  (transferStats as jest.Mock).mockImplementation(async (_c: unknown, tz: string | null) => {
    lastPass = byTimezone[String(tz)] ?? {};
    return {};
  });

beforeEach(() => {
  lastPass = {};
  (transferStats as jest.Mock).mockReset().mockResolvedValue({});
  (getFailedTransfers as jest.Mock).mockImplementation(() =>
    Array.from({ length: lastPass.residents ?? 0 }, (_, i) => ({ guestId: `g${i}` })),
  );
  (getFailedHouses as jest.Mock).mockImplementation(() => lastPass.houses ?? []);
});

describe('runWeeklyTransfers', () => {
  it('runs one pass per timezone plus the fallback', async () => {
    await runWeeklyTransfers(new Date('2026-04-19T08:00:00Z'));

    expect(transferStats).toHaveBeenCalledTimes(PASSES);
    expect(transferStats).toHaveBeenCalledWith(null, null);
  });

  it('defaults now and sums transferred guests', async () => {
    (transferStats as jest.Mock).mockResolvedValue({ a: 1, b: 2 });

    const result = await runWeeklyTransfers();

    expect(result).toEqual({ transfers: 2 * PASSES });
  });

  // transferStats catches a failing house or resident so the rest still roll over to
  // the new week; the run must still fail, or Cloud Scheduler records a success.
  it('fails the run when a pass left residents or houses behind', async () => {
    passLeavesBehind({
      [WEEKLY_TRANSFER_TIMEZONES[0]]: { residents: 1 },
      [WEEKLY_TRANSFER_TIMEZONES[1]]: { houses: ['h2'] },
    });

    await expect(runWeeklyTransfers()).rejects.toThrow(
      `weeklyTransfers: 2 of ${PASSES} passes failed: ` +
        `${WEEKLY_TRANSFER_TIMEZONES[0]} (1 resident(s), 0 house(s)), ` +
        `${WEEKLY_TRANSFER_TIMEZONES[1]} (0 resident(s), 1 house(s))`,
    );
    expect(transferStats).toHaveBeenCalledTimes(PASSES);
  });

  it('fails the run when only the fallback pass left residents behind', async () => {
    passLeavesBehind({ null: { residents: 2 } });

    await expect(runWeeklyTransfers()).rejects.toThrow(
      `weeklyTransfers: 1 of ${PASSES} passes failed: <fallback> (2 resident(s), 0 house(s))`,
    );
  });

  // A pass that throws is caught so the other timezones still roll over, but the run
  // must still fail, or Cloud Scheduler records a success for weeks that didn't advance.
  it('runs every pass after one fails, then rejects naming the failed timezone', async () => {
    (transferStats as jest.Mock).mockRejectedValueOnce(new Error('boom')).mockResolvedValue({});

    await expect(runWeeklyTransfers()).rejects.toThrow(
      `weeklyTransfers: 1 of ${PASSES} passes failed: ${WEEKLY_TRANSFER_TIMEZONES[0]}`,
    );
    expect(transferStats).toHaveBeenCalledTimes(PASSES);
  });

  it('rejects when every pass fails, naming the fallback pass too', async () => {
    (transferStats as jest.Mock).mockRejectedValue(new Error('boom'));

    await expect(runWeeklyTransfers()).rejects.toThrow(
      new RegExp(`^weeklyTransfers: ${PASSES} of ${PASSES} passes failed: .*<fallback>$`),
    );
    expect(transferStats).toHaveBeenCalledTimes(PASSES);
  });
});

describe('weeklyTransfers wrapper', () => {
  it('keeps its schedule config', () => {
    expect(mockScheduleOpts).toContainEqual({
      schedule: '0 8 * * 0',
      timeZone: 'UTC',
    });
  });

  it('delegates to the helper', async () => {
    (transferStats as jest.Mock).mockClear();
    await (weeklyTransfers as unknown as (e: unknown) => Promise<void>)({
      scheduleTime: '2026-04-19T08:00:00Z',
    });
    expect(transferStats).toHaveBeenCalledTimes(PASSES);
  });

  it('still runs every pass when scheduleTime is missing', async () => {
    (transferStats as jest.Mock).mockClear();
    await (weeklyTransfers as unknown as (e: unknown) => Promise<void>)({});
    expect(transferStats).toHaveBeenCalledTimes(PASSES);
  });

  it('does not throw on an invalid date', async () => {
    (transferStats as jest.Mock).mockClear();
    await expect(runWeeklyTransfers(new Date('nope'))).resolves.toBeDefined();
    expect(transferStats).toHaveBeenCalledTimes(PASSES);
  });
});
