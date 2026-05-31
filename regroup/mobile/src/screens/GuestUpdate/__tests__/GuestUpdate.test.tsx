/**
 * GuestUpdate Screen Tests
 *
 * Covers:
 *  - Renders without crashing
 *  - Shows loading indicator while guests are being fetched
 *  - Shows the form when guests have loaded
 *  - RatsLoadingModal is visible when update mutation is pending
 *  - RatsLoadingModal is hidden when mutation is idle
 *  - Error message is passed to loading modal
 *  - Calls useGuests with the selected house id
 *  - Does not call useGuests when house id is empty
 *  - updateGuestMutation.isPending propagates to loading modal
 *  - Renders GuestUpdateForm with navigation prop
 *  - Re-renders without error
 */

// ─── useSelectedHouse mock ────────────────────────────────────────────────────
const mockUseSelectedHouse = jest.fn();

jest.mock('../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => mockUseSelectedHouse(),
}));

// ─── Firebase / native module mocks ────────────────────────────────────────
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
      commit: jest.fn(() => Promise.resolve()),
    })),
  },
  functions: { httpsCallable: jest.fn(() => jest.fn()) },
}));

// ─── Service mocks ────────────────────────────────────────────────────────────
jest.mock('../../../services/guest', () => ({
  createGuestId: jest.fn(() => 'mock-guest-id'),
  getGuests: jest.fn(() => Promise.resolve({})),
  getGuestsBlocking: jest.fn(() => Promise.resolve({})),
  createGuest: jest.fn(() => Promise.resolve()),
  updateGuest: jest.fn(() => Promise.resolve()),
  deleteGuest: jest.fn(() => Promise.resolve()),
  archiveGuest: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../../services/house', () => ({
  createHouseId: jest.fn(() => 'mock-house-id'),
  getHouse: jest.fn(),
  getHouses: jest.fn(),
  createHouse: jest.fn(),
  updateHouse: jest.fn(),
  houseCollection: {},
}));

jest.mock('../../../services/issues', () => ({
  createIssue: jest.fn(),
  removeIssue: jest.fn(),
  updateIssueStatus: jest.fn(),
}));

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock('@react-navigation/native-stack', () => ({}));

// ─── Context mock ─────────────────────────────────────────────────────────────
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
      tertiaryColor: '#ccc',
      logoTintColor: '#fff',
    },
  }),
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

// ─── React Query hooks mocks ──────────────────────────────────────────────────
const mockUseGuests = jest.fn();
const mockUseUpdateGuest = jest.fn();

jest.mock('../../../state/queries', () => ({
  useGuests: (...args: any[]) => mockUseGuests(...args),
  useUpdateGuest: () => mockUseUpdateGuest(),
}));

// ─── Component stubs ──────────────────────────────────────────────────────────
jest.mock(
  '../../../components/rats-loading-indicator/rats-loading-indicator',
  () => {
    const { View } = require('react-native');
    return () => <View testID="rats-loading-indicator" />;
  },
);

jest.mock('../../../components/rats-loading-modal', () => {
  const { View, Text } = require('react-native');
  return ({ isVisible, loadingMessage, error }: any) => (
    <View testID="rats-loading-modal" accessible={!!isVisible}>
      {loadingMessage ? (
        <Text testID="loading-message">{loadingMessage}</Text>
      ) : null}
      {error ? <Text testID="loading-error">{error}</Text> : null}
    </View>
  );
});

// ─── GuestUpdateForm stub — avoids Formik/KeyboardAware complexity ─────────────
jest.mock('../GuestUpdateForm', () => {
  const { View } = require('react-native');
  return ({ navigation }: any) => <View testID="guest-update-form" />;
});

// ─── Util mocks ───────────────────────────────────────────────────────────────
jest.mock('../../../util/display', () => ({
  getCurrentTime: jest.fn(() => '2024-01-01T00:00:00.000Z'),
  getTodaysDate: jest.fn(() => '2024-01-01'),
  getDateAndTime: jest.fn(() => 'Jan 1, 2024'),
}));

// ─── React imports (after mocks) ───────────────────────────────────────────────
import React from 'react';
import { render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import uiReducer from '../../../state/slices/uiSlice';
import authReducer from '../../../state/slices/authSlice';
import themeReducer from '../../../state/slices/themeSlice';
import navigationReducer from '../../../state/slices/navigationSlice';
import userReducer from '../../../state/slices/userSlice';
import housesReducer from '../../../state/slices/housesSlice';
import guestsReducer from '../../../state/slices/guestsSlice';
import meetingsReducer from '../../../state/slices/meetingsSlice';
import adminReducer from '../../../state/slices/adminSlice';
import chatReducer from '../../../state/slices/chatSlice';
import setupReducer from '../../../state/slices/setupSlice';
import notificationsReducer from '../../../state/slices/notificationsSlice';

import GuestUpdateScreen from '../GuestUpdate';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_GUEST: any = {
  id: 'guest-1',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  houseId: 'house-1',
  sobrietyDate: '2020-01-01',
  drugOfChoice: 'Alcohol',
  phase: 'default',
  step: 1,
  status: 'active',
  isAdmin: false,
  infoEntered: false,
  hasJob: false,
  rentOwed: 0,
  choreFees: 0,
  dailyHabit: 0,
  supporters: [],
  jobs: [],
  version: 0,
  createdDate: '2024-01-01T00:00:00.000Z',
  lastUpdated: '2024-01-01T00:00:00.000Z',
};

const BASE_HOUSE: any = {
  id: 'house-1',
  name: 'Test House',
  adminIds: [],
  superAdminIds: [],
  pendingAdminInvites: [],
  issues: {},
  disputes: {},
  applications: {},
  complaints: {},
  rooms: {},
  chores: {},
  phases: {},
  health: {},
  timezone: '',
  ownerId: '',
  lat: 0,
  lng: 0,
  geohash: '',
  street: '1 Main St',
  city: 'Springfield',
  state: 'IL',
  zip: '62701',
  country: 'US',
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
  gender: '',
  baths: 1,
  wifi: false,
  rating: 3,
  stripeStatus: 'not_connected',
  createdDate: '2024-01-01T00:00:00.000Z',
  lastUpdated: '2024-01-01T00:00:00.000Z',
};

// ─── Store builder ─────────────────────────────────────────────────────────────

function buildStore(
  overrides: { house?: any | null; guest?: any | null } = {},
) {
  const house = 'house' in overrides ? overrides.house : BASE_HOUSE;
  const guest = 'guest' in overrides ? overrides.guest : BASE_GUEST;

  mockUseSelectedHouse.mockReturnValue({
    house,
    houseId: house?.id ?? null,
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
    },
    preloadedState: {
      houses: {
        selectedHouse: house,
        houses: house ? { [house.id]: house } : {},
        searchedHouses: [],
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
        error: null,
      } as any,
      guests: {
        guests: guest ? { [guest.id]: guest } : {},
        selectedGuest: guest,
        loading: false,
        error: null,
        requestingGuests: false,
        requestingGuestsFailed: false,
        requestingGuestsSuccessful: false,
        updatingGuest: false,
        updatingGuestSuccessful: false,
        updatingGuestFailed: false,
        creatingGuest: false,
        creatingGuestSuccessful: false,
        creatingGuestFailed: false,
        deletingGuest: false,
        deletingGuestSuccessful: false,
        deletingGuestFailed: false,
      } as any,
      user: {
        user: { id: 'user-1', firstName: 'Admin', lastName: 'User' },
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

const mockNavigation: any = { goBack: jest.fn(), navigate: jest.fn() };

function renderScreen(
  storeOverrides: { house?: any | null; guest?: any | null } = {},
) {
  const store = buildStore(storeOverrides);
  return render(
    <Provider store={store}>
      <GuestUpdateScreen navigation={mockNavigation} />
    </Provider>,
  );
}

// ─── Default mutation state ────────────────────────────────────────────────────
const idleMutation = {
  isPending: false,
  isError: false,
  error: null,
  mutate: jest.fn(),
  mutateAsync: jest.fn(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GuestUpdateScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: loaded, no update in flight
    mockUseGuests.mockReturnValue({
      data: { 'guest-1': BASE_GUEST },
      isLoading: false,
      isError: false,
      error: null,
    });
    mockUseUpdateGuest.mockReturnValue(idleMutation);
  });

  describe('Rendering', () => {
    it('renders without crashing', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('guest-update-form')).toBeTruthy();
    });

    it('renders the GuestUpdateForm', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('guest-update-form')).toBeTruthy();
    });

    it('renders the loading modal element', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('rats-loading-modal')).toBeTruthy();
    });

    it('loading modal is not accessible (hidden) when idle', () => {
      const { getByTestId } = renderScreen();
      // accessible={false} means not visible
      expect(getByTestId('rats-loading-modal').props.accessible).toBeFalsy();
    });

    it('renders correctly with no house selected', () => {
      mockUseGuests.mockReturnValue({
        data: null,
        isLoading: false,
        isError: false,
        error: null,
      });
      const { getByTestId } = renderScreen({ house: null });
      expect(getByTestId('guest-update-form')).toBeTruthy();
    });
  });

  describe('Loading state', () => {
    it('shows the loading indicator while guests are being fetched', () => {
      mockUseGuests.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
      });
      const { getByTestId } = renderScreen();
      expect(getByTestId('rats-loading-indicator')).toBeTruthy();
    });

    it('does not show GuestUpdateForm while loading', () => {
      mockUseGuests.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
      });
      const { queryByTestId } = renderScreen();
      expect(queryByTestId('guest-update-form')).toBeNull();
    });

    it('shows form once loading completes', () => {
      mockUseGuests.mockReturnValue({
        data: { 'guest-1': BASE_GUEST },
        isLoading: false,
        isError: false,
        error: null,
      });
      const { getByTestId } = renderScreen();
      expect(getByTestId('guest-update-form')).toBeTruthy();
    });
  });

  describe('Update mutation loading modal', () => {
    it('makes loading modal accessible when update is pending', () => {
      mockUseUpdateGuest.mockReturnValue({ ...idleMutation, isPending: true });
      const { getByTestId } = renderScreen();
      expect(getByTestId('rats-loading-modal').props.accessible).toBeTruthy();
    });

    it('shows "Updating Guest" message inside modal when pending', () => {
      mockUseUpdateGuest.mockReturnValue({ ...idleMutation, isPending: true });
      const { getByTestId } = renderScreen();
      expect(getByTestId('loading-message')).toBeTruthy();
    });

    it('shows error message in modal when update has error', () => {
      mockUseUpdateGuest.mockReturnValue({
        ...idleMutation,
        isPending: false,
        error: { message: 'Update failed' },
      });
      const { getByTestId } = renderScreen();
      expect(getByTestId('loading-error')).toBeTruthy();
    });

    it('hides error message when no error', () => {
      const { queryByTestId } = renderScreen();
      expect(queryByTestId('loading-error')).toBeNull();
    });
  });

  describe('React Query integration', () => {
    it('calls useGuests with the house id', () => {
      renderScreen();
      expect(mockUseGuests).toHaveBeenCalledWith('house-1', true);
    });

    it('calls useGuests with empty string and false when house is absent', () => {
      renderScreen({ house: null });
      expect(mockUseGuests).toHaveBeenCalledWith('', false);
    });
  });

  describe('Re-render', () => {
    it('re-renders without error', () => {
      const store = buildStore();
      const { rerender, getByTestId } = render(
        <Provider store={store}>
          <GuestUpdateScreen navigation={mockNavigation} />
        </Provider>,
      );
      rerender(
        <Provider store={store}>
          <GuestUpdateScreen navigation={mockNavigation} />
        </Provider>,
      );
      expect(getByTestId('guest-update-form')).toBeTruthy();
    });
  });
});
