/**
 * HouseSettings Screen Tests
 *
 * Covers:
 * - Renders without crash
 * - All 8 settings entries are visible
 * - Navigation press handlers (Payments, Payment Dashboard, Done/goBack)
 * - Modal is opened for each settings action (Details, Chores, Managers, etc.)
 * - useEffect triggers initializeHouseSetup
 * - Loading state is communicated to the modal context
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
    })),
    batch: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      commit: jest.fn(() => Promise.resolve()),
    })),
  },
  functions: {
    httpsCallable: jest.fn(() => jest.fn(() => Promise.resolve({ data: {} }))),
  },
}));

jest.mock('@react-native-firebase/firestore', () => ({
  firebase: {},
  FirebaseFirestoreTypes: {},
}));
jest.mock('@react-navigation/native-stack', () => ({}));

// Stub useFocusEffect so the screen can run outside a NavigationContainer.
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

// ─── Service mocks ────────────────────────────────────────────────────────────
jest.mock('../../../services/house', () => ({
  getHouse: jest.fn(),
  houseCollection: {},
}));
jest.mock('../../../services/admin', () => ({
  getAdmins: jest.fn(() => Promise.resolve({})),
  adminCollection: {},
}));
jest.mock('../../../services/guest', () => ({
  getGuests: jest.fn(() => Promise.resolve({})),
  houseCollection: {},
}));

// ─── Context mocks ────────────────────────────────────────────────────────────
const mockShowFormModal = jest.fn();
const mockDismissFormModal = jest.fn();
const mockSetLoadingModalState = jest.fn();

jest.mock('../../../context', () => ({
  useNotification: () => ({
    showPopover: jest.fn(),
    setPopoverRef: jest.fn(),
    notify: jest.fn(),
  }),
  useModal: () => ({
    showFormModal: mockShowFormModal,
    dismissFormModal: mockDismissFormModal,
    setLoadingModalState: mockSetLoadingModalState,
  }),
  useTheme: () => ({
    theme: {
      primaryColor: '#000',
      secondaryColor: '#fff',
      backgroundColor: '#fff',
      textColor: '#000',
      primaryFontFamily: 'System',
      secondaryFontFamily: 'System',
    },
  }),
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

// ─── Heavy child component stubs ──────────────────────────────────────────────
jest.mock('../../SetupWizards/HouseSetup', () => ({
  HouseSetup: (props: any) => null,
}));
jest.mock('../../SetupWizards/ChoreSetup', () => () => null);
jest.mock('../../SetupWizards/PhaseSetup/PhaseConfigSetup', () => ({
  PhaseConfigSetup: () => null,
}));
jest.mock('../../SetupWizards/GuestSetup', () => () => null);
jest.mock('../../SetupWizards/ManagerSetupEntity', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../ManagerSettings', () => () => null);
jest.mock('../AdminManagement', () => () => null);

// ─── Component stubs ──────────────────────────────────────────────────────────
jest.mock('../../../components/screen-header', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return ({ header }: { header: string }) =>
    React.createElement(Text, { testID: 'screen-header' }, header);
});

jest.mock('../../../components/rats-interactable-section', () => {
  const React = require('react');
  const { TouchableOpacity, Text } = require('react-native');
  return ({ name, onPress, testID }: any) =>
    React.createElement(
      TouchableOpacity,
      {
        onPress,
        testID: testID || `section-${name}`,
        accessibilityLabel: name,
      },
      React.createElement(Text, null, name),
    );
});

jest.mock('../../../components/rats-button/rats-button', () => {
  const React = require('react');
  const { TouchableOpacity, Text } = require('react-native');
  return ({ title, onPress, testID }: any) =>
    React.createElement(
      TouchableOpacity,
      { onPress, testID: testID || `button-${title}` },
      React.createElement(Text, null, title),
    );
});

jest.mock('../../../components/containerized-button', () => ({
  ContainerizedButton: () => null,
}));

// ─── React imports ────────────────────────────────────────────────────────────
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
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

import HouseSettings from '../HouseSettings';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_HOUSE: any = {
  id: 'house-1',
  name: 'Recovery House',
  timezone: 'America/Chicago',
  ownerId: 'owner-1',
  adminIds: ['admin-1'],
  superAdminIds: [],
  pendingAdminInvites: [],
  pendingGuestInvites: [],
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
  chores: { Bathroom: { name: 'Bathroom', description: 'Clean it.' } },
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

// ─── Store factory ────────────────────────────────────────────────────────────

function buildStore(
  house: any = BASE_HOUSE,
  loading = false,
  error: string | null = null,
) {
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
        loading,
        error,
        updateSuccess: !loading && !error,
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
        loading: false,
        error: null,
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
        user: { id: 'user-1', firstName: 'Alice', lastName: 'Manager' },
        loading: false,
        error: null,
        loggedIn: true,
        loggingIn: false,
        loggingInFailed: false,
        signingUp: false,
        signingUpFailed: false,
      } as any,
      setup: {
        selectedHouse: house,
        selectedPhase: null,
      } as any,
    },
  });
}

// ─── Navigation mock ──────────────────────────────────────────────────────────

const mockNavigation: any = {
  navigate: jest.fn(),
  goBack: jest.fn(),
};

function renderScreen(
  store: ReturnType<typeof buildStore>,
  navigation = mockNavigation,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <HouseSettings navigation={navigation} />
      </Provider>
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HouseSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Render ───────────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders without crashing', () => {
      const store = buildStore();
      const { getByTestId } = renderScreen(store);
      expect(getByTestId('house-settings-screen')).toBeTruthy();
    });

    it('renders the House Settings screen header', () => {
      const store = buildStore();
      const { getByText } = renderScreen(store);
      expect(getByText('House Settings')).toBeTruthy();
    });

    it('renders the Details settings entry', () => {
      const store = buildStore();
      const { getByText } = renderScreen(store);
      expect(getByText('Details')).toBeTruthy();
    });

    it('renders the Chores settings entry', () => {
      const store = buildStore();
      const { getByText } = renderScreen(store);
      expect(getByText('Chores')).toBeTruthy();
    });

    it('renders the Managers settings entry', () => {
      const store = buildStore();
      const { getByText } = renderScreen(store);
      expect(getByText('Managers')).toBeTruthy();
    });

    it('renders the Admin Management settings entry', () => {
      const store = buildStore();
      const { getByText } = renderScreen(store);
      expect(getByText('Admin Management')).toBeTruthy();
    });

    it('renders the Phases settings entry', () => {
      const store = buildStore();
      const { getByText } = renderScreen(store);
      expect(getByText('Phases')).toBeTruthy();
    });

    it('renders the Guests settings entry', () => {
      const store = buildStore();
      const { getByText } = renderScreen(store);
      expect(getByText('Guests')).toBeTruthy();
    });

    it('renders the Payments settings entry', () => {
      const store = buildStore();
      const { getByText } = renderScreen(store);
      expect(getByText('Payments')).toBeTruthy();
    });

    it('renders the Payment Dashboard settings entry', () => {
      const store = buildStore();
      const { getByText } = renderScreen(store);
      expect(getByText('Payment Dashboard')).toBeTruthy();
    });

    it('renders the Done button', () => {
      const store = buildStore();
      const { getByText } = renderScreen(store);
      expect(getByText('Done')).toBeTruthy();
    });
  });

  // ─── Navigation ───────────────────────────────────────────────────────────

  describe('navigation handlers', () => {
    it('navigates to StripeSettings when Payments entry is pressed', () => {
      const store = buildStore();
      const { getByText } = renderScreen(store);
      fireEvent.press(getByText('Payments'));
      expect(mockNavigation.navigate).toHaveBeenCalledWith('stripeSettings');
    });

    it('navigates to PaymentDashboard when Payment Dashboard entry is pressed', () => {
      const store = buildStore();
      const { getByText } = renderScreen(store);
      fireEvent.press(getByText('Payment Dashboard'));
      expect(mockNavigation.navigate).toHaveBeenCalledWith('paymentDashboard');
    });

    it('calls navigation.goBack when Done button is pressed', () => {
      const store = buildStore();
      const { getByText } = renderScreen(store);
      fireEvent.press(getByText('Done'));
      expect(mockNavigation.goBack).toHaveBeenCalled();
    });
  });

  // ─── Modal interactions ───────────────────────────────────────────────────

  describe('modal interactions', () => {
    it('opens a form modal when Details entry is pressed', () => {
      const store = buildStore();
      const { getByText } = renderScreen(store);
      fireEvent.press(getByText('Details'));
      expect(mockShowFormModal).toHaveBeenCalled();
    });

    it('opens a form modal when Chores entry is pressed', () => {
      const store = buildStore();
      const { getByText } = renderScreen(store);
      fireEvent.press(getByText('Chores'));
      expect(mockShowFormModal).toHaveBeenCalled();
    });

    it('opens a form modal when Managers entry is pressed', () => {
      const store = buildStore();
      const { getByTestId } = renderScreen(store);
      fireEvent.press(getByTestId('managers-section'));
      expect(mockShowFormModal).toHaveBeenCalled();
    });

    it('opens a form modal when Admin Management entry is pressed', () => {
      const store = buildStore();
      const { getByText } = renderScreen(store);
      fireEvent.press(getByText('Admin Management'));
      expect(mockShowFormModal).toHaveBeenCalled();
    });

    it('opens a form modal when Phases entry is pressed', () => {
      const store = buildStore();
      const { getByText } = renderScreen(store);
      fireEvent.press(getByText('Phases'));
      expect(mockShowFormModal).toHaveBeenCalled();
    });

    it('opens a form modal when Guests entry is pressed', () => {
      const store = buildStore();
      const { getByTestId } = renderScreen(store);
      fireEvent.press(getByTestId('manage-guests-button'));
      expect(mockShowFormModal).toHaveBeenCalled();
    });
  });

  // ─── Loading state ────────────────────────────────────────────────────────

  describe('loading / error state', () => {
    it('calls setLoadingModalState when the house update loading state changes', () => {
      const store = buildStore(BASE_HOUSE, true, null);
      renderScreen(store);
      expect(mockSetLoadingModalState).toHaveBeenCalled();
    });

    it('passes an error message to setLoadingModalState when there is an error', () => {
      const store = buildStore(BASE_HOUSE, false, 'update failed');
      renderScreen(store);
      // setLoadingModalState is called in a useEffect; verify it was called
      expect(mockSetLoadingModalState).toHaveBeenCalled();
      const callArgs = mockSetLoadingModalState.mock.calls[0];
      // 4th argument (index 3) is the error string or null
      expect(callArgs[3]).toBeTruthy();
    });

    it('passes null error to setLoadingModalState when there is no error', () => {
      const store = buildStore(BASE_HOUSE, false, null);
      renderScreen(store);
      const callArgs = mockSetLoadingModalState.mock.calls[0];
      expect(callArgs[3]).toBeNull();
    });
  });
});
