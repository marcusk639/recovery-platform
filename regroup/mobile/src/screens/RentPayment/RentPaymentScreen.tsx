/**
 * RentPaymentScreen
 *
 * Allows a resident (Guest) to view their current rent balance and initiate
 * a payment via Stripe.  The actual card-entry step opens a Stripe-hosted
 * payment URL in a WebView (PaymentWebView).
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import firestore from '@react-native-firebase/firestore';
import { RootStackParamList } from '../../navigation/types';

import { RatsText } from '../../components/rats-text';
import RatsButton from '../../components/rats-button/rats-button';
import ScreenHeader from '../../components/screen-header';
import { RatsIcon } from '../../components/rats-icon';

import {
  usePaymentHistory,
  useCreateRentPayment,
} from '../../state/queries/paymentQueries';
import { Guest } from '../../entities/Guest';
import { House, StripeAccountStatus } from '../../entities/House';
import { logException } from '../../util/logging';

import {
  color,
  fontSize,
  fontFamily,
  normalize,
  CARD_STYLE,
  SAVE_BUTTON,
  ROW,
} from '../../styles/theme';

// ─── Helpers & Sub-components (extracted) ─────────────────────────────────────

import { formatCurrency } from './rentPaymentHelpers';
import PaymentRow from './PaymentRow';
export { formatCurrency };

// ─── Main Screen ──────────────────────────────────────────────────────────────

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
  guest: Guest;
  house: House;
}

const RentPaymentScreen: React.FC<Props> = ({ navigation, guest, house }) => {
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [saveCard, setSaveCard] = useState(guest.autoPayEnabled ?? false);

  const rentOwed = guest.rentOwed ?? 0;
  const choreFees = guest.choreFees ?? 0;
  const totalDue = rentOwed + choreFees;

  // Rent amount to show in breakdown (based on rentFrequency)
  const rentLabel =
    house.rentFrequency === 'weekly'
      ? 'Weekly Rent'
      : house.rentFrequency === 'monthly'
      ? 'Monthly Rent'
      : 'Rent';
  const rentAmount =
    house.rentFrequency === 'weekly' ? house.weeklyRent : house.monthlyRent;

  // Stripe connected & active
  const stripeActive = house.stripeStatus === StripeAccountStatus.ACTIVE;
  const stripeConnected = !!house.stripeAccountId;

  const {
    data: paymentHistory,
    isLoading: historyLoading,
    isError: historyError,
    refetch: refetchHistory,
  } = usePaymentHistory(guest.id, !!guest.id);

  const createPayment = useCreateRentPayment();

  const handlePayNow = useCallback(async () => {
    if (totalDue <= 0) return;
    setPaymentError(null);
    setPaymentSuccess(false);

    try {
      const amountInCents = Math.round(totalDue * 100);
      const result = await createPayment.mutateAsync({
        guestId: guest.id,
        houseId: house.id,
        amount: amountInCents,
        description: rentLabel,
      });

      // Persist auto-pay preference to Firestore when it differs from the
      // currently-persisted value. The scheduled CF reads this flag to
      // auto-charge the guest when due.
      const persistedAutoPayEnabled = guest.autoPayEnabled ?? false;
      if (saveCard !== persistedAutoPayEnabled) {
        try {
          await firestore().collection('guests').doc(guest.id).update({
            autoPayEnabled: saveCard,
          });
        } catch (e) {
          logException(e);
          // Non-fatal — payment succeeded, preference save failed
        }
      }

      // Open the Stripe-hosted payment URL in a WebView or browser
      if (result.paymentUrl) {
        navigation.navigate('PaymentWebView', {
          paymentUrl: result.paymentUrl,
          amount: totalDue,
          guestId: guest.id,
        });
      } else {
        // No URL returned — treat as success-pending (webhook will confirm)
        setPaymentSuccess(true);
      }
    } catch (err: any) {
      const raw: string = err?.message ?? '';
      const lower = raw.toLowerCase();
      if (lower.includes('not found') || lower.includes('not deployed')) {
        setPaymentError(
          'Online payments are not yet available. Please contact your house manager.',
        );
      } else if (lower.includes('network') || lower.includes('timeout')) {
        setPaymentError(
          'Network error. Please check your connection and try again.',
        );
      } else if (lower.includes('stripe') || lower.includes('payment')) {
        setPaymentError(
          'There was a problem initiating the payment. Please try again.',
        );
      } else {
        setPaymentError(
          'Something went wrong. Please try again or contact your house manager.',
        );
      }
    }
  }, [
    totalDue,
    guest.id,
    guest.autoPayEnabled,
    house.id,
    rentLabel,
    createPayment,
    navigation,
    saveCard,
  ]);

  // ── Stripe not connected state ────────────────────────────────────────────
  if (!stripeConnected || !stripeActive) {
    return (
      <View style={styles.container} testID="rent-payment-screen">
        <ScreenHeader header="Pay Rent" />
        <View style={styles.centerContainer} testID="stripe-not-connected">
          <RatsIcon
            name="credit-card"
            size={normalize(60)}
            style={styles.centerIcon}
          />
          <RatsText
            translate={false}
            text="Rent collection not yet set up."
            style={styles.centerTitle}
          />
          <RatsText
            translate={false}
            text="Contact your house manager to enable online rent payments."
            style={styles.centerSubtitle}
          />
        </View>
      </View>
    );
  }

  // ── All paid up state ─────────────────────────────────────────────────────
  const allPaidUp = totalDue <= 0;

  return (
    <View style={styles.container} testID="rent-payment-screen">
      <ScreenHeader header="Pay Rent" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        testID="rent-payment-scroll">
        {/* ── Balance Breakdown Card ─────────────────────────────────────── */}
        <View style={[CARD_STYLE, styles.card]} testID="balance-card">
          <RatsText
            translate={false}
            text="Balance Overview"
            style={styles.cardTitle}
          />

          {/* Rent line */}
          {rentAmount > 0 && (
            <View style={[ROW, styles.lineRow]} testID="rent-amount-label">
              <RatsText
                translate={false}
                text={rentLabel}
                style={styles.lineLabel}
              />
              <RatsText
                translate={false}
                text={formatCurrency(rentAmount)}
                style={styles.lineValue}
              />
            </View>
          )}

          {/* Balance Due line */}
          <View style={[ROW, styles.lineRow]} testID="balance-due-label">
            <RatsText
              translate={false}
              text="Balance Due"
              style={styles.lineLabel}
            />
            <RatsText
              translate={false}
              text={formatCurrency(rentOwed)}
              style={[styles.lineValue, rentOwed > 0 && styles.amountDue]}
            />
          </View>

          {/* Chore fees */}
          {choreFees > 0 && (
            <View style={[ROW, styles.lineRow]} testID="chore-fees-label">
              <RatsText
                translate={false}
                text="Chore Fees"
                style={styles.lineLabel}
              />
              <RatsText
                translate={false}
                text={formatCurrency(choreFees)}
                style={[styles.lineValue, styles.amountDue]}
              />
            </View>
          )}

          {/* Divider */}
          <View style={styles.divider} />

          {/* Total */}
          <View
            style={[ROW, styles.lineRow, styles.totalRow]}
            testID="total-due-label">
            <RatsText
              translate={false}
              text="Total Due"
              style={styles.totalLabel}
            />
            <RatsText
              translate={false}
              text={formatCurrency(totalDue)}
              style={[styles.totalValue, totalDue > 0 && styles.totalAmountDue]}
            />
          </View>
        </View>

        {/* ── All Paid Up State ──────────────────────────────────────────── */}
        {allPaidUp ? (
          <View
            style={[CARD_STYLE, styles.card, styles.paidUpCard]}
            testID="all-paid-up">
            <RatsIcon
              name="check-circle"
              solid
              size={normalize(40)}
              style={styles.paidUpIcon}
            />
            <RatsText
              translate={false}
              text="You're all paid up!"
              style={styles.paidUpText}
            />
            <RatsText
              translate={false}
              text="No balance is currently due."
              style={styles.paidUpSubtext}
            />
          </View>
        ) : null}

        {/* ── Success Banner ─────────────────────────────────────────────── */}
        {paymentSuccess ? (
          <View style={styles.successBanner} testID="payment-success-banner">
            <RatsIcon
              name="check-circle"
              solid
              size={normalize(16)}
              style={styles.successIcon}
            />
            <RatsText
              translate={false}
              text="Payment initiated! Your balance will update once confirmed."
              style={styles.successText}
            />
          </View>
        ) : null}

        {/* ── Error Banner ───────────────────────────────────────────────── */}
        {paymentError ? (
          <View style={styles.errorBanner} testID="payment-error-banner">
            <RatsIcon
              name="exclamation-circle"
              solid
              size={normalize(16)}
              style={styles.errorIcon}
            />
            <RatsText
              translate={false}
              text={paymentError}
              style={styles.errorText}
              testID="payment-error-text"
            />
          </View>
        ) : null}

        {/* ── Payment History ────────────────────────────────────────────── */}
        <View
          style={[CARD_STYLE, styles.card]}
          testID="payment-history-section">
          <RatsText
            translate={false}
            text="Payment History"
            style={styles.cardTitle}
          />

          {historyLoading ? (
            <View
              style={styles.historyLoading}
              testID="payment-history-loading">
              <ActivityIndicator size="small" color={color.main} />
            </View>
          ) : historyError ? (
            <View testID="payment-history-error">
              <RatsText
                translate={false}
                text="Unable to load payment history."
                style={styles.historyErrorText}
              />
              <TouchableOpacity
                onPress={() => refetchHistory()}
                testID="payment-history-retry">
                <RatsText
                  translate={false}
                  text="Tap to retry"
                  style={styles.retryText}
                />
              </TouchableOpacity>
            </View>
          ) : !paymentHistory || paymentHistory.length === 0 ? (
            <View testID="payment-history-empty">
              <RatsText
                translate={false}
                text="No payment history yet."
                style={styles.emptyHistoryText}
              />
            </View>
          ) : (
            paymentHistory.map(payment => (
              <PaymentRow key={payment.id} payment={payment} />
            ))
          )}
        </View>

        {/* ── Auto-Pay Toggle ────────────────────────────────────────── */}
        {!allPaidUp && (
          <View
            style={[CARD_STYLE, styles.card, styles.autoPayCard]}
            testID="auto-pay-card">
            <View style={styles.autoPayRow}>
              <RatsText
                translate={false}
                text="Enable auto-pay"
                style={styles.autoPayLabel}
              />
              <Switch
                testID="auto-pay-switch"
                value={saveCard}
                onValueChange={setSaveCard}
                trackColor={{ false: color.light_grey, true: color.main }}
                thumbColor={color.white}
              />
            </View>
            <RatsText
              translate={false}
              text="Your balance will be automatically charged when due."
              style={styles.autoPayHint}
            />
          </View>
        )}
      </ScrollView>

      {/* ── Bottom CTA ──────────────────────────────────────────────────── */}
      {!allPaidUp && (
        <SafeAreaView edges={['bottom']} style={styles.ctaContainer}>
          {createPayment.isPending ? (
            <View style={styles.loadingCta} testID="pay-now-loading">
              <ActivityIndicator size="small" color={color.white} />
              <RatsText
                translate={false}
                text="Processing…"
                style={styles.loadingCtaText}
              />
            </View>
          ) : (
            <RatsButton
              onPress={handlePayNow}
              title={`Pay ${formatCurrency(totalDue)} Now`}
              containerStyle={styles.payButton}
              disabled={createPayment.isPending}
              testID="pay-now-button"
            />
          )}
        </SafeAreaView>
      )}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.light_grey,
  },
  scrollContent: {
    padding: normalize(10),
    paddingBottom: normalize(20),
    flexGrow: 1,
  },
  card: {
    marginBottom: normalize(10),
    borderRadius: 8,
  },
  cardTitle: {
    fontSize: fontSize.medium,
    fontFamily: fontFamily.bold,
    color: color.black,
    marginBottom: normalize(12),
  },
  lineRow: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: normalize(8),
  },
  lineLabel: {
    fontSize: fontSize.regular,
    color: color.dark_grey,
    flex: 1,
  },
  lineValue: {
    fontSize: fontSize.regular,
    color: color.dark_grey,
    fontFamily: fontFamily.bold,
  },
  amountDue: {
    color: color.red,
  },
  divider: {
    height: 1,
    backgroundColor: color.light_grey,
    marginVertical: normalize(8),
  },
  totalRow: {
    marginBottom: 0,
  },
  totalLabel: {
    fontSize: fontSize.medium,
    fontFamily: fontFamily.bold,
    color: color.black,
    flex: 1,
  },
  totalValue: {
    fontSize: fontSize.medium,
    fontFamily: fontFamily.bold,
    color: color.black,
  },
  totalAmountDue: {
    color: color.red,
    fontSize: fontSize.medium_large,
  },
  paidUpCard: {
    alignItems: 'center',
    paddingVertical: normalize(20),
  },
  paidUpIcon: {
    color: color.green,
    marginBottom: normalize(8),
  },
  paidUpText: {
    fontSize: fontSize.medium,
    fontFamily: fontFamily.bold,
    color: color.green,
    textAlign: 'center',
  },
  paidUpSubtext: {
    fontSize: fontSize.regular,
    color: color.dark_grey,
    textAlign: 'center',
    marginTop: normalize(4),
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: color.green + '22',
    borderRadius: 6,
    padding: normalize(10),
    marginBottom: normalize(8),
    borderColor: color.green,
    borderWidth: 1,
  },
  successIcon: {
    color: color.green,
    marginRight: normalize(8),
    marginTop: normalize(2),
  },
  successText: {
    flex: 1,
    color: color.green,
    fontSize: fontSize.regular,
    fontFamily: fontFamily.bold,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: color.light_red,
    borderRadius: 6,
    padding: normalize(10),
    marginBottom: normalize(8),
  },
  errorIcon: {
    color: color.red,
    marginRight: normalize(8),
    marginTop: normalize(2),
  },
  errorText: {
    flex: 1,
    color: color.red,
    fontSize: fontSize.regular,
  },
  historyLoading: {
    alignItems: 'center',
    paddingVertical: normalize(16),
  },
  historyErrorText: {
    fontSize: fontSize.regular,
    color: color.dark_grey,
    textAlign: 'center',
    marginBottom: normalize(8),
  },
  retryText: {
    fontSize: fontSize.regular,
    color: color.baby_blue,
    textAlign: 'center',
  },
  emptyHistoryText: {
    fontSize: fontSize.regular,
    color: color.grey,
    textAlign: 'center',
    paddingVertical: normalize(12),
  },
  ctaContainer: {
    padding: normalize(10),
    backgroundColor: color.white,
  },
  payButton: {
    ...SAVE_BUTTON,
    backgroundColor: color.main,
    borderColor: color.main,
  },
  loadingCta: {
    ...SAVE_BUTTON,
    backgroundColor: color.main,
    borderColor: color.main,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: normalize(50),
    borderRadius: 5,
  },
  loadingCtaText: {
    color: color.white,
    fontSize: fontSize.regular_medium,
    fontFamily: fontFamily.bold,
    marginLeft: normalize(8),
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: normalize(24),
  },
  centerIcon: {
    color: color.grey,
    marginBottom: normalize(16),
  },
  centerTitle: {
    fontSize: fontSize.medium,
    fontFamily: fontFamily.bold,
    color: color.dark_grey,
    textAlign: 'center',
    marginBottom: normalize(8),
  },
  centerSubtitle: {
    fontSize: fontSize.regular,
    color: color.grey,
    textAlign: 'center',
  },
  autoPayCard: {
    paddingVertical: normalize(12),
  },
  autoPayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: normalize(4),
  },
  autoPayLabel: {
    fontSize: fontSize.regular,
    fontFamily: fontFamily.bold,
    color: color.black,
    flex: 1,
  },
  autoPayHint: {
    fontSize: fontSize.small,
    color: color.dark_grey,
  },
});

export default RentPaymentScreen;
