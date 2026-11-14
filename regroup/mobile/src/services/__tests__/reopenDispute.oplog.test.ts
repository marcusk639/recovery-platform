/**
 * reopenDispute.ts against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 2). This file
 * stays byte-identical from Task 2 to the end of Task 10, the modular Firebase
 * migration. The rules allow a reopen to write exactly these fields, so the
 * transaction's write is pinned whole.
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
import { NOT_ALLOWED_TO_UNDO, reopenDispute } from '../reopenDispute';

const REOPEN = {
  status: 'disputed',
  reopenedBy: 'admin1',
  reopenedAt: { __fv: 'serverTimestamp' },
  disputed: null,
  incomplete: null,
  disputeResult: null,
  disputeOutcome: null,
  disputeResolvedBy: null,
  disputeResolvedAt: null,
};

beforeEach(() => {
  resetOpLog();
});

describe('reopenDispute', () => {
  it('moves a decided dispute back to disputed with exactly the reopen fields', async () => {
    seedDoc('activities/a1', {
      status: 'resolved',
      guestId: 'g1',
      disputed: 'successful',
      incomplete: true,
      disputeResult: 'success',
      disputeOutcome: 'incomplete-per-residents',
      disputeResolvedBy: 'admin2',
      disputeResolvedAt: new Date(1000),
      disputeReason: 'not done',
    });

    await reopenDispute('a1', 'admin1');

    expect(getOpLog()).toEqual([
      { op: 'tx.get', path: 'activities/a1' },
      { op: 'tx.update', path: 'activities/a1', data: REOPEN },
    ]);
    expect(readDoc('activities/a1')).toEqual({
      ...REOPEN,
      reopenedAt: { __serverTimestamp: true },
      guestId: 'g1',
      disputeReason: 'not done',
    });
  });

  it("reopens an older build's delete that upheld the dispute", async () => {
    seedDoc('activities/a1', {
      status: 'deleted',
      disputeResolvedAt: new Date(5000),
      loggedAt: new Date(5000),
    });

    await reopenDispute('a1', 'admin1');

    expect(getOpLog()[1]).toEqual({ op: 'tx.update', path: 'activities/a1', data: REOPEN });
  });

  it('refuses a missing activity', async () => {
    await expect(reopenDispute('a1', 'admin1')).rejects.toThrow('Activity not found');
    expect(getOpLog().map((e) => e.op)).toEqual(['tx.get']);
  });

  it('refuses a dispute that is already open', async () => {
    seedDoc('activities/a1', { status: 'disputed' });
    await expect(reopenDispute('a1', 'admin1')).rejects.toThrow('Dispute already reopened');
    expect(getOpLog().map((e) => e.op)).toEqual(['tx.get']);
  });

  it('refuses an activity with no decision', async () => {
    seedDoc('activities/a1', { status: 'active' });
    await expect(reopenDispute('a1', 'admin1')).rejects.toThrow('No decision to undo');
  });

  it('refuses a plain delete (not an upheld dispute)', async () => {
    seedDoc('activities/a1', {
      status: 'deleted',
      disputeResolvedAt: new Date(5000),
      loggedAt: new Date(6000),
    });
    await expect(reopenDispute('a1', 'admin1')).rejects.toThrow('No decision to undo');
  });

  it('maps a rules refusal to NOT_ALLOWED_TO_UNDO', async () => {
    seedDoc('activities/a1', { status: 'resolved' });
    failNext(
      'tx.get',
      Object.assign(new Error('denied'), { code: 'firestore/permission-denied' }),
      'activities/a1',
    );

    await expect(reopenDispute('a1', 'admin1')).rejects.toThrow(NOT_ALLOWED_TO_UNDO);
  });

  it('maps any other failure to a generic message', async () => {
    seedDoc('activities/a1', { status: 'resolved' });
    failNext('tx.get', new Error('unavailable'), 'activities/a1');

    await expect(reopenDispute('a1', 'admin1')).rejects.toThrow('Failed to undo decision');
  });
});
