import React from 'react';
import renderer, {act} from 'react-test-renderer';

// --- Navigation ---
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: jest.fn(),
    setOptions: jest.fn(),
    dispatch: jest.fn(),
  }),
  useRoute: () => ({
    params: {groupId: 'g1', groupName: 'Test Group'},
    name: 'GroupTreasury',
  }),
  useFocusEffect: (cb: () => void) => {
    cb();
    return () => {};
  },
  useIsFocused: () => true,
  useNavigationState: () => null,
  CommonActions: {navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn()},
  StackActions: {push: jest.fn(), pop: jest.fn(), replace: jest.fn()},
}));

// Mutable so individual tests can override without re-mocking the module.
const mockTrialStatus = {
  isInTrial: false,
  isActive: false,
  isExpired: true,
  daysRemaining: 0,
  trialEndDate: null,
};
jest.mock('../hooks/useTrialStatus', () => ({
  useTrialStatus: () => mockTrialStatus,
}));

// --- Firebase auth: user1 is logged in ---
jest.mock('@react-native-firebase/auth', () => () => ({
  currentUser: {uid: 'user1', email: 'admin@test.com'},
  onAuthStateChanged: jest.fn(() => jest.fn()),
}));

// --- Redux store: call selector with empty state; each slice returns mock data ---
const mockDispatch = jest.fn(() => ({unwrap: () => Promise.resolve([])}));
jest.mock('../store', () => ({
  useAppSelector: (selector: (state: object) => unknown) => selector({}),
  useAppDispatch: () => mockDispatch,
}));

const mockGroup = {
  id: 'g1',
  name: 'Test Group',
  admins: ['user1'],
  isClaimed: true,
  members: ['user1'],
  treasurers: [],
  pendingAdminRequests: [],
  stripeConnectAccountId: null,
  paymentLinks: {},
  subscriptionStatus: 'canceled',
};

const mockTreasuryStats = {
  balance: 100.0,
  prudentReserve: 200.0,
  monthlyIncome: 50.0,
  monthlyExpenses: 30.0,
  lastUpdated: new Date('2026-01-01'),
  groupId: 'g1',
};

jest.mock('../store/slices/groupsSlice', () => ({
  selectGroupById: () => mockGroup,
  selectGroupsStatus: () => 'succeeded',
  selectGroupsError: () => null,
  fetchGroupById: jest.fn(() => ({type: 'groups/fetchById'})),
}));

jest.mock('../store/slices/transactionsSlice', () => ({
  selectGroupTransactions: () => [],
  selectTransactionsStatus: () => 'succeeded',
  selectTransactionsError: () => null,
  fetchGroupTransactions: jest.fn(() => ({type: 'transactions/fetch'})),
}));

jest.mock('../store/slices/treasurySlice', () => ({
  selectTreasuryStatsByGroupId: () => mockTreasuryStats,
  selectTreasuryStatus: () => 'succeeded',
  selectTreasuryError: () => null,
  fetchTreasuryStats: jest.fn(() => ({type: 'treasury/fetchStats'})),
  updatePrudentReserve: jest.fn(() => ({type: 'treasury/updateReserve'})),
}));

jest.mock('../store/slices/servicePositionsSlice', () => ({
  selectIsTreasurerForGroup: () => false,
  selectServicePositionsByGroup: () => [],
  fetchServicePositionsForGroup: jest.fn(() => ({
    type: 'servicePositions/fetch',
  })),
}));

jest.mock('../store/slices/membersSlice', () => ({
  selectMembersByGroupId: () => [],
  fetchGroupMembers: jest.fn(() => ({type: 'members/fetch'})),
}));

jest.mock('../store/slices/treasurerHandoffSlice', () => ({
  selectPendingHandoffsForUser: () => [],
  selectAcceptedHandoffsForUser: () => [],
  fetchPendingHandoffsForUser: jest.fn(() => ({type: 'handoff/fetchPending'})),
  fetchAcceptedHandoffsForUser: jest.fn(() => ({
    type: 'handoff/fetchAccepted',
  })),
}));

// --- Native deps ---
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

// --- Child components with complex dependency trees ---
jest.mock(
  '../components/subscription/FeatureTooltip',
  () =>
    ({children}: any) =>
      children,
);
jest.mock('../components/treasury/EditTransactionModal', () => () => null);
jest.mock('../components/payments/AskAdminUpgradeModal', () => () => null);

// --- Config ---
jest.mock('../config/featureFlags', () => ({
  FEATURE_FLAGS: {
    SHOW_V4_ANALYTICS_TREASURY_TRENDS: false,
  },
}));

import GroupTreasuryScreen from '../screens/homegroup/GroupTreasuryScreen';

describe('GroupTreasuryScreen — subscription gate on Add Transaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDispatch.mockReturnValue({unwrap: () => Promise.resolve([])});
    mockTrialStatus.isInTrial = false;
    mockTrialStatus.isActive = false;
    mockTrialStatus.isExpired = true;
    mockTrialStatus.daysRemaining = 0;
    mockTrialStatus.trialEndDate = null;
  });

  it('redirects admin to SubscriptionUpgrade when subscription is expired', async () => {
    let component: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderer.create(<GroupTreasuryScreen />);
      await Promise.resolve();
    });

    const addBtn = component!.root.findByProps({
      testID: 'treasury-add-transaction-button',
    });

    act(() => {
      addBtn.props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith(
      'SubscriptionUpgrade',
      expect.objectContaining({groupId: 'g1', groupName: 'Test Group'}),
    );
    expect(mockNavigate).not.toHaveBeenCalledWith(
      'AddTransaction',
      expect.anything(),
    );
  });

  it('navigates to AddTransaction when subscription is active', async () => {
    mockTrialStatus.isActive = true;
    mockTrialStatus.isExpired = false;

    let component: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderer.create(<GroupTreasuryScreen />);
      await Promise.resolve();
    });

    const addBtn = component!.root.findByProps({
      testID: 'treasury-add-transaction-button',
    });

    act(() => {
      addBtn.props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith(
      'AddTransaction',
      expect.objectContaining({groupId: 'g1', groupName: 'Test Group'}),
    );
    expect(mockNavigate).not.toHaveBeenCalledWith(
      'SubscriptionUpgrade',
      expect.anything(),
    );
  });

  it('shows the subscription expired banner when subscription is expired', async () => {
    let component: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderer.create(<GroupTreasuryScreen />);
      await Promise.resolve();
    });

    const banner = component!.root.findByProps({
      testID: 'treasury-subscription-expired-banner',
    });

    expect(banner).toBeTruthy();
  });

  it('does not show the subscription expired banner when subscription is active', async () => {
    mockTrialStatus.isActive = true;
    mockTrialStatus.isExpired = false;

    let component: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderer.create(<GroupTreasuryScreen />);
      await Promise.resolve();
    });

    const banners = component!.root.findAllByProps({
      testID: 'treasury-subscription-expired-banner',
    });

    expect(banners).toHaveLength(0);
  });

  it('redirects treasurer to SubscriptionUpgrade when subscription is expired', async () => {
    // Make user1 a treasurer (not admin) with an expired subscription
    const originalAdmins = mockGroup.admins;
    mockGroup.admins = []; // user1 is not an admin

    const servicePositionsMock = jest.requireMock(
      '../store/slices/servicePositionsSlice',
    );
    const originalSelector = servicePositionsMock.selectIsTreasurerForGroup;
    servicePositionsMock.selectIsTreasurerForGroup = () => true; // user1 is treasurer

    // Subscription remains expired (default beforeEach state)

    let component: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderer.create(<GroupTreasuryScreen />);
      await Promise.resolve();
    });

    const addBtn = component!.root.findByProps({
      testID: 'treasury-add-transaction-button',
    });

    act(() => {
      addBtn.props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith(
      'SubscriptionUpgrade',
      expect.objectContaining({groupId: 'g1', groupName: 'Test Group'}),
    );
    expect(mockNavigate).not.toHaveBeenCalledWith(
      'AddTransaction',
      expect.anything(),
    );

    // Restore mocks
    mockGroup.admins = originalAdmins;
    servicePositionsMock.selectIsTreasurerForGroup = originalSelector;
  });
});
