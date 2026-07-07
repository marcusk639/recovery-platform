import React, { useRef, useCallback, useState } from "react";
import { View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { User } from "../../entities/User";
import RatsLoadingIndicator from "../../components/rats-loading-indicator/rats-loading-indicator";
import { RatsText } from "../../components/rats-text";
import RatsButton from "../../components/rats-button/rats-button";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Routes } from "../../navigation/types";
import { color, fontSize, normalize, SAVE_BUTTON } from "../../styles/theme";
import { logException } from "../../util/logging";

interface Props
  extends NativeStackScreenProps<any, typeof Routes.SubscriptionHandler> {
  user: User;
}

/**
 * Hosts the WebView is allowed to load. Adding hosts here is a
 * security-impacting change — review with care.
 */
const ACCOUNT_ORIGIN_ALLOWLIST = ["https://regroup-app.com"];
const ACCOUNT_URL = "https://regroup-app.com/my-account";

/**
 * Returns true when the URL parses successfully AND its origin is on the
 * allowlist. Any parse failure or unexpected host fails closed.
 */
export function isAllowedAccountUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    const origin = `${parsed.protocol}//${parsed.host}`;
    return ACCOUNT_ORIGIN_ALLOWLIST.includes(origin);
  } catch {
    return false;
  }
}

/**
 * Subscription Handler Screen
 *
 * WebView that loads the subscription management page.
 *
 * Hardened 2026-07-04: removed the `window.user = JSON.stringify(user)`
 * injection this screen used to perform on load — the web app's my-account
 * page never reads `window.user` (only `window.launchedFromMobile`, already
 * set via `injectedJavaScript` below), so the injection exposed the full
 * User object to this WebView's JS context for no consumer at all. Also
 * added an origin allowlist (fail-closed) and navigation/window-opening
 * restrictions matching the PaymentWebView pattern.
 */
const SubscriptionHandler: React.FC<Props> = (props) => {
  const { navigation } = props;

  const webViewRef = useRef<WebView | null>(null);
  const [hasError, setHasError] = useState(false);

  const handleEvent = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      if (event && event.nativeEvent && event.nativeEvent.data) {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          if (data && data.subscriptionStatus) {
            // handle subscription status updates if needed
          }
          if (data && data.back) {
            navigation.goBack();
          }
        } catch {
          // Non-JSON message from WebView — ignore
        }
      }
    },
    [navigation]
  );

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  const handleRetry = useCallback(() => {
    setHasError(false);
    webViewRef.current?.reload();
  }, []);

  const urlIsTrusted = isAllowedAccountUrl(ACCOUNT_URL);
  if (!urlIsTrusted) {
    // Defense-in-depth — ACCOUNT_URL is a fixed constant today, but this
    // guards against a future edit accidentally pointing it somewhere
    // unvetted. Fail closed rather than loading an unreviewed page.
    logException(
      new Error(
        `SubscriptionHandler refused to load untrusted URL host: ${(() => {
          try {
            return new URL(ACCOUNT_URL).host;
          } catch {
            return "<unparseable>";
          }
        })()}`
      )
    );
    return (
      <View
        style={styles.errorContainer}
        testID="subscription-webview-untrusted-url"
      >
        <RatsText
          translate={false}
          text="Account page cannot start — an unexpected address was configured."
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

  if (hasError) {
    return (
      <View style={styles.errorContainer} testID="subscription-webview-error">
        <RatsText
          translate={false}
          text="Unable to load the account page."
          style={styles.errorTitle}
        />
        <RatsText
          translate={false}
          text="Please check your internet connection and try again."
          style={styles.errorDescription}
        />
        <RatsButton
          onPress={handleRetry}
          title="Try Again"
          containerStyle={styles.retryButton}
          testID="subscription-webview-retry"
        />
        <RatsButton
          onPress={() => navigation.goBack()}
          title="Go Back"
          light
          containerStyle={styles.goBackButton}
          testID="subscription-webview-go-back"
        />
      </View>
    );
  }

  return (
    <WebView
      onMessage={handleEvent}
      onError={handleError}
      onHttpError={handleError}
      renderLoading={() => (
        <RatsLoadingIndicator containerStyle={styles.loadingOverlay} />
      )}
      startInLoadingState
      ref={(ref) => {
        webViewRef.current = ref as WebView;
      }}
      injectedJavaScript="window.launchedFromMobile = true; true;"
      source={{ uri: ACCOUNT_URL }}
      // Constrain in-WebView navigations to the allowlisted host. Any link
      // the page tries to follow outside this list opens externally instead.
      originWhitelist={ACCOUNT_ORIGIN_ALLOWLIST.map((o) => `${o}/*`)}
      javaScriptCanOpenWindowsAutomatically={false}
      setSupportMultipleWindows={false}
      mixedContentMode="never"
      allowsBackForwardNavigationGestures={false}
      testID="subscription-webview"
    />
  );
};

const styles = StyleSheet.create({
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: normalize(24),
    backgroundColor: color.white,
  },
  errorTitle: {
    fontSize: fontSize.medium,
    color: color.dark_grey,
    textAlign: "center",
    marginBottom: normalize(8),
  },
  errorDescription: {
    fontSize: fontSize.regular,
    color: color.grey,
    textAlign: "center",
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

export default SubscriptionHandler;
