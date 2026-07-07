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
    name: 'TreasurerHandoff',
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

// --- Firebase auth: user1 is logged in ---
jest.mock('@react-native-firebase/auth', () => () => ({
  currentUser: {uid: 'user1', email: 'admin@test.com'},
  onAuthStateChanged: jest.fn(() => jest.fn()),
}));

// --- Firestore: mock chained collection().doc().onSnapshot()/get() calls ---
// This screen calls firestore() directly (not through a slice/model), so
// (unlike GroupTreasuryScreen/GroupOverviewScreen tests) it needs its own
// per-file override of the global jest.setup.js firestore mock.
const mockUnsubscribe = jest.fn();
const mockOnSnapshot = jest.fn(() => mockUnsubscribe);
const mockGroupDoc = {
  onSnapshot: mockOnSnapshot,
};
const mockMembersGet = jest.fn(() => Promise.resolve({docs: []}));
jest.mock('@react-native-firebase/firestore', () => {
  const mockCollection = jest.fn((name: string) => {
    if (name === 'groups') {
      return {doc: jest.fn(() => mockGroupDoc)};
    }
    if (name === 'members') {
      return {
        where: jest.fn().mockReturnThis(),
        get: mockMembersGet,
      };
    }
    return {
      doc: jest.fn(() => ({
        get: jest.fn(() => Promise.resolve({data: () => null})),
      })),
    };
  });
  const fn = () => ({collection: mockCollection});
  return fn;
});

// --- Redux store: call selector with empty state; each slice returns mock data ---
const mockDispatch = jest.fn(() => ({unwrap: () => Promise.resolve([])}));
jest.mock('../store', () => ({
  useAppSelector: (selector: (state: object) => unknown) => selector({}),
  useAppDispatch: () => mockDispatch,
}));

const mockGroup = {
  id: 'g1',
  name: 'Test Group',
  treasurers: ['user1'],
};

jest.mock('../store/slices/groupsSlice', () => ({
  selectGroupById: () => mockGroup,
  fetchGroupById: jest.fn(() => ({type: 'groups/fetchById'})),
}));

// --- Native deps ---
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

import TreasurerHandoffScreen from '../screens/homegroup/TreasurerHandoffScreen';

describe('TreasurerHandoffScreen — Firestore listener lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnSnapshot.mockReturnValue(mockUnsubscribe);
    mockMembersGet.mockResolvedValue({docs: []});
  });

  it('unsubscribes from the group snapshot listener on unmount', async () => {
    let component: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderer.create(<TreasurerHandoffScreen />);
      await Promise.resolve();
    });

    expect(mockOnSnapshot).toHaveBeenCalled();

    act(() => {
      component!.unmount();
    });

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
