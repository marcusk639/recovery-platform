/**
 * MeetingSearch Screen Tests
 *
 * Covers:
 *  - Renders without crashing (smoke test)
 *  - Loading state (searchingForMeetings)
 *  - Empty / no-results state
 *  - Results render with mock meeting data
 *  - Filter button opens modal
 *  - Meetings are filtered and displayed correctly
 *  - Check-in button renders for guest users
 */

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock('@react-navigation/native-stack', () => ({}));

// ─── Clipboard mock ───────────────────────────────────────────────────────────
jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
  getString: jest.fn(() => Promise.resolve('')),
}));

// ─── Context mocks ────────────────────────────────────────────────────────────
const mockShowFormModal = jest.fn();
const mockDismissFormModal = jest.fn();
const mockNotify = jest.fn();
const mockShowPopover = jest.fn();
const mockSetPopoverRef = jest.fn();

jest.mock('../../../context', () => ({
  useModal: () => ({
    showFormModal: mockShowFormModal,
    dismissFormModal: mockDismissFormModal,
  }),
  useNotification: () => ({
    notify: mockNotify,
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

// ─── useMeetingSearch hook mock ───────────────────────────────────────────────
const mockUseMeetingSearch = jest.fn();

jest.mock('../MeetingSearch/useMeetingSearch', () => ({
  useMeetingSearch: (...args: any[]) => mockUseMeetingSearch(...args),
}));

// ─── Activity hook mock ───────────────────────────────────────────────────────
jest.mock('../../../hooks/activity', () => ({
  useActivities: jest.fn(() => ({
    activities: [],
    loading: false,
    error: null,
    refetch: jest.fn(),
  })),
  useCurrentWeek: jest.fn(() => ({
    startDate: '2026-02-16',
    endDate: '2026-02-22',
    weekNumber: 8,
    year: 2026,
  })),
}));

// ─── Assets mock ─────────────────────────────────────────────────────────────
jest.mock('../../../../assets', () => ({
  aaLogo: null,
  naLogo: null,
  crLogo: null,
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

jest.mock('../../../components/rats-button/rats-button', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return ({ title, onPress, testID }: any) => (
    <TouchableOpacity testID={testID || `btn-${title}`} onPress={onPress}>
      <Text>{title}</Text>
    </TouchableOpacity>
  );
});

jest.mock('../../../components/rats-icon', () => ({
  RatsIcon: ({ testID, name }: any) => {
    const { View } = require('react-native');
    return <View testID={testID || `icon-${name}`} />;
  },
  ClickableIcon: ({ containerProps, iconProps }: any) => {
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

jest.mock('../../../components/rats-image', () => {
  const { View } = require('react-native');
  return { RatsImage: () => <View testID="rats-image" /> };
});

jest.mock('../MeetingFilterForm', () => ({
  MeetingFilterForm: () => null,
  MeetingFilters: class {
    day: string = 'monday';
    type: string = 'all';
    location?: any = undefined;
  },
}));

jest.mock('../../../util/display', () => ({
  militaryTimeToDate: jest.fn(() => new Date()),
  getFormattedTime: jest.fn(() => '5:00 PM'),
  militaryTimeToStandard: jest.fn(() => '5:00 PM'),
  getDayOfWeek: jest.fn(() => 1),
  getTodaysDate: jest.fn(() => '2026-02-22'),
  getMilitaryTime: jest.fn(() => '17:00'),
}));

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

import MeetingSearch from '../MeetingSearch';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_HOUSE: any = {
  id: 'house-1',
  name: 'Test House',
  street: '100 Main St',
  city: 'Springfield',
  state: 'IL',
  zip: '62701',
  adminIds: [],
  superAdminIds: [],
  pendingAdminInvites: [],
  timezone: '',
  ownerId: 'owner-1',
  lat: 0,
  lng: 0,
  geohash: '',
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

const BASE_USER: any = {
  id: 'user-1',
  uid: 'user-1',
  firstName: 'Admin',
  lastName: 'User',
  email: 'admin@example.com',
  isAdmin: true,
};

const BASE_GUEST: any = {
  id: 'guest-1',
  firstName: 'Alice',
  lastName: 'Smith',
  avatar: '',
  email: 'alice@example.com',
  houseId: 'house-1',
};

function makeMeeting(id: string, overrides: any = {}): any {
  return {
    id,
    name: `Meeting ${id}`,
    time: '17:00',
    street: '200 Oak Ave',
    city: 'Springfield',
    state: 'IL',
    zip: '62701',
    type: 'AA',
    day: 'monday',
    lat: 39.7817,
    lng: -89.6501,
    verified: true,
    online: false,
    daysAndTimes: { monday: '17:00' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Default hook return value factory ────────────────────────────────────────

function makeHookReturn(overrides: any = {}) {
  return {
    searchTerm: '',
    filters: { day: 'monday', type: 'all' },
    meetings: [],
    searchingForMeetings: false,
    checkingIn: false,
    checkInSuccessful: false,
    checkInError: '',
    userLocation: null,
    gettingPermissions: false,
    showForceModal: false,
    previousMeeting: null,
    guest: null,
    userAsGuest: null,
    setSearchTerm: jest.fn(),
    executeSearch: jest.fn(),
    setSearchFilters: jest.fn(),
    setLocation: jest.fn(),
    checkInto: jest.fn(),
    forceCheckIn: jest.fn(),
    dismissForceModal: jest.fn(),
    noMeetingsFound: jest.fn(() => true),
    guestAttendedMeeting: jest.fn(() => false),
    isMeetingDay: jest.fn(() => true),
    isMeetingTime: jest.fn(() => true),
    showFormModal: mockShowFormModal,
    dismissFormModal: mockDismissFormModal,
    notify: mockNotify,
    showPopover: mockShowPopover,
    navigation: { navigate: jest.fn(), goBack: jest.fn() },
    ...overrides,
  };
}

// ─── Store builder ─────────────────────────────────────────────────────────────

interface BuildStoreOptions {
  meetings?: any[];
  searchingForMeetings?: boolean;
  userAsGuest?: any;
  guest?: any;
  selectedHouse?: any;
  user?: any;
}

function buildStore({
  meetings = [],
  searchingForMeetings = false,
  userAsGuest = null,
  guest = null,
  selectedHouse = BASE_HOUSE,
  user = BASE_USER,
}: BuildStoreOptions = {}) {
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
        selectedHouse,
        houses: selectedHouse ? { [selectedHouse.id]: selectedHouse } : {},
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
        guests: userAsGuest ? { [userAsGuest.id]: userAsGuest } : {},
        selectedGuest: guest,
        userAsGuest,
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
      meetings: {
        meetings,
        searchingForMeetings,
        searchingForMeetingsSuccessful: false,
        searchingForMeetingsFailed: false,
        checkingIn: false,
        checkInSuccessful: false,
        checkInFailed: false,
        checkInError: null,
        addingMeeting: false,
        addingMeetingSuccessful: false,
        addingMeetingFailed: false,
        updatingMeeting: false,
        updatingMeetingSuccessful: false,
        updatingMeetingFailed: false,
        deletingMeeting: false,
        deletingMeetingSuccessful: false,
        deletingMeetingFailed: false,
        error: null,
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

function renderScreen(
  storeOptions: BuildStoreOptions = {},
  hookOverrides: any = {},
) {
  // After React Query migration, the component reads from the hook, not Redux.
  // Propagate storeOptions fields into the hook mock so tests remain intuitive.
  const meetings = storeOptions.meetings ?? [];
  const searchingForMeetings = storeOptions.searchingForMeetings ?? false;
  const userAsGuest = storeOptions.userAsGuest ?? null;

  mockUseMeetingSearch.mockReturnValue(
    makeHookReturn({
      meetings,
      searchingForMeetings,
      userAsGuest,
      noMeetingsFound: jest.fn(() => meetings.length === 0),
      ...hookOverrides,
    }),
  );

  const store = buildStore(storeOptions);
  const queryClient = buildQueryClient();
  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MeetingSearch navigation={mockNavigation} />
      </QueryClientProvider>
    </Provider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MeetingSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Smoke test ─────────────────────────────────────────────────────────────
  describe('render', () => {
    it('renders without crashing', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('screen-header')).toBeTruthy();
    });

    it('renders the "Find Meetings" header', () => {
      const { getByText } = renderScreen();
      expect(getByText('Find Meetings')).toBeTruthy();
    });

    it('renders the search bar', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('search-bar-container')).toBeTruthy();
    });
  });

  // ─── Loading state ───────────────────────────────────────────────────────────
  describe('loading state', () => {
    it('renders loading indicator when searchingForMeetings is true', () => {
      const { getByTestId } = renderScreen({ searchingForMeetings: true });
      expect(getByTestId('loading-indicator')).toBeTruthy();
    });

    it('does not render empty screen while searching', () => {
      const { queryByTestId } = renderScreen({ searchingForMeetings: true });
      expect(queryByTestId('empty-screen')).toBeNull();
    });

    it('does not render meetings list while searching', () => {
      const { queryByTestId } = renderScreen({ searchingForMeetings: true });
      expect(queryByTestId('meetings-list')).toBeNull();
    });
  });

  // ─── Empty / no-results state ─────────────────────────────────────────────────
  describe('empty state', () => {
    it('renders empty screen when no meetings are found', () => {
      const { getByTestId } = renderScreen({ meetings: [] });
      expect(getByTestId('empty-screen')).toBeTruthy();
    });

    it('renders no meetings found message', () => {
      const { getByTestId } = renderScreen({ meetings: [] });
      expect(getByTestId('empty-screen-message')).toBeTruthy();
    });

    it('empty screen has "CHANGE FILTERS" button', () => {
      const { getByText } = renderScreen({ meetings: [] });
      expect(getByText('CHANGE FILTERS')).toBeTruthy();
    });

    it('does not render loading indicator when not searching and no meetings', () => {
      const { queryByTestId } = renderScreen({
        meetings: [],
        searchingForMeetings: false,
      });
      expect(queryByTestId('loading-indicator')).toBeNull();
    });
  });

  // ─── Results render ──────────────────────────────────────────────────────────
  describe('results rendering', () => {
    it('renders meeting name when results are present', () => {
      const meetings = [makeMeeting('m-1', { name: 'Morning AA Meeting' })];
      const { getByText } = renderScreen(
        { meetings },
        { noMeetingsFound: jest.fn(() => false) },
      );
      expect(getByText('Morning AA Meeting')).toBeTruthy();
    });

    it('renders multiple meetings when results contain multiple entries', () => {
      const meetings = [
        makeMeeting('m-1', { name: 'Morning AA Meeting' }),
        makeMeeting('m-2', { name: 'Evening NA Meeting', type: 'NA' }),
      ];
      const { getByText } = renderScreen(
        { meetings },
        { noMeetingsFound: jest.fn(() => false) },
      );
      expect(getByText('Morning AA Meeting')).toBeTruthy();
      expect(getByText('Evening NA Meeting')).toBeTruthy();
    });

    it('does not render empty screen when meetings are present', () => {
      const meetings = [makeMeeting('m-1')];
      const { queryByTestId } = renderScreen(
        { meetings },
        { noMeetingsFound: jest.fn(() => false) },
      );
      expect(queryByTestId('empty-screen')).toBeNull();
    });

    it('renders meeting type label for each meeting', () => {
      const meetings = [makeMeeting('m-1', { name: 'AA Group', type: 'AA' })];
      const { getByText } = renderScreen(
        { meetings },
        { noMeetingsFound: jest.fn(() => false) },
      );
      expect(getByText('AA Meeting')).toBeTruthy();
    });

    it('renders street address for in-person meetings', () => {
      const meetings = [
        makeMeeting('m-1', {
          name: 'Test Meeting',
          street: '200 Oak Ave',
          online: false,
        }),
      ];
      const { getByText } = renderScreen(
        { meetings },
        { noMeetingsFound: jest.fn(() => false) },
      );
      expect(getByText('200 Oak Ave')).toBeTruthy();
    });

    it('renders "Directions" for in-person meetings', () => {
      const meetings = [makeMeeting('m-1', { online: false })];
      const { getByText } = renderScreen(
        { meetings },
        { noMeetingsFound: jest.fn(() => false) },
      );
      expect(getByText('Directions')).toBeTruthy();
    });

    it('renders "Copy Link" for online meetings', () => {
      const meetings = [
        makeMeeting('m-1', {
          online: true,
          link: 'https://zoom.us/j/123',
          onlineNotes: 'No password needed',
        }),
      ];
      const { getByText } = renderScreen(
        { meetings },
        { noMeetingsFound: jest.fn(() => false) },
      );
      expect(getByText('Copy Link')).toBeTruthy();
    });
  });

  // ─── Check-in button ─────────────────────────────────────────────────────────
  describe('check-in button', () => {
    it('renders CHECK IN button when userAsGuest is present', () => {
      const meetings = [makeMeeting('m-1')];
      const { getByTestId } = renderScreen(
        { meetings, userAsGuest: BASE_GUEST },
        {
          noMeetingsFound: jest.fn(() => false),
          userAsGuest: BASE_GUEST,
        },
      );
      expect(getByTestId('add-meeting-button')).toBeTruthy();
    });

    it('does not render CHECK IN button when userAsGuest is null', () => {
      const meetings = [makeMeeting('m-1')];
      const { queryByTestId } = renderScreen(
        { meetings, userAsGuest: null },
        {
          noMeetingsFound: jest.fn(() => false),
          userAsGuest: null,
        },
      );
      expect(queryByTestId('add-meeting-button')).toBeNull();
    });

    it('calls checkInto when CHECK IN button is pressed', async () => {
      const meetings = [makeMeeting('m-1')];
      const mockCheckInto = jest.fn();
      const { getByTestId } = renderScreen(
        { meetings, userAsGuest: BASE_GUEST },
        {
          noMeetingsFound: jest.fn(() => false),
          userAsGuest: BASE_GUEST,
          checkInto: mockCheckInto,
        },
      );
      await act(async () => {
        fireEvent.press(getByTestId('add-meeting-button'));
      });
      expect(mockCheckInto).toHaveBeenCalled();
    });
  });

  // ─── Filter button ────────────────────────────────────────────────────────────
  describe('filter button', () => {
    it('calls showFormModal when filter button is pressed', async () => {
      const { getByTestId } = renderScreen();
      await act(async () => {
        fireEvent.press(getByTestId('filter-button'));
      });
      expect(mockShowFormModal).toHaveBeenCalled();
    });

    it('opens filters from empty screen "CHANGE FILTERS" button', async () => {
      const { getByTestId } = renderScreen({ meetings: [] });
      await act(async () => {
        fireEvent.press(getByTestId('empty-screen-btn'));
      });
      expect(mockShowFormModal).toHaveBeenCalled();
    });
  });

  // ─── Hook integration ────────────────────────────────────────────────────────
  describe('hook integration', () => {
    it('passes navigation to useMeetingSearch hook', () => {
      renderScreen({ meetings: [] });
      expect(mockUseMeetingSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          navigation: expect.anything(),
        }),
      );
    });
  });
});
