/**
 * HouseInfo Tests
 *
 * Covers:
 *   - Loading state: null house renders RatsLoadingIndicator
 *   - Name and address rendered in the banner card
 *   - Capacity row shows currentCapacity / maximumCapacity
 *   - Rent row shows monthly and weekly amounts
 *   - Phone and WiFi rows
 *   - House type row
 *   - Gender row (only when set)
 *   - Chore and phase counts
 *   - House join code card
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

// ─── Service mocks ────────────────────────────────────────────────────────────
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

jest.mock('../../../services/house', () => ({
  getHouse: jest.fn(),
  getHouses: jest.fn(),
  createHouse: jest.fn(),
  updateHouse: jest.fn(),
  createHouseId: jest.fn(() => 'mock-house-id'),
  houseCollection: {},
}));

jest.mock('../../../services/activity', () => ({
  getActivities: jest.fn(() => Promise.resolve([])),
  getWeekSummary: jest.fn(() => Promise.resolve(null)),
  getHouseActivities: jest.fn(() => Promise.resolve([])),
  logActivity: jest.fn(() => Promise.resolve({})),
}));

jest.mock('../../../services/meeting', () => ({
  searchForMeetings: jest.fn(() => Promise.resolve([])),
  addMeeting: jest.fn(() => Promise.resolve({})),
}));

jest.mock('../../../services/offlineQueue', () => ({
  offlineQueue: {
    enqueue: jest.fn(),
    flush: jest.fn(() => Promise.resolve()),
  },
}));

// ─── Context mocks ────────────────────────────────────────────────────────────
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
  useFocusEffect: jest.fn(),
}));
jest.mock('@react-navigation/native-stack', () => ({}));

// ─── Component stubs ──────────────────────────────────────────────────────────
jest.mock('../../../components/rats-scroll-view', () => {
  const { ScrollView } = require('react-native');
  return ScrollView;
});
jest.mock(
  '../../../components/rats-loading-indicator/rats-loading-indicator',
  () => 'RatsLoadingIndicator',
);

// ─── React imports ────────────────────────────────────────────────────────────
import React from 'react';
import { render } from '@testing-library/react-native';
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

import HouseInfo from '../HouseInfo/HouseInfo';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_HOUSE: any = {
  id: 'house-1',
  name: 'Sunrise Recovery House',
  timezone: 'America/Chicago',
  ownerId: 'owner-1',
  lat: 0,
  lng: 0,
  geohash: '',
  adminId: '',
  adminIds: [],
  superAdminIds: [],
  street: '42 Oak Street',
  city: 'Chicago',
  country: 'US',
  health: {},
  monthlyRent: 800,
  weeklyRent: 200,
  currentCapacity: 3,
  maximumCapacity: 8,
  state: 'IL',
  zip: '60601',
  code: 'RISE42',
  avatar: '',
  imageUrl: '',
  depositsAndFees: 0,
  certified: false,
  phoneNumber: '3125550101',
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
  },
  phases: {
    phase1: { name: 'Phase 1' },
    phase2: { name: 'Phase 2' },
    phase3: { name: 'Phase 3' },
  },
  gender: '',
  disputes: {},
  issues: {},
  applications: {},
  complaints: {},
  rooms: {},
  baths: 1,
  wifi: true,
  rating: 4,
  stripeAccountId: undefined,
  stripeStatus: 'not_connected',
  createdDate: '2024-01-01T00:00:00.000Z',
  lastUpdated: '2024-01-01T00:00:00.000Z',
};

// ─── Store factory ────────────────────────────────────────────────────────────

function buildStore(house: any = BASE_HOUSE) {
  mockUseSelectedHouse.mockReturnValue({
    house,
    houseId: house?.id ?? null,
    isLoading: false,
  });

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
        guests: {},
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

function renderScreen(house: any) {
  const store = buildStore(house);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <HouseInfo />
      </Provider>
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HouseInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Loading state
  it('renders loading indicator when no house is selected', () => {
    const { UNSAFE_queryByType } = renderScreen(null);
    expect(UNSAFE_queryByType('RatsLoadingIndicator' as any)).toBeTruthy();
  });

  // Name and address
  it('renders the house name in the banner card', () => {
    const { getByText } = renderScreen(BASE_HOUSE);
    expect(getByText('Sunrise Recovery House')).toBeTruthy();
  });

  it('renders the house address in the banner card', () => {
    const { getByTestId, getByText } = renderScreen(BASE_HOUSE);
    expect(getByTestId('house-info-name-card')).toBeTruthy();
    expect(getByText('42 Oak Street, Chicago, IL, 60601, US')).toBeTruthy();
  });

  // Capacity
  it('renders the capacity row with currentCapacity / maximumCapacity', () => {
    const { getByTestId, getByText } = renderScreen(BASE_HOUSE);
    expect(getByTestId('house-info-capacity')).toBeTruthy();
    expect(getByText('3 / 8')).toBeTruthy();
  });

  // Rent
  it('renders the rent row showing both monthly and weekly amounts', () => {
    const { getByTestId, getByText } = renderScreen(BASE_HOUSE);
    expect(getByTestId('house-info-rent')).toBeTruthy();
    expect(getByText('$800/mo  |  $200/wk')).toBeTruthy();
  });

  it('renders only monthly rent when rentFrequency is monthly', () => {
    const house = { ...BASE_HOUSE, rentFrequency: 'monthly', monthlyRent: 950 };
    const { getByText } = renderScreen(house);
    expect(getByText('$950/mo')).toBeTruthy();
  });

  it('renders only weekly rent when rentFrequency is weekly', () => {
    const house = { ...BASE_HOUSE, rentFrequency: 'weekly', weeklyRent: 275 };
    const { getByText } = renderScreen(house);
    expect(getByText('$275/wk')).toBeTruthy();
  });

  // Phone
  it('renders the phone number row', () => {
    const { getByTestId, getByText } = renderScreen(BASE_HOUSE);
    expect(getByTestId('house-info-phone')).toBeTruthy();
    expect(getByText('3125550101')).toBeTruthy();
  });

  it('renders "Not set" when phoneNumber is empty', () => {
    const house = { ...BASE_HOUSE, phoneNumber: '' };
    const { getByText } = renderScreen(house);
    expect(getByText('Not set')).toBeTruthy();
  });

  // WiFi
  it('renders WiFi as "Yes" when wifi is true', () => {
    const { getByTestId, getByText } = renderScreen(BASE_HOUSE);
    expect(getByTestId('house-info-wifi')).toBeTruthy();
    expect(getByText('Yes')).toBeTruthy();
  });

  it('renders WiFi as "No" when wifi is false', () => {
    const house = { ...BASE_HOUSE, wifi: false };
    const { getByText } = renderScreen(house);
    expect(getByText('No')).toBeTruthy();
  });

  // House type
  it('renders "Traditional" for houseType traditional', () => {
    const { getByTestId, getByText } = renderScreen(BASE_HOUSE);
    expect(getByTestId('house-info-type')).toBeTruthy();
    expect(getByText('Traditional')).toBeTruthy();
  });

  it('renders "Oxford House" for houseType oxford', () => {
    const house = { ...BASE_HOUSE, houseType: 'oxford' };
    const { getByText } = renderScreen(house);
    expect(getByText('Oxford House')).toBeTruthy();
  });

  // Gender filter
  it('does not render gender row when gender is empty', () => {
    const { queryByTestId } = renderScreen(BASE_HOUSE);
    expect(queryByTestId('house-info-gender')).toBeNull();
  });

  it('renders gender row when gender is set', () => {
    const house = { ...BASE_HOUSE, gender: 'male' };
    const { getByTestId, getByText } = renderScreen(house);
    expect(getByTestId('house-info-gender')).toBeTruthy();
    expect(getByText('Male')).toBeTruthy();
  });

  // Chores and phases
  it('renders the chore count', () => {
    const { getByTestId, getByText } = renderScreen(BASE_HOUSE);
    expect(getByTestId('house-info-chores')).toBeTruthy();
    // BASE_HOUSE has 2 chores
    expect(getByText('2')).toBeTruthy();
  });

  it('renders the phase count', () => {
    const { getByTestId, getByText } = renderScreen(BASE_HOUSE);
    expect(getByTestId('house-info-phases')).toBeTruthy();
    // BASE_HOUSE has 3 phases
    expect(getByText('3')).toBeTruthy();
  });

  it('renders chore count of 0 when chores is empty', () => {
    const house = { ...BASE_HOUSE, chores: {} };
    const { getByTestId } = renderScreen(house);
    expect(getByTestId('house-info-chores')).toBeTruthy();
  });

  // House code
  it('renders the join code card with the house code', () => {
    const { getByTestId, getByText } = renderScreen(BASE_HOUSE);
    expect(getByTestId('house-info-code-card')).toBeTruthy();
    expect(getByText('RISE42')).toBeTruthy();
  });

  it('renders an em-dash when code is not set', () => {
    const house = { ...BASE_HOUSE, code: '' };
    const { getByText } = renderScreen(house);
    expect(getByText('—')).toBeTruthy();
  });
});
