/**
 * ResidentPayment Screen Tests
 *
 * Full integration test suite for the Stripe payment sheet flow.
 *
 * Covers:
 *  1. Renders correctly with amount input field
 *  2. Calls createPaymentIntent with the correct amount in cents on submit
 *  3. Calls initPaymentSheet with the clientSecret returned by the Cloud Function
 *  4. Calls presentPaymentSheet after a successful initPaymentSheet
 *  5. Shows success state after payment completes
 *  6. Shows error message when createPaymentIntent fails
 *  7. Shows error message when presentPaymentSheet returns an error
 *  8. Pay button is disabled while stripeLoading / fetching is in progress
 */

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock('@react-navigation/native-stack', () => ({}));

// ─── Push notification mock ───────────────────────────────────────────────────
// Required because ResidentPayment now statically imports cancelRentReminder
// from rentReminder.ts, which in turn imports react-native-push-notification.
// Without this mock the NativeEventEmitter instantiation inside the library's
// iOS entry point throws in the Jest (non-native) environment.
jest.mock('react-native-push-notification', () => ({
  localNotificationSchedule: jest.fn(),
  cancelLocalNotification: jest.fn(),
  checkPermissions: jest.fn(),
}));

// ─── Context mock ─────────────────────────────────────────────────────────────
jest.mock('../../../context', () => ({
  useNotification: () => ({
    showPopover: jest.fn(),
    setPopoverRef: jest.fn(),
    notify: jest.fn(),
  }),
  useModal: () => ({
    showFormModal: jest.fn(),
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
  return (props: any) => {
    const { children, ...rest } = props;
    return <ScrollView {...rest}>{children}</ScrollView>;
  };
});

jest.mock('../../../components/rats-text', () => ({
  RatsText: ({ text, testID, style }: any) => {
    const { Text } = require('react-native');
    return (
      <Text testID={testID} style={style}>
        {text || ''}
      </Text>
    );
  },
}));

jest.mock('../../../components/rats-button/rats-button', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return ({ title, onPress, disabled, testID, containerStyle }: any) => (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={containerStyle}
      accessibilityState={{ disabled: !!disabled }}>
      <Text>{title}</Text>
    </TouchableOpacity>
  );
});

// ─── Stripe mock ──────────────────────────────────────────────────────────────
const mockInitPaymentSheet = jest.fn();
const mockPresentPaymentSheet = jest.fn();

jest.mock('@stripe/stripe-react-native', () => ({
  usePaymentSheet: jest.fn(),
}));

// ─── Payments service mock ────────────────────────────────────────────────────
// The payments service may not exist on all branches, so we use virtual: true
// to mock it without requiring the real module to be present on disk.
const mockCreatePaymentIntent = jest.fn();

jest.mock(
  '../../../services/payments',
  () => ({
    createPaymentIntent: (...args: any[]) => mockCreatePaymentIntent(...args),
  }),
  { virtual: true },
);

// ─── React imports (after mocks) ──────────────────────────────────────────────
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore, Reducer } from '@reduxjs/toolkit';

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

import { usePaymentSheet } from '@stripe/stripe-react-native';

import ResidentPayment from '../ResidentPayment';

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const MOCK_GUEST: any = {
  id: 'guest-abc',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@test.com',
  houseId: 'house-xyz',
};

const MOCK_HOUSE: any = {
  id: 'house-xyz',
  name: 'Serenity House',
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
  currentCapacity: 2,
  maximumCapacity: 5,
  code: 'SER01',
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

const CLIENT_SECRET = 'pi_test_abc123_secret_xyz';

// ─── Store builder ─────────────────────────────────────────────────────────────
interface BuildStoreOptions {
  guest?: any;
  house?: any;
}

function buildStore({
  guest = MOCK_GUEST,
  house = MOCK_HOUSE,
}: BuildStoreOptions = {}) {
  return configureStore({
    reducer: {
      auth: authReducer,
      theme: themeReducer,
      user: userReducer,
      houses: housesReducer as Reducer<any>,
      guests: guestsReducer as Reducer<any>,
      meetings: meetingsReducer as Reducer<any>,
      admin: adminReducer as Reducer<any>,
      chat: chatReducer as Reducer<any>,
      setup: setupReducer as Reducer<any>,
      notifications: notificationsReducer as Reducer<any>,
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
      },
      guests: {
        guests: guest ? { [guest.id]: guest } : {},
        selectedGuest: guest,
        userAsGuest: null,
        status: 'idle',
        error: null,
        updateStatus: 'idle',
        createStatus: 'idle',
        deleteStatus: 'idle',
        customizePhaseStatus: 'idle',
      },
    },
  });
}

// ─── Render helper ────────────────────────────────────────────────────────────
function renderScreen(
  props: Partial<React.ComponentProps<typeof ResidentPayment>> = {},
  storeOptions: BuildStoreOptions = {},
) {
  const store = buildStore(storeOptions);
  const navigation: any = { goBack: jest.fn() };

  const result = render(
    <Provider store={store}>
      <ResidentPayment navigation={navigation} {...props} />
    </Provider>,
  );

  return { ...result, navigation, store };
}

// ─── Default Stripe mock setup ────────────────────────────────────────────────
function setupStripe({
  initError = undefined as { message: string } | undefined,
  paymentError = undefined as { code?: string; message: string } | undefined,
  stripeLoading = false,
} = {}) {
  mockInitPaymentSheet.mockResolvedValue(initError ? { error: initError } : {});
  mockPresentPaymentSheet.mockResolvedValue(
    paymentError ? { error: paymentError } : {},
  );
  (usePaymentSheet as jest.Mock).mockReturnValue({
    initPaymentSheet: mockInitPaymentSheet,
    presentPaymentSheet: mockPresentPaymentSheet,
    loading: stripeLoading,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('ResidentPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupStripe();
    mockCreatePaymentIntent.mockResolvedValue({ clientSecret: CLIENT_SECRET });
  });

  // ── 1. Renders correctly with amount input ─────────────────────────────────
  it('renders the screen header and amount input', () => {
    const { getByTestId, getByText } = renderScreen();

    expect(getByTestId('screen-header')).toBeTruthy();
    expect(getByText('Make a Payment')).toBeTruthy();
    expect(getByTestId('payment-amount-input')).toBeTruthy();
    expect(getByTestId('submit-payment-button')).toBeTruthy();
  });

  // ── 2. Calls createPaymentIntent with correct amount ───────────────────────
  it('calls createPaymentIntent with amount in cents on submit', async () => {
    const { getByTestId } = renderScreen();

    fireEvent.changeText(getByTestId('payment-amount-input'), '25.00');

    await act(async () => {
      fireEvent.press(getByTestId('submit-payment-button'));
    });

    await waitFor(() => {
      expect(mockCreatePaymentIntent).toHaveBeenCalledWith(
        2500, // $25.00 → 2500 cents
        MOCK_GUEST.id,
        MOCK_HOUSE.id,
        'Rent - Serenity House',
      );
    });
  });

  // ── 3. Calls initPaymentSheet with returned clientSecret ───────────────────
  it('calls initPaymentSheet with the clientSecret from createPaymentIntent', async () => {
    const { getByTestId } = renderScreen();

    fireEvent.changeText(getByTestId('payment-amount-input'), '100.00');

    await act(async () => {
      fireEvent.press(getByTestId('submit-payment-button'));
    });

    await waitFor(() => {
      expect(mockInitPaymentSheet).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantDisplayName: 'Regroup',
          paymentIntentClientSecret: CLIENT_SECRET,
        }),
      );
    });
  });

  // ── 4. Calls presentPaymentSheet after initPaymentSheet succeeds ───────────
  it('calls presentPaymentSheet after initPaymentSheet succeeds', async () => {
    const { getByTestId } = renderScreen();

    fireEvent.changeText(getByTestId('payment-amount-input'), '50.00');

    await act(async () => {
      fireEvent.press(getByTestId('submit-payment-button'));
    });

    await waitFor(() => {
      expect(mockPresentPaymentSheet).toHaveBeenCalledTimes(1);
    });
  });

  // ── 5. Shows success state on completion ──────────────────────────────────
  it('shows success state with formatted amount after payment completes', async () => {
    const { getByTestId, getByText } = renderScreen();

    fireEvent.changeText(getByTestId('payment-amount-input'), '75.50');

    await act(async () => {
      fireEvent.press(getByTestId('submit-payment-button'));
    });

    await waitFor(() => {
      expect(getByTestId('success-container')).toBeTruthy();
    });

    expect(getByText('Payment Successful!')).toBeTruthy();
    expect(getByText('$75.50 has been processed.')).toBeTruthy();
  });

  // ── 6. Shows error message when createPaymentIntent fails ─────────────────
  it('shows an error message when createPaymentIntent rejects', async () => {
    mockCreatePaymentIntent.mockRejectedValueOnce(
      new Error('Network request failed'),
    );

    const { getByTestId, getByText } = renderScreen();

    fireEvent.changeText(getByTestId('payment-amount-input'), '20.00');

    await act(async () => {
      fireEvent.press(getByTestId('submit-payment-button'));
    });

    await waitFor(() => {
      expect(getByTestId('error-container')).toBeTruthy();
    });

    // Network-related errors get a friendly message
    expect(
      getByText('Network error. Please check your connection and try again.'),
    ).toBeTruthy();
    // presentPaymentSheet should NOT be called if the Cloud Function fails
    expect(mockPresentPaymentSheet).not.toHaveBeenCalled();
  });

  it('shows the raw error message for non-network createPaymentIntent failures', async () => {
    mockCreatePaymentIntent.mockRejectedValueOnce(
      new Error('Payment intent creation failed: invalid account'),
    );

    const { getByTestId, getByText } = renderScreen();

    fireEvent.changeText(getByTestId('payment-amount-input'), '20.00');

    await act(async () => {
      fireEvent.press(getByTestId('submit-payment-button'));
    });

    await waitFor(() => {
      expect(getByTestId('error-container')).toBeTruthy();
    });

    expect(
      getByText('Payment intent creation failed: invalid account'),
    ).toBeTruthy();
  });

  // ── 7. Shows error when presentPaymentSheet returns error ─────────────────
  it('shows cancellation message when payment sheet is cancelled', async () => {
    setupStripe({
      paymentError: { code: 'Canceled', message: 'Payment canceled by user' },
    });

    const { getByTestId, getByText } = renderScreen();

    fireEvent.changeText(getByTestId('payment-amount-input'), '30.00');

    await act(async () => {
      fireEvent.press(getByTestId('submit-payment-button'));
    });

    await waitFor(() => {
      expect(getByTestId('error-container')).toBeTruthy();
    });

    expect(getByText('Payment was cancelled.')).toBeTruthy();
    // Must not show success
    expect(() => getByTestId('success-container')).toThrow();
  });

  it('shows card decline message when presentPaymentSheet returns a card error', async () => {
    setupStripe({
      paymentError: {
        code: 'Failed',
        message: 'Your card was declined',
      },
    });

    const { getByTestId, queryByTestId } = renderScreen();

    fireEvent.changeText(getByTestId('payment-amount-input'), '30.00');

    await act(async () => {
      fireEvent.press(getByTestId('submit-payment-button'));
    });

    await waitFor(() => {
      expect(getByTestId('error-container')).toBeTruthy();
    });

    expect(queryByTestId('success-container')).toBeNull();
  });

  it('shows error message when initPaymentSheet fails', async () => {
    setupStripe({
      initError: { message: 'Stripe configuration error' },
    });

    const { getByTestId, getByText } = renderScreen();

    fireEvent.changeText(getByTestId('payment-amount-input'), '15.00');

    await act(async () => {
      fireEvent.press(getByTestId('submit-payment-button'));
    });

    await waitFor(() => {
      expect(getByTestId('error-container')).toBeTruthy();
    });

    expect(getByText('Stripe configuration error')).toBeTruthy();
    // presentPaymentSheet must not be called if init failed
    expect(mockPresentPaymentSheet).not.toHaveBeenCalled();
  });

  // ── 8. Pay button disabled while loading ──────────────────────────────────
  it('pay button is disabled when stripeLoading is true', () => {
    setupStripe({ stripeLoading: true });

    const { getByTestId } = renderScreen();

    // Provide a valid amount so only stripeLoading gates the button
    fireEvent.changeText(getByTestId('payment-amount-input'), '10.00');

    const button = getByTestId('submit-payment-button');
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });

  it('pay button is disabled when amount input is empty', () => {
    const { getByTestId } = renderScreen();

    const button = getByTestId('submit-payment-button');
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });

  it('pay button is disabled when amount is invalid (zero)', () => {
    const { getByTestId } = renderScreen();

    fireEvent.changeText(getByTestId('payment-amount-input'), '0');

    const button = getByTestId('submit-payment-button');
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });

  it('pay button is disabled when amount exceeds $9999', () => {
    const { getByTestId } = renderScreen();

    fireEvent.changeText(getByTestId('payment-amount-input'), '10000');

    const button = getByTestId('submit-payment-button');
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });

  it('pay button is disabled when no guest is selected', () => {
    const { getByTestId } = renderScreen({}, { guest: null });

    fireEvent.changeText(getByTestId('payment-amount-input'), '50.00');

    const button = getByTestId('submit-payment-button');
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });

  it('pay button is disabled when no house is selected', () => {
    const { getByTestId } = renderScreen({}, { house: null });

    fireEvent.changeText(getByTestId('payment-amount-input'), '50.00');

    const button = getByTestId('submit-payment-button');
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });

  // ── Route param pre-fill ───────────────────────────────────────────────────
  it('pre-fills the amount input when an amount param is provided in cents', () => {
    const route: any = { params: { amount: 5000 } }; // $50.00
    const { getByTestId } = renderScreen({ route });

    const input = getByTestId('payment-amount-input');
    expect(input.props.value).toBe('50.00');
  });

  it('locks the amount input when amount is passed as a route param', () => {
    const route: any = { params: { amount: 5000 } };
    const { getByTestId } = renderScreen({ route });

    const input = getByTestId('payment-amount-input');
    expect(input.props.editable).toBe(false);
  });

  // ── Validation error messages ──────────────────────────────────────────────
  it('shows a validation error when a negative amount is entered', async () => {
    const { getByTestId, getByText } = renderScreen();

    fireEvent.changeText(getByTestId('payment-amount-input'), '-5');

    await waitFor(() => {
      expect(
        getByText('Please enter a valid amount greater than $0.00.'),
      ).toBeTruthy();
    });
  });

  it('shows a max amount validation error when amount exceeds $9999', async () => {
    const { getByTestId, getByText } = renderScreen();

    fireEvent.changeText(getByTestId('payment-amount-input'), '10000');

    await waitFor(() => {
      expect(getByText('Maximum payment amount is $9,999.')).toBeTruthy();
    });
  });

  // ── Try again button ───────────────────────────────────────────────────────
  it('clears the error and returns to idle when Try Again is pressed', async () => {
    mockCreatePaymentIntent.mockRejectedValueOnce(
      new Error('Something went wrong'),
    );

    const { getByTestId, queryByTestId } = renderScreen();

    fireEvent.changeText(getByTestId('payment-amount-input'), '20.00');

    await act(async () => {
      fireEvent.press(getByTestId('submit-payment-button'));
    });

    await waitFor(() => {
      expect(getByTestId('error-container')).toBeTruthy();
    });

    fireEvent.press(getByTestId('try-again-button'));

    await waitFor(() => {
      expect(queryByTestId('error-container')).toBeNull();
    });
  });

  // ── Done button navigates back ─────────────────────────────────────────────
  it('calls navigation.goBack when Done is pressed on the success screen', async () => {
    const { getByTestId, navigation } = renderScreen();

    fireEvent.changeText(getByTestId('payment-amount-input'), '10.00');

    await act(async () => {
      fireEvent.press(getByTestId('submit-payment-button'));
    });

    await waitFor(() => {
      expect(getByTestId('success-container')).toBeTruthy();
    });

    fireEvent.press(getByTestId('done-button'));

    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });
});

describe('Amount preset buttons', () => {
  it('shows Pay Full Due and Half buttons when rentOwed > 0', () => {
    const { getByTestId } = renderScreen(
      {},
      { guest: { ...MOCK_GUEST, rentOwed: 10000, choreFees: 0 } },
    );
    expect(getByTestId('preset-full-due')).toBeTruthy();
    expect(getByTestId('preset-half')).toBeTruthy();
  });

  it('shows only Custom button when rentOwed === 0', () => {
    const { getByTestId, queryByTestId } = renderScreen(
      {},
      { guest: { ...MOCK_GUEST, rentOwed: 0, choreFees: 0 } },
    );
    expect(getByTestId('preset-custom')).toBeTruthy();
    expect(queryByTestId('preset-full-due')).toBeNull();
    expect(queryByTestId('preset-half')).toBeNull();
  });

  it('tapping Pay Full Due sets the amount input to rentOwed in dollars', () => {
    const { getByTestId } = renderScreen(
      {},
      { guest: { ...MOCK_GUEST, rentOwed: 10000, choreFees: 0 } },
    );
    fireEvent.press(getByTestId('preset-full-due'));
    const input = getByTestId('payment-amount-input');
    expect(input.props.value).toBe('100.00');
  });

  it('tapping Half sets the amount input to floor(rentOwed/2) in dollars', () => {
    const { getByTestId } = renderScreen(
      {},
      // $100.01 (10001 cents): Math.floor(10001 / 2) = 5000 cents = $50.00 (floor demonstrated)
      { guest: { ...MOCK_GUEST, rentOwed: 10001, choreFees: 0 } },
    );
    fireEvent.press(getByTestId('preset-half'));
    const input = getByTestId('payment-amount-input');
    expect(input.props.value).toBe('50.00');
  });

  it('tapping Custom clears the amount input', () => {
    const { getByTestId } = renderScreen(
      {},
      { guest: { ...MOCK_GUEST, rentOwed: 10000, choreFees: 0 } },
    );
    // First set a value via Full Due
    fireEvent.press(getByTestId('preset-full-due'));
    // Then press Custom to clear
    fireEvent.press(getByTestId('preset-custom'));
    const input = getByTestId('payment-amount-input');
    expect(input.props.value).toBe('');
  });
});
