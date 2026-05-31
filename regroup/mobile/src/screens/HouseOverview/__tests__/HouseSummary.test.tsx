/**
 * HouseSummary Screen Tests
 *
 * Covers:
 *  - Renders without crashing (smoke test)
 *  - Loading state when house is null / requestingHouses is true / requestingAdmin is true
 *  - House name / info renders when house is loaded
 *  - Settings button navigates to HouseSettings
 *  - Oxford House section only renders when houseType === 'oxford'
 *  - Key sections render (health score, quick-action buttons)
 */

// ─── useSelectedHouse mock ────────────────────────────────────────────────────
const mockUseSelectedHouse = jest.fn();

jest.mock('../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => mockUseSelectedHouse(),
}));

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock('@react-navigation/native-stack', () => ({}));

// ─── Context mocks ────────────────────────────────────────────────────────────
const mockShowPopover = jest.fn();
const mockSetPopoverRef = jest.fn();

jest.mock('../../../context', () => ({
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

// ─── Auth context mock ────────────────────────────────────────────────────────
// Default: token has "house:full-edit" role so the settings button renders
jest.mock('../../../context/auth', () => ({
  AuthConsumer: ({ children }: { children: (ctx: any) => any }) =>
    children({ token: { role: { 'house-1': 'admin' }, claims: {} } }),
}));

// ─── Can component mock — always render the "yes" branch by default ───────────
// We override per-describe block where needed
let mockCanGranted = true;
jest.mock('../../../components/auth', () => ({
  Can: ({ yes, no }: { yes: () => any; no: () => any }) =>
    mockCanGranted ? yes() : no(),
}));

// ─── React Query hooks mock ───────────────────────────────────────────────────
const mockUseGuests = jest.fn();

jest.mock('../../../state/queries', () => ({
  useGuests: (...args: any[]) => mockUseGuests(...args),
}));

// ─── Component stubs ──────────────────────────────────────────────────────────
jest.mock('../../../components/rats-scroll-view', () => {
  const { ScrollView } = require('react-native');
  return (props: any) => {
    const { testID, children, contentContainerStyle, ...rest } = props;
    return (
      <ScrollView testID={testID} {...rest}>
        {children}
      </ScrollView>
    );
  };
});

jest.mock('../../../components/screen-header', () => {
  const { View, Text } = require('react-native');
  return ({ header, icon }: any) => (
    <View testID="screen-header">
      <Text testID="screen-header-text">{header}</Text>
      {icon}
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

jest.mock('../../../components/week-stat-summary', () => {
  const { View, Text } = require('react-native');
  return ({ percentage, header }: any) => (
    <View
      testID="week-stat-summary"
      accessibilityValue={{ text: String(percentage) }}>
      <Text testID="health-score-header">{header}</Text>
    </View>
  );
});

jest.mock('../../../components/rats-icon', () => ({
  RatsIcon: ({ testID, name, style }: any) => {
    const { View } = require('react-native');
    return <View testID={testID || `icon-${name}`} />;
  },
  ClickableIcon: ({ containerProps, iconProps }: any) => {
    const { TouchableOpacity } = require('react-native');
    return (
      <TouchableOpacity
        testID={containerProps?.testID || 'clickable-icon'}
        onPress={containerProps?.onPress}
      />
    );
  },
}));

jest.mock('../../../components/rats-interactable-section', () => {
  const { TouchableOpacity, Text, View } = require('react-native');
  return ({ name, testID, onPress }: any) => (
    <TouchableOpacity testID={testID || `section-${name}`} onPress={onPress}>
      <Text>{name}</Text>
    </TouchableOpacity>
  );
});

// ─── React imports (after mocks) ──────────────────────────────────────────────
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

import HouseSummary from '../HouseSummary/HouseSummary';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_HOUSE: any = {
  id: 'house-1',
  name: 'Recovery House',
  adminIds: ['admin-1'],
  superAdminIds: [],
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

const OXFORD_HOUSE: any = {
  ...BASE_HOUSE,
  houseType: 'oxford',
};

const BASE_USER: any = {
  id: 'user-1',
  uid: 'user-1',
  firstName: 'Admin',
  lastName: 'User',
  email: 'admin@example.com',
  isAdmin: true,
};

const DEMO_USER: any = {
  ...BASE_USER,
  email: 'demo_user@appdemo.net',
};

// ─── Store builder ─────────────────────────────────────────────────────────────

interface BuildStoreOptions {
  house?: any;
  user?: any;
  requestingHouses?: boolean;
  requestingAdmin?: boolean;
  guests?: any;
}

function buildStore({
  house = BASE_HOUSE,
  user = BASE_USER,
  requestingHouses = false,
  requestingAdmin = false,
  guests = {},
}: BuildStoreOptions = {}) {
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
        loading: false,
        error: null,
        requestingHouse: false,
        requestingHouseFailed: false,
        requestingHouses,
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
        guests,
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
        requestingAdmin,
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
        <HouseSummary navigation={mockNavigation} />
      </QueryClientProvider>
    </Provider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HouseSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGranted = true;
    // Default: React Query returns no data (falls back to Redux guests)
    mockUseGuests.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
  });

  // ─── Smoke test ─────────────────────────────────────────────────────────────
  describe('render', () => {
    it('renders without crashing', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('main-app-screen')).toBeTruthy();
    });

    it('renders the screen header with the house name', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('screen-header')).toBeTruthy();
    });

    it('renders the house name in the header', () => {
      const { getByText } = renderScreen();
      expect(getByText('Recovery House')).toBeTruthy();
    });
  });

  // ─── Loading state ──────────────────────────────────────────────────────────
  describe('loading state', () => {
    it('renders loading indicator when requestingHouses is true', () => {
      const { getByTestId } = renderScreen({ requestingHouses: true });
      expect(getByTestId('loading-indicator')).toBeTruthy();
    });

    it('renders loading indicator when requestingAdmin is true', () => {
      const { getByTestId } = renderScreen({ requestingAdmin: true });
      expect(getByTestId('loading-indicator')).toBeTruthy();
    });

    it('renders loading indicator when house is null', () => {
      const { getByTestId } = renderScreen({ house: null });
      expect(getByTestId('loading-indicator')).toBeTruthy();
    });

    it('does not render the main screen while loading', () => {
      const { queryByTestId } = renderScreen({ requestingHouses: true });
      expect(queryByTestId('main-app-screen')).toBeNull();
    });
  });

  // ─── House info ──────────────────────────────────────────────────────────────
  describe('house info', () => {
    it('renders the health score section', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('week-stat-summary')).toBeTruthy();
    });

    it('renders the Beds section', () => {
      const { getByText } = renderScreen();
      expect(getByText('Beds')).toBeTruthy();
    });

    it('renders the Disputes section', () => {
      const { getByText } = renderScreen();
      expect(getByText('Disputes')).toBeTruthy();
    });

    it('renders the Issues section', () => {
      const { getByText } = renderScreen();
      expect(getByText('Issues')).toBeTruthy();
    });

    it('renders the Complaints section', () => {
      const { getByText } = renderScreen();
      expect(getByText('Complaints')).toBeTruthy();
    });

    it('renders the Meetings section', () => {
      const { getByText } = renderScreen();
      expect(getByText('Meetings')).toBeTruthy();
    });
  });

  // ─── Settings button ─────────────────────────────────────────────────────────
  describe('settings button', () => {
    it('renders the house-settings button when user has full-edit permission', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('house-settings-button')).toBeTruthy();
    });

    it('navigates to HouseSettings when the settings button is pressed', () => {
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId('house-settings-button'));
      expect(mockNavigation.navigate).toHaveBeenCalledWith('houseSettings');
    });

    it('does not render settings button when user lacks full-edit permission', () => {
      mockCanGranted = false;
      const { queryByTestId } = renderScreen();
      expect(queryByTestId('house-settings-button')).toBeNull();
    });

    it('shows demo popover instead of navigating for demo user', () => {
      const { getByTestId } = renderScreen({ user: DEMO_USER });
      fireEvent.press(getByTestId('house-settings-button'));
      expect(mockShowPopover).toHaveBeenCalledWith(
        'House Settings',
        expect.stringContaining('demo mode'),
      );
      expect(mockNavigation.navigate).not.toHaveBeenCalledWith('houseSettings');
    });
  });

  // ─── Oxford House section ─────────────────────────────────────────────────────
  describe('Oxford House sections', () => {
    it('does not render Oxford sections for a traditional house', () => {
      const { queryByText } = renderScreen({ house: BASE_HOUSE });
      expect(queryByText('Oxford House Hub')).toBeNull();
      expect(queryByText('Officers')).toBeNull();
      expect(queryByText('Equal Expense Share')).toBeNull();
      expect(queryByText('Business Meetings')).toBeNull();
      expect(queryByText('Voting')).toBeNull();
    });

    it('renders Oxford House Hub section when houseType is oxford', () => {
      const { getByText } = renderScreen({ house: OXFORD_HOUSE });
      expect(getByText('Oxford House Hub')).toBeTruthy();
    });

    it('renders Officers section when houseType is oxford', () => {
      const { getByText } = renderScreen({ house: OXFORD_HOUSE });
      expect(getByText('Officers')).toBeTruthy();
    });

    it('renders Equal Expense Share section when houseType is oxford', () => {
      const { getByText } = renderScreen({ house: OXFORD_HOUSE });
      expect(getByText('Equal Expense Share')).toBeTruthy();
    });

    it('renders Business Meetings section when houseType is oxford', () => {
      const { getByText } = renderScreen({ house: OXFORD_HOUSE });
      expect(getByText('Business Meetings')).toBeTruthy();
    });

    it('renders Voting section when houseType is oxford', () => {
      const { getByText } = renderScreen({ house: OXFORD_HOUSE });
      expect(getByText('Voting')).toBeTruthy();
    });
  });

  // ─── Disputes navigation ─────────────────────────────────────────────────────
  describe('quick action navigation', () => {
    it('navigates to HouseDisputes when Disputes section is pressed', () => {
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId('house-disputes-button'));
      expect(mockNavigation.navigate).toHaveBeenCalledWith('houseDisputes');
    });

    it('navigates to Beds when Beds section is pressed', () => {
      const { getByText } = renderScreen();
      fireEvent.press(getByText('Beds'));
      expect(mockNavigation.navigate).toHaveBeenCalled();
    });
  });

  // ─── Manage Guests (admin only) ───────────────────────────────────────────────
  describe('manage guests section', () => {
    it('renders Manage Guests section when user has full-edit permission', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('manage-guests-button')).toBeTruthy();
    });

    it('does not render Manage Guests when user lacks full-edit permission', () => {
      mockCanGranted = false;
      const { queryByTestId } = renderScreen();
      expect(queryByTestId('manage-guests-button')).toBeNull();
    });
  });
});
