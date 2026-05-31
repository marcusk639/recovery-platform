/**
 * GuestHome Screen Tests
 *
 * Covers:
 *  - Renders loading indicator when guests or house are loading
 *  - Renders empty state (EmptyScreen) when there is no selected guest
 *  - Renders the main overview screen when guest and house are loaded
 *  - Renders stat cards (meetings, job, chores, sponsor)
 *  - Renders pay-rent and payment-history cards
 *  - Admin-only "Export Compliance Report" card is shown for admins
 *  - Admin-only "Export Compliance Report" card is hidden for non-admins
 *  - Navigation is called when a stat card is pressed
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
const mockShowFormModal = jest.fn();

jest.mock('../../../context', () => ({
  useModal: () => ({
    showFormModal: mockShowFormModal,
    dismissFormModal: jest.fn(),
    setLoadingModalState: jest.fn(),
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
// Default: isAdmin returns false (guest view). Override per-test as needed.
const mockIsAdmin = jest.fn(() => false);

jest.mock('../../../context/auth', () => ({
  AuthConsumer: ({ children }: { children: (ctx: any) => any }) =>
    children({ token: { role: { 'house-1': 'guest' }, claims: {} } }),
}));

jest.mock('../../../util/roles', () => ({
  isAdmin: (...args: any[]) => (mockIsAdmin as any)(...args),
}));

// ─── Activity hooks ────────────────────────────────────────────────────────────
const mockUseWeekSummary = jest.fn();
const mockUseComplianceCheck = jest.fn();

jest.mock('../../../hooks/activity/useWeekSummary', () => ({
  useWeekSummary: (...args: any[]) => mockUseWeekSummary(...args),
}));

jest.mock('../../../hooks/activity/useCurrentWeek', () => ({
  useCurrentWeek: () => ({
    startDate: '2026-02-16',
    endDate: '2026-02-22',
    weekNumber: 8,
    year: 2026,
  }),
}));

jest.mock('../../../state/queries/activityQueries', () => ({
  useComplianceCheck: (...args: any[]) => mockUseComplianceCheck(...args),
  useWeekSummary: jest.fn(() => ({
    data: null,
    isLoading: false,
    isError: false,
    error: null,
  })),
}));

// ─── React Query mocks ────────────────────────────────────────────────────────
jest.mock('../../../state/queries', () => ({
  useGuest: jest.fn(() => ({ data: null, isLoading: false, error: null })),
  useGuests: jest.fn(() => ({ data: {}, isLoading: false, error: null })),
}));

// ─── reportExport mock ────────────────────────────────────────────────────────
jest.mock('../../../services/reportExport', () => ({
  exportWeeklyReportPDF: jest.fn(() => Promise.resolve('/tmp/report.pdf')),
}));

// ─── react-native-html-to-pdf mock ───────────────────────────────────────────
jest.mock('react-native-html-to-pdf', () => ({
  generatePDF: jest.fn(() => Promise.resolve({ filePath: '/tmp/report.pdf' })),
}));

// ─── Push notification mocks ─────────────────────────────────────────────────
jest.mock('react-native-push-notification', () => ({
  localNotificationSchedule: jest.fn(),
  cancelLocalNotification: jest.fn(),
  getApplicationIconBadgeNumber: jest.fn(),
  setApplicationIconBadgeNumber: jest.fn(),
  getChannels: jest.fn(),
  createChannel: jest.fn(),
  checkPermissions: jest.fn(),
}));

const mockScheduleRentReminder = jest.fn();
const mockCancelRentReminder = jest.fn();

jest.mock('../../../services/notifications/rentReminder', () => ({
  scheduleRentReminder: (...args: any[]) => mockScheduleRentReminder(...args),
  cancelRentReminder: (...args: any[]) => mockCancelRentReminder(...args),
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
  return ({ header }: any) => (
    <View testID="screen-header">
      <Text>{header}</Text>
    </View>
  );
});

jest.mock('../../../components/rats-text', () => ({
  RatsText: ({ text }: any) => {
    const { Text } = require('react-native');
    return <Text>{text || ''}</Text>;
  },
}));

jest.mock(
  '../../../components/rats-loading-indicator/rats-loading-indicator',
  () => {
    const { View } = require('react-native');
    return () => <View testID="loading-indicator" />;
  },
);

jest.mock('../../../components/empty-screen', () => {
  const { View, TouchableOpacity, Text } = require('react-native');
  return ({ message, buttonTitle, onPress }: any) => (
    <View testID="empty-screen">
      <Text testID="empty-screen-message">{message}</Text>
      <TouchableOpacity testID="empty-screen-button" onPress={onPress}>
        <Text>{buttonTitle}</Text>
      </TouchableOpacity>
    </View>
  );
});

jest.mock('../../../components/week-stat-summary', () => {
  const { View } = require('react-native');
  return ({ percentage }: any) => (
    <View
      testID="week-stat-summary"
      accessibilityValue={{ text: String(percentage) }}
    />
  );
});

jest.mock('../../../components/rats-icon', () => ({
  RatsIcon: ({ testID, name }: any) => {
    const { View } = require('react-native');
    return <View testID={testID || `icon-${name}`} />;
  },
  ClickableIcon: ({ testID, containerProps }: any) => {
    const { TouchableOpacity } = require('react-native');
    return (
      <TouchableOpacity
        testID={testID || 'clickable-icon'}
        onPress={containerProps?.onPress}
      />
    );
  },
}));

jest.mock('../../../components/rats-icon/boxed-icon', () => {
  const { View } = require('react-native');
  return ({ name }: any) => <View testID={`boxed-icon-${name}`} />;
});

jest.mock('../../../components/compliance-indicator', () => ({
  ComplianceBreakdown: ({ testID }: any) => {
    const { View } = require('react-native');
    return <View testID={testID || 'compliance-breakdown'} />;
  },
}));

// ─── React imports (after mocks) ──────────────────────────────────────────────
import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
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

import GuestHome from '../GuestHome';

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
  phases: {
    '1': {
      name: 'Phase 1',
      rules: {
        meetings: 3,
        work: 20,
        chore: 1,
        supporter: true,
        medications: false,
      },
    },
  },
  gender: '',
  disputes: {},
  applications: {},
  complaints: {},
  rooms: {},
  baths: 1,
  wifi: false,
  rating: 3,
  stripeAccountId: null,
  stripeStatus: 'not_connected',
  createdDate: '2024-01-01',
  lastUpdated: '2024-01-01',
};

const BASE_GUEST: any = {
  id: 'guest-1',
  userId: 'user-1',
  firstName: 'Alice',
  lastName: 'Smith',
  email: 'alice@example.com',
  houseId: 'house-1',
  phase: 1,
  step: 3,
  avatar: '',
  rentOwed: 0,
  choreFees: 0,
  currentWeek: null,
};

const WEEK_SUMMARY_DATA: any = {
  guestId: 'guest-1',
  houseId: 'house-1',
  startDate: '2026-02-16',
  stats: {
    meetingsAttended: 2,
    hoursWorked: 15,
    choresCompleted: 1,
    primarySupporterMet: 1,
    medicationTaken: 0,
  },
};

// ─── Store builder ─────────────────────────────────────────────────────────────

interface BuildStoreOptions {
  selectedGuest?: any;
  house?: any;
  requestingGuests?: boolean;
  requestingHouse?: boolean;
}

function buildStore({
  selectedGuest = BASE_GUEST,
  house = BASE_HOUSE,
  requestingGuests = false,
  requestingHouse = false,
}: BuildStoreOptions = {}) {
  mockUseSelectedHouse.mockReturnValue({
    house,
    houseId: house?.id ?? null,
    isLoading: requestingHouse,
  });
  mockUseSelectedGuest.mockReturnValue({
    guest: selectedGuest ?? null,
    guestId: selectedGuest?.id ?? null,
    isLoading: requestingGuests,
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
        requestingHouse,
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
        guests: selectedGuest ? { [selectedGuest.id]: selectedGuest } : {},
        selectedGuest: selectedGuest ?? null,
        userAsGuest: null,
        status: requestingGuests ? 'loading' : 'idle',
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
      } as any,
      user: {
        user: {
          id: 'admin-1',
          firstName: 'Admin',
          lastName: 'User',
          isAdmin: false,
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
        <GuestHome navigation={mockNavigation} />
      </QueryClientProvider>
    </Provider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GuestHome', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAdmin.mockReturnValue(false);

    // Default activity hooks: no summary loaded
    mockUseWeekSummary.mockReturnValue({
      summary: null,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    mockUseComplianceCheck.mockReturnValue({
      data: null,
      status: 'incomplete-data',
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  // ─── Loading state ─────────────────────────────────────────────────────────
  describe('loading state', () => {
    it('renders loading indicator when guests are loading', () => {
      const { getByTestId } = renderScreen({ requestingGuests: true });
      expect(getByTestId('loading-indicator')).toBeTruthy();
    });

    it('renders loading indicator when house is loading', () => {
      const { getByTestId } = renderScreen({ requestingHouse: true });
      expect(getByTestId('loading-indicator')).toBeTruthy();
    });

    it('renders loading indicator when house is null', () => {
      const { getByTestId } = renderScreen({ house: null });
      expect(getByTestId('loading-indicator')).toBeTruthy();
    });

    it('does not render the overview screen while loading', () => {
      const { queryByTestId } = renderScreen({ requestingGuests: true });
      expect(queryByTestId('guest-overview-screen')).toBeNull();
    });
  });

  // ─── Empty state ───────────────────────────────────────────────────────────
  describe('empty state (no guest)', () => {
    it('renders the EmptyScreen when there is no selected guest', () => {
      const { getByTestId } = renderScreen({ selectedGuest: null });
      expect(getByTestId('empty-screen')).toBeTruthy();
    });

    it('shows the "No guests in this house" message', () => {
      const { getByTestId } = renderScreen({ selectedGuest: null });
      expect(getByTestId('empty-screen-message').props.children).toBe(
        'No guests in this house',
      );
    });

    it('navigates to SendInvites when the empty-state button is pressed', () => {
      const { getByTestId } = renderScreen({ selectedGuest: null });
      fireEvent.press(getByTestId('empty-screen-button'));
      expect(mockNavigation.navigate).toHaveBeenCalledWith('sendInvites');
    });

    it('does not render the overview screen in empty state', () => {
      const { queryByTestId } = renderScreen({ selectedGuest: null });
      expect(queryByTestId('guest-overview-screen')).toBeNull();
    });
  });

  // ─── Main overview renders ─────────────────────────────────────────────────
  describe('main overview', () => {
    it('renders the overview screen when guest and house are loaded', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('guest-overview-screen')).toBeTruthy();
    });

    it('renders the week-summary card', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('week-summary-card')).toBeTruthy();
    });

    it('renders the header with the guest name', () => {
      const { getByText } = renderScreen();
      // Header shows "Alice S."
      expect(getByText('Alice S.')).toBeTruthy();
    });
  });

  // ─── Stat cards ────────────────────────────────────────────────────────────
  describe('stat cards', () => {
    it('renders the meetings card', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('meetings-card')).toBeTruthy();
    });

    it('renders the job-status card', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('job-status-card')).toBeTruthy();
    });

    it('renders the chores card', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('chores-card')).toBeTruthy();
    });

    it('renders the sponsor card', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('sponsor-card')).toBeTruthy();
    });

    it('renders the pay-rent card', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('pay-rent-card')).toBeTruthy();
    });

    it('renders the payment-history card', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('payment-history-card')).toBeTruthy();
    });
  });

  // ─── Week summary data ─────────────────────────────────────────────────────
  describe('with week summary data', () => {
    beforeEach(() => {
      mockUseWeekSummary.mockReturnValue({
        summary: WEEK_SUMMARY_DATA,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });
    });

    it('renders the overview screen with summary data available', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('guest-overview-screen')).toBeTruthy();
    });

    it('renders the week-stat-summary component', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('week-stat-summary')).toBeTruthy();
    });
  });

  // ─── Navigation ────────────────────────────────────────────────────────────
  describe('navigation from stat cards', () => {
    it('navigates when meetings card is pressed', () => {
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId('meetings-card'));
      expect(mockNavigation.navigate).toHaveBeenCalled();
    });

    it('navigates when chores card is pressed', () => {
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId('chores-card'));
      expect(mockNavigation.navigate).toHaveBeenCalled();
    });

    it('navigates to PaymentHistory when payment-history card is pressed', () => {
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId('payment-history-card'));
      expect(mockNavigation.navigate).toHaveBeenCalledWith('paymentHistory');
    });
  });

  // ─── Pay rent — stripe not connected ─────────────────────────────────────
  describe('pay rent card', () => {
    it('renders pay-rent card with "No balance due" when rentOwed is 0', () => {
      const { getByTestId, getByText } = renderScreen();
      expect(getByTestId('pay-rent-card')).toBeTruthy();
      expect(getByText('No balance due')).toBeTruthy();
    });

    it('renders pay-rent card with amount due when rentOwed > 0', () => {
      const guestWithRent = { ...BASE_GUEST, rentOwed: 500, choreFees: 0 };
      const { getByText } = renderScreen({ selectedGuest: guestWithRent });
      expect(getByText('$500.00 due')).toBeTruthy();
    });
  });

  // ─── Admin-only export card ────────────────────────────────────────────────
  describe('export compliance report (admin only)', () => {
    it('shows the export card when the user is an admin', () => {
      mockIsAdmin.mockReturnValue(true);
      const { getByTestId } = renderScreen();
      expect(getByTestId('export-compliance-report-card')).toBeTruthy();
    });

    it('does not show the export card for non-admins', () => {
      mockIsAdmin.mockReturnValue(false);
      const { queryByTestId } = renderScreen();
      expect(queryByTestId('export-compliance-report-card')).toBeNull();
    });
  });

  // ─── Make a Payment (guest only) ──────────────────────────────────────────
  describe('make a payment button', () => {
    it('renders the "Make a Payment" button for a guest user', () => {
      mockIsAdmin.mockReturnValue(false);
      const { getByTestId } = renderScreen();
      expect(getByTestId('make-payment-button')).toBeTruthy();
    });

    it('navigates to ResidentPayment when "Make a Payment" button is pressed', () => {
      mockIsAdmin.mockReturnValue(false);
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId('make-payment-button'));
      expect(mockNavigation.navigate).toHaveBeenCalledWith('residentPayment');
    });

    it('does not render the "Make a Payment" button for admins', () => {
      mockIsAdmin.mockReturnValue(true);
      const { queryByTestId } = renderScreen();
      expect(queryByTestId('make-payment-button')).toBeNull();
    });
  });
});

describe('Rent reminder notification scheduling', () => {
  beforeEach(() => {
    mockScheduleRentReminder.mockClear();
  });

  it('schedules a rent reminder when guest has rentOwed > 0', () => {
    renderScreen({ selectedGuest: { ...BASE_GUEST, rentOwed: 5000 } });
    expect(mockScheduleRentReminder).toHaveBeenCalledWith(
      expect.objectContaining({ id: BASE_GUEST.id }),
    );
  });

  it('does not schedule a reminder when rentOwed === 0', () => {
    renderScreen({ selectedGuest: { ...BASE_GUEST, rentOwed: 0 } });
    expect(mockScheduleRentReminder).not.toHaveBeenCalled();
  });
});
