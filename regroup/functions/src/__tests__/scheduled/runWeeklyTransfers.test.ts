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
}));

import { runWeeklyTransfers } from '../../scheduled/weeklyTransfers';
import { weeklyTransfers } from '../../scheduled';
import { transferStats } from '../../util/guest';
import { WEEKLY_TRANSFER_TIMEZONES } from '../../util/timezones';

const PASSES = WEEKLY_TRANSFER_TIMEZONES.length + 1;

describe('runWeeklyTransfers', () => {
  beforeEach(() => (transferStats as jest.Mock).mockClear());

  it('runs one pass per timezone plus the fallback', async () => {
    await runWeeklyTransfers(new Date('2026-04-19T08:00:00Z'));

    expect(transferStats).toHaveBeenCalledTimes(PASSES);
    expect(transferStats).toHaveBeenCalledWith(null, null);
  });

  it('defaults now and sums transferred guests', async () => {
    (transferStats as jest.Mock).mockResolvedValue({ a: 1, b: 2 });

    const result = await runWeeklyTransfers();

    expect(result).toEqual({ transfers: 2 * PASSES });
    (transferStats as jest.Mock).mockResolvedValue({});
  });

  it('continues after a failing pass', async () => {
    (transferStats as jest.Mock).mockRejectedValueOnce(new Error('boom')).mockResolvedValue({});

    await expect(runWeeklyTransfers()).resolves.toEqual({ transfers: 0 });
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
});
