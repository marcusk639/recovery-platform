/**
 * BusinessMeetings Screen Tests
 *
 * Covers:
 * - Renders without crashing
 * - Loading state shows ActivityIndicator
 * - Empty state shows "No business meetings scheduled" message
 * - Meetings list renders scheduled dates, quorum status, attendee counts
 * - "Schedule New Meeting" button shows the create form
 * - Create form renders a TouchableOpacity date trigger (NOT a raw TextInput)
 * - DatePicker modal is rendered in date mode
 * - When a date is selected via DatePicker it formats to YYYY-MM-DD on save
 * - Cancel button hides the create form
 * - Submitting create form calls createBusinessMeeting service with YYYY-MM-DD string
 * - Error alert shown when createBusinessMeeting fails
 * - Refresh button reloads meetings
 */

// ─── useSelectedHouse mock ────────────────────────────────────────────────────
const mockUseSelectedHouse = jest.fn();

jest.mock('../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => mockUseSelectedHouse(),
}));

// ─── useOxfordGate mock — always-allow for screen-behavior tests ──────────────
// The gate is tested on its own; these tests target BusinessMeetings behavior
// under the assumption that the subscription/house-type gate has passed.
jest.mock('../../../hooks/useOxfordGate', () => ({
  useOxfordGate: () => ({ allowed: true, houseId: 'house-1' }),
}));

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock('@react-navigation/native-stack', () => ({}));

// ─── DatePicker mock ──────────────────────────────────────────────────────────
jest.mock('react-native-date-picker', () => 'RNDatePicker');

// ─── Firebase setup mock ──────────────────────────────────────────────────────
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
        collection: jest.fn().mockReturnThis(),
      })),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn(() => Promise.resolve({ docs: [] })),
    })),
    batch: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      commit: jest.fn(() => Promise.resolve()),
    })),
  },
}));

// ─── Business meetings service mocks ─────────────────────────────────────────
const mockGetBusinessMeetings = jest.fn();
const mockCreateBusinessMeeting = jest.fn();

// Mock the barrel (what oxfordQueries.ts imports from)
jest.mock('../../../services/oxford', () => ({
  getBusinessMeetings: (...args: any[]) => mockGetBusinessMeetings(...args),
  createBusinessMeeting: (...args: any[]) => mockCreateBusinessMeeting(...args),
  getOfficers: jest.fn(() => Promise.resolve([])),
  getActiveOfficers: jest.fn(() => Promise.resolve([])),
  createOfficer: jest.fn(() => Promise.resolve({})),
  updateOfficer: jest.fn(() => Promise.resolve()),
  removeOfficer: jest.fn(() => Promise.resolve()),
  updateBusinessMeeting: jest.fn(() => Promise.resolve()),
  deleteBusinessMeeting: jest.fn(() => Promise.resolve()),
  castVote: jest.fn(() => Promise.resolve({})),
  getVotesForMeeting: jest.fn(() => Promise.resolve([])),
  updateVote: jest.fn(() => Promise.resolve()),
  getElections: jest.fn(() => Promise.resolve([])),
  createElection: jest.fn(() => Promise.resolve({})),
  updateElection: jest.fn(() => Promise.resolve()),
  getEESTransactions: jest.fn(() => Promise.resolve([])),
  createEESTransaction: jest.fn(() => Promise.resolve({})),
  getFinancialRecords: jest.fn(() => Promise.resolve([])),
  createFinancialRecord: jest.fn(() => Promise.resolve({})),
}));

// Also mock the subcollection module (for direct imports if any)
jest.mock('../../../services/oxford/businessMeetings', () => ({
  getBusinessMeetings: (...args: any[]) => mockGetBusinessMeetings(...args),
  createBusinessMeeting: (...args: any[]) => mockCreateBusinessMeeting(...args),
}));

// ─── Context mock ─────────────────────────────────────────────────────────────
jest.mock('../../../context', () => ({
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
      <Text>{header}</Text>
    </View>
  );
});

jest.mock('../../../components/rats-scroll-view', () => {
  const { ScrollView } = require('react-native');
  return ScrollView;
});

jest.mock('../../../components/rats-text', () => ({
  RatsText: ({ text }: any) => {
    const { Text } = require('react-native');
    return <Text>{String(text ?? '')}</Text>;
  },
}));

jest.mock('../../../components/rats-button/rats-button', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return ({ title, onPress, disabled }: any) => (
    <TouchableOpacity
      testID={`rats-button-${String(title ?? '')
        .toLowerCase()
        .replace(/[\s.]+/g, '-')}`}
      onPress={onPress}
      disabled={disabled}>
      <Text>{title}</Text>
    </TouchableOpacity>
  );
});

// ─── React imports (after mocks) ──────────────────────────────────────────────
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';

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

import BusinessMeetings from '../BusinessMeetings';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_HOUSE: any = {
  id: 'house-1',
  name: 'Oxford Recovery House',
  adminIds: [],
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
  currentCapacity: 4,
  maximumCapacity: 8,
  code: 'OXF01',
  avatar: '',
  imageUrl: '',
  depositsAndFees: 0,
  certified: true,
  phoneNumber: '5551234567',
  rentFrequency: 'both',
  subscriptionStatus: 'active',
  isDemoHouse: false,
  houseType: 'oxford',
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
  baths: 2,
  wifi: true,
  rating: 5,
  createdDate: '2024-01-01',
  lastUpdated: '2024-01-01',
};

const makeMeeting = (overrides: any = {}) => ({
  id: 'meeting-1',
  houseId: 'house-1',
  scheduledDate: '2026-03-01',
  agenda: [],
  attendees: [],
  quorumMet: false,
  createdBy: 'user-1',
  createdAt: '2026-02-22T00:00:00.000Z',
  ...overrides,
});

// ─── Store builder ─────────────────────────────────────────────────────────────

function buildStore(userId = 'user-1') {
  mockUseSelectedHouse.mockReturnValue({
    house: BASE_HOUSE,
    houseId: BASE_HOUSE?.id ?? null,
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
        selectedHouse: BASE_HOUSE,
        houses: { 'house-1': BASE_HOUSE },
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
        userAsGuest: null,
        status: 'idle',
        error: null,
        updateStatus: 'idle',
        createStatus: 'idle',
        deleteStatus: 'idle',
        customizePhaseStatus: 'idle',
      } as any,
      user: {
        user: { id: userId, firstName: 'Admin', lastName: 'User' },
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

function renderScreen(userId = 'user-1') {
  const store = buildStore(userId);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <BusinessMeetings navigation={mockNavigation} />
      </Provider>
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BusinessMeetings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert');
    mockGetBusinessMeetings.mockResolvedValue([]);
    mockCreateBusinessMeeting.mockResolvedValue(makeMeeting());
  });

  // ─── Smoke test ───────────────────────────────────────────────────────────
  describe('render', () => {
    it('renders without crashing', async () => {
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText('Business Meetings')).toBeTruthy();
      });
    });

    it('renders the screen header', async () => {
      const { getByTestId } = renderScreen();
      await waitFor(() => {
        expect(getByTestId('screen-header')).toBeTruthy();
      });
    });
  });

  // ─── Loading state ────────────────────────────────────────────────────────
  describe('loading state', () => {
    it('renders ActivityIndicator while loading', () => {
      mockGetBusinessMeetings.mockReturnValue(new Promise(() => {}));
      const { UNSAFE_getByType } = renderScreen();
      const { ActivityIndicator } = require('react-native');
      expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    });

    it('renders header text in loading state', () => {
      mockGetBusinessMeetings.mockReturnValue(new Promise(() => {}));
      const { getByText } = renderScreen();
      expect(getByText('Business Meetings')).toBeTruthy();
    });
  });

  // ─── Empty state ──────────────────────────────────────────────────────────
  describe('empty state', () => {
    it('shows "No business meetings scheduled" when list is empty', async () => {
      mockGetBusinessMeetings.mockResolvedValue([]);
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText('No business meetings scheduled.')).toBeTruthy();
      });
    });

    it('renders Schedule New Meeting button when no meetings exist', async () => {
      mockGetBusinessMeetings.mockResolvedValue([]);
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText('Schedule New Meeting')).toBeTruthy();
      });
    });
  });

  // ─── Data rendering ───────────────────────────────────────────────────────
  describe('meetings list', () => {
    it('renders scheduled date for a meeting', async () => {
      const meetings = [makeMeeting({ scheduledDate: '2026-03-15' })];
      mockGetBusinessMeetings.mockResolvedValue(meetings);
      const { getByText } = renderScreen();
      await waitFor(() => {
        // moment formats '2026-03-15' as 'Sunday, March 15, 2026'
        expect(getByText('Sunday, March 15, 2026')).toBeTruthy();
      });
    });

    it('renders quorum status badges', async () => {
      const meetings = [
        makeMeeting({ id: 'meeting-1', quorumMet: false }),
        makeMeeting({ id: 'meeting-2', quorumMet: true }),
      ];
      mockGetBusinessMeetings.mockResolvedValue(meetings);
      const { getByText, getAllByText } = renderScreen();
      await waitFor(() => {
        expect(getByText('No Quorum')).toBeTruthy();
        expect(getByText('Quorum Met')).toBeTruthy();
      });
    });

    it('renders attendee count for a meeting', async () => {
      const meetings = [
        makeMeeting({ attendees: ['user-1', 'user-2', 'user-3'] }),
      ];
      mockGetBusinessMeetings.mockResolvedValue(meetings);
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText('3 attendees')).toBeTruthy();
      });
    });

    it('renders agenda item count when agenda exists', async () => {
      const meetings = [
        makeMeeting({
          agenda: [
            { id: 'a1', title: 'Item 1', addedBy: 'user-1' },
            { id: 'a2', title: 'Item 2', addedBy: 'user-1' },
          ],
        }),
      ];
      mockGetBusinessMeetings.mockResolvedValue(meetings);
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText('2 agenda items')).toBeTruthy();
      });
    });

    it('renders "Minutes recorded" when meeting has minutes', async () => {
      const meetings = [makeMeeting({ minutes: 'Meeting went well.' })];
      mockGetBusinessMeetings.mockResolvedValue(meetings);
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText('Minutes recorded')).toBeTruthy();
      });
    });

    it('renders multiple meetings', async () => {
      const meetings = [
        makeMeeting({ id: 'meeting-1', scheduledDate: '2026-03-01' }),
        makeMeeting({ id: 'meeting-2', scheduledDate: '2026-04-01' }),
      ];
      mockGetBusinessMeetings.mockResolvedValue(meetings);
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText('Sunday, March 1, 2026')).toBeTruthy();
        expect(getByText('Wednesday, April 1, 2026')).toBeTruthy();
      });
    });
  });

  // ─── Create form ──────────────────────────────────────────────────────────
  describe('create form', () => {
    it('shows create form when "Schedule New Meeting" is pressed', async () => {
      mockGetBusinessMeetings.mockResolvedValue([]);
      const { getByText } = renderScreen();

      await waitFor(() => {
        expect(getByText('Schedule New Meeting')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Schedule New Meeting'));
      });

      await waitFor(() => {
        expect(getByText('Schedule New Meeting')).toBeTruthy();
        expect(getByText('Scheduled Date (YYYY-MM-DD)')).toBeTruthy();
      });
    });

    it('does NOT render a raw TextInput with placeholder "YYYY-MM-DD"', async () => {
      mockGetBusinessMeetings.mockResolvedValue([]);
      const { getByText, queryByPlaceholderText } = renderScreen();

      await waitFor(() => {
        expect(getByText('Schedule New Meeting')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Schedule New Meeting'));
      });

      await waitFor(() => {
        expect(getByText('Scheduled Date (YYYY-MM-DD)')).toBeTruthy();
      });

      // The raw TextInput with placeholder must be gone — replaced by DatePicker
      expect(queryByPlaceholderText('YYYY-MM-DD')).toBeNull();
    });

    it('renders the DatePicker modal (RNDatePicker) in date mode', async () => {
      mockGetBusinessMeetings.mockResolvedValue([]);
      const { getByText, UNSAFE_getAllByType } = renderScreen();

      await waitFor(() => {
        expect(getByText('Schedule New Meeting')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Schedule New Meeting'));
      });

      await waitFor(() => {
        expect(getByText('Scheduled Date (YYYY-MM-DD)')).toBeTruthy();
      });

      const pickers = UNSAFE_getAllByType('RNDatePicker' as any);
      expect(pickers.length).toBeGreaterThan(0);
      expect(pickers[0].props.mode).toBe('date');
      expect(pickers[0].props.modal).toBe(true);
    });

    it('DatePicker receives a Date object as its date prop', async () => {
      mockGetBusinessMeetings.mockResolvedValue([]);
      const { getByText, UNSAFE_getAllByType } = renderScreen();

      await waitFor(() => {
        expect(getByText('Schedule New Meeting')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Schedule New Meeting'));
      });

      await waitFor(() => {
        expect(getByText('Scheduled Date (YYYY-MM-DD)')).toBeTruthy();
      });

      const pickers = UNSAFE_getAllByType('RNDatePicker' as any);
      expect(pickers[0].props.date).toBeInstanceOf(Date);
    });

    it('opens DatePicker when the date display TouchableOpacity is pressed', async () => {
      mockGetBusinessMeetings.mockResolvedValue([]);
      const { getByText, getByTestId, UNSAFE_getAllByType } = renderScreen();

      await waitFor(() => {
        expect(getByText('Schedule New Meeting')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Schedule New Meeting'));
      });

      await waitFor(() => {
        expect(getByText('Scheduled Date (YYYY-MM-DD)')).toBeTruthy();
      });

      // Picker should be closed initially
      let pickers = UNSAFE_getAllByType('RNDatePicker' as any);
      expect(pickers[0].props.open).toBe(false);

      // Press the date trigger button to open the picker
      await act(async () => {
        fireEvent.press(getByTestId('date-picker-trigger'));
      });

      pickers = UNSAFE_getAllByType('RNDatePicker' as any);
      expect(pickers[0].props.open).toBe(true);
    });

    it('leaves scheduledDate unchanged when DatePicker is cancelled', async () => {
      mockGetBusinessMeetings.mockResolvedValue([]);
      const { getByText, getByTestId, UNSAFE_getAllByType } = renderScreen();

      await waitFor(() => {
        expect(getByText('Schedule New Meeting')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Schedule New Meeting'));
      });

      await waitFor(() => {
        expect(getByText('Scheduled Date (YYYY-MM-DD)')).toBeTruthy();
      });

      // Record the initial displayed date on the trigger
      const triggerBefore = getByTestId('date-picker-trigger');
      const dateBefore = triggerBefore.props.children;

      // Simulate the user opening the picker then pressing Cancel
      await act(async () => {
        fireEvent.press(getByTestId('date-picker-trigger'));
      });

      const pickers = UNSAFE_getAllByType('RNDatePicker' as any);
      expect(pickers[0].props.open).toBe(true);

      await act(async () => {
        pickers[0].props.onCancel();
      });

      // Picker should be closed
      const pickersAfter = UNSAFE_getAllByType('RNDatePicker' as any);
      expect(pickersAfter[0].props.open).toBe(false);

      // Displayed date must be identical to what it was before cancel
      const triggerAfter = getByTestId('date-picker-trigger');
      expect(triggerAfter.props.children).toEqual(dateBefore);
    });

    it('hides create form when Cancel is pressed', async () => {
      mockGetBusinessMeetings.mockResolvedValue([]);
      const { getByText, queryByText } = renderScreen();

      await waitFor(() => {
        expect(getByText('Schedule New Meeting')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Schedule New Meeting'));
      });

      await waitFor(() => {
        expect(getByText('Scheduled Date (YYYY-MM-DD)')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Cancel'));
      });

      await waitFor(() => {
        expect(queryByText('Scheduled Date (YYYY-MM-DD)')).toBeNull();
      });
    });

    it('calls createBusinessMeeting with YYYY-MM-DD string when form is submitted', async () => {
      mockGetBusinessMeetings.mockResolvedValue([]);
      const { getByText, UNSAFE_getAllByType } = renderScreen();

      await waitFor(() => {
        expect(getByText('Schedule New Meeting')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Schedule New Meeting'));
      });

      await waitFor(() => {
        expect(getByText('Scheduled Date (YYYY-MM-DD)')).toBeTruthy();
      });

      // Simulate confirming a date via the DatePicker
      const testDate = new Date('2026-04-01T12:00:00.000Z');
      const pickers = UNSAFE_getAllByType('RNDatePicker' as any);
      await act(async () => {
        pickers[0].props.onConfirm(testDate);
      });

      await act(async () => {
        fireEvent.press(getByText('Schedule Meeting'));
      });

      await waitFor(() => {
        expect(mockCreateBusinessMeeting).toHaveBeenCalledWith(
          expect.objectContaining({
            houseId: 'house-1',
            scheduledDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            quorumMet: false,
            createdBy: 'user-1',
          }),
        );
      });
    });

    it('shows error alert when createBusinessMeeting fails', async () => {
      mockCreateBusinessMeeting.mockRejectedValueOnce(
        new Error('Server error'),
      );
      mockGetBusinessMeetings.mockResolvedValue([]);
      const { getByText } = renderScreen();

      await waitFor(() => {
        expect(getByText('Schedule New Meeting')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Schedule New Meeting'));
      });

      await waitFor(() => {
        expect(getByText('Scheduled Date (YYYY-MM-DD)')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Schedule Meeting'));
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Error',
          expect.stringContaining('Failed to create meeting'),
        );
      });
    });
  });

  // Refresh behavior is now handled by React Query's stale-while-revalidate.
  // No manual Refresh button is needed.
});
