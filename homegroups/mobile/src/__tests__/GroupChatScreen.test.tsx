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
    name: 'GroupChat',
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
  currentUser: {
    uid: 'user1',
    displayName: 'Test User',
    email: 'user1@test.com',
  },
  onAuthStateChanged: jest.fn(() => jest.fn()),
}));

// --- Firebase firestore: capture .set() calls made by the typing indicator ---
const mockSet = jest.fn(() => Promise.resolve());
const mockUpdate = jest.fn(() => Promise.resolve());
const mockOnSnapshot = jest.fn(() => jest.fn());
jest.mock('@react-native-firebase/firestore', () => {
  const mockDoc = jest.fn(() => ({
    set: mockSet,
    update: mockUpdate,
    onSnapshot: mockOnSnapshot,
    get: jest.fn(() => Promise.resolve({exists: false, data: () => null})),
    delete: jest.fn(() => Promise.resolve()),
  }));
  const mockCollection = jest.fn(() => ({
    doc: mockDoc,
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    onSnapshot: mockOnSnapshot,
    get: jest.fn(() => Promise.resolve({docs: [], empty: true})),
  }));
  const fn: any = () => ({collection: mockCollection});
  fn.Timestamp = {
    now: jest.fn(() => ({
      toDate: () => new Date(),
      toMillis: () => Date.now(),
    })),
    fromDate: jest.fn((d: Date) => ({
      toDate: () => d,
      toMillis: () => d.getTime(),
    })),
  };
  fn.FieldValue = {
    delete: jest.fn(() => ({})),
    serverTimestamp: jest.fn(() => ({})),
  };
  return fn;
});

// --- Redux store: call selector with empty state; each slice returns mock data ---
const mockDispatch = jest.fn(() => ({unwrap: () => Promise.resolve([])}));
jest.mock('../store', () => ({
  useAppSelector: (selector: (state: object) => unknown) => selector({}),
  useAppDispatch: () => mockDispatch,
}));

jest.mock('../store/slices/chatSlice', () => ({
  initializeGroupChat: jest.fn(() => ({type: 'chat/initialize'})),
  fetchRecentMessages: jest.fn(() => ({type: 'chat/fetchRecent'})),
  fetchEarlierMessages: jest.fn(() => ({type: 'chat/fetchEarlier'})),
  sendMessage: jest.fn(() => ({type: 'chat/send'})),
  markMessageAsRead: jest.fn(() => ({type: 'chat/markRead'})),
  markChatAsRead: jest.fn(() => ({type: 'chat/markChatRead'})),
  addReaction: jest.fn(() => ({type: 'chat/addReaction'})),
  deleteMessage: jest.fn(() => ({type: 'chat/delete'})),
  setMessages: jest.fn(() => ({type: 'chat/setMessages'})),
  addOptimisticMessage: jest.fn(() => ({type: 'chat/addOptimistic'})),
  removeOptimisticMessage: jest.fn(() => ({type: 'chat/removeOptimistic'})),
  selectMessagesByGroup: () => [],
  selectChatStatus: () => 'succeeded',
  selectChatError: () => null,
}));

jest.mock('../store/slices/membersSlice', () => ({
  selectMembersByGroupId: () => [],
}));

jest.mock('../store/slices/groupsSlice', () => ({
  selectIsGroupMember: () => true,
  fetchGroupById: jest.fn(() => ({type: 'groups/fetchById'})),
}));

jest.mock('../models/ChatModel', () => ({
  ChatModel: {
    listenForMessages: jest.fn(() => jest.fn()),
  },
}));

jest.mock('../models/GroupModel', () => ({
  GroupModel: {
    isGroupAdmin: jest.fn(() => Promise.resolve(false)),
  },
}));

jest.mock('../models/DirectMessageModel', () => ({
  DirectMessageModel: {
    checkCanMessage: jest.fn(() => Promise.resolve(false)),
  },
  generateThreadId: jest.fn(() => 'thread1'),
}));

// --- Native deps not covered by jest.setup.js ---
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

// --- Child components with their own complex dependency trees ---
jest.mock('../components/moderation/ReportContentModal', () => () => null);

import GroupChatScreen from '../screens/homegroup/GroupChatScreen';

describe('GroupChatScreen — typing indicator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDispatch.mockReturnValue({unwrap: () => Promise.resolve([])});
  });

  it('debounces the typing-indicator Firestore write to at most once per 1.5s', async () => {
    jest.useFakeTimers();

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<GroupChatScreen />);
      await Promise.resolve();
    });

    const input = component!.root.findByProps({testID: 'chat-message-input'});

    // Two rapid onChangeText calls within the same 1.5s debounce window.
    act(() => {
      input.props.onChangeText('h');
    });
    act(() => {
      input.props.onChangeText('he');
    });

    expect(mockSet).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });

  it('writes the typing indicator again after the 1.5s debounce window elapses', async () => {
    jest.useFakeTimers();

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<GroupChatScreen />);
      await Promise.resolve();
    });

    const input = component!.root.findByProps({testID: 'chat-message-input'});

    act(() => {
      input.props.onChangeText('h');
    });
    expect(mockSet).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(1600);
    });

    act(() => {
      input.props.onChangeText('he');
    });

    expect(mockSet).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });
});
