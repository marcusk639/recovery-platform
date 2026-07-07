/**
 * OfficerManagement Screen Tests
 *
 * Covers:
 * - Renders without crashing (smoke test)
 * - Loading state shows ActivityIndicator
 * - Officer roles render with correct labels
 * - Officers with assigned residents show resident name
 * - Unassigned roles show "Unassigned"
 * - Tapping a role row enters assign-officer mode
 * - Resident selection list renders in assign mode
 * - Cancel button exits assign mode
 * - Selecting a resident calls setOfficer service
 * - Pull-to-refresh calls getOfficers service again
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
  },
}));

// ─── Officer service mocks ────────────────────────────────────────────────────
const mockGetOfficers = jest.fn();
const mockSetOfficer = jest.fn();
const mockRemoveOfficer = jest.fn();

jest.mock('../../../services/oxford', () => ({
  getOfficers: (...args: any[]) => mockGetOfficers(...args),
  createOfficer: (...args: any[]) => mockSetOfficer(...args),
  removeOfficer: (...args: any[]) => mockRemoveOfficer(...args),
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
        .replace(/\s+/g, '-')}`}
      onPress={onPress}
      disabled={disabled}>
      <Text>{title}</Text>
    </TouchableOpacity>
  );
});

jest.mock('../../../components/rats-interactable-section', () => {
  const { TouchableOpacity, Text, View } = require('react-native');
  return ({ name, description, onPress, testID }: any) => (
    <TouchableOpacity testID={testID || `section-${name}`} onPress={onPress}>
      <Text>{name}</Text>
      <Text>{description}</Text>
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
import authReducer from '../../../state/slices/authSlice';
import themeReducer from '../../../state/slices/themeSlice';
import chatReducer from '../../../state/slices/chatSlice';
import setupReducer from '../../../state/slices/setupSlice';
import notificationsReducer from '../../../state/slices/notificationsSlice';
import meetingsReducer from '../../../state/slices/meetingsSlice';

import OfficerManagement from '../OfficerManagement';

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

const GUEST_1: any = {
  id: 'guest-1',
  userId: 'guest-1', // Auth UID — matches OFFICER_PRESIDENT.userId
  firstName: 'Alice',
  lastName: 'Smith',
  avatar: '',
  email: 'alice@example.com',
  houseId: 'house-1',
};

const GUEST_2: any = {
  id: 'guest-2',
  userId: 'guest-2', // Auth UID — matches officer fixtures that reference 'guest-2'
  firstName: 'Bob',
  lastName: 'Jones',
  avatar: '',
  email: 'bob@example.com',
  houseId: 'house-1',
};

const OFFICER_PRESIDENT: any = {
  id: 'officer-1',
  houseId: 'house-1',
  userId: 'guest-1',
  role: 'president',
  termStartDate: '2024-01-01',
  termEndDate: '2024-07-01',
  isActive: true,
  electedAt: '2024-01-01T00:00:00.000Z',
};

// ─── Store builder ─────────────────────────────────────────────────────────────

function buildStore(guests: Record<string, any> = {}) {
  mockUseSelectedHouse.mockReturnValue({
    house: BASE_HOUSE,
    houseId: BASE_HOUSE?.id ?? null,
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

const mockNavigation: any = { goBack: jest.fn(), navigate: jest.fn() };

function renderScreen(guests: Record<string, any> = {}) {
  const store = buildStore(guests);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  // After A2 migration, screens read guests via useGuests(houseId) instead of
  // Redux. Seed the React Query cache directly so the component renders the
  // same fixtures the tests were already providing via the Redux store.
  // See .full-review/01-quality-architecture.md [A2].
  queryClient.setQueryData(['guests', 'list', BASE_HOUSE.id], guests);
  return render(
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <OfficerManagement navigation={mockNavigation} />
      </Provider>
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OfficerManagement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert');
    // Default: getOfficers resolves with empty array
    mockGetOfficers.mockResolvedValue([]);
    mockSetOfficer.mockResolvedValue({
      id: 'officer-new',
      houseId: 'house-1',
      userId: 'guest-1',
      role: 'president',
      isActive: true,
      termStartDate: '',
      termEndDate: '',
      electedAt: '',
    });
    mockRemoveOfficer.mockResolvedValue(undefined);
  });

  // ─── Smoke test ───────────────────────────────────────────────────────────
  describe('render', () => {
    it('renders without crashing', async () => {
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText('Officer Management')).toBeTruthy();
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
      // Keep the promise pending so loading stays true
      mockGetOfficers.mockReturnValue(new Promise(() => {}));
      const { getByText, UNSAFE_getByType } = renderScreen();
      // The "Officer Management" header text should appear even in loading state
      expect(getByText('Officer Management')).toBeTruthy();
      // ActivityIndicator is rendered during loading
      const { ActivityIndicator } = require('react-native');
      expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    });
  });

  // ─── Empty / unassigned state ─────────────────────────────────────────────
  describe('unassigned officer roles', () => {
    it('renders all 4 officer role rows', async () => {
      mockGetOfficers.mockResolvedValue([]);
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText('President')).toBeTruthy();
        expect(getByText('Treasurer')).toBeTruthy();
        expect(getByText('Secretary')).toBeTruthy();
        expect(getByText('Comptroller')).toBeTruthy();
      });
    });

    it('shows "Unassigned" for each role when no officers exist', async () => {
      mockGetOfficers.mockResolvedValue([]);
      const { getAllByText } = renderScreen();
      await waitFor(() => {
        const unassigned = getAllByText('Unassigned');
        expect(unassigned.length).toBe(4);
      });
    });
  });

  // ─── Officer data renders ─────────────────────────────────────────────────
  describe('officer data', () => {
    it('shows resident name for an assigned officer role', async () => {
      mockGetOfficers.mockResolvedValue([OFFICER_PRESIDENT]);
      const { getByText } = renderScreen({ 'guest-1': GUEST_1 });
      await waitFor(() => {
        expect(getByText('Alice Smith')).toBeTruthy();
      });
    });

    it('shows "Unknown" when officer userId does not match a known guest', async () => {
      mockGetOfficers.mockResolvedValue([OFFICER_PRESIDENT]);
      const { getByText } = renderScreen({});
      await waitFor(() => {
        expect(getByText('Unknown')).toBeTruthy();
      });
    });

    it('displays officer name correctly when userId differs from guest doc id', async () => {
      // This is the core bug: officers store the Firebase Auth UID in userId,
      // but guests are keyed in Redux by their Firestore document ID.
      // A direct key lookup (guests[userId]) fails when these two IDs differ.
      const firestoreDocId = 'guest-doc-123';
      const authUid = 'auth-uid-456'; // Intentionally different from the Firestore doc ID

      const guestWithMismatchedIds: any = {
        id: firestoreDocId,
        firstName: 'John',
        lastName: 'Doe',
        userId: authUid, // Auth UID stored on the guest document
        houseId: 'house-1',
        email: 'john@example.com',
        avatar: '',
      };

      const officerReferencingAuthUid: any = {
        id: 'officer-99',
        houseId: 'house-1',
        userId: authUid, // Officer references the Auth UID — NOT the Firestore doc ID
        role: 'president',
        termStartDate: '2026-01-01',
        termEndDate: '2026-12-31',
        isActive: true,
        electedAt: '2026-01-01T00:00:00.000Z',
      };

      mockGetOfficers.mockResolvedValue([officerReferencingAuthUid]);
      // Guests map is keyed by Firestore doc ID, not by Auth UID
      const { getByText, queryByText } = renderScreen({
        [firestoreDocId]: guestWithMismatchedIds,
      });

      await waitFor(() => {
        // Should resolve the name via userId field lookup, not key lookup
        expect(getByText('John Doe')).toBeTruthy();
        expect(queryByText('Unknown')).toBeNull();
      });
    });

    it('renders multiple officer roles with their assigned residents', async () => {
      const officerTreasurer: any = {
        id: 'officer-2',
        houseId: 'house-1',
        userId: 'guest-2',
        role: 'treasurer',
        termStartDate: '2024-01-01',
        termEndDate: '2024-07-01',
        isActive: true,
        electedAt: '2024-01-01T00:00:00.000Z',
      };
      mockGetOfficers.mockResolvedValue([OFFICER_PRESIDENT, officerTreasurer]);
      const { getByText } = renderScreen({
        'guest-1': GUEST_1,
        'guest-2': GUEST_2,
      });
      await waitFor(() => {
        expect(getByText('Alice Smith')).toBeTruthy();
        expect(getByText('Bob Jones')).toBeTruthy();
      });
    });
  });

  // ─── Assign officer flow ──────────────────────────────────────────────────
  describe('assign officer flow', () => {
    it('enters assign mode when a role row is pressed', async () => {
      mockGetOfficers.mockResolvedValue([]);
      const { getByText } = renderScreen({ 'guest-1': GUEST_1 });

      await waitFor(() => {
        expect(getByText('President')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('President'));
      });

      await waitFor(() => {
        expect(getByText('Select a resident to assign:')).toBeTruthy();
      });
    });

    it('shows resident list in assign mode', async () => {
      mockGetOfficers.mockResolvedValue([]);
      const { getByText } = renderScreen({
        'guest-1': GUEST_1,
        'guest-2': GUEST_2,
      });

      await waitFor(() => {
        expect(getByText('President')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('President'));
      });

      await waitFor(() => {
        expect(getByText('Alice Smith')).toBeTruthy();
        expect(getByText('Bob Jones')).toBeTruthy();
      });
    });

    it('shows "No residents found" in assign mode when guests list is empty', async () => {
      mockGetOfficers.mockResolvedValue([]);
      const { getByText } = renderScreen({});

      await waitFor(() => {
        expect(getByText('President')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('President'));
      });

      await waitFor(() => {
        expect(getByText('No residents found')).toBeTruthy();
      });
    });

    it('exits assign mode when Cancel is pressed', async () => {
      mockGetOfficers.mockResolvedValue([]);
      const { getByText, queryByText } = renderScreen({ 'guest-1': GUEST_1 });

      await waitFor(() => {
        expect(getByText('President')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('President'));
      });

      await waitFor(() => {
        expect(getByText('Select a resident to assign:')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Cancel'));
      });

      await waitFor(() => {
        expect(queryByText('Select a resident to assign:')).toBeNull();
        expect(getByText('President')).toBeTruthy();
      });
    });

    it('calls setOfficer when a resident is selected', async () => {
      mockGetOfficers.mockResolvedValue([]);
      const { getByText } = renderScreen({ 'guest-1': GUEST_1 });

      await waitFor(() => {
        expect(getByText('President')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('President'));
      });

      await waitFor(() => {
        expect(getByText('Alice Smith')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Alice Smith'));
      });

      await waitFor(() => {
        expect(mockSetOfficer).toHaveBeenCalledWith(
          expect.objectContaining({
            houseId: 'house-1',
            userId: 'guest-1',
            role: 'president',
            isActive: true,
          }),
        );
      });
    });

    it('stores guest.userId (Auth UID) not guest.id (Firestore doc ID) when assigning an officer', async () => {
      // This test guards the write-side bug: when a guest has a Firestore doc ID
      // that differs from their Firebase Auth UID, handleGuestSelected must store
      // the Auth UID (guest.userId) in the officer record — not the doc ID (guest.id).
      const guestWithDifferentIds: any = {
        id: 'firestore-doc-id', // Firestore document ID — must NOT be written to officer
        userId: 'firebase-auth-uid', // Firebase Auth UID — must be written to officer
        firstName: 'Carol',
        lastName: 'White',
        avatar: '',
        email: 'carol@example.com',
        houseId: 'house-1',
      };

      mockGetOfficers.mockResolvedValue([]);
      const { getByText } = renderScreen({
        'firestore-doc-id': guestWithDifferentIds,
      });

      await waitFor(() => {
        expect(getByText('President')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('President'));
      });

      await waitFor(() => {
        expect(getByText('Carol White')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Carol White'));
      });

      await waitFor(() => {
        expect(mockSetOfficer).toHaveBeenCalledWith(
          expect.objectContaining({
            houseId: 'house-1',
            userId: 'firebase-auth-uid', // Auth UID — NOT 'firestore-doc-id'
            role: 'president',
            isActive: true,
          }),
        );
        // Explicitly confirm the doc ID was NOT stored
        expect(mockSetOfficer).not.toHaveBeenCalledWith(
          expect.objectContaining({ userId: 'firestore-doc-id' }),
        );
      });
    });

    it('shows success alert after assigning an officer', async () => {
      mockGetOfficers.mockResolvedValue([]);
      const { getByText } = renderScreen({ 'guest-1': GUEST_1 });

      await waitFor(() => {
        expect(getByText('President')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('President'));
      });

      await waitFor(() => {
        expect(getByText('Alice Smith')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Alice Smith'));
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Success',
          expect.stringContaining('Alice'),
        );
      });
    });

    it('shows error alert when setOfficer fails', async () => {
      mockGetOfficers.mockResolvedValue([]);
      mockSetOfficer.mockRejectedValueOnce(new Error('Network error'));

      const { getByText } = renderScreen({ 'guest-1': GUEST_1 });

      await waitFor(() => {
        expect(getByText('President')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('President'));
      });

      await waitFor(() => {
        expect(getByText('Alice Smith')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText('Alice Smith'));
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Error',
          expect.stringContaining('Failed to assign officer'),
        );
      });
    });
  });

  // ─── Refresh ──────────────────────────────────────────────────────────────
  describe('refresh', () => {
    it('calls getOfficers again when pull-to-refresh fires', async () => {
      mockGetOfficers.mockResolvedValue([]);
      const { getByText, UNSAFE_root } = renderScreen();

      // Wait for the ready branch — that's the only branch where
      // RatsScrollView gets the `refreshControl` prop
      // (OfficerManagement.tsx:254-260). The loading branch does not.
      await waitFor(() => {
        expect(getByText('President')).toBeTruthy();
      });

      // `refreshControl` is a React element passed via the ScrollView's
      // `refreshControl` prop. Locate the first node that carries it, then
      // invoke the prop's `onRefresh` callback directly.
      const scrollNode = UNSAFE_root.findAll(
        (node: any) =>
          node.props &&
          node.props.refreshControl &&
          typeof node.props.refreshControl === 'object',
      )[0];
      expect(scrollNode).toBeTruthy();
      await act(async () => {
        scrollNode.props.refreshControl.props.onRefresh();
      });

      // getOfficers called once on mount, once on pull-to-refresh
      expect(mockGetOfficers).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Term expiry warning ──────────────────────────────────────────────────
  describe('term expiry warning', () => {
    it('shows term expiry warning when term ends within 30 days', async () => {
      jest.useFakeTimers();
      // Freeze at midnight UTC so moment diff truncation is exact
      jest.setSystemTime(new Date('2026-03-01T00:00:00.000Z'));

      const termEndDate = '2026-03-16'; // exactly 15 days after frozen time
      mockGetOfficers.mockResolvedValue([
        {
          id: 'o1',
          role: 'president',
          userId: 'u1',
          isActive: true,
          termEndDate,
          houseId: 'house-1',
          electedAt: new Date().toISOString(),
          termStartDate: '2026-01-01',
        },
      ]);
      const { findByText } = renderScreen();
      expect(await findByText(/expires in 15 days/i)).toBeTruthy();
      jest.useRealTimers();
    });

    it('does NOT show warning when term ends in more than 30 days', async () => {
      const termEndDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      mockGetOfficers.mockResolvedValue([
        {
          id: 'o1',
          role: 'president',
          userId: 'u1',
          isActive: true,
          termEndDate,
          houseId: 'house-1',
          electedAt: new Date().toISOString(),
          termStartDate: '2026-01-01',
        },
      ]);
      const { queryByText } = renderScreen();
      await waitFor(() => {
        expect(queryByText(/expires in/i)).toBeNull();
      });
    });
  });

  // ─── Remove officer ───────────────────────────────────────────────────────
  describe('remove officer', () => {
    it('shows Remove button for active officers', async () => {
      const termEndDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      mockGetOfficers.mockResolvedValue([
        {
          id: 'o1',
          role: 'president',
          userId: 'u1',
          isActive: true,
          termEndDate,
          houseId: 'house-1',
          electedAt: new Date().toISOString(),
          termStartDate: '2026-01-01',
        },
      ]);
      const { findByTestId } = renderScreen();
      expect(await findByTestId('remove-officer-president')).toBeTruthy();
    });

    it('calls removeOfficer with the officer id when Remove is pressed', async () => {
      const officer = {
        id: 'o1',
        role: 'president',
        userId: 'u1',
        isActive: true,
        termEndDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        houseId: 'house-1',
        electedAt: new Date().toISOString(),
        termStartDate: '2026-01-01',
      };
      mockGetOfficers.mockResolvedValue([officer]);
      const { findByTestId } = renderScreen();
      const btn = await findByTestId('remove-officer-president');
      fireEvent.press(btn);
      await waitFor(() => {
        expect(mockRemoveOfficer).toHaveBeenCalledWith('o1', 'house-1');
        expect(mockSetOfficer).not.toHaveBeenCalled();
      });
    });
  });
});
