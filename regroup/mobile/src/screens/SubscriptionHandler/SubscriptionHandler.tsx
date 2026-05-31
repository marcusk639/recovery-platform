import React, { useRef, useEffect, useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { User } from '../../entities/User';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import { RatsText } from '../../components/rats-text';
import RatsButton from '../../components/rats-button/rats-button';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Routes } from '../../navigation/types';
import { useAppDispatch } from '../../state/store';
import { color, fontSize, normalize, SAVE_BUTTON } from '../../styles/theme';

interface Props
  extends NativeStackScreenProps<any, typeof Routes.SubscriptionHandler> {
  user: User;
}

/**
 * Subscription Handler Screen
 *
 * WebView that loads the subscription management page.
 * Injects user data as a JSON payload so the web app can identify the user.
 *
 * UX improvements:
 * - Fixed user injection to use JSON.stringify (was producing [object Object])
 * - Added error state with retry when the WebView fails to load
 */
const SubscriptionHandler: React.FC<Props> = props => {
  const { user, navigation } = props;

  const dispatch = useAppDispatch();
  const webViewRef = useRef<WebView | null>(null);
  const [hasError, setHasError] = useState(false);

  const injectData = useCallback(() => {
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(
        `window.user = ${JSON.stringify(user)}; window.launchedFromMobile = true; true;`,
      );
    }
  }, [user]);

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
    [navigation],
  );

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  const handleRetry = useCallback(() => {
    setHasError(false);
    webViewRef.current?.reload();
  }, []);

  useEffect(() => {
    // componentDidMount equivalent
  }, []);

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
        <RatsLoadingIndicator
          containerStyle={styles.loadingOverlay}
        />
      )}
      startInLoadingState
      ref={ref => {
        webViewRef.current = ref as WebView;
      }}
      injectedJavaScript="window.launchedFromMobile = true; true;"
      onLoad={injectData}
      source={{ uri: 'https://regroup-app.com/my-account' }}
      testID="subscription-webview"
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
  errorDescription: {
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

export default SubscriptionHandler;
