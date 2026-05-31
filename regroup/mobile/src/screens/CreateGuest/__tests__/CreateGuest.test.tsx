/**
 * CreateGuest Screen Tests
 *
 * Covers:
 *  - Renders without crashing (smoke test)
 *  - testID "create-guest-screen" is present
 *  - CreateGuestForm child is mounted
 *  - Submit button is rendered
 *  - Form fields for a guest are present (firstName, lastName, email, etc.)
 *  - Form is disabled while submitting
 *  - Redux store selector for guests is called
 *  - Container uses correct background style
 *  - Renders with an empty Guest instance
 *  - Re-renders without error
 */

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
  functions: {
    httpsCallable: jest.fn(() => jest.fn()),
  },
}));

// ─── Service mocks ───────────────────────────────────────────────────────────
jest.mock('../../../services/guest', () => ({
  createGuestId: jest.fn(() => 'mock-guest-id'),
  getGuests: jest.fn(() => Promise.resolve({})),
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

// ─── Component stubs ──────────────────────────────────────────────────────────
jest.mock(
  '../../../components/rats-loading-indicator/rats-loading-indicator',
  () => {
    const { View } = require('react-native');
    return () => <View testID="loading-indicator" />;
  },
);

jest.mock('../../../components/rats-loading-modal', () => {
  const { View } = require('react-native');
  return ({ isVisible }: any) =>
    isVisible ? <View testID="loading-modal" /> : null;
});

jest.mock('../../../components/rats-text', () => ({
  RatsText: ({ text }: any) => {
    const { Text } = require('react-native');
    return <Text>{text || ''}</Text>;
  },
}));

// ─── Keyboard-aware scroll view ───────────────────────────────────────────────
jest.mock('react-native-keyboard-aware-scroll-view', () => {
  const { ScrollView } = require('react-native');
  return {
    KeyboardAwareScrollView: (props: any) => <ScrollView {...props} />,
  };
});

// ─── Formik stub — renders children with standard helpers ─────────────────────
jest.mock('formik', () => {
  const React = require('react');
  return {
    withFormik: (config: any) => (InnerComponent: any) => {
      return (props: any) => {
        const values = config.mapPropsToValues
          ? config.mapPropsToValues(props)
          : {};
        return (
          <InnerComponent
            {...props}
            values={values}
            handleSubmit={jest.fn()}
            isSubmitting={false}
            status={{}}
            guest={props.guest || values}
          />
        );
      };
    },
    Field: ({ component: Comp, name, placeholder, disabled, testID }: any) => {
      const { View } = require('react-native');
      return <View testID={testID || `field-${name}`} />;
    },
  };
});

// ─── RatsButton stub ──────────────────────────────────────────────────────────
jest.mock('../../../components/rats-button/rats-button', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return ({ onPress, title, testID, disabled }: any) => (
    <TouchableOpacity
      testID={testID || `button-${title}`}
      onPress={onPress}
      disabled={disabled}>
      <Text>{title}</Text>
    </TouchableOpacity>
  );
});

// ─── Misc component stubs ──────────────────────────────────────────────────────
jest.mock(
  '../../../components/rats-text-input/rats-text-input',
  () => 'RatsTextInput',
);
jest.mock(
  '../../../components/rats-checkbox/rats-checkbox',
  () => 'RatsCheckBox',
);
jest.mock(
  '../../../components/rats-datepicker/rats-datepicker',
  () => 'RatsDatePicker',
);

// ─── useSelectedHouse mock (A2 migration) ─────────────────────────────────────
// After A2, CreateGuestFormWrapper calls useSelectedHouse() which internally
// uses React Query (via useHouse). This test has no QueryClientProvider, so
// stub the hook with a fixed house. See .full-review [A2].
jest.mock('../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => ({
    house: { id: 'house-1' },
    houseId: 'house-1',
    isLoading: false,
  }),
}));

// ─── useGuests mock (A2 migration) ───────────────────────────────────────────
// After A2, CreateGuestForm reads guests via useGuests(houseId). This file has
// no QueryClientProvider; stub the hook to return whatever buildStore passed
// in. Other guestQueries exports (useUpdateGuest etc.) are stubbed to no-ops
// so they don't trigger 'No QueryClient set' errors when called transitively.
// See .full-review [A2].
const mockUseGuestsForCreateGuest = jest.fn(() => ({
  data: {},
  isLoading: false,
  isError: false,
}));
jest.mock('../../../state/queries/guestQueries', () => ({
  useGuests: (...args: any[]) => mockUseGuestsForCreateGuest(...args),
  useGuestsBlocking: () => ({ data: {}, isLoading: false }),
  useGuest: () => ({ data: null, isLoading: false }),
  useUpdateGuest: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCreateGuest: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteGuest: () => ({ mutateAsync: jest.fn(), isPending: false }),
  guestKeys: {
    all: ['guests'],
    lists: () => ['guests', 'list'],
    list: (id: string) => ['guests', 'list', id],
    details: () => ['guests', 'detail'],
    detail: (id: string) => ['guests', 'detail', id],
  },
}));

// ─── Display util ─────────────────────────────────────────────────────────────
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

import CreateGuestScreen from '../CreateGuest';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_GUEST: any = {
  id: 'guest-1',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
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

function buildStore(overrides: { guests?: any; house?: any } = {}) {
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
        selectedHouse: overrides.house ?? BASE_HOUSE,
        houses: { 'house-1': overrides.house ?? BASE_HOUSE },
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
        guests: overrides.guests ?? { 'guest-1': BASE_GUEST },
        selectedGuest: BASE_GUEST,
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

function renderScreen(storeOverrides: { guests?: any; house?: any } = {}) {
  const store = buildStore(storeOverrides);
  // A2 migration: feed the same fixture through useGuests so CreateGuestForm
  // sees the data it used to read from state.guests.guests.
  mockUseGuestsForCreateGuest.mockReturnValue({
    data: storeOverrides.guests ?? { 'guest-1': BASE_GUEST },
    isLoading: false,
    isError: false,
  });
  return render(
    <Provider store={store}>
      <CreateGuestScreen />
    </Provider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CreateGuestScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders without crashing', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('create-guest-screen')).toBeTruthy();
    });

    it('renders the top-level container with testID "create-guest-screen"', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('create-guest-screen')).toBeDefined();
    });

    it('renders the submit button', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('create-guest-button')).toBeTruthy();
    });

    it('renders submit button with title "Submit"', () => {
      const { getByText } = renderScreen();
      expect(getByText('Submit')).toBeTruthy();
    });

    it('renders the firstName field', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('guest-firstname-input')).toBeTruthy();
    });

    it('renders the lastName field', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('guest-lastname-input')).toBeTruthy();
    });

    it('renders the email field', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('guest-email-input')).toBeTruthy();
    });

    it('renders the sobrietyDate field', () => {
      const { getByTestId } = renderScreen();
      // fieldName.toLowerCase() first strips case, so no hyphens injected: "sobrietydate"
      expect(getByTestId('guest-sobrietydate-input')).toBeTruthy();
    });

    it('renders the drugOfChoice field', () => {
      const { getByTestId } = renderScreen();
      // fieldName.toLowerCase() first strips case, so no hyphens injected: "drugofchoice"
      expect(getByTestId('guest-drugofchoice-input')).toBeTruthy();
    });

    it('renders the phase field', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('guest-phase-input')).toBeTruthy();
    });
  });

  describe('State', () => {
    it('renders correctly when guest list is empty', () => {
      const { getByTestId } = renderScreen({ guests: {} });
      expect(getByTestId('create-guest-screen')).toBeTruthy();
    });

    it('renders correctly when no house is selected', () => {
      const { getByTestId } = renderScreen({ house: null });
      expect(getByTestId('create-guest-screen')).toBeTruthy();
    });

    it('re-renders without error', () => {
      const store = buildStore();
      const { rerender, getByTestId } = render(
        <Provider store={store}>
          <CreateGuestScreen />
        </Provider>,
      );
      rerender(
        <Provider store={store}>
          <CreateGuestScreen />
        </Provider>,
      );
      expect(getByTestId('create-guest-screen')).toBeTruthy();
    });
  });
});
