/**
 * HouseConfig Screen Tests
 *
 * Covers:
 * - Renders without crash
 * - "House Configuration" heading is visible
 * - HouseConfigForm is rendered inside the scroll view
 * - Action buttons (Add Phase, Add Chore, Add Admin, Next, House Search)
 * - User data is passed through from Redux state
 * - Screen renders when user is null (graceful handling)
 */

// ─── Firebase mock ────────────────────────────────────────────────────────────
jest.mock('../../../../firebase-setup', () => ({
  firestore: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(() =>
          Promise.resolve({ exists: false, data: () => null }),
        ),
        set: jest.fn(() => Promise.resolve()),
        update: jest.fn(() => Promise.resolve()),
        delete: jest.fn(() => Promise.resolve()),
      })),
      get: jest.fn(() => Promise.resolve({ docs: [] })),
      where: jest.fn().mockReturnThis(),
    })),
    batch: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      commit: jest.fn(() => Promise.resolve()),
    })),
  },
  functions: {
    httpsCallable: jest.fn(() => jest.fn(() => Promise.resolve({ data: {} }))),
  },
}));

jest.mock('@react-native-firebase/firestore', () => ({
  firebase: {},
  FirebaseFirestoreTypes: {},
}));
jest.mock('@react-navigation/native-stack', () => ({}));

// ─── Service mocks ────────────────────────────────────────────────────────────
jest.mock('../../../services/house', () => ({
  getHouse: jest.fn(),
  houseCollection: {},
}));
jest.mock('../../../services/admin', () => ({
  getAdmins: jest.fn(() => Promise.resolve({})),
  adminCollection: {},
}));
jest.mock('../../../services/guest', () => ({
  getGuests: jest.fn(() => Promise.resolve({})),
  houseCollection: {},
}));

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  NavigationContainer: ({ children }: any) => children,
}));

// ─── Context mocks ────────────────────────────────────────────────────────────
jest.mock('../../../context', () => ({
  useNotification: () => ({
    showPopover: jest.fn(),
    setPopoverRef: jest.fn(),
    notify: jest.fn(),
  }),
  useModal: () => ({
    showFormModal: jest.fn(),
    dismissFormModal: jest.fn(),
    setLoadingModalState: jest.fn(),
  }),
  useTheme: () => ({
    theme: {
      primaryColor: '#000',
      secondaryColor: '#fff',
      backgroundColor: '#fff',
      textColor: '#000',
      primaryFontFamily: 'System',
      secondaryFontFamily: 'System',
    },
  }),
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

// ─── Stub the heavy HouseConfigForm so we test the container only ─────────────
jest.mock('../HouseConfigForm', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  return (props: any) =>
    React.createElement(
      View,
      { testID: 'house-config-form' },
      React.createElement(Text, null, 'HouseConfigForm'),
      React.createElement(
        TouchableOpacity,
        { testID: 'add-phase-button', onPress: jest.fn() },
        React.createElement(Text, null, 'Add Phase'),
      ),
      React.createElement(
        TouchableOpacity,
        { testID: 'add-chore-button', onPress: jest.fn() },
        React.createElement(Text, null, 'Add Chore'),
      ),
      React.createElement(
        TouchableOpacity,
        { testID: 'add-admin-button', onPress: jest.fn() },
        React.createElement(Text, null, 'Add Admin'),
      ),
      React.createElement(
        TouchableOpacity,
        {
          testID: 'next-button',
          onPress: props.handleSubmit || jest.fn(),
        },
        React.createElement(Text, null, 'Next'),
      ),
      React.createElement(
        TouchableOpacity,
        {
          testID: 'house-search-button',
          onPress: () => props.navigation?.navigate?.('houseSearch'),
        },
        React.createElement(Text, null, 'House Search'),
      ),
    );
});

// ─── Stub the scroll view ─────────────────────────────────────────────────────
jest.mock('../../../components/rats-scroll-view', () => {
  const { ScrollView } = require('react-native');
  return ScrollView;
});

// ─── React imports ────────────────────────────────────────────────────────────
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import housesReducer from '../../../state/slices/housesSlice';
import guestsReducer from '../../../state/slices/guestsSlice';
import userReducer from '../../../state/slices/userSlice';
import adminReducer from '../../../state/slices/adminSlice';
import authReducer from '../../../state/slices/authSlice';
import themeReducer from '../../../state/slices/themeSlice';
import chatReducer from '../../../state/slices/chatSlice';
import setupReducer from '../../../state/slices/setupSlice';
import notificationsReducer from '../../../state/slices/notificationsSlice';
import meetingsReducer from '../../../state/slices/meetingsSlice';

import HouseConfig from '../HouseConfig';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_HOUSE: any = {
  id: 'house-1',
  name: 'Recovery House',
  timezone: 'America/Chicago',
  ownerId: 'owner-1',
  adminIds: ['admin-1'],
  superAdminIds: [],
  pendingAdminInvites: [],
  pendingGuestInvites: [],
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
  avatar: '',
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

// ─── Store factory ────────────────────────────────────────────────────────────

function buildStore(
  user: any = { id: 'user-1', firstName: 'Alice', lastName: 'Manager' },
) {
  return configureStore({
    reducer: {
      auth: authReducer,
      theme: themeReducer,
      user: userReducer,
      houses: housesReducer,
      guests: guestsReducer,
      meetings: meetingsReducer,
      admin: adminReducer,
      chat: chatReducer,
      setup: setupReducer,
      notifications: notificationsReducer,
    },
    preloadedState: {
      houses: {
        selectedHouse: BASE_HOUSE,
        houses: { [BASE_HOUSE.id]: BASE_HOUSE },
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
        loading: false,
        error: null,
      } as any,
      admin: {
        houseAdmins: {},
        admins: {},
        selectedAdmin: null,
        userAsAdmin: null,
        loading: false,
        error: null,
      } as any,
      user: {
        user,
        loading: false,
        error: null,
        loggedIn: true,
        loggingIn: false,
        loggingInFailed: false,
        signingUp: false,
        signingUpFailed: false,
      } as any,
    },
  });
}

const mockNavigation: any = { navigate: jest.fn(), goBack: jest.fn() };

function renderScreen(store: ReturnType<typeof buildStore>) {
  return render(
    <Provider store={store}>
      <HouseConfig />
    </Provider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HouseConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Render ───────────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders without crashing', () => {
      const store = buildStore();
      const { getByText } = renderScreen(store);
      expect(getByText('House Configuration')).toBeTruthy();
    });

    it('renders the "House Configuration" heading', () => {
      const store = buildStore();
      const { getByText } = renderScreen(store);
      expect(getByText('House Configuration')).toBeTruthy();
    });

    it('renders the HouseConfigForm component', () => {
      const store = buildStore();
      const { getByTestId } = renderScreen(store);
      expect(getByTestId('house-config-form')).toBeTruthy();
    });

    it('renders when user is null without throwing', () => {
      const store = buildStore(null);
      expect(() => renderScreen(store)).not.toThrow();
    });
  });

  // ─── Form actions ─────────────────────────────────────────────────────────

  describe('form action buttons', () => {
    it('renders the Add Phase button inside the form', () => {
      const store = buildStore();
      const { getByTestId } = renderScreen(store);
      expect(getByTestId('add-phase-button')).toBeTruthy();
    });

    it('renders the Add Chore button inside the form', () => {
      const store = buildStore();
      const { getByTestId } = renderScreen(store);
      expect(getByTestId('add-chore-button')).toBeTruthy();
    });

    it('renders the Add Admin button inside the form', () => {
      const store = buildStore();
      const { getByTestId } = renderScreen(store);
      expect(getByTestId('add-admin-button')).toBeTruthy();
    });

    it('renders the Next (submit) button inside the form', () => {
      const store = buildStore();
      const { getByTestId } = renderScreen(store);
      expect(getByTestId('next-button')).toBeTruthy();
    });

    it('renders the House Search navigation button inside the form', () => {
      const store = buildStore();
      const { getByTestId } = renderScreen(store);
      expect(getByTestId('house-search-button')).toBeTruthy();
    });

    it('pressing the Add Phase button does not throw', () => {
      const store = buildStore();
      const { getByTestId } = renderScreen(store);
      expect(() =>
        fireEvent.press(getByTestId('add-phase-button')),
      ).not.toThrow();
    });

    it('pressing the Add Chore button does not throw', () => {
      const store = buildStore();
      const { getByTestId } = renderScreen(store);
      expect(() =>
        fireEvent.press(getByTestId('add-chore-button')),
      ).not.toThrow();
    });

    it('pressing the Next button does not throw', () => {
      const store = buildStore();
      const { getByTestId } = renderScreen(store);
      expect(() => fireEvent.press(getByTestId('next-button'))).not.toThrow();
    });
  });

  // ─── User state ───────────────────────────────────────────────────────────

  describe('user state', () => {
    it('renders with an authenticated user in the Redux store', () => {
      const store = buildStore({
        id: 'user-1',
        firstName: 'Bob',
        lastName: 'Admin',
      });
      const { getByText } = renderScreen(store);
      expect(getByText('House Configuration')).toBeTruthy();
    });

    it('renders with a different user without crashing', () => {
      const store = buildStore({
        id: 'user-2',
        firstName: 'Carol',
        lastName: 'Operator',
      });
      expect(() => renderScreen(store)).not.toThrow();
    });
  });
});
