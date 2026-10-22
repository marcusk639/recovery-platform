/**
 * Tests for the `runWarmWebsite` helper and the `warmWebsite` wrapper.
 */
const mockScheduleOpts: unknown[] = [];
jest.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: jest.fn((opts: unknown, handler: unknown) => {
    mockScheduleOpts.push(opts);
    return handler;
  }),
}));

const mockInfo = jest.fn();
jest.mock('firebase-functions', () => ({
  logger: { info: mockInfo, error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../api/firestore', () => ({
  houseCollection: { get: jest.fn() },
  app: {},
}));

import { runWarmWebsite } from '../../scheduled/warmWebsite';
import { warmWebsite } from '../../scheduled';

describe('runWarmWebsite', () => {
  beforeEach(() => mockInfo.mockClear());

  it('logs the keep-alive ping and resolves', async () => {
    await expect(runWarmWebsite()).resolves.toBeUndefined();
    expect(mockInfo).toHaveBeenCalledWith('warmWebsite: keep-alive ping fired');
  });
});

describe('warmWebsite wrapper', () => {
  it('keeps its schedule config', () => {
    expect(mockScheduleOpts).toContainEqual({ schedule: 'every 5 minutes' });
  });

  it('delegates to the helper', async () => {
    mockInfo.mockClear();
    await (warmWebsite as unknown as (e: unknown) => Promise<void>)({});
    expect(mockInfo).toHaveBeenCalled();
  });
});
