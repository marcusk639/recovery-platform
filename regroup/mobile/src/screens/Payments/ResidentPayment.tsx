import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';

import RatsScrollView from '../../components/rats-scroll-view';
import ScreenHeader from '../../components/screen-header';
import RatsButton from '../../components/rats-button/rats-button';
import { RatsText } from '../../components/rats-text';

import { useAppSelector } from '../../state/store';
import {
  color,
  normalize,
  fontSize,
  CARD_STYLE,
  fontFamily,
} from '../../styles/theme';
import { RootStackParamList, Routes } from '../../navigation/types';

import { cancelRentReminder } from '../../services/notifications/rentReminder';

// ---------------------------------------------------------------------------
// Stripe import — wrapped defensively so the screen compiles before the
// @stripe/stripe-react-native native module is linked.
// ---------------------------------------------------------------------------
let usePaymentSheet: () => {
  initPaymentSheet: (params: any) => Promise<{ error?: { message: string } }>;
  presentPaymentSheet: () => Promise<{
    error?: { code?: string; message: string };
  }>;
  loading: boolean;
};

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  usePaymentSheet = require('@stripe/stripe-react-native').usePaymentSheet;
} catch {
  // Fallback stub used during tests and before native linking
  usePaymentSheet = () => ({
    initPaymentSheet: async () => ({}),
    presentPaymentSheet: async () => ({}),
    loading: false,
  });
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MAX_AMOUNT_DOLLARS = 9999;
const MIN_AMOUNT_CENTS = 50; // Stripe minimum for USD
const STRIPE_CANCELLED_CODE = 'Canceled';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type PaymentState = 'idle' | 'fetching' | 'presenting' | 'success' | 'error';

// ---------------------------------------------------------------------------
// Payments service — resolved defensively so the screen compiles on branches
// where src/services/payments.ts does not yet exist.
// ---------------------------------------------------------------------------
type CreateRentPaymentIntentFn = (params: {
  guestId: string;
  houseId: string;
  amountInCents: number;
  description?: string;
}) => Promise<{ clientSecret: string }>;

let createRentPaymentIntent: CreateRentPaymentIntentFn;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  createRentPaymentIntent =
    require('../../services/payments').createRentPaymentIntent;
} catch {
  createRentPaymentIntent = async () => {
    throw new Error('Payments service is not available on this branch.');
  };
}

// ---------------------------------------------------------------------------
// Navigation type — resolved defensively to avoid compile errors on branches
// where the ResidentPayment route hasn't been added to RootStackParamList yet.
// ---------------------------------------------------------------------------
type ResidentPaymentParams = { amount?: number };

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
  route?: RouteProp<Record<string, ResidentPaymentParams>, string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function parseDollarInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const num = parseFloat(trimmed);
  if (isNaN(num) || num <= 0) {
    return null;
  }
  return Math.round(num * 100); // convert to cents
}

function classifyPaymentError(
  code: string | undefined,
  message: string,
): string {
  if (!code || code === STRIPE_CANCELLED_CODE) {
    return 'Payment was cancelled.';
  }
  const lower = message.toLowerCase();
  if (lower.includes('declined') || lower.includes('card')) {
    return `Card declined: ${message}`;
  }
  return message || 'Payment failed. Please try again.';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const ResidentPayment: React.FC<Props> = ({ navigation, route }) => {
  const guest = useAppSelector((s: any) => s.guests.selectedGuest);
  const house = useAppSelector((s: any) => s.houses.selectedHouse);

  // If an amount (in cents) was passed as a route param, pre-fill the input.
  const paramAmountCents = route?.params?.amount ?? null;
  const paramAmountDollars =
    paramAmountCents != null ? (paramAmountCents / 100).toFixed(2) : '';

  const [amountInput, setAmountInput] = useState<string>(paramAmountDollars);
  const [paymentState, setPaymentState] = useState<PaymentState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successAmountDisplay, setSuccessAmountDisplay] = useState<string>('');
  const paymentInProgress = useRef(false);

  const {
    initPaymentSheet,
    presentPaymentSheet,
    loading: stripeLoading,
  } = usePaymentSheet();

  // ── Derived state ──────────────────────────────────────────────────────────
  const isBusy =
    paymentState === 'fetching' ||
    paymentState === 'presenting' ||
    stripeLoading;

  const amountInCents = parseDollarInput(amountInput);
  const amountIsValid =
    amountInCents !== null &&
    amountInCents >= MIN_AMOUNT_CENTS &&
    amountInCents / 100 <= MAX_AMOUNT_DOLLARS;

  const canPay =
    !isBusy && amountIsValid && Boolean(guest?.id) && Boolean(house?.id);

  // ── Handler ────────────────────────────────────────────────────────────────
  const handlePayment = useCallback(async () => {
    if (paymentInProgress.current) return;
    if (!canPay || amountInCents === null) {
      return;
    }
    paymentInProgress.current = true;

    try {
      setErrorMessage('');
      setPaymentState('fetching');

      // Step 1 — fetch clientSecret from Cloud Function
      let clientSecret: string;
      try {
        const result = await createRentPaymentIntent({
          guestId: guest.id,
          houseId: house.id,
          amountInCents,
          description: `Rent - ${house.name ?? 'House'}`,
        });
        clientSecret = result.clientSecret;
      } catch (err: any) {
        const msg = err?.message?.toLowerCase().includes('network')
          ? 'Network error. Please check your connection and try again.'
          : err?.message || 'Unable to initiate payment. Please try again.';
        setErrorMessage(msg);
        setPaymentState('error');
        return;
      }

      // Step 2 — initialise the Stripe payment sheet
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'Regroup',
        paymentIntentClientSecret: clientSecret,
      });

      if (initError) {
        setErrorMessage(initError.message || 'Unable to load payment sheet.');
        setPaymentState('error');
        return;
      }

      setPaymentState('presenting');

      // Step 3 — present the sheet to the user
      const { error: paymentError } = await presentPaymentSheet();

      if (paymentError) {
        const friendly = classifyPaymentError(
          (paymentError as any).code,
          paymentError.message,
        );
        setErrorMessage(friendly);
        setPaymentState('error');
        return;
      }

      // Step 4 — success
      setSuccessAmountDisplay(formatCurrency(amountInCents));
      setPaymentState('success');
      // Cancel the rent reminder now that payment is confirmed
      if (guest) {
        cancelRentReminder(guest);
      }
    } finally {
      paymentInProgress.current = false;
    }
  }, [
    canPay,
    amountInCents,
    guest,
    house,
    initPaymentSheet,
    presentPaymentSheet,
  ]);

  const handleGoBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleTryAgain = useCallback(() => {
    setPaymentState('idle');
    setErrorMessage('');
  }, []);

  // ── Success screen ─────────────────────────────────────────────────────────
  if (paymentState === 'success') {
    return (
      <RatsScrollView>
        <ScreenHeader renderBackButton header="Payment Complete" />
        <View style={styles.successContainer} testID="success-container">
          <View style={styles.successIconContainer}>
            <RatsText translate={false} text="✓" style={styles.successIcon} />
          </View>
          <RatsText
            translate={false}
            text="Payment Successful!"
            style={styles.successTitle}
          />
          <RatsText
            translate={false}
            text={`${successAmountDisplay} has been processed.`}
            style={styles.successSubtitle}
          />
          <RatsText
            translate={false}
            text="You will receive a receipt by email."
            style={styles.successNote}
          />
          <RatsButton
            testID="done-button"
            title="Done"
            onPress={handleGoBack}
            containerStyle={styles.doneButton}
          />
        </View>
      </RatsScrollView>
    );
  }

  // ── Main payment form ──────────────────────────────────────────────────────
  return (
    <RatsScrollView>
      <ScreenHeader renderBackButton header="Make a Payment" />

      <View style={styles.container}>
        {/* Amount section */}
        <View style={styles.card}>
          <RatsText
            translate={false}
            text="Payment Amount (USD)"
            style={styles.sectionTitle}
          />

          <RatsText translate={false} text="Amount ($)" style={styles.label} />
          {paramAmountCents === null && (
            <View style={styles.presetRow}>
              {(guest?.rentOwed ?? 0) > 0 && (
                <>
                  <TouchableOpacity
                    testID="preset-full-due"
                    style={styles.presetButton}
                    onPress={() =>
                      setAmountInput((guest.rentOwed / 100).toFixed(2))
                    }>
                    <RatsText
                      translate={false}
                      text="Pay Full Due"
                      style={styles.presetButtonText}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="preset-half"
                    style={styles.presetButton}
                    onPress={() =>
                      setAmountInput(
                        (Math.floor(guest.rentOwed / 2) / 100).toFixed(2),
                      )
                    }>
                    <RatsText
                      translate={false}
                      text="Half"
                      style={styles.presetButtonText}
                    />
                  </TouchableOpacity>
                </>
              )}
              {(guest?.rentOwed ?? 0) > 0 && (guest?.choreFees ?? 0) > 0 && (
                <TouchableOpacity
                  testID="preset-full-balance"
                  style={styles.presetButton}
                  onPress={() =>
                    setAmountInput(
                      ((guest.rentOwed + guest.choreFees) / 100).toFixed(2),
                    )
                  }>
                  <RatsText
                    translate={false}
                    text={`Full Balance ($${(
                      (guest.rentOwed + guest.choreFees) /
                      100
                    ).toFixed(2)})`}
                    style={styles.presetButtonText}
                  />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                testID="preset-custom"
                style={styles.presetButton}
                onPress={() => setAmountInput('')}>
                <RatsText
                  translate={false}
                  text="Custom"
                  style={styles.presetButtonText}
                />
              </TouchableOpacity>
            </View>
          )}
          <TextInput
            testID="payment-amount-input"
            style={[
              styles.input,
              !amountIsValid && amountInput.length > 0 && styles.inputError,
            ]}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={color.grey}
            value={amountInput}
            onChangeText={setAmountInput}
            editable={!isBusy && paramAmountCents === null}
            returnKeyType="done"
            accessibilityLabel="Payment amount in dollars"
          />

          {amountInput.length > 0 && !amountIsValid && (
            <RatsText
              testID="amount-validation-error"
              translate={false}
              text={
                amountInCents !== null &&
                amountInCents / 100 > MAX_AMOUNT_DOLLARS
                  ? `Maximum payment amount is $${MAX_AMOUNT_DOLLARS.toLocaleString()}.`
                  : amountInCents !== null && amountInCents < MIN_AMOUNT_CENTS
                  ? 'Minimum payment amount is $0.50.'
                  : 'Please enter a valid amount greater than $0.00.'
              }
              style={styles.validationError}
            />
          )}

          {amountIsValid && amountInCents !== null && (
            <RatsText
              testID="amount-display"
              translate={false}
              text={`Total: ${formatCurrency(amountInCents)}`}
              style={styles.amountDisplay}
            />
          )}
        </View>

        {/* Guest / house context */}
        {(guest || house) && (
          <View style={[styles.card, styles.contextCard]}>
            {guest && (
              <RatsText
                translate={false}
                text={`Resident: ${guest.firstName ?? ''} ${
                  guest.lastName ?? ''
                }`.trim()}
                style={styles.contextText}
              />
            )}
            {house && (
              <RatsText
                translate={false}
                text={`House: ${house.name ?? house.id}`}
                style={styles.contextText}
              />
            )}
          </View>
        )}

        {/* Error message */}
        {paymentState === 'error' && errorMessage.length > 0 && (
          <View style={styles.errorContainer} testID="error-container">
            <RatsText
              testID="error-message"
              translate={false}
              text={errorMessage}
              style={styles.errorText}
            />
            <TouchableOpacity
              testID="try-again-button"
              onPress={handleTryAgain}
              style={styles.tryAgainButton}>
              <RatsText
                translate={false}
                text="Try Again"
                style={styles.tryAgainText}
              />
            </TouchableOpacity>
          </View>
        )}

        {/* Loading indicator */}
        {isBusy && (
          <View style={styles.loadingContainer} testID="loading-indicator">
            <ActivityIndicator size="small" color={color.baby_blue} />
            <RatsText
              translate={false}
              text={
                paymentState === 'fetching'
                  ? 'Preparing payment...'
                  : 'Loading payment sheet...'
              }
              style={styles.loadingText}
            />
          </View>
        )}

        {/* Pay button */}
        <RatsButton
          testID="submit-payment-button"
          title={
            paymentState === 'fetching'
              ? 'Preparing...'
              : paymentState === 'presenting'
              ? 'Processing...'
              : 'Pay Now'
          }
          onPress={handlePayment}
          disabled={!canPay}
          containerStyle={styles.payButton}
        />

        {(!guest?.id || !house?.id) && (
          <RatsText
            translate={false}
            text="No resident or house selected. Please go back and select a resident."
            style={styles.warningText}
          />
        )}
      </View>
    </RatsScrollView>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    padding: normalize(16),
    gap: normalize(12),
  },
  card: {
    ...CARD_STYLE,
    borderRadius: 10,
    padding: normalize(16),
    marginBottom: normalize(4),
  },
  contextCard: {
    backgroundColor: color.light_blue,
  },
  sectionTitle: {
    fontSize: fontSize.medium,
    fontFamily: fontFamily.bold,
    color: color.dark_grey,
    marginBottom: normalize(12),
  },
  label: {
    fontSize: fontSize.regular,
    color: color.dark_grey,
    fontFamily: fontFamily.bold,
    marginBottom: normalize(6),
  },
  input: {
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.medium_grey,
    borderRadius: 8,
    fontSize: fontSize.medium,
    color: color.black,
    fontFamily: fontFamily.roboto,
    paddingVertical: normalize(12),
    paddingHorizontal: normalize(12),
    marginBottom: normalize(4),
  },
  inputError: {
    borderColor: color.red,
  },
  validationError: {
    fontSize: fontSize.small,
    color: color.red,
    marginTop: normalize(4),
    marginBottom: normalize(4),
  },
  amountDisplay: {
    fontSize: fontSize.medium,
    color: color.green,
    fontFamily: fontFamily.bold,
    marginTop: normalize(6),
  },
  contextText: {
    fontSize: fontSize.regular,
    color: color.dark_blue,
    fontFamily: fontFamily.roboto,
    marginBottom: normalize(2),
  },
  errorContainer: {
    backgroundColor: color.light_red,
    borderRadius: 8,
    padding: normalize(12),
    borderLeftWidth: 4,
    borderLeftColor: color.red,
    marginBottom: normalize(12),
  },
  errorText: {
    fontSize: fontSize.regular,
    color: color.red,
    fontFamily: fontFamily.roboto,
  },
  tryAgainButton: {
    marginTop: normalize(8),
    alignSelf: 'flex-start',
  },
  tryAgainText: {
    fontSize: fontSize.regular,
    color: color.red,
    fontFamily: fontFamily.bold,
    textDecorationLine: 'underline',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: normalize(8),
    marginBottom: normalize(8),
  },
  loadingText: {
    fontSize: fontSize.regular,
    color: color.dark_grey,
    fontFamily: fontFamily.roboto,
    marginLeft: normalize(8),
  },
  payButton: {
    marginTop: normalize(8),
  },
  warningText: {
    fontSize: fontSize.small,
    color: color.dark_grey,
    textAlign: 'center',
    marginTop: normalize(8),
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: normalize(8),
    marginBottom: normalize(8),
  },
  presetButton: {
    borderWidth: 1,
    borderColor: color.baby_blue,
    borderRadius: 6,
    paddingVertical: normalize(6),
    paddingHorizontal: normalize(12),
  },
  presetButtonText: {
    fontSize: fontSize.small,
    color: color.baby_blue,
  },
  // ── Success styles ────────────────────────────────────────────────────────
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: normalize(32),
  },
  successIconContainer: {
    width: normalize(80),
    height: normalize(80),
    borderRadius: normalize(40),
    backgroundColor: color.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: normalize(24),
  },
  successIcon: {
    fontSize: normalize(40),
    color: color.white,
    fontFamily: fontFamily.bold,
  },
  successTitle: {
    fontSize: fontSize.large,
    color: color.green,
    fontFamily: fontFamily.bold,
    marginBottom: normalize(12),
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: fontSize.medium,
    color: color.dark_grey,
    fontFamily: fontFamily.roboto,
    marginBottom: normalize(8),
    textAlign: 'center',
  },
  successNote: {
    fontSize: fontSize.regular,
    color: color.grey,
    fontFamily: fontFamily.roboto,
    marginBottom: normalize(32),
    textAlign: 'center',
  },
  doneButton: {
    width: '100%',
  },
});

export default ResidentPayment;
