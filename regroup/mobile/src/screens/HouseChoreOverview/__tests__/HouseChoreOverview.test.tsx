/**
 * HouseChoreOverview Tests
 *
 * Covers:
 *   - HouseChoreActivity: renders guest chore assignments, empty state, loading state
 *   - HouseChoreInfo: renders chore schedule, rotation order, empty states
 *   - HouseChoreSummary: renders weekly stats, completion bar, per-guest status
 */

// ─── useSelectedHouse mock ────────────────────────────────────────────────────
const mockUseSelectedHouse = jest.fn();

jest.mock('../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => mockUseSelectedHouse(),
}));

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

// ─── Guest service mock ────────────────────────────────────────────────────────
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

// ─── Activity service mock (for useWeekSummary) ───────────────────────────────
jest.mock('../../../services/activity', () => ({
  getActivities: jest.fn(() => Promise.resolve([])),
  getWeekSummary: jest.fn(() => Promise.resolve(null)),
  getHouseActivities: jest.fn(() => Promise.resolve([])),
  logActivity: jest.fn(() => Promise.resolve({})),
}));

// ─── React Query hooks mock - makes useWeekSummary return synchronously ───────
// After A2 migration the screens read guests via useGuests (no more Redux
// fallback). buildStore() sets mockGuestsFixture so the mock returns the
// same data each test put in Redux state. See .full-review [A2].
let mockGuestsFixture: Record<string, any> = {};
jest.mock('../../../state/queries', () => ({
  useGuests: jest.fn(() => ({
    data: mockGuestsFixture,
    isLoading: false,
    error: null,
  })),
  useWeekSummary: jest.fn((guestId: string, weekStart: string) => ({
    data: null,
    isLoading: false,
    error: null,
  })),
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

// ─── Context mock ─────────────────────────────────────────────────────────────
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

// ─── Auth context mock ────────────────────────────────────────────────────────
jest.mock('../../../context/auth', () => ({
  AuthConsumer: ({ children }: { children: (ctx: any) => React.ReactNode }) =>
    children({ token: { 'house-1': { role: 'admin' } } }),
}));

// ─── Navigation mocks ─────────────────────────────────────────────────────────
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: () => true,
  }),
  NavigationContainer: ({ children }: any) => children,
}));
jest.mock('@react-navigation/native-stack', () => ({}));

// ─── Component stubs ─────────────────────────────────────────────────────────
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

// ─── dateWithTimezone mock ────────────────────────────────────────────────────
jest.mock('../../../util/dateWithTimezone', () => ({
  getStartOfWeekInTimezone: jest.fn(() => '2026-02-17'),
  getEndOfWeekInTimezone: jest.fn(() => '2026-02-23'),
  getTodaysDateInTimezone: jest.fn(() => '2026-02-22'),
}));

// ─── React imports ────────────────────────────────────────────────────────────
import React from 'react';
import { render, act } from '@testing-library/react-native';
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

import HouseChoreActivity from '../HouseChoreActivity/HouseChoreActivity';
import HouseChoreInfo from '../HouseChoreInfo/HouseChoreInfo';
import HouseChoreSummary from '../HouseChoreSummary/HouseChoreSummary';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

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
  chores: {
    Bathroom: { name: 'Bathroom', description: 'Clean the bathroom.' },
    Kitchen: { name: 'Kitchen', description: 'Clean the kitchen.' },
    'Living Room': {
      name: 'Living Room',
      description: 'Clean the living room.',
    },
  },
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
  userId: 'user-alice',
  firstName: 'Alice',
  lastName: 'Smith',
  email: 'alice@example.com',
  displayName: 'Alice Smith',
  status: 'active',
  isAdmin: false,
  currentChore: 'Bathroom',
  phase: 1,
  step: 1,
  sobrietyDate: '2023-01-01',
  drugOfChoice: 'alcohol',
  hasJob: true,
  rentOwed: 0,
  choreFees: 0,
  dailyHabit: 0,
  supporters: [],
  jobs: [],
  version: 1,
  createdDate: '2024-01-01T00:00:00.000Z',
  lastUpdated: '2024-01-01T00:00:00.000Z',
};

const GUEST_BOB: any = {
  id: 'guest-bob',
  houseId: 'house-1',
  userId: 'user-bob',
  firstName: 'Bob',
  lastName: 'Jones',
  email: 'bob@example.com',
  displayName: 'Bob Jones',
  status: 'active',
  isAdmin: false,
  currentChore: 'Kitchen',
  phase: 1,
  step: 1,
  sobrietyDate: '2023-06-01',
  drugOfChoice: 'opioids',
  hasJob: false,
  rentOwed: 0,
  choreFees: 0,
  dailyHabit: 0,
  supporters: [],
  jobs: [],
  version: 1,
  createdDate: '2024-01-01T00:00:00.000Z',
  lastUpdated: '2024-01-01T00:00:00.000Z',
};

const GUEST_NO_CHORE: any = {
  ...GUEST_ALICE,
  id: 'guest-nochore',
  firstName: 'Carol',
  lastName: 'Davis',
  currentChore: undefined,
  email: 'carol@example.com',
};

// ─── Store factory ────────────────────────────────────────────────────────────

function buildStore(guests: Record<string, any> = {}, house: any = BASE_HOUSE) {
  mockUseSelectedHouse.mockReturnValue({
    house,
    houseId: house?.id ?? null,
    isLoading: false,
  });
  // A2 migration: route the same fixture through the mocked useGuests so the
  // screens see the data they used to read from state.guests.guests.
  mockGuestsFixture = guests;

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

function renderScreen(
  Component: React.FC,
  store: ReturnType<typeof buildStore>,
) {
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
        <Component />
      </QueryClientProvider>
    </Provider>,
  );
}

// ─── HouseChoreActivity Tests ─────────────────────────────────────────────────

describe('HouseChoreActivity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading indicator when no house is selected', () => {
    const store = buildStore({}, null);
    const { UNSAFE_queryByType } = renderScreen(HouseChoreActivity, store);
    // Should show loading indicator
    expect(UNSAFE_queryByType('RatsLoadingIndicator' as any)).toBeTruthy();
  });

  it('renders the screen header and summary when house exists', async () => {
    const store = buildStore(
      { 'guest-alice': GUEST_ALICE, 'guest-bob': GUEST_BOB },
      BASE_HOUSE,
    );
    const { getByTestId, getByText } = renderScreen(HouseChoreActivity, store);
    // Header should be rendered
    expect(getByText('Chore Assignments')).toBeTruthy();
  });

  it('renders guest chore rows for all active guests', async () => {
    const store = buildStore(
      { 'guest-alice': GUEST_ALICE, 'guest-bob': GUEST_BOB },
      BASE_HOUSE,
    );
    const { getByTestId } = renderScreen(HouseChoreActivity, store);
    expect(getByTestId('chore-row-guest-alice')).toBeTruthy();
    expect(getByTestId('chore-row-guest-bob')).toBeTruthy();
  });

  it('shows empty state when no guests are present', async () => {
    const store = buildStore({}, BASE_HOUSE);
    const { getByTestId } = renderScreen(HouseChoreActivity, store);
    expect(getByTestId('chore-activity-empty')).toBeTruthy();
  });

  it('shows guest name and chore name in each row', async () => {
    const store = buildStore({ 'guest-alice': GUEST_ALICE }, BASE_HOUSE);
    const { getByText } = renderScreen(HouseChoreActivity, store);
    expect(getByText('Alice Smith')).toBeTruthy();
    expect(getByText('Bathroom')).toBeTruthy();
  });

  it('shows "No chore assigned" for guests without a current chore', async () => {
    const store = buildStore({ 'guest-nochore': GUEST_NO_CHORE }, BASE_HOUSE);
    const { getByText } = renderScreen(HouseChoreActivity, store);
    expect(getByText('No chore assigned')).toBeTruthy();
  });

  it('shows "Pending" status badge for guests with no week summary data', async () => {
    const store = buildStore({ 'guest-alice': GUEST_ALICE }, BASE_HOUSE);
    const { getByText } = renderScreen(HouseChoreActivity, store);
    // useWeekSummary returns null (no data) so badge shows "Pending"
    expect(getByText('Pending')).toBeTruthy();
  });

  it('shows assignment summary count', async () => {
    const store = buildStore(
      { 'guest-alice': GUEST_ALICE, 'guest-bob': GUEST_BOB },
      BASE_HOUSE,
    );
    const { getByText } = renderScreen(HouseChoreActivity, store);
    expect(getByText('2 of 2 residents assigned')).toBeTruthy();
  });
});

// ─── HouseChoreInfo Tests ─────────────────────────────────────────────────────

describe('HouseChoreInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading indicator when no house is selected', () => {
    const store = buildStore({}, null);
    const { UNSAFE_queryByType } = renderScreen(HouseChoreInfo, store);
    expect(UNSAFE_queryByType('RatsLoadingIndicator' as any)).toBeTruthy();
  });

  it('renders the Chore Schedule header', () => {
    const store = buildStore({}, BASE_HOUSE);
    const { getByText } = renderScreen(HouseChoreInfo, store);
    expect(getByText('Chore Schedule')).toBeTruthy();
  });

  it('renders a chore info item for each house chore', () => {
    const store = buildStore({}, BASE_HOUSE);
    const { getByTestId } = renderScreen(HouseChoreInfo, store);
    expect(getByTestId('chore-info-Bathroom')).toBeTruthy();
    expect(getByTestId('chore-info-Kitchen')).toBeTruthy();
    expect(getByTestId('chore-info-Living Room')).toBeTruthy();
  });

  it('shows chore descriptions', () => {
    const store = buildStore({}, BASE_HOUSE);
    const { getByText } = renderScreen(HouseChoreInfo, store);
    expect(getByText('Clean the bathroom.')).toBeTruthy();
  });

  it('shows "No chores configured" when house has no chores', () => {
    const houseNoChores = { ...BASE_HOUSE, chores: {} };
    const store = buildStore({}, houseNoChores);
    const { getByTestId } = renderScreen(HouseChoreInfo, store);
    expect(getByTestId('chore-info-no-chores')).toBeTruthy();
  });

  it('shows "No residents in house" when no guests', () => {
    const store = buildStore({}, BASE_HOUSE);
    const { getByTestId } = renderScreen(HouseChoreInfo, store);
    expect(getByTestId('chore-info-no-residents')).toBeTruthy();
  });

  it('renders rotation rows for each active guest', () => {
    const store = buildStore(
      { 'guest-alice': GUEST_ALICE, 'guest-bob': GUEST_BOB },
      BASE_HOUSE,
    );
    const { getByTestId } = renderScreen(HouseChoreInfo, store);
    expect(getByTestId('rotation-row-guest-alice')).toBeTruthy();
    expect(getByTestId('rotation-row-guest-bob')).toBeTruthy();
  });

  it('shows assigned chore name in rotation row for guest with chore', () => {
    const store = buildStore({ 'guest-alice': GUEST_ALICE }, BASE_HOUSE);
    const { getByText } = renderScreen(HouseChoreInfo, store);
    expect(getByText('Current: Bathroom')).toBeTruthy();
  });

  it('shows "No chore assigned" in rotation row for guest without chore', () => {
    const store = buildStore({ 'guest-nochore': GUEST_NO_CHORE }, BASE_HOUSE);
    const { getByText } = renderScreen(HouseChoreInfo, store);
    expect(getByText('No chore assigned')).toBeTruthy();
  });

  it('shows assigned guest name in chore item when guest has that chore', () => {
    const store = buildStore({ 'guest-alice': GUEST_ALICE }, BASE_HOUSE);
    const { getAllByText } = renderScreen(HouseChoreInfo, store);
    // Guest appears in both the ChoreInfoItem (assigned to) and the rotation list
    const matches = getAllByText('Alice Smith');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('renders how chores work info card', () => {
    const store = buildStore({}, BASE_HOUSE);
    const { getByTestId } = renderScreen(HouseChoreInfo, store);
    expect(getByTestId('chore-info-summary')).toBeTruthy();
  });
});

// ─── HouseChoreSummary Tests ──────────────────────────────────────────────────

describe('HouseChoreSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading indicator when no house is selected', () => {
    const store = buildStore({}, null);
    const { UNSAFE_queryByType } = renderScreen(HouseChoreSummary, store);
    expect(UNSAFE_queryByType('RatsLoadingIndicator' as any)).toBeTruthy();
  });

  it('renders the Chore Summary header', () => {
    const store = buildStore({}, BASE_HOUSE);
    const { getByText } = renderScreen(HouseChoreSummary, store);
    expect(getByText('Chore Summary')).toBeTruthy();
  });

  it('renders the stat card with current week label', () => {
    const store = buildStore({}, BASE_HOUSE);
    const { getByTestId } = renderScreen(HouseChoreSummary, store);
    expect(getByTestId('chore-summary-stat-card')).toBeTruthy();
  });

  it('shows completion bar components', () => {
    const store = buildStore(
      { 'guest-alice': GUEST_ALICE, 'guest-bob': GUEST_BOB },
      BASE_HOUSE,
    );
    const { getByTestId } = renderScreen(HouseChoreSummary, store);
    expect(getByTestId('completion-bar-bg')).toBeTruthy();
    expect(getByTestId('completion-bar-fill')).toBeTruthy();
  });

  it('renders a summary row for each active guest', () => {
    const store = buildStore(
      { 'guest-alice': GUEST_ALICE, 'guest-bob': GUEST_BOB },
      BASE_HOUSE,
    );
    const { getByTestId } = renderScreen(HouseChoreSummary, store);
    expect(getByTestId('summary-row-guest-alice')).toBeTruthy();
    expect(getByTestId('summary-row-guest-bob')).toBeTruthy();
  });

  it('shows empty state when no guests', () => {
    const store = buildStore({}, BASE_HOUSE);
    const { getByTestId } = renderScreen(HouseChoreSummary, store);
    expect(getByTestId('chore-summary-empty')).toBeTruthy();
  });

  it('shows guest chore name in summary row', () => {
    const store = buildStore({ 'guest-alice': GUEST_ALICE }, BASE_HOUSE);
    const { getByText } = renderScreen(HouseChoreSummary, store);
    // Guest name and chore name should appear
    expect(getByText('Alice Smith')).toBeTruthy();
    expect(getByText('Bathroom')).toBeTruthy();
  });

  it('shows "No chore assigned" for guests without a chore', () => {
    const store = buildStore({ 'guest-nochore': GUEST_NO_CHORE }, BASE_HOUSE);
    const { getByText } = renderScreen(HouseChoreSummary, store);
    expect(getByText('No chore assigned')).toBeTruthy();
  });

  it('shows "Pending" status when week summary has no completions', () => {
    const store = buildStore({ 'guest-alice': GUEST_ALICE }, BASE_HOUSE);
    const { getByText } = renderScreen(HouseChoreSummary, store);
    // useWeekSummary returns null so choresCompleted = 0, status = Pending
    expect(getByText('Pending')).toBeTruthy();
  });

  it('shows residents assigned count in the big number', () => {
    const store = buildStore(
      {
        'guest-alice': GUEST_ALICE,
        'guest-bob': GUEST_BOB,
        'guest-nochore': GUEST_NO_CHORE,
      },
      BASE_HOUSE,
    );
    const { getByText } = renderScreen(HouseChoreSummary, store);
    // 2 guests have chores, 3 total
    expect(getByText('2')).toBeTruthy();
    expect(getByText(' / 3')).toBeTruthy();
  });

  it('shows "residents assigned a chore" label', () => {
    const store = buildStore({ 'guest-alice': GUEST_ALICE }, BASE_HOUSE);
    const { getByText } = renderScreen(HouseChoreSummary, store);
    expect(getByText('residents assigned a chore')).toBeTruthy();
  });
});
