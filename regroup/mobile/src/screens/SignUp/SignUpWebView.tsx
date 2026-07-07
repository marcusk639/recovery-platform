import React, { useRef, useCallback, useState } from "react";
import { View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { login } from "../../state/slices/userSlice";
import RatsLoadingIndicator from "../../components/rats-loading-indicator/rats-loading-indicator";
import { RatsText } from "../../components/rats-text";
import RatsButton from "../../components/rats-button/rats-button";
import { useAppDispatch } from "../../state/store";
import { color, fontSize, normalize, SAVE_BUTTON } from "../../styles/theme";
import { logException } from "../../util/logging";

interface Props {
  navigation: { goBack: () => void };
}

/**
 * Hosts the WebView is allowed to load. This screen only ever loads the
 * Regroup pricing/signup page; a hardcoded dev URL (rats-dev.web.app) used
 * to sit here unconditionally, meaning any release build accidentally
 * pointed at it would load an unvetted page with no restriction on what it
 * could send back via postMessage. Adding hosts here is a security-impacting
 * change — review with care.
 */
const SIGNUP_ORIGIN_ALLOWLIST = ["https://regroup-app.com"];
const SIGNUP_URL = "https://regroup-app.com/pricing";

/**
 * Returns true when the URL parses successfully AND its origin is on the
 * allowlist. Any parse failure or unexpected host fails closed.
 */
export function isAllowedSignupUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    const origin = `${parsed.protocol}//${parsed.host}`;
    return SIGNUP_ORIGIN_ALLOWLIST.includes(origin);
  } catch {
    return false;
  }
}

const SignUpWebView: React.FC<Props> = (props) => {
  const { navigation } = props;

  const dispatch = useAppDispatch();
  const webViewRef = useRef<WebView | null>(null);
  const [hasError, setHasError] = useState(false);

  const handleEvent = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      if (event && event.nativeEvent && event.nativeEvent.data) {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          if (data && data.email && data.password) {
            dispatch(login({ email: data.email, password: data.password }));
          }
          if (data && data.back) {
            navigation.goBack();
          }
        } catch {
          // Non-JSON message from WebView — ignore
        }
      }
    },
    [dispatch, navigation]
  );

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  const handleRetry = useCallback(() => {
    setHasError(false);
    webViewRef.current?.reload();
  }, []);

  const urlIsTrusted = isAllowedSignupUrl(SIGNUP_URL);
  if (!urlIsTrusted) {
    // Defense-in-depth — SIGNUP_URL is a fixed constant today, but this
    // guards against a future edit accidentally pointing it somewhere
    // unvetted. Fail closed rather than loading an unreviewed page.
    logException(
      new Error(
        `SignUpWebView refused to load untrusted URL host: ${(() => {
          try {
            return new URL(SIGNUP_URL).host;
          } catch {
            return "<unparseable>";
          }
        })()}`
      )
    );
    return (
      <View style={styles.errorContainer} testID="signup-webview-untrusted-url">
        <RatsText
          translate={false}
          text="Sign up cannot start — an unexpected address was configured."
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
      <View style={styles.errorContainer} testID="signup-webview-error">
        <RatsText
          translate={false}
          text="Unable to load the sign up page."
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
          testID="signup-webview-retry"
        />
        <RatsButton
          onPress={() => navigation.goBack()}
          title="Go Back"
          light
          containerStyle={styles.goBackButton}
          testID="signup-webview-go-back"
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
        webViewRef.current = ref;
      }}
      injectedJavaScript={"window.launchedFromMobile = true; true;"}
      source={{ uri: SIGNUP_URL }}
      // Constrain in-WebView navigations to the allowlisted host. Any link
      // the page tries to follow outside this list opens externally instead.
      originWhitelist={SIGNUP_ORIGIN_ALLOWLIST.map((o) => `${o}/*`)}
      javaScriptCanOpenWindowsAutomatically={false}
      setSupportMultipleWindows={false}
      mixedContentMode="never"
      allowsBackForwardNavigationGestures={false}
      testID="signup-webview"
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

/**
 * Sign Up WebView
 *
 * Loads the Regroup pricing/signup page for superAdmin onboarding. Hardened
 * 2026-07-04: replaced a hardcoded dev URL with the production host, added
 * an origin allowlist (fail-closed) matching the PaymentWebView pattern,
 * wrapped message parsing in try/catch, and removed a dead/broken
 * `window.user` injection — the web app never reads `window.user` (only
 * `window.launchedFromMobile`), so injecting it exposed the full User object
 * to this WebView's JS context for no consumer at all.
 */
export default SignUpWebView;
