import { makeDirectoryDb } from '../../triggers/testing/directoryDbMock';
import type { SweepResult } from './meetingSweep';
import { MeetingGuideAccessError, runMeetingSync } from './meetingSync';

const sweepAborted = (aborted: SweepResult['aborted']): SweepResult => ({
  meetings: [],
  baseCells: 10,
  requests: 50,
  cappedResponses: 50,
  failedBaseCells: 0,
  unresolvedSpots: [],
  droppedNonUs: 0,
  rateLimited: 0,
  aborted,
});

function runWith(aborted: SweepResult['aborted']) {
  const seed = { 'directoryMeetings/a': { source: 'external', provider: 'AA', externalId: '1' } };
  const { db, store } = makeDirectoryDb(seed);
  const snapshot = new Map(store);
  const run = runMeetingSync({
    db,
    now: () => new Date('2026-11-08T12:00:00Z'),
    apply: true,
    sweep: async () => sweepAborted(aborted),
  });
  return { run, store, snapshot };
}

describe('runMeetingSync on a sweep that ran out of budget', () => {
  it('leaves the directory untouched, because the sweep is known to be incomplete', async () => {
    const { run, store, snapshot } = runWith('budget');
    await expect(run).rejects.toThrow(/request budget/);
    expect(store).toEqual(snapshot);
  });
});

describe('runMeetingSync when Meeting Guide refuses access', () => {
  it('raises an access error naming the key to replace, and changes nothing', async () => {
    const { run, store, snapshot } = runWith('unauthorized');
    await expect(run).rejects.toThrow(MeetingGuideAccessError);
    await expect(run).rejects.toThrow(/MEETING_GUIDE_API_KEY/);
    expect(store).toEqual(snapshot);
  });

  it('raises an access error when the API stops answering, and changes nothing', async () => {
    const { run, store, snapshot } = runWith('unanswered');
    await expect(run).rejects.toThrow(MeetingGuideAccessError);
    await expect(run).rejects.toThrow(/stopped answering/);
    expect(store).toEqual(snapshot);
  });
});
