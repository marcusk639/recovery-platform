/**
 * reopenDispute: undo a dispute decision (owner decision). In a transaction:
 * only a decided dispute (or an older build's "delete") reopens, writing
 * exactly what the rules allow; a second admin's reopen is refused clearly.
 */

const mockTx = { get: jest.fn(), update: jest.fn() };
const mockRef = { id: 'act-1' };

jest.mock('../../../firebase-setup', () => ({
  firestore: {
    collection: jest.fn(() => ({ doc: jest.fn(() => mockRef) })),
    runTransaction: jest.fn(async (fn: any) => fn(mockTx)),
  },
}));
// The modular functions delegate to the firebase-setup mock above
// (namespaced-adapter), so these cases drive the same collection/transaction.
jest.mock('@react-native-firebase/firestore', () => ({
  ...require('../../../__mocks__/firebase-modular/namespaced-adapter'),
  serverTimestamp: () => '__SERVER_TIME__',
  FieldValue: { serverTimestamp: () => '__SERVER_TIME__' },
}));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { firestore } from '../../../firebase-setup';
import { reopenDispute, REOPEN_REFUSALS } from '../reopenDispute';
import { logException } from '../../util/logging';
import { ActivityStatus } from '../../entities/ActivityModel';

const seed = (data: Record<string, unknown> | undefined) =>
  mockTx.get.mockResolvedValue({ exists: () => data !== undefined, data: () => data });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('reopenDispute', () => {
  it.each([
    ['an approval', { status: 'resolved', disputed: 'successful', incomplete: true }],
    ['a rejection', { status: 'resolved', disputed: 'rejected', incomplete: false }],
    ["an older build's keep", { status: 'resolved', disputeResolvedBy: 'mgr' }],
    [
      "an older build's delete",
      {
        status: 'deleted',
        disputeResolvedAt: '2026-01-15T10:00:00.000Z',
        loggedAt: '2026-01-15T10:00:00.000Z',
      },
    ],
  ])(
    'reopens %s: pending again, decision cleared, reopener and server time recorded',
    async (_l, data) => {
      seed(data);
      await reopenDispute('act-1', 'mgr-1');

      expect(firestore.collection).toHaveBeenCalledWith('activities');
      expect(firestore.runTransaction).toHaveBeenCalledTimes(1);
      expect(mockTx.update).toHaveBeenCalledWith(mockRef, {
        status: ActivityStatus.DISPUTED,
        reopenedBy: 'mgr-1',
        reopenedAt: '__SERVER_TIME__',
        disputed: null,
        incomplete: null,
        disputeResult: null,
        disputeOutcome: null,
        disputeResolvedBy: null,
        disputeResolvedAt: null,
      });
    },
  );

  it('refuses a dispute already reopened (a second admin, or a double tap)', async () => {
    seed({ status: 'disputed', reopenedBy: 'mgr-2' });
    await expect(reopenDispute('act-1', 'mgr-1')).rejects.toThrow('Dispute already reopened');
    expect(mockTx.update).not.toHaveBeenCalled();
  });

  it('refuses an activity with no decision, or a plain deletion', async () => {
    for (const data of [
      { status: 'active' },
      { status: 'deleted', loggedAt: '2026-01-15T10:00:00.000Z' },
    ]) {
      seed(data);
      await expect(reopenDispute('act-1', 'mgr-1')).rejects.toThrow('No decision to undo');
    }
    seed(undefined);
    await expect(reopenDispute('act-1', 'mgr-1')).rejects.toThrow('Activity not found');
    expect(mockTx.update).not.toHaveBeenCalled();
    expect(REOPEN_REFUSALS).toHaveLength(4);
  });

  it('1: a rules refusal (own activity, logger, or decision not logged yet) gets its own message', async () => {
    (logException as jest.Mock).mockClear();
    seed({ status: 'resolved', disputed: 'rejected' });
    (firestore.runTransaction as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('denied'), { code: 'firestore/permission-denied' }),
    );
    await expect(reopenDispute('act-1', 'mgr-1')).rejects.toThrow(
      'Not allowed to undo this decision',
    );
    expect(logException).toHaveBeenCalled();
  });

  it('reports any other failure generically', async () => {
    seed({ status: 'resolved', disputed: 'rejected' });
    (firestore.runTransaction as jest.Mock).mockRejectedValueOnce(new Error('permission-denied'));
    await expect(reopenDispute('act-1', 'mgr-1')).rejects.toThrow('Failed to undo decision');
    expect(logException).toHaveBeenCalled();
  });
});
