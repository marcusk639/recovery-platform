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
    name: 'GroupOverview',
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
};
jest.mock('../hooks/useTrialStatus', () => () => mockTrialStatus);

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
  pendingAdminRequests: [],
  stripeConnectAccountId: null,
  paymentLinks: {},
  subscriptionStatus: 'canceled',
};

jest.mock('../store/slices/groupsSlice', () => ({
  selectGroupById: () => mockGroup,
  selectGroupsStatus: () => 'succeeded',
  selectIsGroupMember: () => true,
  fetchGroupById: jest.fn(() => ({type: 'groups/fetchById'})),
  leaveGroup: jest.fn(() => ({type: 'groups/leave'})),
  requestGroupAdminAccess: jest.fn(() => ({type: 'groups/requestAdmin'})),
  joinGroup: jest.fn(() => ({type: 'groups/join'})),
}));

jest.mock('../store/slices/announcementsSlice', () => ({
  selectAnnouncementsByGroupId: () => [],
  fetchAnnouncementsForGroup: jest.fn(() => ({type: 'announcements/fetch'})),
}));

jest.mock('../store/slices/membersSlice', () => ({
  selectMembersByGroupId: () => [],
  selectGroupMilestones: () => [],
  fetchGroupMembers: jest.fn(() => ({type: 'members/fetch'})),
  fetchGroupMilestones: jest.fn(() => ({type: 'milestones/fetch'})),
}));

jest.mock('../store/slices/meetingsSlice', () => ({
  selectGroupMeetings: () => [],
  selectGroupMeetingInstanceIds: () => [],
  selectAllMeetingInstances: () => ({}),
  fetchGroupMeetings: jest.fn(() => ({type: 'meetings/fetch'})),
  fetchUpcomingMeetingInstances: jest.fn(() => ({type: 'instances/fetch'})),
}));

jest.mock('../store/slices/sponsorshipSlice', () => ({
  selectActiveSponsorship: () => undefined,
  fetchGroupSponsorships: jest.fn(() => ({type: 'sponsorship/fetch'})),
}));

jest.mock('../store/slices/reportsSlice', () => ({
  selectPendingReportCount: () => 0,
  fetchPendingReportCount: jest.fn(() => ({type: 'reports/fetchCount'})),
}));

jest.mock('../store/slices/authSlice', () => ({
  fetchUserData: jest.fn(() => ({type: 'auth/fetchUser'})),
}));

jest.mock('../store/slices/servicePositionsSlice', () => ({
  selectMemberServicePositionsForGroup: () => [],
  fetchServicePositionsForGroup: jest.fn(() => ({
    type: 'servicePositions/fetch',
  })),
}));

jest.mock('../store/slices/chatSlice', () => ({
  selectUnreadCount: () => 0,
  fetchUnreadCount: jest.fn(() => ({type: 'chat/fetchUnread'})),
}));

// --- Native deps not covered by jest.setup.js ---
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

// --- Child components with their own complex dependency trees ---
jest.mock('../components/payments/SubscriptionWebView', () => () => null);
jest.mock('../components/payments/AdminValuePropModal', () => () => null);
jest.mock('../components/subscription/TrialStatusBanner', () => () => null);
jest.mock('../components/groups/GroupSwitcherModal', () => () => null);
jest.mock('../components/groups/AdminRequestCard', () => () => null);
jest.mock('../components/groups/PendingAdminRequestsSection', () => () => null);
jest.mock('../components/groups/GroupInviteModal', () => () => null);
jest.mock('../components/invites/InviteShareSheet', () => () => null);
jest.mock('../components/common/OfflineBanner', () => () => null);
jest.mock('../components/common/UnreadBadge', () => () => null);
jest.mock('../models/GroupModel', () => ({
  GroupModel: {claimGroup: jest.fn(() => Promise.resolve())},
}));

import GroupOverviewScreen from '../screens/homegroup/GroupOverviewScreen';

describe('GroupOverviewScreen — subscription gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDispatch.mockReturnValue({unwrap: () => Promise.resolve([])});
    mockTrialStatus.isInTrial = false;
    mockTrialStatus.isActive = false;
    mockTrialStatus.isExpired = true;
    mockTrialStatus.daysRemaining = 0;
  });

  it('redirects expired admin to SubscriptionUpgrade when tapping the Treasury tile', async () => {
    let component: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderer.create(<GroupOverviewScreen />);
      await Promise.resolve();
    });

    const treasuryBtn = component!.root.findByProps({
      testID: 'group-overview-treasury-tile',
    });

    act(() => {
      treasuryBtn.props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith(
      'SubscriptionUpgrade',
      expect.objectContaining({groupId: 'g1'}),
    );
  });

  it('navigates to GroupTreasury when admin has an active subscription', async () => {
    mockTrialStatus.isActive = true;
    mockTrialStatus.isExpired = false;

    let component: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderer.create(<GroupOverviewScreen />);
      await Promise.resolve();
    });

    const treasuryBtn = component!.root.findByProps({
      testID: 'group-overview-treasury-tile',
    });

    act(() => {
      treasuryBtn.props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith(
      'GroupTreasury',
      expect.objectContaining({groupId: 'g1'}),
    );
  });

  it('redirects expired admin to SubscriptionUpgrade when tapping the Announcements tile', async () => {
    let component: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderer.create(<GroupOverviewScreen />);
      await Promise.resolve();
    });

    const announcementsBtn = component!.root.findByProps({
      testID: 'group-overview-announcements-tile',
    });

    act(() => {
      announcementsBtn.props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith(
      'SubscriptionUpgrade',
      expect.objectContaining({groupId: 'g1'}),
    );
  });

  it('navigates to GroupAnnouncements when admin has an active subscription', async () => {
    mockTrialStatus.isActive = true;
    mockTrialStatus.isExpired = false;

    let component: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderer.create(<GroupOverviewScreen />);
      await Promise.resolve();
    });

    const announcementsBtn = component!.root.findByProps({
      testID: 'group-overview-announcements-tile',
    });

    act(() => {
      announcementsBtn.props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith(
      'GroupAnnouncements',
      expect.objectContaining({groupId: 'g1'}),
    );
  });
});
