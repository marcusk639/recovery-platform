// src/__tests__/triggers/activityWeekSummary.test.ts
//
// Wiring of the onActivityWritten trigger: which document it listens on,
// that it retries, and that it hands the event's before/after payloads to the
// recompute (covered in __tests__/activities/syncWeekSummary.test.ts).

jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: jest.fn((options: unknown, handler: unknown) => ({ options, handler })),
  onDocumentCreated: jest.fn(() => ({})),
  onDocumentUpdated: jest.fn(() => ({})),
  onDocumentDeleted: jest.fn(() => ({})),
}));
jest.mock('../../api/firestore', () => ({ ratsFirestore: { name: 'rats-db' } }));
jest.mock('../../activities/syncWeekSummary', () => ({
  syncWeekSummariesForActivityWrite: jest.fn(async () => ({ recomputed: [] })),
}));
jest.mock('../../activities/disputeNotifications', () => ({
  notifyDispute: jest.fn(async () => ({ recipients: [] })),
}));
jest.mock('../../activities/houseDisputeMirror', () => ({
  mirrorHouseDispute: jest.fn(async () => ({ added: 0, removed: 0 })),
}));
jest.mock('../../activities/residentStamp', () => ({
  stampResidentUid: jest.fn(async () => 'unchanged'),
}));
jest.mock('../../activities/selfDecisionCheck', () => ({
  flagSelfDecision: jest.fn(async () => false),
}));

import { onActivityWritten } from '../../triggers/firestore/activityWeekSummary';
import { syncWeekSummariesForActivityWrite } from '../../activities/syncWeekSummary';
import { notifyDispute } from '../../activities/disputeNotifications';
import { mirrorHouseDispute } from '../../activities/houseDisputeMirror';
import { stampResidentUid } from '../../activities/residentStamp';
import { flagSelfDecision } from '../../activities/selfDecisionCheck';

const trigger = onActivityWritten as unknown as {
  options: { document: string; retry: boolean };
  handler: (event: unknown) => Promise<void>;
};

const snap = (data: Record<string, unknown> | undefined) => ({ data: () => data });

describe('onActivityWritten', () => {
  it('listens on every write to activities/{activityId} and retries on failure', () => {
    expect(trigger.options).toEqual({ document: 'activities/{activityId}', retry: true });
  });

  it('passes the activity id and both versions to the recompute', async () => {
    const before = { status: 'active' };
    const after = { status: 'deleted' };
    await trigger.handler({
      params: { activityId: 'a1' },
      data: { before: snap(before), after: snap(after) },
    });
    expect(syncWeekSummariesForActivityWrite).toHaveBeenCalledWith(
      { name: 'rats-db' },
      'a1',
      before,
      after,
    );
  });

  it('passes undefined for the side that does not exist on a create', async () => {
    const after = { status: 'active' };
    await trigger.handler({
      params: { activityId: 'a2' },
      data: { before: snap(undefined), after: snap(after) },
    });
    expect(syncWeekSummariesForActivityWrite).toHaveBeenCalledWith(
      { name: 'rats-db' },
      'a2',
      undefined,
      after,
    );
  });

  it('propagates a recompute failure so the event is redelivered', async () => {
    (syncWeekSummariesForActivityWrite as jest.Mock).mockRejectedValueOnce(new Error('aborted'));
    await expect(
      trigger.handler({
        params: { activityId: 'a3' },
        data: { before: snap(undefined), after: snap({}) },
      }),
    ).rejects.toThrow('aborted');
  });

  it('runs the notifier and the house mirror with the event id and time', async () => {
    const before = { status: 'active' };
    const after = { status: 'disputed', disputedBy: 'peer-uid' };
    await trigger.handler({
      id: 'evt-9',
      time: '2026-01-15T12:00:00.000Z',
      params: { activityId: 'a9' },
      data: { before: snap(before), after: snap(after) },
    });
    expect(notifyDispute).toHaveBeenCalledWith({ name: 'rats-db' }, 'evt-9', 'a9', before, after);
    expect(mirrorHouseDispute).toHaveBeenCalledWith({ name: 'rats-db' }, 'a9', before, after, {
      now: '2026-01-15T12:00:00.000Z',
    });
  });

  it('stamps residentUid on every write (the stamp itself skips writes that need none)', async () => {
    const after = { status: 'active', guestId: 'g1' };
    await trigger.handler({
      id: 'e',
      params: { activityId: 'a11' },
      data: { before: snap(undefined), after: snap(after) },
    });
    expect(stampResidentUid).toHaveBeenCalledWith({ name: 'rats-db' }, 'a11', undefined, after);
    expect(flagSelfDecision).toHaveBeenCalledWith({ name: 'rats-db' }, 'a11', undefined, after, {
      now: undefined,
    });
  });

  it('takes no decision from the event auth context (authId is not documented as the uid)', async () => {
    await trigger.handler({
      id: 'evt-10',
      authType: 'unknown',
      authId: 'someone-else',
      params: { activityId: 'a10' },
      data: { before: snap({ status: 'active' }), after: snap({ status: 'disputed' }) },
    });
    expect((notifyDispute as jest.Mock).mock.calls[0]).toHaveLength(5);
    expect(JSON.stringify((mirrorHouseDispute as jest.Mock).mock.calls[0])).not.toContain(
      'someone-else',
    );
  });

  it('still recomputes when notifying fails, then fails the event so it retries', async () => {
    (notifyDispute as jest.Mock).mockRejectedValueOnce(new Error('notify down'));
    await expect(
      trigger.handler({
        id: 'e',
        params: { activityId: 'a10' },
        data: { before: snap(undefined), after: snap({}) },
      }),
    ).rejects.toThrow('notify down');
    expect(syncWeekSummariesForActivityWrite).toHaveBeenCalledWith(
      { name: 'rats-db' },
      'a10',
      undefined,
      {},
    );
  });

  it('is exported from the triggers index so it deploys', () => {
    jest.isolateModules(() => {
      jest.doMock('firebase-admin', () => ({
        initializeApp: jest.fn(),
        firestore: jest.fn(() => ({ collection: jest.fn() })),
        auth: jest.fn(),
        apps: [{}],
      }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const triggers = require('../../triggers/firestore');
      expect(triggers.onActivityWritten).toBeDefined();
    });
  });
});
