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
    loggedBy: 'user-1',
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

const mockGuest = {
  id: 'guest-1',
  userId: 'user-1',
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
      expect(mockMutateAsync).toHaveBeenCalled();
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
      mockMutateAsync.mockRejectedValueOnce(new Error('Network error'));

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
    it('returns confirmButtonProps for a disputable activity without admin token', () => {
      const activity = makeActivity({ type: ActivityType.CHORE, disputeResult: 'none', underDispute: 1 });
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));

      const props = result.current.getLeftButtonProps(activity);

      expect(props).toBeDefined();
      expect(props.title).toBe('CHALLENGE DISPUTE');
    });

    it('returns verify button for admin on unverified activity (non-disputes view)', () => {
      const activity = makeActivity({ verified: false, type: ActivityType.CHORE, disputeResult: 'none' });
      const adminToken = { role: { 'house-1': 'admin' } } as any;
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));

      const props = result.current.getLeftButtonProps(activity, false, adminToken);

      expect(props).toBeDefined();
      expect(props.title).toBe('VERIFY');
    });

    it('returns allow button for admin in disputes-only view', () => {
      const dispute = makeDispute();
      const activity = makeActivity({
        type: ActivityType.CHORE,
        disputeResult: 'none',
        underDispute: 1,
        disputeId: 'dispute-1',
      });
      const adminToken = { role: { 'house-1': 'admin' } } as any;
      const { result } = renderHook(() =>
        useBaseActivityScreen(makeProps({ disputes: { 'dispute-1': dispute } }))
      );

      const props = result.current.getLeftButtonProps(activity, true, adminToken);

      expect(props?.title).toBe('ALLOW');
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

    it('returns override button for admin in disputes-only view', () => {
      const dispute = makeDispute();
      const activity = makeActivity({
        type: ActivityType.CHORE,
        disputeResult: 'none',
        underDispute: 1,
        disputeId: 'dispute-1',
      });
      const adminToken = { role: { 'house-1': 'admin' } } as any;
      const { result } = renderHook(() =>
        useBaseActivityScreen(makeProps({ disputes: { 'dispute-1': dispute } }))
      );

      const props = result.current.getRightButtonProps(activity, true, adminToken);

      expect(props?.title).toBe('OVERRIDE');
    });

    it('returns undefined for a non-disputable activity', () => {
      const activity = makeActivity({ type: ActivityType.CHORE, disputeResult: 'success' });
      const { result } = renderHook(() => useBaseActivityScreen(makeProps()));

      const props = result.current.getRightButtonProps(activity);

      expect(props).toBeUndefined();
    });
  });

  // ── overturnDispute / allowDispute (Alert.alert) ───────────────────────────

  describe('overturnDispute and allowDispute', () => {
    it('shows an Alert.alert when overturnDispute is called', () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined as any);
      const dispute = makeDispute();
      const props = makeProps({ disputes: { 'dispute-1': dispute } });
      const { result } = renderHook(() => useBaseActivityScreen(props));

      act(() => { result.current.overturnDispute(dispute); });

      expect(alertSpy).toHaveBeenCalledWith(
        'Confirm Override',
        'Are you sure you want to override this dispute?',
        expect.any(Array),
      );

      alertSpy.mockRestore();
    });

    it('shows an Alert.alert when allowDispute is called', () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined as any);
      const dispute = makeDispute();
      const props = makeProps({ disputes: { 'dispute-1': dispute } });
      const { result } = renderHook(() => useBaseActivityScreen(props));

      act(() => { result.current.allowDispute(dispute); });

      expect(alertSpy).toHaveBeenCalledWith(
        'Confirm Allowance',
        'Are you sure you want to allow this dispute?',
        expect.any(Array),
      );

      alertSpy.mockRestore();
    });
  });
});
