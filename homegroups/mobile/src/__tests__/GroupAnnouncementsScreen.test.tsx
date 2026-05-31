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
    name: 'GroupAnnouncements',
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

// --- Firebase firestore & functions ---
jest.mock('@react-native-firebase/firestore', () => () => ({
  collection: jest.fn().mockReturnThis(),
  doc: jest.fn().mockReturnThis(),
}));
jest.mock('@react-native-firebase/functions', () => () => ({
  httpsCallable: jest.fn(() => jest.fn()),
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
  subscriptionStatus: 'canceled',
};

jest.mock('../store/slices/groupsSlice', () => ({
  selectGroupById: () => mockGroup,
  selectAdminGroups: () => [],
  fetchGroupById: jest.fn(() => ({type: 'groups/fetchById'})),
}));

jest.mock('../store/slices/announcementsSlice', () => ({
  selectAnnouncementsByGroupId: () => [],
  selectAnnouncementsStatus: () => 'succeeded',
  selectAnnouncementsError: () => null,
  fetchAnnouncementsForGroup: jest.fn(() => ({type: 'announcements/fetch'})),
  createAnnouncement: jest.fn(() => ({type: 'announcements/create'})),
  deleteAnnouncement: jest.fn(() => ({type: 'announcements/delete'})),
}));

jest.mock('../store/slices/membersSlice', () => ({
  selectMembersByGroupId: () => [],
  fetchGroupMembers: jest.fn(() => ({type: 'members/fetch'})),
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
jest.mock('../components/payments/AskAdminUpgradeModal', () => () => null);

// --- DateTimePicker ---
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

import GroupAnnouncementsScreen from '../screens/homegroup/GroupAnnouncementsScreen';

describe('GroupAnnouncementsScreen — subscription gate on Create Announcement', () => {
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
      component = renderer.create(<GroupAnnouncementsScreen />);
      await Promise.resolve();
    });

    const createBtn = component!.root.findByProps({
      testID: 'group-announcements-create-button',
    });

    act(() => {
      createBtn.props.onPress();
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

  it('opens modal when subscription is active', async () => {
    mockTrialStatus.isActive = true;
    mockTrialStatus.isExpired = false;

    let component: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderer.create(<GroupAnnouncementsScreen />);
      await Promise.resolve();
    });

    const createBtn = component!.root.findByProps({
      testID: 'group-announcements-create-button',
    });

    act(() => {
      createBtn.props.onPress();
    });

    expect(mockNavigate).not.toHaveBeenCalledWith(
      'SubscriptionUpgrade',
      expect.anything(),
    );

    // Verify modal opened by checking that the title input inside the modal exists
    const titleInput = component!.root.findByProps({
      testID: 'announcement-title-input',
    });
    expect(titleInput).toBeTruthy();
  });

  it('shows the subscription expired banner when subscription is expired', async () => {
    let component: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderer.create(<GroupAnnouncementsScreen />);
      await Promise.resolve();
    });

    const banner = component!.root.findByProps({
      testID: 'announcements-subscription-expired-banner',
    });

    expect(banner).toBeTruthy();
  });

  it('does not show the subscription expired banner when subscription is active', async () => {
    mockTrialStatus.isActive = true;
    mockTrialStatus.isExpired = false;

    let component: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderer.create(<GroupAnnouncementsScreen />);
      await Promise.resolve();
    });

    const banners = component!.root.findAllByProps({
      testID: 'announcements-subscription-expired-banner',
    });

    expect(banners).toHaveLength(0);
  });
});
