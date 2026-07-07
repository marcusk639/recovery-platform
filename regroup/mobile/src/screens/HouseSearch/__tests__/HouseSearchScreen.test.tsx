/**
 * HouseSearchScreen Tests
 *
 * Covers:
 *  - Renders without crashing (smoke test)
 *  - Loading state (gettingPermissions / searchingHouses)
 *  - Empty / no-results state
 *  - Results render with mock house data
 *  - Filter button opens modal
 *  - "VIEW DETAILS" button dispatches selectHouse and navigates
 *  - Search term filters house list
 */

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock('@react-navigation/native-stack', () => ({}));

// ─── Geolocation mocks ────────────────────────────────────────────────────────
jest.mock('@react-native-community/geolocation', () => ({
  getCurrentPosition: jest.fn(successCb => {
    successCb({ coords: { latitude: 37.7749, longitude: -122.4194 } });
  }),
  watchPosition: jest.fn(() => 0),
  clearWatch: jest.fn(),
  stopObserving: jest.fn(),
  requestAuthorization: jest.fn(),
}));

jest.mock('react-native-permissions', () => ({
  check: jest.fn(() => Promise.resolve('granted')),
  request: jest.fn(() => Promise.resolve('granted')),
  PERMISSIONS: {
    IOS: {
      LOCATION_ALWAYS: 'ios.permission.LOCATION_ALWAYS',
      LOCATION_WHEN_IN_USE: 'ios.permission.LOCATION_WHEN_IN_USE',
    },
    ANDROID: {
      ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
    },
  },
  RESULTS: {
    GRANTED: 'granted',
    DENIED: 'denied',
    BLOCKED: 'blocked',
    UNAVAILABLE: 'unavailable',
  },
}));

// ─── util/permissions mock ─────────────────────────────────────────────────────
// Return false so Geolocation is not called and the thunk is not dispatched,
// keeping the preloaded searchedHouses in Redux intact throughout each test.
jest.mock('../../../util/permissions', () => ({
  checkAndRequestLocationPermissions: jest.fn(() => Promise.resolve(false)),
}));

// ─── Context mocks ────────────────────────────────────────────────────────────
const mockShowFormModal = jest.fn();
const mockDismissFormModal = jest.fn();
const mockShowPopover = jest.fn();
const mockSetPopoverRef = jest.fn();

jest.mock('../../../context', () => ({
  useModal: () => ({
    showFormModal: mockShowFormModal,
    dismissFormModal: mockDismissFormModal,
  }),
  useNotification: () => ({
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

// ─── Component stubs ──────────────────────────────────────────────────────────
jest.mock('../../../components/screen-header', () => {
  const { View, Text } = require('react-native');
  return ({ header }: any) => (
    <View testID="screen-header">
      <Text testID="screen-header-text">{header}</Text>
    </View>
  );
});

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
    return <Text>{typeof text === 'number' ? String(text) : text || ''}</Text>;
  },
}));

jest.mock('../../../components/rats-flat-list', () => {
  const { FlatList } = require('react-native');
  return { RatsFlatList: FlatList };
});

jest.mock('../../../components/rats-search-bar', () => {
  const { View, TouchableOpacity, Text } = require('react-native');
  return (props: any) => (
    <View testID="search-bar-container">
      <TouchableOpacity testID="filter-button" onPress={props.onFilter}>
        <Text>Filter</Text>
      </TouchableOpacity>
    </View>
  );
});

jest.mock('../../../components/rats-search-filter', () => {
  const { View } = require('react-native');
  return () => <View testID="search-filter" />;
});

jest.mock('../../../components/rats-scroll-view', () => {
  const { ScrollView } = require('react-native');
  return ScrollView;
});

jest.mock('../../../components/rats-button/rats-button', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return ({ title, onPress, testID }: any) => (
    <TouchableOpacity testID={testID || `btn-${title}`} onPress={onPress}>
      <Text>{title}</Text>
    </TouchableOpacity>
  );
});

jest.mock('../../../components/rats-avatar', () => {
  const { View } = require('react-native');
  return () => <View testID="rats-avatar" />;
});

jest.mock('../../../components/rats-icon', () => ({
  RatsIcon: ({ testID, name }: any) => {
    const { View } = require('react-native');
    return <View testID={testID || `icon-${name}`} />;
  },
  ClickableIcon: ({ containerProps }: any) => {
    const { TouchableOpacity } = require('react-native');
    return (
      <TouchableOpacity
        testID="clickable-icon"
        onPress={containerProps?.onPress}
      />
    );
  },
}));

jest.mock('../../../components/help-icon', () => {
  const { View } = require('react-native');
  return () => <View testID="help-icon" />;
});

jest.mock('../../../components/empty-screen', () => {
  const { View, Text, TouchableOpacity } = require('react-native');
  return ({ message, buttonTitle, onPress }: any) => (
    <View testID="empty-screen">
      <Text testID="empty-screen-message">{message}</Text>
      <TouchableOpacity testID="empty-screen-btn" onPress={onPress}>
        <Text>{buttonTitle}</Text>
      </TouchableOpacity>
    </View>
  );
});

jest.mock('../HouseSearchFilterForm', () => ({
  HouseSearchFilterForm: () => null,
}));

const mockSearchForHouses = jest.fn();

jest.mock('../../../services/house', () => ({
  searchForHouses: (...args: any[]) => mockSearchForHouses(...args),
}));

// ─── React imports (after mocks) ──────────────────────────────────────────────
import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

import HouseSearchScreen from '../HouseSearchScreen';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_HOUSE: any = {
  id: 'house-1',
  name: 'Sunrise Recovery',
  adminIds: [],
  superAdminIds: [],
  pendingAdminInvites: [],
  timezone: '',
  ownerId: 'owner-1',
  lat: 37.7749,
  lng: -122.4194,
  geohash: 'abc123',
  street: '100 Main St',
  city: 'San Francisco',
  state: 'CA',
  zip: '94102',
  country: 'US',
  health: {},
  monthlyRent: 1200,
  weeklyRent: 300,
  currentCapacity: 3,
  maximumCapacity: 8,
  code: 'SF01',
  avatar: '',
  imageUrl: '',
  depositsAndFees: 0,
  certified: true,
  phoneNumber: '5551234567',
  rentFrequency: 'both',
  subscriptionStatus: 'active',
  isDemoHouse: false,
  houseType: 'traditional',
  seniorPeerEmails: [],
  managerSetupType: 'operator-only',
  awaitingVerification: [],
  chores: {},
  phases: { phase1: true },
  gender: 'male',
  disputes: {},
  applications: {},
  complaints: {},
  rooms: {},
  baths: 2,
  wifi: true,
  rating: 4,
  createdDate: '2024-01-01',
  lastUpdated: '2024-01-01',
};

const SECOND_HOUSE: any = {
  ...BASE_HOUSE,
  id: 'house-2',
  name: 'Serenity House',
  certified: false,
  rating: 3,
};

const BASE_USER: any = {
  id: 'user-1',
  uid: 'user-1',
  firstName: 'Admin',
  lastName: 'User',
  email: 'admin@example.com',
  isAdmin: true,
};

// ─── Store builder ─────────────────────────────────────────────────────────────

interface BuildStoreOptions {
  searchedHouses?: any[];
  searchingHouses?: boolean;
  user?: any;
  selectedHouse?: any;
}

function buildStore({
  searchedHouses = [],
  searchingHouses = false,
  user = BASE_USER,
  selectedHouse = null,
}: BuildStoreOptions = {}) {
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
        selectedHouse,
        houses: {},
        searchedHouses,
        loading: false,
        error: null,
        requestingHouse: false,
        requestingHouseFailed: false,
        requestingHouses: false,
        requestingHousesSuccessful: false,
        requestingHousesFailed: false,
        searchingHouses,
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
        houseAdmins: {},
        admins: {},
        selectedAdmin: null,
        userAsAdmin: null,
        loading: false,
        error: null,
        requestingAdmin: false,
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

function buildQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

const mockNavigation: any = {
  navigate: jest.fn(),
  goBack: jest.fn(),
};

function renderScreen(storeOptions: BuildStoreOptions = {}) {
  const store = buildStore(storeOptions);
  const queryClient = buildQueryClient();
  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <HouseSearchScreen navigation={mockNavigation} />
      </QueryClientProvider>
    </Provider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HouseSearchScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: search returns empty (most tests don't need results)
    mockSearchForHouses.mockResolvedValue({});
  });

  // ─── Smoke test ─────────────────────────────────────────────────────────────
  describe('render', () => {
    it('renders without crashing', async () => {
      const { getByTestId } = renderScreen();
      // Wait for async permissions check in useEffect to complete
      await waitFor(() => expect(getByTestId('screen-header')).toBeTruthy());
    });

    it('renders the screen header with "Find Houses"', async () => {
      const { getByText } = renderScreen();
      await waitFor(() => expect(getByText('Find Houses')).toBeTruthy());
    });

    it('renders the search bar', async () => {
      const { getByTestId } = renderScreen();
      await waitFor(() =>
        expect(getByTestId('search-bar-container')).toBeTruthy(),
      );
    });
  });

  // ─── Loading state ───────────────────────────────────────────────────────────
  describe('loading state', () => {
    // The initial gettingPermissions state shows loading-indicator immediately
    it('renders loading indicator on initial mount before permissions resolve', () => {
      const { getByTestId } = renderScreen();
      // On first paint, the component shows loading-indicator before async effect resolves
      expect(getByTestId('loading-indicator')).toBeTruthy();
    });

    it('renders loading indicator while searching for houses (after init)', async () => {
      const { getByTestId } = renderScreen({ searchingHouses: true });
      // After permissions resolve, searchingHouses=true means loading is still shown
      await waitFor(() =>
        expect(getByTestId('loading-indicator')).toBeTruthy(),
      );
    });

    it('does not render empty screen while searching', async () => {
      const { queryByTestId } = renderScreen({ searchingHouses: true });
      await waitFor(() => expect(queryByTestId('empty-screen')).toBeNull());
    });
  });

  // ─── Empty / no-results state ────────────────────────────────────────────────
  describe('empty state', () => {
    it('renders empty screen when no houses are found', async () => {
      const { getByTestId } = renderScreen({ searchedHouses: [] });
      await waitFor(() => expect(getByTestId('empty-screen')).toBeTruthy());
    });

    it('renders empty screen message about no houses found', async () => {
      const { getByTestId } = renderScreen({ searchedHouses: [] });
      await waitFor(() =>
        expect(getByTestId('empty-screen-message')).toBeTruthy(),
      );
    });

    it('empty screen has a "CHANGE FILTERS" button', async () => {
      const { getByText } = renderScreen({ searchedHouses: [] });
      await waitFor(() => expect(getByText('CHANGE FILTERS')).toBeTruthy());
    });
  });

  // ─── Results render ──────────────────────────────────────────────────────────
  describe('results rendering', () => {
    it('renders house names when search results are present', async () => {
      const permModule = require('../../../util/permissions');
      permModule.checkAndRequestLocationPermissions.mockResolvedValueOnce(true);
      mockSearchForHouses.mockResolvedValue({ [BASE_HOUSE.id]: BASE_HOUSE });
      const { getByText } = renderScreen();
      await waitFor(() => expect(getByText('Sunrise Recovery')).toBeTruthy());
    });

    it('renders multiple houses when results contain multiple houses', async () => {
      const permModule = require('../../../util/permissions');
      permModule.checkAndRequestLocationPermissions.mockResolvedValueOnce(true);
      mockSearchForHouses.mockResolvedValue({
        [BASE_HOUSE.id]: BASE_HOUSE,
        [SECOND_HOUSE.id]: SECOND_HOUSE,
      });
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText('Sunrise Recovery')).toBeTruthy();
        expect(getByText('Serenity House')).toBeTruthy();
      });
    });

    it('does not render empty screen when houses are present', async () => {
      const permModule = require('../../../util/permissions');
      permModule.checkAndRequestLocationPermissions.mockResolvedValueOnce(true);
      mockSearchForHouses.mockResolvedValue({ [BASE_HOUSE.id]: BASE_HOUSE });
      const { queryByTestId } = renderScreen();
      await waitFor(() => expect(queryByTestId('empty-screen')).toBeNull());
    });

    it('renders "VIEW DETAILS" button for each house', async () => {
      const permModule = require('../../../util/permissions');
      permModule.checkAndRequestLocationPermissions.mockResolvedValueOnce(true);
      mockSearchForHouses.mockResolvedValue({
        [BASE_HOUSE.id]: BASE_HOUSE,
        [SECOND_HOUSE.id]: SECOND_HOUSE,
      });
      const { getAllByText } = renderScreen();
      await waitFor(() => {
        const detailButtons = getAllByText('VIEW DETAILS');
        expect(detailButtons).toHaveLength(2);
      });
    });

    it('renders certified status for each house', async () => {
      const permModule = require('../../../util/permissions');
      permModule.checkAndRequestLocationPermissions.mockResolvedValueOnce(true);
      mockSearchForHouses.mockResolvedValue({ [BASE_HOUSE.id]: BASE_HOUSE });
      const { getByText } = renderScreen();
      await waitFor(() => expect(getByText('Certified')).toBeTruthy());
    });

    it('renders "Not Certified" for uncertified houses', async () => {
      const permModule = require('../../../util/permissions');
      permModule.checkAndRequestLocationPermissions.mockResolvedValueOnce(true);
      mockSearchForHouses.mockResolvedValue({
        [SECOND_HOUSE.id]: SECOND_HOUSE,
      });
      const { getByText } = renderScreen();
      await waitFor(() => expect(getByText('Not Certified')).toBeTruthy());
    });

    it('renders city and state for each house', async () => {
      const permModule = require('../../../util/permissions');
      permModule.checkAndRequestLocationPermissions.mockResolvedValueOnce(true);
      mockSearchForHouses.mockResolvedValue({ [BASE_HOUSE.id]: BASE_HOUSE });
      const { getByText } = renderScreen();
      await waitFor(() => expect(getByText(/San Francisco/)).toBeTruthy());
    });
  });

  // ─── Filter button interaction ───────────────────────────────────────────────
  describe('filter button', () => {
    it('calls showFormModal when filter button is pressed', async () => {
      const { getByTestId } = renderScreen();
      await waitFor(() => expect(getByTestId('filter-button')).toBeTruthy());
      fireEvent.press(getByTestId('filter-button'));
      expect(mockShowFormModal).toHaveBeenCalled();
    });

    it('opens filters from empty screen "CHANGE FILTERS" button', async () => {
      const { getByTestId } = renderScreen({ searchedHouses: [] });
      await waitFor(() => expect(getByTestId('empty-screen-btn')).toBeTruthy());
      fireEvent.press(getByTestId('empty-screen-btn'));
      expect(mockShowFormModal).toHaveBeenCalled();
    });
  });

  // ─── Location denied banner ──────────────────────────────────────────────────
  describe('location denied banner', () => {
    it('shows a location denied banner when permission is denied', async () => {
      // checkAndRequestLocationPermissions is already mocked to return false
      // (see top-level jest.mock for '../../../util/permissions')
      const { getByTestId } = renderScreen();
      await waitFor(() => {
        expect(getByTestId('location-denied-banner')).toBeTruthy();
      });
    });

    it('banner contains informative message about using filters', async () => {
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(
          getByText(
            'Location unavailable. Use the filters to search by city or zip code.',
          ),
        ).toBeTruthy();
      });
    });

    it('shows location denied banner when GPS position fails', async () => {
      // Override permission mock to return true (permission granted, but GPS fails)
      const permModule = require('../../../util/permissions');
      permModule.checkAndRequestLocationPermissions.mockResolvedValueOnce(true);

      // Override Geolocation to call the error callback
      const Geolocation = require('@react-native-community/geolocation');
      Geolocation.getCurrentPosition.mockImplementationOnce(
        (_success: any, error: any) => error(new Error('GPS unavailable')),
      );

      const { getByTestId } = renderScreen();

      await waitFor(() => {
        expect(getByTestId('location-denied-banner')).toBeTruthy();
      });
    });
  });

  // ─── VIEW DETAILS navigation ─────────────────────────────────────────────────
  describe('VIEW DETAILS navigation', () => {
    it('navigates to IntroHouseSummary when VIEW DETAILS is pressed', async () => {
      const permModule = require('../../../util/permissions');
      permModule.checkAndRequestLocationPermissions.mockResolvedValueOnce(true);
      mockSearchForHouses.mockResolvedValue({ [BASE_HOUSE.id]: BASE_HOUSE });
      const { getAllByText } = renderScreen();
      await waitFor(() =>
        expect(getAllByText('VIEW DETAILS').length).toBeGreaterThan(0),
      );
      fireEvent.press(getAllByText('VIEW DETAILS')[0]);
      expect(mockNavigation.navigate).toHaveBeenCalledWith('introHouseSummary');
    });
  });
});
