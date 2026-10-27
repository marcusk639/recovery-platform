/**
 * useBaseActivityScreen Hook Tests
 *
 * Tests the base activity screen logic including modal state,
 * activity filtering, icon resolution, dispute management,
 * and button prop generation.
 */

import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useBaseActivityScreen } from '../useBaseActivityScreen';
import * as activityService from '../../services/activity';
import { ActivityType, ActivityStatus } from '../../entities/ActivityModel';
import { ActivityFilterFormValues } from '../../screens/Activity/ActivityFilterForm';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockMutateAsync = jest.fn(() => Promise.resolve());

jest.mock('../../state/queries/disputeQueries', () => ({
  useUpdateDispute: () => ({
    mutateAsync: mockMutateAsync,
    isLoading: false,
  }),
}));

jest.mock('../../services/activity', () => ({
  disputeActivity: jest.fn(() => Promise.resolve()),
  resolveDispute: jest.fn(() => Promise.resolve()),
  verifyActivity: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../firebase-setup', () => ({
  firestore: { collection: jest.fn(() => ({ doc: jest.fn(() => ({})) })) },
  functions: { httpsCallable: jest.fn() },
}));

jest.mock('uuid', () => ({
  v4: () => 'mock-uuid-1234',
}));

jest.mock('../../util/display', () => ({
  getTodaysDate: () => '2026-02-22',
}));

jest.mock('../../util/guest', () => ({
  filterActivities: jest.fn((_activities: any[], _filters: any, _guest: any, _searchTerm: string, type: string) => {
    if (type === 'all') return _activities;
    return _activities.filter((a: any) => a.type === type);
  }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeActivity(overrides: Record<string, any> = {}) {
  return {
    id: 'act-1',
    guestId: 'guest-1',
    houseId: 'house-1',
    type: ActivityType.CHORE,
    timestamp: new Date().toISOString(),
    loggedAt: new Date().toISOString(),
    loggedBy: 'resident-1',
    verified: false,
    status: ActivityStatus.ACTIVE,
    data: { type: 'chore', choreType: 'daily', choreName: 'Kitchen' },
    underDispute: 0,
    disputeResult: 'none' as const,
    disputeId: undefined,
    ...overrides,
  };
}

function makeDispute(overrides: Record<string, any> = {}) {
  return {
    id: 'dispute-1',
    guestId: 'guest-1',
    houseId: 'house-1',
    activityId: 'act-1',
    type: ActivityType.CHORE,
    message: 'Dispute message',
    status: 'pending' as const,
    createdDate: '2026-02-22',
    createdAt: '2026-02-22',
    updatedAt: '2026-02-22',
    challenges: [],
    ...overrides,
  };
}

// The activities' resident is 'resident-1'; the viewer (mockUser, 'user-1')
// is a housemate, so DISPUTE is offered unless a test says otherwise.
const mockGuest = {
  id: 'guest-1',
  userId: 'resident-1',
  firstName: 'Alice',
  lastName: 'Smith',
};

const mockUser = {
  id: 'user-1',
  guestId: 'guest-1',
  email: 'alice@test.com',
};

const mockHouse = {
  id: 'house-1',
  name: 'Test House',
  disputes: {},
};

function makeProps(overrides: Record<string, any> = {}) {
  return {
    guest: mockGuest,
    house: mockHouse,
    user: mockUser,
    guests: { 'guest-1': mockGuest },
    activities: [],
    disputes: {},
    admins: {},
    ...overrides,
  } as any;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useBaseActivityScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Initial state ──────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with modalVisible false', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      expect(result.current.modalVisible).toBe(false);
    });

    it('starts with modalType as empty string', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      expect(result.current.modalType).toBe('');
    });

    it('starts with selectedActivity as null', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      expect(result.current.selectedActivity).toBeNull();
    });

    it('starts with empty searchTerm', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      expect(result.current.searchTerm).toBe('');
    });

    it('starts with empty error string', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      expect(result.current.error).toBe('');
    });

    it('starts with default ActivityFilterFormValues', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      expect(result.current.filters).toBeInstanceOf(ActivityFilterFormValues);
      expect(result.current.filters.disputed).toBe('all');
      expect(result.current.filters.type).toBe('all');
      expect(result.current.filters.guest).toBeNull();
    });
  });

  // ── showModal / dismissModal ───────────────────────────────────────────────

  describe('showModal', () => {
    it('sets modalVisible to true', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const activity = makeActivity();

      act(() => { result.current.showModal('dispute', activity); });

      expect(result.current.modalVisible).toBe(true);
    });

    it('sets the modal type to "dispute"', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const activity = makeActivity();

      act(() => { result.current.showModal('dispute', activity); });

      expect(result.current.modalType).toBe('dispute');
    });

    it('sets the modal type to "confirm"', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const activity = makeActivity();

      act(() => { result.current.showModal('confirm', activity); });

      expect(result.current.modalType).toBe('confirm');
    });

    it('sets selectedActivity', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const activity = makeActivity();

      act(() => { result.current.showModal('dispute', activity); });

      expect(result.current.selectedActivity).toEqual(activity);
    });

    it('sets loadingMessage to disputing text for dispute type', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const activity = makeActivity();

      act(() => { result.current.showModal('dispute', activity); });

      expect(result.current.loadingMessage).toBe('Disputing action...');
    });

    it('sets loadingMessage to confirming text for confirm type', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const activity = makeActivity();

      act(() => { result.current.showModal('confirm', activity); });

      expect(result.current.loadingMessage).toBe('Confirming action...');
    });
  });

  describe('dismissModal', () => {
    it('sets modalVisible back to false', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const activity = makeActivity();

      act(() => { result.current.showModal('dispute', activity); });
      expect(result.current.modalVisible).toBe(true);

      act(() => { result.current.dismissModal(); });
      expect(result.current.modalVisible).toBe(false);
    });
  });

  describe('setModalVisible', () => {
    it('can explicitly set modal visibility', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));

      act(() => { result.current.setModalVisible(true); });
      expect(result.current.modalVisible).toBe(true);

      act(() => { result.current.setModalVisible(false); });
      expect(result.current.modalVisible).toBe(false);
    });
  });

  // ── Search term ────────────────────────────────────────────────────────────

  describe('setSearchTerm', () => {
    it('updates searchTerm', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));

      act(() => { result.current.setSearchTerm('Alice'); });

      expect(result.current.searchTerm).toBe('Alice');
    });

    it('can clear search term back to empty string', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));

      act(() => { result.current.setSearchTerm('Query'); });
      act(() => { result.current.setSearchTerm(''); });

      expect(result.current.searchTerm).toBe('');
    });
  });

  // ── Filters ────────────────────────────────────────────────────────────────

  describe('setSearchFilters', () => {
    it('updates filters', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const newFilters = new ActivityFilterFormValues();
      newFilters.disputed = 'yes';
      newFilters.type = 'chore';

      act(() => { result.current.setSearchFilters(newFilters); });

      expect(result.current.filters.disputed).toBe('yes');
      expect(result.current.filters.type).toBe('chore');
    });
  });

  // ── getIconForActivity ─────────────────────────────────────────────────────

  describe('getIconForActivity', () => {
    it('returns "broom" for CHORE type', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const activity = makeActivity({ type: ActivityType.CHORE });
      expect(result.current.getIconForActivity(activity)).toBe('broom');
    });

    it('returns "users" for MEETING type', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const activity = makeActivity({ type: ActivityType.MEETING });
      expect(result.current.getIconForActivity(activity)).toBe('users');
    });

    it('returns "pills" for MEDICATION type', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const activity = makeActivity({ type: ActivityType.MEDICATION });
      expect(result.current.getIconForActivity(activity)).toBe('pills');
    });

    it('returns "briefcase" for WORK type', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const activity = makeActivity({ type: ActivityType.WORK });
      expect(result.current.getIconForActivity(activity)).toBe('briefcase');
    });

    it('returns "user-friends" for PRIMARY_SUPPORTER type', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const activity = makeActivity({ type: ActivityType.PRIMARY_SUPPORTER });
      expect(result.current.getIconForActivity(activity)).toBe('user-friends');
    });

    it('returns "broom" for legacy chore_completed string', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const activity = makeActivity({ type: 'chore_completed' as any });
      expect(result.current.getIconForActivity(activity)).toBe('broom');
    });

    it('returns "exchange-alt" for legacy chore_changed string', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const activity = makeActivity({ type: 'chore_changed' as any });
      expect(result.current.getIconForActivity(activity)).toBe('exchange-alt');
    });

    it('returns "check-circle" for unknown type', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const activity = makeActivity({ type: 'unknown_type' as any });
      expect(result.current.getIconForActivity(activity)).toBe('check-circle');
    });
  });

  // ── activityIsDisputable ───────────────────────────────────────────────────

  describe('activityIsDisputable', () => {
    it('returns true for a disputable activity with no disputeResult', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const activity = makeActivity({
        type: ActivityType.CHORE,
        disputeResult: 'none',
      });
      expect(result.current.activityIsDisputable(activity)).toBe(true);
    });

    it('returns false when disputeResult is "success"', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const activity = makeActivity({
        type: ActivityType.CHORE,
        disputeResult: 'success',
      });
      expect(result.current.activityIsDisputable(activity)).toBe(false);
    });

    it('returns false when disputeResult is "fail"', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const activity = makeActivity({
        type: ActivityType.CHORE,
        disputeResult: 'fail',
      });
      expect(result.current.activityIsDisputable(activity)).toBe(false);
    });

    it('returns true for MEETING type (disputable)', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const activity = makeActivity({ type: ActivityType.MEETING, disputeResult: 'none' });
      expect(result.current.activityIsDisputable(activity)).toBe(true);
    });

    it.each([ActivityStatus.DISPUTED, ActivityStatus.RESOLVED, ActivityStatus.DELETED])(
      'returns false for a %s activity (only ACTIVE can be disputed)',
      status => {
        const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
        expect(result.current.activityIsDisputable(makeActivity({ status }) as any)).toBe(false);
      },
    );

    it('returns true for WORK type (disputable)', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const activity = makeActivity({ type: ActivityType.WORK, disputeResult: 'none' });
      expect(result.current.activityIsDisputable(activity)).toBe(true);
    });
  });

  // ── updateHouseDisputes ────────────────────────────────────────────────────

  describe('updateHouseDisputes', () => {
    it('returns a partialHouse with resolved dispute removed', () => {
      const dispute = makeDispute();
      const props = makeProps({ disputes: { 'dispute-1': dispute } });
      const { result } = renderHook(() => useBaseActivityScreen(props));

      const { partialHouse, resolvedDispute } = result.current.updateHouseDisputes(dispute, 'overturned');

      expect(partialHouse.id).toBe('house-1');
      // Dispute should be removed from the map after being resolved
      expect(partialHouse.disputes?.['dispute-1']).toBeUndefined();
    });

    it('returns the resolvedDispute with status "resolved"', () => {
      const dispute = makeDispute();
      const props = makeProps({ disputes: { 'dispute-1': dispute } });
      const { result } = renderHook(() => useBaseActivityScreen(props));

      const { resolvedDispute } = result.current.updateHouseDisputes(dispute, 'overturned');

      expect(resolvedDispute?.status).toBe('resolved');
      expect(resolvedDispute?.resolutionMessage).toBe('overturned');
    });

    it('sets resolvedDate on the resolved dispute', () => {
      const dispute = makeDispute();
      const props = makeProps({ disputes: { 'dispute-1': dispute } });
      const { result } = renderHook(() => useBaseActivityScreen(props));

      const { resolvedDispute } = result.current.updateHouseDisputes(dispute, 'allowed');

      expect(resolvedDispute?.resolvedDate).toBe('2026-02-22');
    });
  });

  // ── handleDisputeSubmission ────────────────────────────────────────────────

  describe('handleDisputeSubmission', () => {
    it('returns false when no activity is selected', async () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));

      let returnValue: boolean | undefined;
      await act(async () => {
        returnValue = await result.current.handleDisputeSubmission({ message: 'test' });
      });

      expect(returnValue).toBe(false);
    });

    it('returns true and calls disputeActivity when modalType is "dispute"', async () => {
      const activity = makeActivity({ underDispute: 0, disputeResult: 'none' });
      const { result } = renderHook(() =>
        useBaseActivityScreen(makeProps({ activities: [activity] }))
      );

      act(() => { result.current.showModal('dispute', activity); });

      let returnValue: boolean | undefined;
      await act(async () => {
        returnValue = await result.current.handleDisputeSubmission({ message: 'I dispute this' });
      });

      expect(returnValue).toBe(true);
      // The activity write is the whole client side of a dispute.
      expect(activityService.disputeActivity).toHaveBeenCalledWith(activity.id, 'I dispute this', mockUser.id);
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it('dismisses modal after successful submission', async () => {
      const activity = makeActivity({ underDispute: 0, disputeResult: 'none' });
      const { result } = renderHook(() =>
        useBaseActivityScreen(makeProps({ activities: [activity] }))
      );

      act(() => { result.current.showModal('dispute', activity); });
      expect(result.current.modalVisible).toBe(true);

      await act(async () => {
        await result.current.handleDisputeSubmission({ message: 'test' });
      });

      expect(result.current.modalVisible).toBe(false);
    });

    it('returns false and sets error when an exception occurs', async () => {
      (activityService.disputeActivity as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      jest.spyOn(Alert, 'alert').mockImplementation(() => undefined as any);

      const activity = makeActivity({ underDispute: 0, disputeResult: 'none' });
      const { result } = renderHook(() =>
        useBaseActivityScreen(makeProps({ activities: [activity] }))
      );

      act(() => { result.current.showModal('dispute', activity); });

      let returnValue: boolean | undefined;
      await act(async () => {
        returnValue = await result.current.handleDisputeSubmission({ message: 'test' });
      });

      expect(returnValue).toBe(false);
      expect(result.current.error).toBe('Something went wrong. Please try again later.');
    });
  });

  // ── filterActivitiesByType ─────────────────────────────────────────────────

  describe('filterActivitiesByType', () => {
    it('returns all activities when type is "all"', () => {
      const activities = [
        makeActivity({ id: 'act-1', type: ActivityType.CHORE }),
        makeActivity({ id: 'act-2', type: ActivityType.MEETING }),
      ];
      const { result } = renderHook(() =>
        useBaseActivityScreen(makeProps({ activities }))
      );

      const filtered = result.current.filterActivitiesByType('all');
      expect(filtered).toHaveLength(2);
    });

    it('returns sorted activities by date descending', () => {
      const activities = [
        makeActivity({
          id: 'act-old',
          type: ActivityType.CHORE,
          timestamp: '2026-01-01T00:00:00Z',
        }),
        makeActivity({
          id: 'act-new',
          type: ActivityType.CHORE,
          timestamp: '2026-02-22T00:00:00Z',
        }),
      ];
      const { result } = renderHook(() =>
        useBaseActivityScreen(makeProps({ activities }))
      );

      const filtered = result.current.filterActivitiesByType('all');
      expect(filtered[0].id).toBe('act-new');
      expect(filtered[1].id).toBe('act-old');
    });

    it('returns empty array when no activities provided', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps({ activities: [] })));

      const filtered = result.current.filterActivitiesByType('all');
      expect(filtered).toEqual([]);
    });
  });

  // ── getLeftButtonProps ─────────────────────────────────────────────────────

  describe('getLeftButtonProps', () => {
    it('hides CHALLENGE DISPUTE until the follow-up PR (it could only fail now)', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));

      for (const status of [ActivityStatus.ACTIVE, ActivityStatus.DISPUTED]) {
        const activity = makeActivity({ type: ActivityType.CHORE, disputeResult: 'none', underDispute: 1, status });
        expect(result.current.getLeftButtonProps(activity as any)).toBeUndefined();
      }
    });

    it('returns verify button for admin on unverified activity (non-disputes view)', () => {
      const activity = makeActivity({ verified: false, type: ActivityType.CHORE, disputeResult: 'none' });
      const adminToken = { role: { 'house-1': 'admin' } } as any;
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));

      const props = result.current.getLeftButtonProps(activity, false, adminToken);

      expect(props).toBeDefined();
      expect(props.title).toBe('VERIFY');
    });

    it('returns the APPROVE button for an admin in the disputes-only view', () => {
      const dispute = makeDispute();
      const activity = makeActivity({
        type: ActivityType.CHORE,
        status: ActivityStatus.DISPUTED,
        disputeResult: 'none',
        underDispute: 1,
        disputeId: 'dispute-1',
      });
      const adminToken = { role: { 'house-1': 'admin' } } as any;
      const { result } = renderHook(() =>
        useBaseActivityScreen(makeProps({ disputes: { 'dispute-1': dispute } }))
      );

      const props = result.current.getLeftButtonProps(activity, true, adminToken);

      expect(props?.title).toBe('APPROVE');
    });

    it('returns undefined for non-disputable activity without admin token', () => {
      const activity = makeActivity({ type: ActivityType.CHORE, disputeResult: 'success' });
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));

      const props = result.current.getLeftButtonProps(activity);

      expect(props).toBeUndefined();
    });
  });

  // ── getRightButtonProps ────────────────────────────────────────────────────

  describe('getRightButtonProps', () => {
    it('returns dispute button props for a disputable activity', () => {
      const activity = makeActivity({ type: ActivityType.CHORE, disputeResult: 'none', underDispute: 0 });
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));

      const props = result.current.getRightButtonProps(activity);

      expect(props).toBeDefined();
      expect(props.title).toBe('DISPUTE');
    });

    it('returns the REJECT button for an admin in the disputes-only view', () => {
      const dispute = makeDispute();
      const activity = makeActivity({
        type: ActivityType.CHORE,
        status: ActivityStatus.DISPUTED,
        disputeResult: 'none',
        underDispute: 1,
        disputeId: 'dispute-1',
      });
      const adminToken = { role: { 'house-1': 'admin' } } as any;
      const { result } = renderHook(() =>
        useBaseActivityScreen(makeProps({ disputes: { 'dispute-1': dispute } }))
      );

      const props = result.current.getRightButtonProps(activity, true, adminToken);

      expect(props?.title).toBe('REJECT');
    });

    it('returns undefined for a non-disputable activity', () => {
      const activity = makeActivity({ type: ActivityType.CHORE, disputeResult: 'success' });
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));

      const props = result.current.getRightButtonProps(activity);

      expect(props).toBeUndefined();
    });
  });

  // ── approveDispute / rejectDispute (owner decision) ────────────────────────

  describe('dispute model wiring (owner decision)', () => {
    const press = (alertSpy: jest.SpyInstance, text: string) => {
      const buttons = alertSpy.mock.calls[0][2] as Array<{ text: string; onPress: () => unknown }>;
      return buttons.find(b => b.text === text)!.onPress();
    };
    const adminToken = { role: { [mockHouse.id]: 'admin' } } as any;

    it('APPROVE approves the dispute and writes only the activity (the server archives house.disputes)', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined as any);
      const dispute = makeDispute({ activityId: 'act-1' });
      const { result } = renderHook(() =>
        useBaseActivityScreen(makeProps({ disputes: { 'dispute-1': dispute } })),
      );

      act(() => { result.current.approveDispute(makeActivity({ id: 'act-1', status: 'disputed' }) as any); });
      await act(async () => { await press(alertSpy, 'Approve'); });

      expect(activityService.resolveDispute).toHaveBeenCalledWith('act-1', mockUser.id, 'approve');
      expect(mockMutateAsync).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });

    it('REJECT rejects the dispute (the activity stands and counts)', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined as any);
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));

      act(() => { result.current.rejectDispute(makeActivity({ id: 'act-2', status: 'disputed' }) as any); });
      await act(async () => { await press(alertSpy, 'Reject'); });

      expect(activityService.resolveDispute).toHaveBeenCalledWith('act-2', mockUser.id, 'reject');
      expect(mockMutateAsync).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });

    it('a dispute writes only the activity (the server mirrors and notifies)', async () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));

      await act(async () => {
        await result.current.disputeActivity(
          makeActivity({ id: 'act-3', guestId: 'guest-1' }) as any,
          'Not done',
        );
      });

      expect(activityService.disputeActivity).toHaveBeenCalledWith('act-3', 'Not done', mockUser.id);
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it('APPROVE is enabled for any pending dispute, without legacy underDispute/disputeId', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const approve = result.current.getLeftButtonProps(
        makeActivity({ status: 'disputed', underDispute: undefined, disputeId: undefined }) as any,
        true,
        adminToken,
      );
      expect(approve.title).toBe('APPROVE');
      expect(approve.disabled).toBe(false);
    });

    it('shows a message when resolving fails', async () => {
      (activityService.resolveDispute as jest.Mock).mockRejectedValueOnce(new Error('denied'));
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined as any);
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));

      act(() => { result.current.approveDispute(makeActivity({ status: 'disputed' }) as any); });
      await act(async () => { await press(alertSpy, 'Approve'); });

      expect(alertSpy).toHaveBeenLastCalledWith(
        'Approval not saved',
        'We could not resolve this dispute. Please try again.',
      );
      alertSpy.mockRestore();
    });
  });

  describe('resolve refusals are shown to the admin', () => {
    it.each([
      ['Dispute already resolved', 'Dispute already resolved', 'Another admin has already resolved this dispute.'],
      ['Activity is not disputed', 'Not disputed', 'This activity is not disputed anymore, so there is nothing to resolve.'],
    ])('"%s" shows its specific message', async (error, title, message) => {
      (activityService.resolveDispute as jest.Mock).mockRejectedValueOnce(new Error(error));
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined as any);
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));

      act(() => { result.current.rejectDispute(makeActivity({ status: 'disputed' }) as any); });
      const buttons = alertSpy.mock.calls[0][2] as Array<{ text: string; onPress: () => unknown }>;
      await act(async () => { await buttons.find(b => b.text === 'Reject')!.onPress(); });

      expect(alertSpy).toHaveBeenLastCalledWith(title, message);
      alertSpy.mockRestore();
    });
  });

  describe('owner rule: no DISPUTE on your own activity', () => {
    it("hides DISPUTE on an activity of the viewer's own guest (an admin logged it for them)", () => {
      const props = makeProps({ guests: { 'guest-1': { ...mockGuest, userId: mockUser.id } } });
      const { result } = renderHook(() => useBaseActivityScreen(props));
      const activity = makeActivity({ loggedBy: 'admin-9' }) as any;

      expect(result.current.activityIsDisputable(activity)).toBe(false);
      expect(result.current.getRightButtonProps(activity)).toBeUndefined();
    });

    it('hides DISPUTE on an activity the viewer logged (e.g. an admin logging for a resident)', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const activity = makeActivity({ loggedBy: mockUser.id }) as any;

      expect(result.current.activityIsDisputable(activity)).toBe(false);
      expect(result.current.getRightButtonProps(activity)).toBeUndefined();
    });

    it("offers DISPUTE on a housemate's activity", () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const activity = makeActivity() as any;

      expect(result.current.activityIsDisputable(activity)).toBe(true);
      expect(result.current.getRightButtonProps(activity)?.title).toBe('DISPUTE');
    });
  });

  describe('who sees which dispute button', () => {
    const adminToken = { role: { [mockHouse.id]: 'admin' } } as any;
    const ownerToken = { role: { [mockHouse.id]: 'superAdmin' } } as any;
    const residentToken = { role: { [mockHouse.id]: 'guest' } } as any;

    it.each([ActivityStatus.DISPUTED, ActivityStatus.RESOLVED, ActivityStatus.DELETED])(
      'does not offer DISPUTE on a %s activity',
      status => {
        const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
        const props = result.current.getRightButtonProps(makeActivity({ status }) as any, false, residentToken);
        expect(props?.title).not.toBe('DISPUTE');
      },
    );

    it('never shows APPROVE or REJECT to a resident, even on the Disputes screen', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const pending = makeActivity({ status: 'disputed' }) as any;
      expect(result.current.getLeftButtonProps(pending, true, residentToken)?.title).not.toBe('APPROVE');
      expect(result.current.getRightButtonProps(pending, true, residentToken)?.title).not.toBe('REJECT');
    });

    it('shows APPROVE and REJECT to managers/peer leaders (admin) and owners (superAdmin)', () => {
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));
      const pending = makeActivity({ status: 'disputed' }) as any;
      for (const token of [adminToken, ownerToken]) {
        expect(result.current.getLeftButtonProps(pending, true, token)?.title).toBe('APPROVE');
        expect(result.current.getRightButtonProps(pending, true, token)?.title).toBe('REJECT');
      }
    });
  });

  describe('rejectDispute and approveDispute', () => {
    it('shows a confirm dialog when rejectDispute is called', () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined as any);
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));

      act(() => { result.current.rejectDispute(makeActivity({ status: 'disputed' }) as any); });

      expect(alertSpy).toHaveBeenCalledWith(
        'Reject dispute?',
        'The activity stands and keeps counting toward the weekly numbers.',
        expect.any(Array),
      );

      alertSpy.mockRestore();
    });

    it('shows a confirm dialog when approveDispute is called', () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined as any);
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));

      act(() => { result.current.approveDispute(makeActivity({ status: 'disputed' }) as any); });

      expect(alertSpy).toHaveBeenCalledWith(
        'Approve dispute?',
        'The activity is marked as not done and stops counting. It stays on record.',
        expect.any(Array),
      );

      alertSpy.mockRestore();
    });
  });
});
