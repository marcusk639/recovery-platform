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

describe('runDisputeUpdates failures', () => {
  beforeEach(() => {
    mockHouseGet.mockReset();
    mockRunDisputeTransaction.mockReset().mockResolvedValue(undefined);
  });

  it('keeps going past a house that fails, then rejects naming it', async () => {
    mockHouseGet.mockResolvedValue({
      docs: [
        houseDoc('h1', { d1: { id: 'd1' } }),
        houseDoc('h2', { bad: { id: 'bad' } }),
        houseDoc('h3', { d3: { id: 'd3' } }),
      ],
    });
    mockRunDisputeTransaction.mockImplementation((_house: unknown, dispute: { id: string }) => {
      if (dispute.id === 'bad') {
        throw new Error('malformed dispute');
      }
      return Promise.resolve();
    });

    await expect(runDisputeUpdates()).rejects.toThrow('updateDisputes: 1 house(s) failed: h2');
    expect(mockRunDisputeTransaction).toHaveBeenCalledWith(expect.anything(), { id: 'd3' });
  });

  it('lets every transaction finish when one rejects, then rejects', async () => {
    let done = false;
    mockHouseGet.mockResolvedValue({
      docs: [houseDoc('h1', { d1: { id: 'd1' }, d2: { id: 'd2' } })],
    });
    mockRunDisputeTransaction.mockRejectedValueOnce(new Error('contention')).mockImplementationOnce(
      () =>
        new Promise<void>((res) =>
          setTimeout(() => {
            done = true;
            res();
          }, 5),
        ),
    );

    await expect(runDisputeUpdates()).rejects.toThrow(
      'updateDisputes: 1 of 2 dispute transactions failed',
    );
    expect(done).toBe(true);
  });

  // The thrown error and the logs are the only record of what to look at.
  it('logs each failed transaction with its house, dispute and error, and names the house', async () => {
    const { logger } = require('firebase-functions');
    mockHouseGet.mockResolvedValue({
      docs: [houseDoc('h1', { d1: { id: 'd1' } }), houseDoc('h2', { d2: { id: 'd2' } })],
    });
    mockRunDisputeTransaction
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('contention'));

    await expect(runDisputeUpdates()).rejects.toThrow(
      'updateDisputes: 1 of 2 dispute transactions failed (houses: h2)',
    );
    expect(logger.error).toHaveBeenCalledWith('updateDisputes: dispute transaction failed', {
      houseId: 'h2',
      disputeId: 'd2',
      error: expect.stringContaining('contention'),
    });
  });

  // firebase-functions logs a plain object's own keys, and an Error's message and
  // stack aren't enumerable, so the error has to be logged as text.
  it('logs the error text when a house fails', async () => {
    const { logger } = require('firebase-functions');
    mockHouseGet.mockResolvedValue({ docs: [houseDoc('h2', { bad: { id: 'bad' } })] });
    mockRunDisputeTransaction.mockImplementation(() => {
      throw new Error('malformed dispute');
    });

    await expect(runDisputeUpdates()).rejects.toThrow();
    expect(logger.error).toHaveBeenCalledWith('updateDisputes: failed processing house', {
      houseId: 'h2',
      error: expect.stringContaining('malformed dispute'),
    });
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

  // Cloud Scheduler sees only the handler, so it must pass the failure on.
  it('rejects when a dispute transaction fails', async () => {
    mockHouseGet.mockResolvedValue({ docs: [houseDoc('h1', { d1: { id: 'd1' } })] });
    mockRunDisputeTransaction.mockReset().mockRejectedValue(new Error('contention'));

    await expect((updateDisputes as unknown as (e: unknown) => Promise<void>)({})).rejects.toThrow(
      'dispute transactions failed',
    );
  });
});
