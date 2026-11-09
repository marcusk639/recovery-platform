import { makeDirectoryDb } from '../../triggers/testing/directoryDbMock';
import { runMeetingSync } from './meetingSync';

describe('runMeetingSync on a sweep that ran out of budget', () => {
  it('leaves the directory untouched, because the sweep is known to be incomplete', async () => {
    const seed = { 'directoryMeetings/a': { source: 'external', provider: 'AA', externalId: '1' } };
    const { db, store } = makeDirectoryDb(seed);
    const snapshot = new Map(store);
    await expect(
      runMeetingSync({
        db,
        now: () => new Date('2026-11-08T12:00:00Z'),
        apply: true,
        sweep: async () => ({
          meetings: [],
          baseCells: 10,
          requests: 50,
          cappedResponses: 50,
          failedBaseCells: 0,
          unresolvedCells: 0,
          droppedNonUs: 0,
          rateLimited: 0,
          aborted: 'budget',
        }),
      }),
    ).rejects.toThrow(/request budget/);
    expect(store).toEqual(snapshot);
  });
});
