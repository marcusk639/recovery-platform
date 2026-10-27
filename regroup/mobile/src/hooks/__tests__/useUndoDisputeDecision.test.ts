/**
 * "Undo decision" (owner decision: "Add a way to undo dispute decisions. The
 * dispute should stay alive and approve and reject should show as options
 * again.").
 *
 * - useUndoDisputeDecision: a confirm dialog, then reopenDispute; refusals
 *   shown as-is, anything else as a generic failure.
 * - useBaseActivityScreen: UNDO DECISION on a decided dispute on the Disputes
 *   screen, for house admins who are not the activity's resident; once
 *   reopened (pending), APPROVE and REJECT show again.
 */

import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { UNDO_DECISION_MESSAGE, useUndoDisputeDecision } from '../useUndoDisputeDecision';
import { useBaseActivityScreen } from '../useBaseActivityScreen';
import { reopenDispute } from '../../services/reopenDispute';
import { logException } from '../../util/logging';
import { ActivityType, ActivityStatus } from '../../entities/ActivityModel';

jest.mock('../../services/reopenDispute', () => ({
  reopenDispute: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../services/activity', () => ({
  disputeActivity: jest.fn(() => Promise.resolve()),
  resolveDispute: jest.fn(() => Promise.resolve()),
  verifyActivity: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../state/queries/disputeQueries', () => ({
  useUpdateDispute: () => ({ mutateAsync: jest.fn(), isLoading: false }),
}));
jest.mock('../../firebase-setup', () => ({
  firestore: { collection: jest.fn(() => ({ doc: jest.fn(() => ({})) })) },
  functions: { httpsCallable: jest.fn() },
}));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));
jest.mock('../../util/guest', () => ({
  filterActivities: jest.fn((activities: any[]) => activities),
}));

const ADMIN = { role: { 'house-1': 'admin' } } as any;
const OWNER = { role: { 'house-1': 'superAdmin' } } as any;
const RESIDENT = { role: { 'house-1': 'guest' } } as any;

const activity = (overrides: Record<string, any> = {}) =>
  ({
    id: 'act-1',
    guestId: 'guest-1',
    houseId: 'house-1',
    type: ActivityType.CHORE,
    timestamp: new Date().toISOString(),
    loggedAt: new Date().toISOString(),
    loggedBy: 'resident-1',
    residentUid: 'resident-1',
    verified: false,
    status: ActivityStatus.RESOLVED,
    disputed: 'successful',
    incomplete: true,
    data: { type: 'chore', choreType: 'daily', choreName: 'Kitchen' },
    ...overrides,
  } as any);

const screenProps = (userId = 'mgr-1') =>
  ({
    house: { id: 'house-1', name: 'H', disputes: {} },
    user: { id: userId },
    guests: { 'guest-1': { id: 'guest-1', userId: 'resident-1' } },
    activities: [],
    disputes: {},
    admins: {},
  } as any);

/** Press the dialog button titled `text` in the last Alert.alert call. */
const press = (spy: jest.SpyInstance, text: string) => {
  const buttons = spy.mock.calls[spy.mock.calls.length - 1][2] as Array<{
    text: string;
    onPress?: () => unknown;
  }>;
  return buttons.find((b) => b.text === text)?.onPress?.();
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useUndoDisputeDecision', () => {
  it('asks to confirm with the owner wording, then reopens as the admin', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { result } = renderHook(() => useUndoDisputeDecision('mgr-1'));

    act(() => result.current.undoDecision(activity()));
    expect(alert).toHaveBeenCalledWith('Undo decision?', UNDO_DECISION_MESSAGE, expect.any(Array));
    expect(UNDO_DECISION_MESSAGE).toBe(
      'This reopens the dispute. The activity will count while the dispute is pending, and you can approve or reject it again.',
    );
    expect(reopenDispute).not.toHaveBeenCalled();

    await act(async () => {
      await press(alert, 'Undo decision');
    });
    expect(reopenDispute).toHaveBeenCalledWith('act-1', 'mgr-1');
  });

  it('Cancel changes nothing', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { result } = renderHook(() => useUndoDisputeDecision('mgr-1'));
    act(() => result.current.undoDecision(activity()));
    press(alert, 'Cancel');
    expect(reopenDispute).not.toHaveBeenCalled();
  });

  it("shows a second admin's concurrent reopen clearly, and anything else as a generic failure", async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { result } = renderHook(() => useUndoDisputeDecision('mgr-1'));

    (reopenDispute as jest.Mock).mockRejectedValueOnce(new Error('Dispute already reopened'));
    act(() => result.current.undoDecision(activity()));
    await act(async () => {
      await press(alert, 'Undo decision');
    });
    expect(alert).toHaveBeenLastCalledWith(
      'Already reopened',
      expect.stringContaining('Another admin'),
    );

    (reopenDispute as jest.Mock).mockRejectedValueOnce(new Error('Failed to undo decision'));
    act(() => result.current.undoDecision(activity()));
    await act(async () => {
      await press(alert, 'Undo decision');
    });
    expect(alert).toHaveBeenLastCalledWith('Decision not undone', expect.any(String));
    expect(logException).toHaveBeenCalled();
  });
});

describe('UNDO DECISION on the Disputes screen', () => {
  it('is offered to managers/peer leaders and owners on a decided dispute (approved or rejected)', () => {
    const { result } = renderHook(() => useBaseActivityScreen(screenProps()));
    for (const token of [ADMIN, OWNER]) {
      for (const decided of [activity(), activity({ disputed: 'rejected', incomplete: false })]) {
        expect(result.current.getLeftButtonProps(decided, true, token)?.title).toBe(
          'UNDO DECISION',
        );
        expect(result.current.getRightButtonProps(decided, true, token)).toBeUndefined();
      }
    }
  });

  it('pressing it opens the confirm dialog', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { result } = renderHook(() => useBaseActivityScreen(screenProps()));
    const props = result.current.getLeftButtonProps(activity(), true, ADMIN);
    expect(props.testID).toBe('undo-dispute-decision-button-act-1');
    act(() => props.onPress());
    expect(alert).toHaveBeenCalledWith('Undo decision?', UNDO_DECISION_MESSAGE, expect.any(Array));
  });

  it("is never offered to a resident, to the activity's own resident who is an admin, or off the Disputes screen", () => {
    const { result } = renderHook(() => useBaseActivityScreen(screenProps()));
    expect(result.current.getLeftButtonProps(activity(), true, RESIDENT)?.title).not.toBe(
      'UNDO DECISION',
    );
    expect(
      result.current.getLeftButtonProps(activity({ verified: true }), false, ADMIN)?.title,
    ).not.toBe('UNDO DECISION');
    const ownResident = renderHook(() => useBaseActivityScreen(screenProps('resident-1'))).result;
    expect(ownResident.current.getLeftButtonProps(activity(), true, ADMIN)?.title).not.toBe(
      'UNDO DECISION',
    );
    const ownLogger = renderHook(() => useBaseActivityScreen(screenProps('mgr-1'))).result;
    expect(
      ownLogger.current.getLeftButtonProps(activity({ loggedBy: 'mgr-1' }), true, ADMIN)?.title,
    ).not.toBe('UNDO DECISION');
  });

  it('after the undo (pending again), APPROVE and REJECT show again', () => {
    const { result } = renderHook(() => useBaseActivityScreen(screenProps()));
    const reopened = activity({
      status: ActivityStatus.DISPUTED,
      disputed: null,
      incomplete: null,
      reopenedBy: 'mgr-2',
    });
    expect(result.current.getLeftButtonProps(reopened, true, ADMIN)?.title).toBe('APPROVE');
    expect(result.current.getRightButtonProps(reopened, true, ADMIN)?.title).toBe('REJECT');
  });
});
