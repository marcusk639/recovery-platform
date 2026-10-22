/**
 * Tests for the `runDisputeUpdates` helper and the `updateDisputes` wrapper.
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

const mockHouseGet = jest.fn();
jest.mock('../../api/firestore', () => ({
  houseCollection: { get: mockHouseGet },
  app: {},
}));

const mockRunDisputeTransaction = jest.fn();
jest.mock('../../util/disputes', () => ({
  runDisputeTransaction: mockRunDisputeTransaction,
}));

import { runDisputeUpdates } from '../../scheduled/disputeUpdates';
import { updateDisputes } from '../../scheduled';

const houseDoc = (id: string, disputes: Record<string, unknown>) => ({
  id,
  data: () => ({ disputes }),
});

describe('runDisputeUpdates', () => {
  beforeEach(() => {
    mockHouseGet.mockReset();
    mockRunDisputeTransaction.mockReset().mockResolvedValue(undefined);
  });

  it('runs a dispute transaction per dispute and reports the count', async () => {
    mockHouseGet.mockResolvedValue({
      docs: [
        houseDoc('h1', { d1: { id: 'd1' } }),
        houseDoc('h2', { d2: { id: 'd2' }, d3: { id: 'd3' } }),
      ],
    });

    const result = await runDisputeUpdates();

    expect(result).toEqual({ updated: 3 });
    expect(mockRunDisputeTransaction).toHaveBeenCalledTimes(3);
  });

  it('returns zero when there are no houses', async () => {
    mockHouseGet.mockResolvedValue({ docs: [] });
    expect(await runDisputeUpdates()).toEqual({ updated: 0 });
  });

  it('awaits all transactions before resolving', async () => {
    let done = false;
    mockHouseGet.mockResolvedValue({
      docs: [houseDoc('h1', { d1: { id: 'd1' } })],
    });
    mockRunDisputeTransaction.mockImplementation(
      () =>
        new Promise<void>((res) =>
          setTimeout(() => {
            done = true;
            res();
          }, 5),
        ),
    );

    await runDisputeUpdates();

    expect(done).toBe(true);
  });
});

describe('updateDisputes wrapper', () => {
  it('keeps its schedule config', () => {
    expect(mockScheduleOpts).toContainEqual({ schedule: '0 2 * * *' });
  });

  it('delegates to the helper', async () => {
    mockHouseGet.mockResolvedValue({ docs: [] });
    await (updateDisputes as unknown as (e: unknown) => Promise<void>)({});
    expect(mockHouseGet).toHaveBeenCalled();
  });
});
