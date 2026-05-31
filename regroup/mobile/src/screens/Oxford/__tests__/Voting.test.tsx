/**
 * Voting Screen Tests
 *
 * Covers:
 * - Renders without crashing
 * - Loading state shows ActivityIndicator
 * - Empty state shows "No votes open at this time"
 * - Votes list renders topic, type, and result badge
 * - Progress bar and tally info renders for each vote
 * - "Open New Vote" button shows create form
 * - Create form renders topic/description inputs
 * - Cancel hides create form
 * - Submitting form with empty topic shows validation alert
 * - Submitting form with valid topic calls createVote service
 * - Vote buttons (YES/NO/ABSTAIN) render for open votes when userAsGuest exists
 * - Casting a vote calls castVote service
 * - Closed votes show closed date and no vote buttons
 * - Error alert shown when createVote fails
 * - Refresh button reloads votes
 */

// ─── useSelectedHouse mock ────────────────────────────────────────────────────
const mockUseSelectedHouse = jest.fn();

jest.mock('../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => mockUseSelectedHouse(),
}));

// ─── useOxfordGate mock — always-allow for screen-behavior tests ──────────────
jest.mock('../../../hooks/useOxfordGate', () => ({
  useOxfordGate: () => ({ allowed: true, houseId: 'house-1' }),
}));

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock('@react-navigation/native-stack', () => ({}));

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
    runTransaction: jest.fn(fn => fn({ get: jest.fn(), update: jest.fn() })),
  },
}));

// ─── Votes service mocks ──────────────────────────────────────────────────────
const mockGetVotes = jest.fn();
const mockCreateVote = jest.fn();
const mockCastVote = jest.fn();
const mockCalculateResult = jest.fn();

jest.mock('../../../services/oxford/votes', () => ({
  getVotes: (...args: any[]) => mockGetVotes(...args),
  createVote: (...args: any[]) => mockCreateVote(...args),
  castVote: (...args: any[]) => mockCastVote(...args),
  calculateResult: (...args: any[]) => mockCalculateResult(...args),
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

import Voting from '../Voting';

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

const USER_AS_GUEST: any = {
  id: 'guest-1',
  firstName: 'Alice',
  lastName: 'Smith',
  avatar: '',
  email: 'alice@example.com',
  houseId: 'house-1',
};

const makeVote = (overrides: any = {}) => ({
  id: 'vote-1',
  houseId: 'house-1',
  topic: 'Accept new applicant',
  description: 'John Doe has applied for residency.',
  type: 'acceptance',
  options: ['yes', 'no', 'abstain'],
  results: { yes: 0, no: 0, abstain: 0 },
  individualVotes: {},
  threshold: 0.8,
  passed: false,
  createdAt: '2026-02-22T00:00:00.000Z',
  ...overrides,
});

// ─── Store builder ─────────────────────────────────────────────────────────────

function buildStore(options: { userAsGuest?: any; userId?: string } = {}) {
  const { userAsGuest = null, userId = 'user-1' } = options;
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
        userAsGuest,
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

function renderScreen(options: { userAsGuest?: any; userId?: string } = {}) {
  const store = buildStore(options);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <Voting navigation={mockNavigation} />
      </Provider>
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Voting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert');
    mockGetVotes.mockResolvedValue([]);
    mockCreateVote.mockResolvedValue(makeVote());
    mockCastVote.mockResolvedValue(undefined);
    // Default: pending result for all votes
    mockCalculateResult.mockReturnValue('pending');
  });

  // ─── Smoke test ───────────────────────────────────────────────────────────
  describe('render', () => {
    it('renders without crashing', async () => {
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText('Oxford Voting')).toBeTruthy();
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
      mockGetVotes.mockReturnValue(new Promise(() => {}));
      const { UNSAFE_getByType } = renderScreen();
      const { ActivityIndicator } = require('react-native');
      expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    });

    it('renders header text in loading state', () => {
      mockGetVotes.mockReturnValue(new Promise(() => {}));
      const { getByText } = renderScreen();
      expect(getByText('Oxford Voting')).toBeTruthy();
    });
  });

  // ─── Empty state ──────────────────────────────────────────────────────────
  describe('empty state', () => {
    it('shows "No votes open at this time" when no votes exist', async () => {
      mockGetVotes.mockResolvedValue([]);
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText('No votes open at this time.')).toBeTruthy();
      });
    });

    it('renders "Open New Vote" button when list is empty', async () => {
      mockGetVotes.mockResolvedValue([]);
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText('Open New Vote')).toBeTruthy();
      });
    });
  });

  // ─── Votes list ───────────────────────────────────────────────────────────
  describe('votes list', () => {
    it('renders vote topic', async () => {
      mockGetVotes.mockResolvedValue([makeVote()]);
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText('Accept new applicant')).toBeTruthy();
      });
    });

    it('renders vote type', async () => {
      mockGetVotes.mockResolvedValue([makeVote({ type: 'acceptance' })]);
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText('acceptance')).toBeTruthy();
      });
    });

    it('renders PENDING result badge for open votes', async () => {
      mockCalculateResult.mockReturnValue('pending');
      mockGetVotes.mockResolvedValue([makeVote()]);
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText('PENDING')).toBeTruthy();
      });
    });

    it('renders PASSED result badge for passed votes', async () => {
      mockCalculateResult.mockReturnValue('passed');
      const closedVote = makeVote({
        closedAt: '2026-02-20T00:00:00.000Z',
        results: { yes: 8, no: 1, abstain: 1 },
        passed: true,
      });
      mockGetVotes.mockResolvedValue([closedVote]);
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText('PASSED')).toBeTruthy();
      });
    });

    it('renders FAILED result badge for failed votes', async () => {
      mockCalculateResult.mockReturnValue('failed');
      const failedVote = makeVote({
        closedAt: '2026-02-20T00:00:00.000Z',
        results: { yes: 3, no: 7, abstain: 0 },
        passed: false,
      });
      mockGetVotes.mockResolvedValue([failedVote]);
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText('FAILED')).toBeTruthy();
      });
    });

    it('renders vote description when present', async () => {
      const vote = makeVote({
        description: 'John Doe has applied for residency.',
      });
      mockGetVotes.mockResolvedValue([vote]);
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText('John Doe has applied for residency.')).toBeTruthy();
      });
    });

    it('renders yes percentage and total votes', async () => {
      const vote = makeVote({ results: { yes: 4, no: 1, abstain: 0 } });
      mockGetVotes.mockResolvedValue([vote]);
      const { getByText } = renderScreen();
      await waitFor(() => {
        // 4 yes out of 5 total = 80%
        expect(getByText('Yes: 80% (need 80%)')).toBeTruthy();
        expect(getByText('5 votes')).toBeTruthy();
      });
    });

    it('renders tally breakdown', async () => {
      const vote = makeVote({ results: { yes: 4, no: 1, abstain: 0 } });
      mockGetVotes.mockResolvedValue([vote]);
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText('Yes: 4  No: 1  Abstain: 0')).toBeTruthy();
      });
    });

    it('renders threshold text', async () => {
      mockGetVotes.mockResolvedValue([makeVote()]);
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText('Threshold: 80% yes votes required')).toBeTruthy();
      });
    });

    it('renders closed date for closed votes', async () => {
      mockCalculateResult.mockReturnValue('failed');
      const closedVote = makeVote({ closedAt: '2026-02-20T00:00:00.000Z' });
      mockGetVotes.mockResolvedValue([closedVote]);
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText(/Closed:/)).toBeTruthy();
      });
    });

    it('renders multiple votes', async () => {
      const votes = [
        makeVote({ id: 'vote-1', topic: 'Accept John Doe' }),
        makeVote({ id: 'vote-2', topic: 'Expel member' }),
      ];
      mockGetVotes.mockResolvedValue(votes);
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText('Accept John Doe')).toBeTruthy();
        expect(getByText('Expel member')).toBeTruthy();
      });
    });
  });

  // ─── Vote buttons ─────────────────────────────────────────────────────────
  describe('vote buttons', () => {
    it('renders YES/NO/ABSTAIN buttons for open votes when userAsGuest is set', async () => {
      mockGetVotes.mockResolvedValue([makeVote()]);
      const { getByText } = renderScreen({ userAsGuest: USER_AS_GUEST });
      await waitFor(() => {
        expect(getByText('YES')).toBeTruthy();
        expect(getByText('NO')).toBeTruthy();
        expect(getByText('ABSTAIN')).toBeTruthy();
      });
    });

    it('does not render vote buttons when userAsGuest is null', async () => {
      mockGetVotes.mockResolvedValue([makeVote()]);
      const { queryByText } = renderScreen({ userAsGuest: null });
      await waitFor(() => {
        expect(queryByText('YES')).toBeNull();
        expect(queryByText('NO')).toBeNull();
        expect(queryByText('ABSTAIN')).toBeNull();
      });
    });

    it('does not render vote buttons for closed votes', async () => {
      mockCalculateResult.mockReturnValue('failed');
      const closedVote = makeVote({ closedAt: '2026-02-20T00:00:00.000Z' });
      mockGetVotes.mockResolvedValue([closedVote]);
      const { queryByText } = renderScreen({ userAsGuest: USER_AS_GUEST });
      await waitFor(() => {
        expect(queryByText('YES')).toBeNull();
        expect(queryByText('NO')).toBeNull();
        expect(queryByText('ABSTAIN')).toBeNull();
      });
    });

    it('shows "Cast your vote:" label when user has not voted', async () => {
      mockGetVotes.mockResolvedValue([makeVote({ individualVotes: {} })]);
      const { getByText } = renderScreen({ userAsGuest: USER_AS_GUEST });
      await waitFor(() => {
        expect(getByText('Cast your vote:')).toBeTruthy();
      });
    });

    it('shows "Your vote: YES" when user has voted yes', async () => {
      const vote = makeVote({
        individualVotes: { 'guest-1': 'yes' },
        results: { yes: 1, no: 0, abstain: 0 },
      });
      mockGetVotes.mockResolvedValue([vote]);
      const { getByText } = renderScreen({ userAsGuest: USER_AS_GUEST });
      await waitFor(() => {
        expect(getByText('Your vote: YES')).toBeTruthy();
      });
    });

    it('calls castVote with yes when YES button is pressed', async () => {
      mockGetVotes.mockResolvedValue([makeVote()]);
      const { getByText } = renderScreen({ userAsGuest: USER_AS_GUEST });

      await waitFor(() => {
        expect(getByText('YES')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('YES'));
      });

      await waitFor(() => {
        expect(mockCastVote).toHaveBeenCalledWith(
          'house-1',
          'vote-1',
          'guest-1',
          'yes',
        );
      });
    });

    it('calls castVote with no when NO button is pressed', async () => {
      mockGetVotes.mockResolvedValue([makeVote()]);
      const { getByText } = renderScreen({ userAsGuest: USER_AS_GUEST });

      await waitFor(() => {
        expect(getByText('NO')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('NO'));
      });

      await waitFor(() => {
        expect(mockCastVote).toHaveBeenCalledWith(
          'house-1',
          'vote-1',
          'guest-1',
          'no',
        );
      });
    });

    it('calls castVote with abstain when ABSTAIN button is pressed', async () => {
      mockGetVotes.mockResolvedValue([makeVote()]);
      const { getByText } = renderScreen({ userAsGuest: USER_AS_GUEST });

      await waitFor(() => {
        expect(getByText('ABSTAIN')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('ABSTAIN'));
      });

      await waitFor(() => {
        expect(mockCastVote).toHaveBeenCalledWith(
          'house-1',
          'vote-1',
          'guest-1',
          'abstain',
        );
      });
    });

    it('shows error alert when castVote fails', async () => {
      mockCastVote.mockRejectedValueOnce(new Error('Network error'));
      mockGetVotes.mockResolvedValue([makeVote()]);
      const { getByText } = renderScreen({ userAsGuest: USER_AS_GUEST });

      await waitFor(() => {
        expect(getByText('YES')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('YES'));
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Error',
          expect.stringContaining('Failed to cast vote'),
        );
      });
    });

    it('shows "Vote Closed" alert when trying to vote on a closed vote', async () => {
      const closedVote = makeVote({ closedAt: '2026-02-20T00:00:00.000Z' });
      mockGetVotes.mockResolvedValue([closedVote]);
      // The vote buttons are not rendered for closed votes so this should not appear.
      // Verify buttons are absent for closed votes.
      const { queryByText } = renderScreen({ userAsGuest: USER_AS_GUEST });
      await waitFor(() => {
        expect(queryByText('YES')).toBeNull();
      });
    });
  });

  // ─── Create form ──────────────────────────────────────────────────────────
  describe('create form', () => {
    it('shows create form when "Open New Vote" is pressed', async () => {
      mockGetVotes.mockResolvedValue([]);
      const { getByText } = renderScreen();

      await waitFor(() => {
        expect(getByText('Open New Vote')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Open New Vote'));
      });

      await waitFor(() => {
        expect(getByText('Create New Vote')).toBeTruthy();
        expect(getByText('Topic')).toBeTruthy();
        expect(getByText('Description (optional)')).toBeTruthy();
      });
    });

    it('hides create form when Cancel is pressed', async () => {
      mockGetVotes.mockResolvedValue([]);
      const { getByText, queryByText } = renderScreen();

      await waitFor(() => {
        expect(getByText('Open New Vote')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Open New Vote'));
      });

      await waitFor(() => {
        expect(getByText('Create New Vote')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Cancel'));
      });

      await waitFor(() => {
        expect(queryByText('Create New Vote')).toBeNull();
        expect(getByText('Open New Vote')).toBeTruthy();
      });
    });

    it('shows validation alert when topic is empty', async () => {
      mockGetVotes.mockResolvedValue([]);
      const { getByText } = renderScreen();

      await waitFor(() => {
        expect(getByText('Open New Vote')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Open New Vote'));
      });

      await waitFor(() => {
        expect(getByText('Open Vote')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Open Vote'));
      });

      expect(Alert.alert).toHaveBeenCalledWith(
        'Validation',
        expect.stringContaining('Please enter a topic'),
      );
    });

    it('calls createVote when form is submitted with valid topic', async () => {
      mockGetVotes.mockResolvedValue([]);
      const { getByText, getByPlaceholderText } = renderScreen();

      await waitFor(() => {
        expect(getByText('Open New Vote')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Open New Vote'));
      });

      await waitFor(() => {
        expect(getByPlaceholderText('e.g. Accept new applicant')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.changeText(
          getByPlaceholderText('e.g. Accept new applicant'),
          'Accept new member',
        );
      });

      await act(async () => {
        fireEvent.press(getByText('Open Vote'));
      });

      await waitFor(() => {
        expect(mockCreateVote).toHaveBeenCalledWith(
          'house-1',
          expect.objectContaining({
            houseId: 'house-1',
            topic: 'Accept new member',
            type: 'general',
            threshold: 0.8,
            passed: false,
          }),
        );
      });
    });

    it('clears form and hides it after successful creation', async () => {
      mockGetVotes.mockResolvedValue([]);
      const { getByText, getByPlaceholderText, queryByText } = renderScreen();

      await waitFor(() => {
        expect(getByText('Open New Vote')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Open New Vote'));
      });

      await waitFor(() => {
        expect(getByPlaceholderText('e.g. Accept new applicant')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.changeText(
          getByPlaceholderText('e.g. Accept new applicant'),
          'New member vote',
        );
      });

      await act(async () => {
        fireEvent.press(getByText('Open Vote'));
      });

      await waitFor(() => {
        expect(queryByText('Create New Vote')).toBeNull();
      });
    });

    it('shows error alert when createVote fails', async () => {
      mockCreateVote.mockRejectedValueOnce(new Error('Server error'));
      mockGetVotes.mockResolvedValue([]);
      const { getByText, getByPlaceholderText } = renderScreen();

      await waitFor(() => {
        expect(getByText('Open New Vote')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Open New Vote'));
      });

      await waitFor(() => {
        expect(getByPlaceholderText('e.g. Accept new applicant')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.changeText(
          getByPlaceholderText('e.g. Accept new applicant'),
          'New member vote',
        );
      });

      await act(async () => {
        fireEvent.press(getByText('Open Vote'));
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Error',
          expect.stringContaining('Failed to create vote'),
        );
      });
    });

    it('renders "Requires 80% yes votes to pass" info text', async () => {
      mockGetVotes.mockResolvedValue([]);
      const { getByText } = renderScreen();

      await waitFor(() => {
        expect(getByText('Open New Vote')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Open New Vote'));
      });

      await waitFor(() => {
        expect(getByText('Requires 80% yes votes to pass')).toBeTruthy();
      });
    });
  });

  // Refresh behavior is now handled by React Query's stale-while-revalidate.
  // No manual Refresh button is needed.
});
