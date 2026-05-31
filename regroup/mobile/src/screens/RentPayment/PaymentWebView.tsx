/**
 * PaymentWebView
 *
 * A full-screen WebView that loads a Stripe-hosted payment page.
 * Modelled after SubscriptionHandler.tsx.
 *
 * It listens for postMessage events from the hosted page:
 *   - { type: 'payment_success' } → show success UI, then navigate back
 *   - { type: 'payment_error', message: string } → show error UI
 *   - { type: 'back' } → go back
 *
 * Security notes (see .full-review/02-security-performance.md [S3]):
 *  - paymentUrl is validated against the Stripe host allowlist before loading.
 *  - originWhitelist constrains in-WebView navigations to Stripe.
 *  - postMessage from non-Stripe origins is rejected — we cannot read the
 *    sender's origin from RN onMessage directly, so we rely on the
 *    originWhitelist to ensure only Stripe pages run inside the WebView
 *    (and therefore only they can postMessage).
 */

import React, { useRef, useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RatsText } from '../../components/rats-text';
import RatsButton from '../../components/rats-button/rats-button';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import { logException } from '../../util/logging';

import { color, fontSize, normalize, SAVE_BUTTON } from '../../styles/theme';

interface PaymentWebViewParams {
  paymentUrl: string;
  amount: number;
  guestId: string;
}

interface Props extends NativeStackScreenProps<any, 'PaymentWebView'> {}

/**
 * Hosts the WebView is allowed to load. Stripe Checkout serves the entire
 * payment flow under checkout.stripe.com; hooks.stripe.com may appear in
 * post-checkout redirects. Adding hosts here is a security-impacting change
 * — review with care.
 */
const STRIPE_ORIGIN_ALLOWLIST = [
  'https://checkout.stripe.com',
  'https://hooks.stripe.com',
];

/**
 * Returns true when the URL parses successfully AND its origin is on the
 * Stripe allowlist. Any parse failure or non-Stripe host fails closed.
 */
export function isAllowedPaymentUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    const origin = `${parsed.protocol}//${parsed.host}`;
    return STRIPE_ORIGIN_ALLOWLIST.includes(origin);
  } catch {
    return false;
  }
}

const PaymentWebView: React.FC<Props> = ({ navigation, route }) => {
  const { paymentUrl, amount } = (route.params ?? {}) as PaymentWebViewParams;

  const webViewRef = useRef<WebView | null>(null);
  const [hasError, setHasError] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);

  // Validate the URL once at mount. Any rejection here is logged so the
  // operator can investigate a CF returning an unexpected host.
  const urlIsTrusted = isAllowedPaymentUrl(paymentUrl);
  if (paymentUrl && !urlIsTrusted) {
    logException(
      new Error(
        `PaymentWebView refused to load untrusted paymentUrl host: ${(() => {
          try {
            return new URL(paymentUrl).host;
          } catch {
            return '<unparseable>';
          }
        })()}`,
      ),
    );
  }

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data?.type === 'payment_success') {
          setPaymentDone(true);
          // Brief pause so the user sees the success message, then pop
          setTimeout(() => {
            navigation.goBack();
          }, 2000);
        } else if (data?.type === 'back') {
          navigation.goBack();
        }
        // payment_error is handled visually by the hosted page itself
      } catch {
        // Non-JSON message — ignore
      }
    },
    [navigation],
  );

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  const handleRetry = useCallback(() => {
    setHasError(false);
    webViewRef.current?.reload();
  }, []);

  if (paymentDone) {
    return (
      <View style={styles.doneContainer} testID="payment-done-view">
        <RatsText
          translate={false}
          text="Payment Submitted!"
          style={styles.doneTitle}
        />
        <RatsText
          translate={false}
          text="Your payment is being processed. Your balance will update once confirmed."
          style={styles.doneSubtitle}
        />
      </View>
    );
  }

  if (hasError) {
    return (
      <View style={styles.errorContainer} testID="payment-webview-error">
        <RatsText
          translate={false}
          text="Unable to load the payment page."
          style={styles.errorTitle}
        />
        <RatsText
          translate={false}
          text="Please check your internet connection and try again."
          style={styles.errorSubtitle}
        />
        <RatsButton
          onPress={handleRetry}
          title="Try Again"
          containerStyle={styles.retryButton}
          testID="payment-webview-retry"
        />
        <RatsButton
          onPress={() => navigation.goBack()}
          title="Go Back"
          light
          containerStyle={styles.goBackButton}
          testID="payment-webview-go-back"
        />
      </View>
    );
  }

  if (!paymentUrl) {
    return (
      <View style={styles.errorContainer} testID="payment-webview-no-url">
        <RatsText
          translate={false}
          text="Payment URL is missing."
          style={styles.errorTitle}
        />
        <RatsButton
          onPress={() => navigation.goBack()}
          title="Go Back"
          light
          containerStyle={styles.goBackButton}
        />
      </View>
    );
  }

  if (!urlIsTrusted) {
    // Defense-in-depth — the CF return value is trusted today, but a
    // compromised CF, a stale cache, or a future code path passing a
    // user-controlled URL would otherwise reach the WebView. Fail closed.
    return (
      <View
        style={styles.errorContainer}
        testID="payment-webview-untrusted-url">
        <RatsText
          translate={false}
          text="Payment cannot start — the payment provider returned an unexpected address."
          style={styles.errorTitle}
        />
        <RatsText
          translate={false}
          text="Please try again. If the problem continues, contact support."
          style={styles.errorSubtitle}
        />
        <RatsButton
          onPress={() => navigation.goBack()}
          title="Go Back"
          light
          containerStyle={styles.goBackButton}
        />
      </View>
    );
  }

  return (
    <WebView
      ref={ref => {
        webViewRef.current = ref as WebView;
      }}
      source={{ uri: paymentUrl }}
      onMessage={handleMessage}
      onError={handleError}
      onHttpError={handleError}
      // Constrain in-WebView navigations to Stripe. Any link the page tries
      // to follow outside this list opens externally instead of in-WebView.
      originWhitelist={STRIPE_ORIGIN_ALLOWLIST}
      // Block tab/window/popup creation and downgrade attempts.
      javaScriptCanOpenWindowsAutomatically={false}
      setSupportMultipleWindows={false}
      mixedContentMode="never"
      allowsBackForwardNavigationGestures={false}
      startInLoadingState
      renderLoading={() => (
        <RatsLoadingIndicator containerStyle={styles.loadingOverlay} />
      )}
      testID="payment-webview"
    />
  );
};

const styles = StyleSheet.create({
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  doneContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: normalize(24),
    backgroundColor: color.white,
  },
  doneTitle: {
    fontSize: fontSize.large,
    color: color.green,
    fontFamily: 'Quicksand-Bold',
    textAlign: 'center',
    marginBottom: normalize(12),
  },
  doneSubtitle: {
    fontSize: fontSize.regular,
    color: color.dark_grey,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: normalize(24),
    backgroundColor: color.white,
  },
  errorTitle: {
    fontSize: fontSize.medium,
    color: color.dark_grey,
    textAlign: 'center',
    marginBottom: normalize(8),
  },
  errorSubtitle: {
    fontSize: fontSize.regular,
    color: color.grey,
    textAlign: 'center',
    marginBottom: normalize(24),
  },
  retryButton: {
    ...SAVE_BUTTON,
    minWidth: normalize(200),
    marginBottom: normalize(12),
  },
  goBackButton: {
    ...SAVE_BUTTON,
    backgroundColor: color.white,
    borderColor: color.baby_blue,
    minWidth: normalize(200),
  },
});

export default PaymentWebView;
