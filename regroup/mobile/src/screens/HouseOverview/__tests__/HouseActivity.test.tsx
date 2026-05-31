/**
 * HouseActivity Tests
 *
 * Covers:
 *   - Renders activity feed rows when activities are returned
 *   - Loading state while query is in-flight
 *   - Empty state when no activities exist
 *   - Error state when query fails
 *   - Loading indicator when no house is selected
 */

// ─── useSelectedHouse mock ────────────────────────────────────────────────────
const mockUseSelectedHouse = jest.fn();

jest.mock('../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => mockUseSelectedHouse(),
}));

// ─── Firebase mock ─────────────────────────────────────────────────────────────
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
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    })),
    batch: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      commit: jest.fn(() => Promise.resolve()),
    })),
  },
}));

// ─── Activity service mock ────────────────────────────────────────────────────
jest.mock('../../../services/activity', () => ({
  getActivities: jest.fn(() => Promise.resolve([])),
  getWeekSummary: jest.fn(() => Promise.resolve(null)),
  getHouseActivities: jest.fn(() => Promise.resolve([])),
  logActivity: jest.fn(() => Promise.resolve({})),
}));

// ─── Guest service mock ───────────────────────────────────────────────────────
jest.mock('../../../services/guest', () => ({
  getGuests: jest.fn(() => Promise.resolve({})),
  getGuestsBlocking: jest.fn(() => Promise.resolve({})),
  getGuest: jest.fn(() => Promise.resolve(null)),
  createGuest: jest.fn(),
  updateGuest: jest.fn(),
  deleteGuest: jest.fn(),
  archiveGuest: jest.fn(),
  createGuestId: jest.fn(() => 'mock-guest-id'),
  houseCollection: {},
}));

// ─── House service mock ───────────────────────────────────────────────────────
jest.mock('../../../services/house', () => ({
  getHouse: jest.fn(),
  getHouses: jest.fn(),
  createHouse: jest.fn(),
  updateHouse: jest.fn(),
  createHouseId: jest.fn(() => 'mock-house-id'),
  houseCollection: {},
}));

// ─── Meeting service mock ─────────────────────────────────────────────────────
jest.mock('../../../services/meeting', () => ({
  searchForMeetings: jest.fn(() => Promise.resolve([])),
  addMeeting: jest.fn(() => Promise.resolve({})),
}));

// ─── offlineQueue mock ────────────────────────────────────────────────────────
jest.mock('../../../services/offlineQueue', () => ({
  offlineQueue: {
    enqueue: jest.fn(),
    flush: jest.fn(() => Promise.resolve()),
  },
}));

// ─── React Query hooks mock ───────────────────────────────────────────────────
// useHouseActivities is controlled per-test via mockReturnValue; default to empty.
const mockUseHouseActivities = jest.fn<
  { data: any; isLoading: boolean; isError: boolean; error: any },
  any[]
>(() => ({
  data: [] as any[],
  isLoading: false,
  isError: false,
  error: null,
}));

jest.mock('../../../state/queries', () => ({
  useHouseActivities: (...args: [any?, any?, any?]) =>
    mockUseHouseActivities(...args),
  useGuests: jest.fn(() => ({
    data: undefined,
    isLoading: false,
    error: null,
  })),
  useWeekSummary: jest.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
  })),
}));

// ─── Context mock ──────────────────────────────────────────────────────────────
jest.mock('../../../context', () => ({
  useModal: () => ({
    showFormModal: jest.fn(),
    dismissFormModal: jest.fn(),
  }),
  useNotification: () => ({
    notify: jest.fn(),
    showPopover: jest.fn(),
    setPopoverRef: jest.fn(),
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

// ─── Auth context mock ─────────────────────────────────────────────────────────
jest.mock('../../../context/auth', () => ({
  AuthConsumer: ({ children }: { children: (ctx: any) => React.ReactNode }) =>
    children({ token: { 'house-1': { role: 'admin' } } }),
}));

// ─── Navigation mocks ──────────────────────────────────────────────────────────
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: () => true,
  }),
  NavigationContainer: ({ children }: any) => children,
}));
jest.mock('@react-navigation/native-stack', () => ({}));

// ─── Component stubs ───────────────────────────────────────────────────────────
jest.mock('../../../components/screen-header', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return ({ header }: { header: string }) =>
    React.createElement(Text, null, header);
});
jest.mock('../../../components/rats-scroll-view', () => {
  const { ScrollView } = require('react-native');
  return ScrollView;
});
jest.mock(
  '../../../components/rats-loading-indicator/rats-loading-indicator',
  () => 'RatsLoadingIndicator',
);
jest.mock('../../../components/title-bar-right-button', () => ({
  HouseSelectionButton: 'HouseSelectionButton',
  GuestSelectionButton: 'GuestSelectionButton',
}));
// Stub vector icons so the test renderer doesn't explode
jest.mock('react-native-vector-icons/FontAwesome5', () => 'FontAwesome5Icon');
jest.mock('react-native-vector-icons/MaterialIcons', () => 'MaterialIcon');

// ─── React imports ─────────────────────────────────────────────────────────────
import React from 'react';
import { render } from '@testing-library/react-native';
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

import HouseActivity from '../HouseActivity/HouseActivity';
import { ActivityType, ActivityStatus } from '../../../entities/ActivityModel';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_HOUSE: any = {
  id: 'house-1',
  name: 'Test House',
  timezone: 'America/New_York',
  ownerId: 'owner-1',
  lat: 0,
  lng: 0,
  geohash: '',
  adminId: '',
  adminIds: [],
  superAdminIds: [],
  street: '1 Main St',
  city: 'Springfield',
  country: 'US',
  health: {},
  monthlyRent: 1000,
  weeklyRent: 250,
  currentCapacity: 2,
  maximumCapacity: 5,
  state: 'IL',
  zip: '62701',
  code: 'TEST01',
  avatar: '',
  imageUrl: '',
  depositsAndFees: 0,
  certified: false,
  phoneNumber: '5551234567',
  rentFrequency: 'both',
  pendingAdminInvites: [],
  pendingGuestInvites: [],
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
  issues: {},
  applications: {},
  complaints: {},
  rooms: {},
  baths: 1,
  wifi: false,
  rating: 3,
  stripeAccountId: undefined,
  stripeStatus: 'not_connected',
  createdDate: '2024-01-01T00:00:00.000Z',
  lastUpdated: '2024-01-01T00:00:00.000Z',
};

const GUEST_ALICE: any = {
  id: 'guest-alice',
  houseId: 'house-1',
  firstName: 'Alice',
  lastName: 'Smith',
  status: 'active',
};

const SAMPLE_MEETING_ACTIVITY: any = {
  id: 'act-1',
  guestId: 'guest-alice',
  houseId: 'house-1',
  type: ActivityType.MEETING,
  timestamp: '2026-02-20T10:00:00.000Z',
  loggedAt: '2026-02-20T10:01:00.000Z',
  loggedBy: 'guest-alice',
  verified: false,
  status: ActivityStatus.ACTIVE,
  data: {
    type: 'meeting',
    meetingName: 'AA Morning',
    meetingType: 'AA',
    duration: 60,
  },
};

const SAMPLE_WORK_ACTIVITY: any = {
  id: 'act-2',
  guestId: 'guest-alice',
  houseId: 'house-1',
  type: ActivityType.WORK,
  timestamp: '2026-02-19T14:00:00.000Z',
  loggedAt: '2026-02-19T14:05:00.000Z',
  loggedBy: 'guest-alice',
  verified: false,
  status: ActivityStatus.ACTIVE,
  data: {
    type: 'work',
    jobName: 'Coffee Shop',
    hoursWorked: 8,
  },
};

const SAMPLE_CHORE_ACTIVITY: any = {
  id: 'act-3',
  guestId: 'guest-alice',
  houseId: 'house-1',
  type: ActivityType.CHORE,
  timestamp: '2026-02-18T09:00:00.000Z',
  loggedAt: '2026-02-18T09:01:00.000Z',
  loggedBy: 'guest-alice',
  verified: false,
  status: ActivityStatus.ACTIVE,
  data: {
    type: 'chore',
    choreType: 'daily',
    choreName: 'Bathroom',
  },
};

// ─── Store factory ─────────────────────────────────────────────────────────────

function buildStore(guests: Record<string, any> = {}, house: any = BASE_HOUSE) {
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
        guests,
        selectedGuest: null,
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
      admin: {
        houseAdmins: {},
        admins: {},
        selectedAdmin: null,
        loading: false,
        error: null,
      } as any,
      user: {
        user: {
          id: 'admin-1',
          firstName: 'Admin',
          lastName: 'User',
          isAdmin: true,
        },
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

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderScreen(store: ReturnType<typeof buildStore>) {
  const queryClient = createQueryClient();
  // After A2 migration screens read guests via useGuests(houseId). Mirror
  // the Redux fixture into the React Query cache. See .full-review [A2].
  const state = store.getState() as any;
  const houseId = state.houses?.selectedHouse?.id;
  const guests = state.guests?.guests;
  if (houseId && guests) {
    queryClient.setQueryData(['guests', 'list', houseId], guests);
  }
  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <HouseActivity />
      </QueryClientProvider>
    </Provider>,
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('HouseActivity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: empty, loaded, no error
    mockUseHouseActivities.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  it('renders loading indicator when no house is selected', () => {
    const store = buildStore({}, null);
    const { UNSAFE_queryByType } = renderScreen(store);
    expect(UNSAFE_queryByType('RatsLoadingIndicator' as any)).toBeTruthy();
  });

  it('renders the screen header when house is selected', () => {
    const store = buildStore({}, BASE_HOUSE);
    const { getByText } = renderScreen(store);
    expect(getByText('Activity Feed')).toBeTruthy();
  });

  it('shows loading indicator while query is in-flight', () => {
    mockUseHouseActivities.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });
    const store = buildStore({}, BASE_HOUSE);
    const { getByTestId } = renderScreen(store);
    expect(getByTestId('activity-loading')).toBeTruthy();
  });

  it('shows empty state when no activities are returned', () => {
    mockUseHouseActivities.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    });
    const store = buildStore({}, BASE_HOUSE);
    const { getByTestId } = renderScreen(store);
    expect(getByTestId('activity-empty')).toBeTruthy();
  });

  it('shows "No activity yet" text in empty state', () => {
    const store = buildStore({}, BASE_HOUSE);
    const { getByText } = renderScreen(store);
    expect(getByText('No activity yet')).toBeTruthy();
  });

  it('shows error state when query fails', () => {
    mockUseHouseActivities.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
    });
    const store = buildStore({}, BASE_HOUSE);
    const { getByTestId } = renderScreen(store);
    expect(getByTestId('activity-error')).toBeTruthy();
  });

  it('shows "Unable to load activity" message in error state', () => {
    mockUseHouseActivities.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
    });
    const store = buildStore({}, BASE_HOUSE);
    const { getByText } = renderScreen(store);
    expect(getByText('Unable to load activity')).toBeTruthy();
  });

  it('renders activity rows when activities are returned', () => {
    mockUseHouseActivities.mockReturnValue({
      data: [SAMPLE_MEETING_ACTIVITY, SAMPLE_WORK_ACTIVITY],
      isLoading: false,
      isError: false,
      error: null,
    });
    const store = buildStore({ 'guest-alice': GUEST_ALICE }, BASE_HOUSE);
    const { getByTestId } = renderScreen(store);
    expect(getByTestId('activity-row-act-1')).toBeTruthy();
    expect(getByTestId('activity-row-act-2')).toBeTruthy();
  });

  it('renders the FlatList when activities exist', () => {
    mockUseHouseActivities.mockReturnValue({
      data: [SAMPLE_MEETING_ACTIVITY],
      isLoading: false,
      isError: false,
      error: null,
    });
    const store = buildStore({ 'guest-alice': GUEST_ALICE }, BASE_HOUSE);
    const { getByTestId } = renderScreen(store);
    expect(getByTestId('activity-list')).toBeTruthy();
  });

  it('displays the meeting name for meeting activities', () => {
    mockUseHouseActivities.mockReturnValue({
      data: [SAMPLE_MEETING_ACTIVITY],
      isLoading: false,
      isError: false,
      error: null,
    });
    const store = buildStore({ 'guest-alice': GUEST_ALICE }, BASE_HOUSE);
    const { getByText } = renderScreen(store);
    expect(getByText('AA Morning')).toBeTruthy();
  });

  it('displays hours and job name for work activities', () => {
    mockUseHouseActivities.mockReturnValue({
      data: [SAMPLE_WORK_ACTIVITY],
      isLoading: false,
      isError: false,
      error: null,
    });
    const store = buildStore({ 'guest-alice': GUEST_ALICE }, BASE_HOUSE);
    const { getByText } = renderScreen(store);
    expect(getByText('8h at Coffee Shop')).toBeTruthy();
  });

  it('displays chore name for chore activities', () => {
    mockUseHouseActivities.mockReturnValue({
      data: [SAMPLE_CHORE_ACTIVITY],
      isLoading: false,
      isError: false,
      error: null,
    });
    const store = buildStore({ 'guest-alice': GUEST_ALICE }, BASE_HOUSE);
    const { getByText } = renderScreen(store);
    expect(getByText('Bathroom')).toBeTruthy();
  });

  it('displays guest name when guest is found in redux state', () => {
    mockUseHouseActivities.mockReturnValue({
      data: [SAMPLE_MEETING_ACTIVITY],
      isLoading: false,
      isError: false,
      error: null,
    });
    const store = buildStore({ 'guest-alice': GUEST_ALICE }, BASE_HOUSE);
    const { getByText } = renderScreen(store);
    expect(getByText('Alice Smith')).toBeTruthy();
  });

  it('calls useHouseActivities with the house id', () => {
    const store = buildStore({}, BASE_HOUSE);
    renderScreen(store);
    expect(mockUseHouseActivities).toHaveBeenCalledWith('house-1', 50, true);
  });

  it('passes enabled=false to useHouseActivities when house id is missing', () => {
    // House with no id
    const noIdHouse = { ...BASE_HOUSE, id: '' };
    const store = buildStore({}, noIdHouse);
    renderScreen(store);
    expect(mockUseHouseActivities).toHaveBeenCalledWith('', 50, false);
  });

  it('renders multiple activities in order', () => {
    mockUseHouseActivities.mockReturnValue({
      data: [
        SAMPLE_MEETING_ACTIVITY,
        SAMPLE_WORK_ACTIVITY,
        SAMPLE_CHORE_ACTIVITY,
      ],
      isLoading: false,
      isError: false,
      error: null,
    });
    const store = buildStore({ 'guest-alice': GUEST_ALICE }, BASE_HOUSE);
    const { getByTestId } = renderScreen(store);
    expect(getByTestId('activity-row-act-1')).toBeTruthy();
    expect(getByTestId('activity-row-act-2')).toBeTruthy();
    expect(getByTestId('activity-row-act-3')).toBeTruthy();
  });
});
