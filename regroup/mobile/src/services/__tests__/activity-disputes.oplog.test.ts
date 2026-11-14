/**
 * activity.ts reads-then-writes and disputes against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 2). This file
 * stays byte-identical from Task 2 to the end of Task 10, the modular Firebase
 * migration: a mapping mistake in the rewrite fails here instead of being
 * copied into an edited expectation. Every `exists` read is pinned both ways,
 * because a missed `exists()` call reads as truthy after the migration.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);

import {
  failNext,
  getOpLog,
  readDoc,
  resetOpLog,
  seedDoc,
} from '../../../__mocks__/firebase-modular/log';
import {
  DISPUTED_NOT_DELETABLE,
  NOT_ALLOWED_TO_DECIDE,
  deleteActivity,
  disputeActivity,
  getWeekSummary,
  resolveDispute,
  updateActivity,
  verifyActivity,
} from '../activity';
import { ActivityStatus } from '../../entities/ActivityModel';

const SERVER_TIME = { __fv: 'serverTimestamp' };

function firestoreError(code: string): Error {
  return Object.assign(new Error(`[${code}]`), { code });
}

beforeEach(() => {
  resetOpLog();
});

describe('getWeekSummary', () => {
  it('returns the summary when the doc exists', async () => {
    seedDoc('week-summaries/g1_2026-10-05', { guestId: 'g1', choresCompleted: 2 });

    const summary = await getWeekSummary('g1', '2026-10-05');

    expect(summary).toEqual(expect.objectContaining({ id: 'g1_2026-10-05', choresCompleted: 2 }));
    expect(getOpLog()).toEqual([{ op: 'get', path: 'week-summaries/g1_2026-10-05' }]);
  });

  it('returns null when the doc does not exist', async () => {
    expect(await getWeekSummary('g1', '2026-10-05')).toBeNull();
  });
});

describe('updateActivity', () => {
  it('updates with a server loggedAt when the activity exists', async () => {
    seedDoc('activities/a1', { status: 'active' });

    await updateActivity('a1', { notes: 'x' } as any);

    expect(getOpLog()).toEqual([
      { op: 'get', path: 'activities/a1' },
      { op: 'update', path: 'activities/a1', data: { notes: 'x', loggedAt: SERVER_TIME } },
    ]);
  });

  it('throws Activity not found and writes nothing when it does not exist', async () => {
    await expect(updateActivity('a1', { notes: 'x' } as any)).rejects.toThrow('Activity not found');
    expect(getOpLog().map((e) => e.op)).toEqual(['get']);
  });
});

describe('deleteActivity', () => {
  it('soft-deletes an undisputed activity', async () => {
    seedDoc('activities/a1', { status: 'active' });

    await deleteActivity('a1');

    expect(getOpLog()).toEqual([
      { op: 'get', path: 'activities/a1' },
      { op: 'update', path: 'activities/a1', data: { status: 'deleted', loggedAt: SERVER_TIME } },
    ]);
  });

  it('refuses an activity with dispute history', async () => {
    seedDoc('activities/a1', { status: 'active', disputeReason: 'not done' });

    await expect(deleteActivity('a1')).rejects.toThrow(DISPUTED_NOT_DELETABLE);
    expect(getOpLog().map((e) => e.op)).toEqual(['get']);
  });

  it('throws Activity not found when it does not exist', async () => {
    await expect(deleteActivity('a1')).rejects.toThrow('Activity not found');
    expect(getOpLog().map((e) => e.op)).toEqual(['get']);
  });
});

describe('disputeActivity / verifyActivity', () => {
  it('writes the dispute fields and leaves loggedAt alone', async () => {
    seedDoc('activities/a1', { status: 'active' });

    await disputeActivity('a1', 'not done', 'u2');

    expect(getOpLog()).toEqual([
      {
        op: 'update',
        path: 'activities/a1',
        data: {
          status: 'disputed',
          disputeReason: 'not done',
          disputedBy: 'u2',
          disputeResolvedBy: 'u2',
          disputedAt: SERVER_TIME,
        },
      },
    ]);
  });

  it('verifies with verified and verifiedBy only', async () => {
    seedDoc('activities/a1', { status: 'active' });

    await verifyActivity('a1', 'admin1');

    expect(getOpLog()).toEqual([
      { op: 'update', path: 'activities/a1', data: { verified: true, verifiedBy: 'admin1' } },
    ]);
  });
});

describe('resolveDispute', () => {
  it('approve: reads then writes the incomplete outcome in one transaction', async () => {
    seedDoc('activities/a1', { status: ActivityStatus.DISPUTED });

    await resolveDispute('a1', 'admin1', 'approve');

    expect(getOpLog()).toEqual([
      { op: 'tx.get', path: 'activities/a1' },
      {
        op: 'tx.update',
        path: 'activities/a1',
        data: {
          status: 'resolved',
          disputed: 'successful',
          incomplete: true,
          disputeOutcome: 'incomplete-per-residents',
          disputeResult: 'success',
          disputeResolvedBy: 'admin1',
          disputeResolvedAt: SERVER_TIME,
        },
      },
    ]);
  });

  it('reject: the activity stands, no outcome field', async () => {
    seedDoc('activities/a1', { status: ActivityStatus.DISPUTED });

    await resolveDispute('a1', 'admin1', 'reject');

    expect(getOpLog()[1].data).toEqual({
      status: 'resolved',
      disputed: 'rejected',
      incomplete: false,
      disputeResult: 'fail',
      disputeResolvedBy: 'admin1',
      disputeResolvedAt: SERVER_TIME,
    });
  });

  it('refuses a missing activity', async () => {
    await expect(resolveDispute('a1', 'admin1', 'approve')).rejects.toThrow('Activity not found');
    expect(getOpLog().map((e) => e.op)).toEqual(['tx.get']);
  });

  it('refuses an already resolved dispute', async () => {
    seedDoc('activities/a1', { status: ActivityStatus.RESOLVED });
    await expect(resolveDispute('a1', 'admin1', 'approve')).rejects.toThrow(
      'Dispute already resolved',
    );
    expect(readDoc('activities/a1')).toEqual({ status: 'resolved' });
  });

  it('refuses an activity that is not disputed', async () => {
    seedDoc('activities/a1', { status: ActivityStatus.ACTIVE });
    await expect(resolveDispute('a1', 'admin1', 'reject')).rejects.toThrow(
      'Activity is not disputed',
    );
  });

  it('maps a rules refusal to NOT_ALLOWED_TO_DECIDE', async () => {
    seedDoc('activities/a1', { status: ActivityStatus.DISPUTED });
    failNext('tx.get', firestoreError('firestore/permission-denied'), 'activities/a1');

    await expect(resolveDispute('a1', 'admin1', 'approve')).rejects.toThrow(NOT_ALLOWED_TO_DECIDE);
  });
});
