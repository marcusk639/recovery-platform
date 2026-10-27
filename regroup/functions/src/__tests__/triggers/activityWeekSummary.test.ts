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

import { onActivityWritten } from '../../triggers/firestore/activityWeekSummary';
import { syncWeekSummariesForActivityWrite } from '../../activities/syncWeekSummary';

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
