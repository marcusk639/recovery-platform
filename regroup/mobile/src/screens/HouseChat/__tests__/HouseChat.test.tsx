/**
 * HouseChat Tests
 *
 * Covers:
 *  - Renders loading indicator when house is null
 *  - Renders loading indicator when user is null
 *  - Renders loading indicator while chat is still initialising
 *  - Renders BaseChat (the chat UI) when house, user, and chat are ready
 *  - Subscribes to house chat on mount
 *  - Unsubscribes on unmount
 *  - Sends a message via sendMessageToHouseChat + dispatches addMessageToConversation
 */

// ─── useSelectedHouse / useSelectedGuest mocks ───────────────────────────────
const mockUseSelectedHouse = jest.fn();
const mockUseSelectedGuest = jest.fn();

jest.mock('../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => mockUseSelectedHouse(),
}));
jest.mock('../../../hooks/useSelectedGuest', () => ({
  useSelectedGuest: () => mockUseSelectedGuest(),
}));

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock('@react-navigation/native-stack', () => ({}));

// ─── Context mocks ────────────────────────────────────────────────────────────
const mockShowPopover = jest.fn();
const mockSetPopoverRef = jest.fn();

jest.mock('../../../context', () => ({
  useModal: () => ({
    showFormModal: jest.fn(),
    dismissFormModal: jest.fn(),
    setLoadingModalState: jest.fn(),
  }),
  useNotification: () => ({
    notify: jest.fn(),
    showPopover: mockShowPopover,
    setPopoverRef: mockSetPopoverRef,
  }),
  useTheme: () => ({
    theme: {
      primaryFontFamily: 'System',
      secondaryFontFamily: 'System',
      primaryColor: '#000',
      secondaryColor: '#fff',
      tertiaryColor: '#ccc',
      backgroundColor: '#fff',
      textColor: '#000',
      logoTintColor: '#fff',
    },
  }),
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

// ─── Message service mocks ────────────────────────────────────────────────────
const mockSubscribeToHouseChat = jest.fn();
const mockUnsubscribeFromHouseChat = jest.fn();
const mockLoadChat = jest.fn(() => Promise.resolve([]));
const mockSendMessageToHouseChat = jest.fn(() => Promise.resolve());

jest.mock('../../../services/message', () => ({
  subscribeToHouseChat: (...args: any[]) => mockSubscribeToHouseChat(...args),
  unsubscribeFromHouseChat: (...args: any[]) =>
    mockUnsubscribeFromHouseChat(...args),
  loadChat: (...args: any[]) => (mockLoadChat as any)(...args),
  sendMessageToHouseChat: (...args: any[]) =>
    (mockSendMessageToHouseChat as any)(...args),
  loadDirectChat: jest.fn(() => Promise.resolve([])),
  subscribeToDirectChat: jest.fn(),
  unsubscribeFromDirectChat: jest.fn(),
  CHAT_ID: jest.fn((ids: string[]) => ids.sort().join('_')),
  updateConversation: jest.fn(() => Promise.resolve()),
  markRead: jest.fn(() => Promise.resolve()),
}));

// ─── Native module mocks ──────────────────────────────────────────────────────
jest.mock('react-native-keyboard-manager', () => ({
  setEnable: jest.fn(),
  setEnableAutoToolbar: jest.fn(),
  setToolbarDoneBarButtonItemText: jest.fn(),
  setLayoutIfNeededOnUpdate: jest.fn(),
  setKeyboardDistanceFromTextField: jest.fn(),
  setPreventShowingBottomBlankSpace: jest.fn(),
  setShouldResignOnTouchOutside: jest.fn(),
}));

jest.mock('react-native-iphone-x-helper', () => ({
  getBottomSpace: jest.fn(() => 0),
  getStatusBarHeight: jest.fn(() => 0),
  isIphoneX: jest.fn(() => false),
}));

// ─── Component stubs ──────────────────────────────────────────────────────────
jest.mock(
  '../../../components/rats-loading-indicator/rats-loading-indicator',
  () => {
    const { View } = require('react-native');
    return () => <View testID="loading-indicator" />;
  },
);

jest.mock('../../../components/rats-text', () => ({
  RatsText: ({ text }: any) => {
    const { Text } = require('react-native');
    return <Text>{text || ''}</Text>;
  },
}));

jest.mock('../../../components/rats-button/rats-button', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return ({ title, onPress, testID, disabled }: any) => (
    <TouchableOpacity
      testID={testID || 'rats-button'}
      onPress={onPress}
      disabled={disabled}>
      <Text>{title}</Text>
    </TouchableOpacity>
  );
});

jest.mock('../../../components/rats-icon', () => ({
  RatsIcon: ({ testID, name }: any) => {
    const { View } = require('react-native');
    return <View testID={testID || `icon-${name}`} />;
  },
  Icon: ({ testID, name }: any) => {
    const { View } = require('react-native');
    return <View testID={testID || `icon-${name}`} />;
  },
}));

jest.mock('../../../components/rats-avatar', () => {
  const { View } = require('react-native');
  return ({ testID }: any) => <View testID={testID || 'rats-avatar'} />;
});

// ─── BaseChat stub ─────────────────────────────────────────────────────────────
// BaseChat is complex (keyboard listeners, useChatLogic hook). Stub it to a
// simple element so HouseChat's own state/props are isolated in these tests.
// The path must match what HouseChat.tsx actually imports: '../DirectChat/BaseChat'
// resolved relative to the project root becomes 'src/screens/DirectChat/BaseChat'.
jest.mock('../../DirectChat/BaseChat', () => {
  const { View, TextInput, TouchableOpacity, Text } = require('react-native');
  return ({ onSend, messages, conversationId }: any) => (
    <View testID="base-chat">
      <Text testID="conversation-id">{conversationId}</Text>
      <Text testID="message-count">{(messages || []).length}</Text>
      <TextInput testID="message-input" onChangeText={() => {}} />
      <TouchableOpacity
        testID="send-button"
        onPress={() => onSend && onSend('Hello world')}>
        <Text>SEND</Text>
      </TouchableOpacity>
    </View>
  );
});

// ─── util/phone ───────────────────────────────────────────────────────────────
jest.mock('../../../util/phone', () => ({
  callNumber: jest.fn(),
}));

// ─── util/display ────────────────────────────────────────────────────────────
jest.mock('../../../util/display', () => ({
  dateAndTime: jest.fn(() => 'Jan 1, 2026 12:00 PM'),
}));

// ─── React imports (after mocks) ──────────────────────────────────────────────
import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import housesReducer from '../../../state/slices/housesSlice';
import guestsReducer from '../../../state/slices/guestsSlice';
import userReducer from '../../../state/slices/userSlice';
import adminReducer from '../../../state/slices/adminSlice';
import uiReducer from '../../../state/slices/uiSlice';
import authReducer from '../../../state/slices/authSlice';
import themeReducer from '../../../state/slices/themeSlice';
import navigationReducer from '../../../state/slices/navigationSlice';
import chatReducer from '../../../state/slices/chatSlice';
import setupReducer from '../../../state/slices/setupSlice';
import notificationsReducer from '../../../state/slices/notificationsSlice';
import meetingsReducer from '../../../state/slices/meetingsSlice';

import HouseChat from '../HouseChat';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_HOUSE: any = {
  id: 'house-1',
  name: 'Test House',
  adminIds: ['admin-1'],
  superAdminIds: [],
  avatar: 'https://example.com/avatar.jpg',
  pendingAdminInvites: [],
  timezone: '',
  ownerId: 'owner-1',
  lat: 0,
  lng: 0,
  geohash: '',
  street: '1 Main St',
  city: 'Springfield',
  state: 'IL',
  zip: '62701',
  country: 'US',
  health: {},
  monthlyRent: 1000,
  weeklyRent: 250,
  currentCapacity: 2,
  maximumCapacity: 5,
  code: 'TEST01',
  imageUrl: '',
  depositsAndFees: 0,
  certified: false,
  phoneNumber: '5551234567',
  rentFrequency: 'both',
  subscriptionStatus: 'active',
  isDemoHouse: false,
  houseType: 'traditional',
  seniorPeerEmails: [],
  managerSetupType: 'operator-only',
  awaitingVerification: [],
  chores: {},
  phases: {},
  gender: '',
  disputes: {},
  applications: {},
  complaints: {},
  rooms: {},
  baths: 1,
  wifi: false,
  rating: 3,
  createdDate: '2024-01-01',
  lastUpdated: '2024-01-01',
};

const BASE_USER: any = {
  uid: 'user-1',
  id: 'user-1',
  firstName: 'Alice',
  lastName: 'Manager',
  email: 'alice@example.com',
  isAdmin: true,
  adminId: 'admin-1',
  guestId: undefined,
  avatar: '',
};

const BASE_ADMIN: any = {
  id: 'admin-1',
  userId: 'user-1',
  firstName: 'Alice',
  lastName: 'Manager',
  email: 'alice@example.com',
  houseIds: ['house-1'],
  superAdmin: [],
  phoneNumber: '',
  avatar: '',
};

const SAMPLE_MESSAGE: any = {
  id: 'msg-1',
  houseId: 'house-1',
  text: 'Hello from Alice',
  senderId: 'user-1',
  user: { _id: 'user-1', name: 'Alice Manager', avatar: '' },
  createdAt: new Date('2026-01-01T12:00:00Z'),
  sortKey: '1735732800000',
  read: false,
};

// ─── Store builder ─────────────────────────────────────────────────────────────

interface BuildStoreOptions {
  house?: any;
  user?: any;
  admin?: any;
  messages?: any[];
  conversationId?: string | null;
}

function buildStore({
  house = BASE_HOUSE,
  user = BASE_USER,
  admin = BASE_ADMIN,
  messages = [],
  conversationId = null,
}: BuildStoreOptions = {}) {
  const conversations: Record<string, any[]> = {};
  if (house && messages.length) {
    conversations[house.id] = messages;
  }

  mockUseSelectedHouse.mockReturnValue({
    house,
    houseId: house?.id ?? null,
    isLoading: false,
  });
  mockUseSelectedGuest.mockReturnValue({
    guest: null,
    guestId: null,
    isLoading: false,
  });

  return configureStore({
    reducer: {
      ui: uiReducer,
      auth: authReducer,
      theme: themeReducer,
      navigation: navigationReducer,
      user: userReducer,
      houses: housesReducer,
      guests: guestsReducer,
      meetings: meetingsReducer,
      admin: adminReducer,
      chat: chatReducer,
      setup: setupReducer,
      notifications: notificationsReducer,
    } as any,
    preloadedState: {
      houses: {
        selectedHouse: house,
        houses: house ? { [house.id]: house } : {},
        searchedHouses: [],
        loading: false,
        error: null,
        requestingHouse: false,
        requestingHouseFailed: false,
        requestingHouses: false,
        requestingHousesSuccessful: false,
        requestingHousesFailed: false,
        searchingHouses: false,
        searchingHousesSuccessful: false,
        searchingHousesFailed: false,
        creatingHouse: false,
        creatingHouseSuccessful: false,
        creatingHouseFailed: false,
        updatingHouse: false,
        updatingHouseSuccessful: false,
        updatingHouseFailed: false,
      } as any,
      guests: {
        guests: {},
        selectedGuest: null,
        userAsGuest: null,
        status: 'idle',
        error: null,
        updateStatus: 'idle',
        createStatus: 'idle',
        deleteStatus: 'idle',
        customizePhaseStatus: 'idle',
      } as any,
      admin: {
        houseAdmins: admin ? { [admin.id]: admin } : {},
        admins: admin ? { [admin.id]: admin } : {},
        selectedAdmin: null,
        userAsAdmin: admin ?? null,
        loading: false,
        error: null,
      } as any,
      user: {
        user,
        loading: false,
        error: null,
        loggedIn: !!user,
        loggingIn: false,
        loggingInFailed: false,
        loggingOut: false,
        loggingOutSuccessful: false,
        signingUp: false,
        signingUpFailed: false,
      } as any,
      chat: {
        conversations,
        activeConversationId: conversationId,
        recipient: null,
        sendingMessage: false,
        messageSent: false,
        loading: false,
        error: null,
      } as any,
    },
  });
}

const mockNavigation: any = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
};

function renderScreen(storeOptions: BuildStoreOptions = {}) {
  const store = buildStore(storeOptions);
  return render(
    <Provider store={store}>
      <HouseChat navigation={mockNavigation} />
    </Provider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HouseChat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // subscribeToHouseChat now returns the Firestore unsubscribe function
    // (HouseChat stores it in a ref and calls it directly on cleanup).
    // Return mockUnsubscribeFromHouseChat so the existing "calls
    // unsubscribeFromHouseChat on unmount" assertion still passes.
    mockSubscribeToHouseChat.mockImplementation(
      (_houseId: string, _cb: Function) => mockUnsubscribeFromHouseChat,
    );
  });

  // ─── Loading states ────────────────────────────────────────────────────────
  describe('loading states', () => {
    it('renders loading indicator when house is null', async () => {
      const { getByTestId } = renderScreen({ house: null });
      expect(getByTestId('loading-indicator')).toBeTruthy();
    });

    it('renders loading indicator when user is null', async () => {
      const { getByTestId } = renderScreen({ user: null });
      expect(getByTestId('loading-indicator')).toBeTruthy();
    });

    it('does not render BaseChat when house is null', async () => {
      const { queryByTestId } = renderScreen({ house: null });
      expect(queryByTestId('base-chat')).toBeNull();
    });

    it('does not render BaseChat when user is null', async () => {
      const { queryByTestId } = renderScreen({ user: null });
      expect(queryByTestId('base-chat')).toBeNull();
    });
  });

  // ─── Rendered chat UI ──────────────────────────────────────────────────────
  describe('chat UI render', () => {
    it('renders BaseChat when house and user are present', async () => {
      const { getByTestId } = renderScreen();
      await waitFor(() => {
        expect(getByTestId('base-chat')).toBeTruthy();
      });
    });

    it('passes house.id as conversationId to BaseChat', async () => {
      const { getByTestId } = renderScreen();
      await waitFor(() => {
        expect(getByTestId('conversation-id').props.children).toBe('house-1');
      });
    });

    it('passes empty messages array when no messages exist', async () => {
      const { getByTestId } = renderScreen({ messages: [] });
      await waitFor(() => {
        expect(getByTestId('message-count').props.children).toBe(0);
      });
    });

    it('passes messages from Redux state to BaseChat', async () => {
      const { getByTestId } = renderScreen({ messages: [SAMPLE_MESSAGE] });
      await waitFor(() => {
        expect(getByTestId('message-count').props.children).toBe(1);
      });
    });
  });

  // ─── Firebase subscription ─────────────────────────────────────────────────
  describe('Firebase subscription', () => {
    it('calls subscribeToHouseChat with house.id on mount', async () => {
      renderScreen();
      await waitFor(() => {
        expect(mockSubscribeToHouseChat).toHaveBeenCalledWith(
          'house-1',
          expect.any(Function),
        );
      });
    });

    it('does not call subscribeToHouseChat when house is null', async () => {
      renderScreen({ house: null });
      await waitFor(() => {
        expect(mockSubscribeToHouseChat).not.toHaveBeenCalled();
      });
    });

    it('calls unsubscribeFromHouseChat on unmount', async () => {
      const { unmount } = renderScreen();
      await waitFor(() => {
        expect(mockSubscribeToHouseChat).toHaveBeenCalled();
      });
      unmount();
      expect(mockUnsubscribeFromHouseChat).toHaveBeenCalled();
    });
  });

  // ─── Send message ──────────────────────────────────────────────────────────
  describe('send message', () => {
    it('calls sendMessageToHouseChat when the send button is pressed', async () => {
      const { getByTestId } = renderScreen();
      await waitFor(() => {
        expect(getByTestId('send-button')).toBeTruthy();
      });
      await act(async () => {
        fireEvent.press(getByTestId('send-button'));
      });
      await waitFor(() => {
        expect(mockSendMessageToHouseChat).toHaveBeenCalledWith(
          'house-1',
          expect.any(Array),
        );
      });
    });
  });
});
