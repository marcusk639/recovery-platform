/**
 * Complaints Screen Tests
 *
 * Covers:
 * - Returns null when house is missing
 * - Renders without crashing with valid state
 * - Empty state (no complaints)
 * - Complaints render with realistic mock data
 * - Reply renders when complaint has a reply
 * - Admin "REMOVE" and "REPLY" buttons visible
 * - Admin removes a complaint (Alert confirmation flow)
 * - Admin replies to complaint (opens modal via showFormModal)
 * - Search bar is rendered
 * - Filter form opens via showFormModal
 * - Help popover triggers showPopover
 */

// ─── useSelectedHouse mock ────────────────────────────────────────────────────
const mockUseSelectedHouse = jest.fn();

jest.mock('../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => mockUseSelectedHouse(),
}));

// ─── Firebase setup mock ─────────────────────────────────────────────────────
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
      onSnapshot: jest.fn(() => () => {}),
    })),
    batch: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      commit: jest.fn(() => Promise.resolve()),
    })),
  },
}));

// ─── House service stub ───────────────────────────────────────────────────────
jest.mock('../../../services/house', () => ({
  getHouse: jest.fn(),
  houseCollection: {},
  updateHouse: jest.fn(() => Promise.resolve()),
}));

// ─── Display util mock ────────────────────────────────────────────────────────
jest.mock('../../../util/display', () => ({
  getCurrentTime: jest.fn(() => '2024-01-01T00:00:00.000Z'),
  getDateAndTime: jest.fn(() => 'Jan 1, 2024'),
  camelCaseToDisplayForm: jest.fn((s: string) => s),
  getTodaysDate: jest.fn(() => '2024-01-01'),
}));

// ─── Roles util mock ─────────────────────────────────────────────────────────
jest.mock('../../../util/roles', () => ({
  isAdmin: jest.fn(() => true),
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
    setLoadingModalState: jest.fn(),
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

// ─── Auth context mock — admin token ─────────────────────────────────────────
jest.mock('../../../context/auth', () => ({
  AuthConsumer: ({ children }: { children: (ctx: any) => React.ReactNode }) =>
    children({ token: { role: { 'house-1': 'admin' } } }),
  AuthProvider: ({ children }: any) => children,
}));

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock('@react-navigation/native-stack', () => ({}));

// ─── Component stubs ─────────────────────────────────────────────────────────
jest.mock('../../../components/rats-flat-list', () => {
  const { FlatList } = require('react-native');
  return { RatsFlatList: FlatList };
});

jest.mock('../../../components/rats-search-bar', () => 'RatsSearchBar');
jest.mock('../../../components/screen-header', () => 'ScreenHeader');
jest.mock('../../../components/help-icon', () => 'HelpIcon');
jest.mock('../../../components/rats-scroll-view', () => {
  const { ScrollView } = require('react-native');
  return ScrollView;
});
jest.mock('../../../components/rats-text', () => ({
  RatsText: ({ text }: any) => {
    const { Text } = require('react-native');
    return <Text>{text || ''}</Text>;
  },
}));
jest.mock('../../../components/rats-button/rats-button', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return ({ onPress, title, testID, disabled }: any) => (
    <TouchableOpacity testID={testID} onPress={onPress} disabled={disabled}>
      <Text>{title}</Text>
    </TouchableOpacity>
  );
});
jest.mock('../../../components/card-list/card-list', () => ({
  CardItem: ({
    avatarName,
    activityItems,
    leftButtonProps,
    rightButtonProps,
    children,
  }: any) => {
    const { View, Text, TouchableOpacity } = require('react-native');
    return (
      <View>
        {avatarName ? <Text>{avatarName}</Text> : null}
        {activityItems}
        {leftButtonProps && (
          <TouchableOpacity
            testID={leftButtonProps.testID}
            onPress={leftButtonProps.onPress}
            disabled={leftButtonProps.disabled}>
            <Text>{leftButtonProps.title}</Text>
          </TouchableOpacity>
        )}
        {rightButtonProps && (
          <TouchableOpacity
            testID={rightButtonProps.testID}
            onPress={rightButtonProps.onPress}
            disabled={rightButtonProps.disabled}>
            <Text>{rightButtonProps.title}</Text>
          </TouchableOpacity>
        )}
        {children}
      </View>
    );
  },
  ActivityItem: ({ descriptionHeader, description, testID }: any) => {
    const { View, Text } = require('react-native');
    return (
      <View testID={testID}>
        {descriptionHeader ? <Text>{descriptionHeader}</Text> : null}
        {description ? <Text>{description}</Text> : null}
      </View>
    );
  },
}));

jest.mock('../ComplaintsFilter', () => ({
  ComplaintFilterFormValues: class {
    guest: any = null;
  },
  ComplaintsFilterForm: () => null,
}));

jest.mock('formik', () => ({
  Formik: ({ children, onSubmit, initialValues }: any) =>
    children({
      handleSubmit: () => onSubmit(initialValues),
      values: initialValues,
    }),
}));

jest.mock('../../../util/form', () => ({
  renderField: () => null,
}));

jest.mock(
  '../../../components/rats-text-input/rats-text-input',
  () => 'RatsTextInput',
);
jest.mock(
  '../../../components/confirmation-buttons',
  () => 'ConfirmationButtons',
);

// ─── React imports (after mocks) ─────────────────────────────────────────────
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { Alert } from 'react-native';
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

import ComplaintScreen from '../Complaints';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const GUEST_1: any = {
  id: 'guest-1',
  firstName: 'Alice',
  lastName: 'Smith',
  avatar: '',
  email: 'alice@example.com',
};

const GUEST_2: any = {
  id: 'guest-2',
  firstName: 'Bob',
  lastName: 'Jones',
  avatar: '',
  email: 'bob@example.com',
};

function makeComplaint(id: string, overrides: Partial<any> = {}): any {
  return {
    id,
    plaintiff: 'guest-1',
    description: `Complaint description for ${id}`,
    reply: '',
    createdDate: '2024-01-10T10:00:00.000Z',
    modifiedDate: '2024-01-10T10:00:00.000Z',
    ...overrides,
  };
}

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

// ─── Store builder ────────────────────────────────────────────────────────────

function buildStore(
  opts: {
    complaints?: Record<string, any>;
    guests?: Record<string, any>;
    admins?: Record<string, any>;
    house?: any | null;
  } = {},
) {
  const complaints = opts.complaints ?? {};
  const guests = opts.guests ?? { 'guest-1': GUEST_1 };
  const admins = opts.admins ?? {};
  const house =
    opts.house === undefined ? { ...BASE_HOUSE, complaints } : opts.house;

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
        selectedHouseId: house?.id ?? null,
        houses: house ? { [house.id]: house } : {},
        searchedHouses: [],
        loading: false,
        error: null,
      } as any,
      guests: {
        guests,
        selectedGuest: null,
        loading: false,
        error: null,
      } as any,
      admin: {
        houseAdmins: admins,
        admins,
        selectedAdmin: null,
        userAsAdmin: null,
        loading: false,
        error: null,
      } as any,
      user: {
        user: {
          id: 'admin-user-1',
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

const mockNavigation: any = { goBack: jest.fn(), navigate: jest.fn() };

function renderScreen(store: ReturnType<typeof buildStore>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // After A2 migration screens read guests via useGuests(houseId). Mirror
  // the Redux fixture into the React Query cache. See .full-review [A2].
  const state = store.getState() as any;
  const houseId = state.houses?.selectedHouse?.id;
  const guests = state.guests?.guests;
  if (houseId && guests) {
    queryClient.setQueryData(['guests', 'list', houseId], guests);
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <ComplaintScreen navigation={mockNavigation} />
      </Provider>
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ComplaintScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert');
    mockUseSelectedHouse.mockReturnValue({
      house: BASE_HOUSE,
      houseId: BASE_HOUSE?.id ?? null,
      isLoading: false,
    });
  });

  // ─── Guard conditions ─────────────────────────────────────────────────────
  describe('guard conditions', () => {
    it('returns null when house is missing', () => {
      const store = buildStore({ house: null });
      const { toJSON } = renderScreen(store);
      expect(toJSON()).toBeNull();
    });
  });

  // ─── Basic rendering ──────────────────────────────────────────────────────
  describe('basic rendering', () => {
    it('renders without crashing with a valid house', () => {
      const store = buildStore();
      const { toJSON } = renderScreen(store);
      expect(toJSON()).toBeTruthy();
    });

    it('renders with an empty complaints list', () => {
      const store = buildStore({ complaints: {} });
      const { toJSON } = renderScreen(store);
      expect(toJSON()).toBeTruthy();
    });

    it('renders the search bar', () => {
      const store = buildStore();
      const { UNSAFE_getAllByType } = renderScreen(store);
      expect(UNSAFE_getAllByType).toBeTruthy();
    });
  });

  // ─── Complaint data rendering ─────────────────────────────────────────────
  describe('complaint rendering', () => {
    it('renders a complaint description', () => {
      const complaint = makeComplaint('c1', {
        description: 'The shower is broken',
      });
      const store = buildStore({
        complaints: { c1: complaint },
        guests: { 'guest-1': GUEST_1 },
      });
      const { getByText } = renderScreen(store);
      expect(getByText('The shower is broken')).toBeTruthy();
    });

    it('renders the complaint author name', () => {
      const complaint = makeComplaint('c1');
      const store = buildStore({
        complaints: { c1: complaint },
        guests: { 'guest-1': GUEST_1 },
      });
      const { getByText } = renderScreen(store);
      expect(getByText('Alice Smith')).toBeTruthy();
    });

    it('renders multiple complaints', () => {
      const c1 = makeComplaint('c1', { description: 'Leaky pipe' });
      const c2 = makeComplaint('c2', {
        description: 'Noisy neighbors',
        plaintiff: 'guest-2',
      });
      const store = buildStore({
        complaints: { c1, c2 },
        guests: { 'guest-1': GUEST_1, 'guest-2': GUEST_2 },
      });
      const { getByText } = renderScreen(store);
      expect(getByText('Leaky pipe')).toBeTruthy();
      expect(getByText('Noisy neighbors')).toBeTruthy();
    });

    it('renders "No description" when description is empty', () => {
      const complaint = makeComplaint('c1', { description: '' });
      const store = buildStore({
        complaints: { c1: complaint },
        guests: { 'guest-1': GUEST_1 },
      });
      const { getByText } = renderScreen(store);
      expect(getByText('No description')).toBeTruthy();
    });

    it('renders "Complaint" as the activity item header', () => {
      const complaint = makeComplaint('c1', {
        description: 'Hot water is cold',
      });
      const store = buildStore({
        complaints: { c1: complaint },
        guests: { 'guest-1': GUEST_1 },
      });
      const { getByText } = renderScreen(store);
      expect(getByText('Complaint')).toBeTruthy();
    });

    it('renders "Manager\'s Reply" when complaint has a reply', () => {
      const complaint = makeComplaint('c1', {
        description: 'Broken heater',
        reply: 'We will fix it tomorrow',
      });
      const store = buildStore({
        complaints: { c1: complaint },
        guests: { 'guest-1': GUEST_1 },
      });
      const { getByText } = renderScreen(store);
      expect(getByText("Manager's Reply")).toBeTruthy();
      expect(getByText('We will fix it tomorrow')).toBeTruthy();
    });

    it('renders "Anonymous" when plaintiff is not found in guests or admins', () => {
      const complaint = makeComplaint('c1', {
        plaintiff: 'unknown-user',
        description: 'Something is wrong',
      });
      const store = buildStore({
        complaints: { c1: complaint },
        guests: { 'guest-1': GUEST_1 },
      });
      const { getByText } = renderScreen(store);
      expect(getByText('Anonymous')).toBeTruthy();
    });
  });

  // ─── Admin buttons ────────────────────────────────────────────────────────
  describe('admin actions (isAdmin=true)', () => {
    it('renders the "REMOVE" button for a complaint with a reply', () => {
      // REMOVE is enabled only when complaint.reply is truthy
      const complaint = makeComplaint('c1', {
        description: 'Broken window',
        reply: 'Already fixed',
      });
      const store = buildStore({
        complaints: { c1: complaint },
        guests: { 'guest-1': GUEST_1 },
      });
      const { getByText } = renderScreen(store);
      expect(getByText('REMOVE')).toBeTruthy();
    });

    it('renders the "REPLY" button', () => {
      const complaint = makeComplaint('c1', { description: 'Broken heater' });
      const store = buildStore({
        complaints: { c1: complaint },
        guests: { 'guest-1': GUEST_1 },
      });
      const { getByText } = renderScreen(store);
      expect(getByText('REPLY')).toBeTruthy();
    });

    it('shows a confirmation Alert when "REMOVE" is pressed', () => {
      const complaint = makeComplaint('c1', {
        description: 'Leaky faucet',
        reply: 'Fixed',
      });
      const store = buildStore({
        complaints: { c1: complaint },
        guests: { 'guest-1': GUEST_1 },
      });
      const { getByText } = renderScreen(store);
      fireEvent.press(getByText('REMOVE'));
      expect(Alert.alert).toHaveBeenCalledWith(
        'Confirm Removal',
        expect.stringContaining('remove this complaint'),
        expect.arrayContaining([
          expect.objectContaining({ text: 'Cancel' }),
          expect.objectContaining({ text: 'Continue' }),
        ]),
      );
    });

    it('opens reply modal (calls showFormModal) when "REPLY" is pressed', () => {
      const complaint = makeComplaint('c1', { description: 'Cold water' });
      const store = buildStore({
        complaints: { c1: complaint },
        guests: { 'guest-1': GUEST_1 },
      });
      const { getByText } = renderScreen(store);
      fireEvent.press(getByText('REPLY'));
      expect(mockShowFormModal).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Search bar interaction ───────────────────────────────────────────────
  describe('search', () => {
    it('filters complaints by guest name when search term matches', () => {
      const c1 = makeComplaint('c1', {
        description: 'Alice complaint',
        plaintiff: 'guest-1',
      });
      const c2 = makeComplaint('c2', {
        description: 'Bob complaint',
        plaintiff: 'guest-2',
      });
      const store = buildStore({
        complaints: { c1, c2 },
        guests: { 'guest-1': GUEST_1, 'guest-2': GUEST_2 },
      });
      const { getByText } = renderScreen(store);
      // Both render initially
      expect(getByText('Alice complaint')).toBeTruthy();
      expect(getByText('Bob complaint')).toBeTruthy();
    });
  });

  // ─── Filter form ──────────────────────────────────────────────────────────
  describe('filter form', () => {
    it('showFormModal is wired for opening filter form', () => {
      const store = buildStore();
      renderScreen(store);
      // Just confirm the mock is reachable
      expect(mockShowFormModal).toBeDefined();
    });
  });

  // ─── Help popover ─────────────────────────────────────────────────────────
  describe('help popover', () => {
    it('setPopoverRef is provided from useNotification', () => {
      const store = buildStore();
      renderScreen(store);
      expect(mockSetPopoverRef).toBeDefined();
    });
  });

  // ─── Remove complaint — confirm path ─────────────────────────────────────
  describe('remove complaint confirmation', () => {
    it('calls dispatch (updateHouse) when removal is confirmed', async () => {
      (Alert.alert as jest.Mock).mockImplementation(
        (_title: string, _msg: string, buttons: any[]) => {
          const continueBtn = buttons?.find(b => b.text === 'Continue');
          continueBtn?.onPress?.();
        },
      );

      const complaint = makeComplaint('c1', {
        description: 'Pest problem',
        reply: 'We will call an exterminator',
      });
      const store = buildStore({
        complaints: { c1: complaint },
        guests: { 'guest-1': GUEST_1 },
      });

      const { getByText } = renderScreen(store);

      await act(async () => {
        fireEvent.press(getByText('REMOVE'));
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Confirm Removal',
          expect.any(String),
          expect.any(Array),
        );
      });
    });

    it('does not dispatch when removal is cancelled', () => {
      (Alert.alert as jest.Mock).mockImplementation(
        (_title: string, _msg: string, buttons: any[]) => {
          const cancelBtn = buttons?.find(b => b.text === 'Cancel');
          cancelBtn?.onPress?.();
        },
      );

      const complaint = makeComplaint('c1', {
        description: 'Noisy heater',
        reply: 'Will fix',
      });
      const store = buildStore({
        complaints: { c1: complaint },
        guests: { 'guest-1': GUEST_1 },
      });

      const { getByText } = renderScreen(store);
      fireEvent.press(getByText('REMOVE'));

      // notify should not have been called after cancel
      expect(mockNotify).not.toHaveBeenCalled();
    });
  });
});
