import React, {useRef, useState, useCallback, useEffect} from 'react';
import {
  View,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StatusBar,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {WebView} from 'react-native-webview';
import type {WebViewNavigation} from 'react-native-webview';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import functions from '@react-native-firebase/functions';

// Types for WebView events
interface WebViewErrorEvent {
  nativeEvent: {
    description?: string;
    domain?: string;
    code?: number;
    url?: string;
  };
}

interface WebViewHttpErrorEvent {
  nativeEvent: {
    statusCode: number;
    description?: string;
    url?: string;
  };
}

// Web payment URL — points to the deployed Firebase Hosting origin.
// Must stay in lockstep with web/src/lib/deepLinks.js WEB_ORIGIN. When
// switching to a custom domain, update both — see docs/LAUNCH_BLOCKERS.md #5.
const PAYMENT_BASE_URL = 'https://recovery-connect-cad4b.web.app/subscribe';

export interface SubscriptionWebViewProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (subscriptionId: string) => void;
  onError: (error: string) => void;
  // User/Group data to pre-fill
  userId: string;
  userEmail: string;
  userName: string;
  groupId: string;
  groupName: string;
  // Optional: admin request message
  requestMessage?: string;
}

/**
 * In-app WebView for subscription payments
 * Provides a native-feeling experience while using web-based Stripe checkout
 */
const SubscriptionWebView: React.FC<SubscriptionWebViewProps> = ({
  visible,
  onClose,
  onSuccess,
  onError,
  userId,
  userEmail,
  userName,
  groupId,
  groupName,
  requestMessage,
}) => {
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('Subscribe');
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Fetch auth token when component becomes visible
  useEffect(() => {
    if (visible && !authToken) {
      const fetchAuthToken = async () => {
        try {
          setTokenError(null);
          const createWebAuthToken =
            functions().httpsCallable('createWebAuthToken');
          const result = await createWebAuthToken();
          const {token} = result.data as {token: string};
          setAuthToken(token);
        } catch (error: any) {
          console.error('Error fetching auth token:', error);
          setTokenError('Failed to authenticate. Please try again.');
          onError('Failed to authenticate. Please try again.');
        }
      };
      fetchAuthToken();
    }
  }, [visible, authToken, onError]);

  // Reset token when modal closes
  useEffect(() => {
    if (!visible) {
      setAuthToken(null);
      setTokenError(null);
    }
  }, [visible]);

  // Build the payment URL with auth token
  const paymentUrl = authToken
    ? `${PAYMENT_BASE_URL}?${new URLSearchParams({
        token: authToken, // Use auth token instead of userId
        email: userEmail,
        name: userName,
        groupId,
        groupName,
        message: requestMessage || '',
        platform: Platform.OS,
      }).toString()}`
    : '';

  // Handle navigation state changes to detect success/cancel via deep links
  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      const {url} = navState;

      // Check for deep link success pattern (homegroups-app://payment-success)
      if (
        url.includes('payment-success') ||
        url.includes('homegroups-app://payment-success')
      ) {
        try {
          // Try to extract subscription ID from URL
          const urlObj = new URL(url.replace('homegroups-app://', 'https://'));
          const subscriptionId =
            urlObj.searchParams.get('subscriptionId') || '';
          onSuccess(subscriptionId);
        } catch {
          onSuccess('');
        }
        return;
      }

      // Check for cancel/failure URL pattern
      if (
        url.includes('payment-cancelled') ||
        url.includes('homegroups-app://payment-cancelled')
      ) {
        onClose();
        return;
      }

      if (
        url.includes('payment-error') ||
        url.includes('homegroups-app://payment-error')
      ) {
        try {
          const urlObj = new URL(url.replace('homegroups-app://', 'https://'));
          const errorMessage =
            urlObj.searchParams.get('error') ||
            'Payment failed. Please try again.';
          onError(decodeURIComponent(errorMessage));
        } catch {
          onError('Payment failed. Please try again.');
        }
        return;
      }

      // Update title based on page content
      if (url.includes('/subscribe')) {
        setTitle('Subscribe');
      }
    },
    [onSuccess, onError, onClose],
  );

  // Handle messages from the web page (alternative to URL-based detection)
  const handleMessage = useCallback(
    (event: {nativeEvent: {data: string}}) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        switch (data.type) {
          case 'PAYMENT_SUCCESS':
            onSuccess(data.subscriptionId);
            break;
          case 'PAYMENT_ERROR':
            onError(data.error);
            break;
          case 'PAYMENT_CANCELLED':
            onClose();
            break;
          case 'UPDATE_TITLE':
            setTitle(data.title);
            break;
        }
      } catch (e) {
        // Ignore non-JSON messages
      }
    },
    [onSuccess, onError, onClose],
  );

  // Inject JavaScript to enable postMessage communication
  const injectedJavaScript = `
    // Bridge for communication with React Native
    window.ReactNativeBridge = {
      postSuccess: function(subscriptionId) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'PAYMENT_SUCCESS',
          subscriptionId: subscriptionId
        }));
      },
      postError: function(error) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'PAYMENT_ERROR',
          error: error
        }));
      },
      postCancel: function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'PAYMENT_CANCELLED'
        }));
      }
    };
    true;
  `;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
            <Icon name="close" size={24} color="#424242" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>{title}</Text>

          {/* Secure badge */}
          <View style={styles.secureBadge}>
            <Icon name="lock" size={14} color="#4CAF50" />
            <Text style={styles.secureText}>Secure</Text>
          </View>
        </View>

        {/* Loading overlay - show while fetching token or loading WebView */}
        {(loading || !authToken) && !tokenError && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#2196F3" />
            <Text style={styles.loadingText}>
              {!authToken ? 'Authenticating...' : 'Loading secure checkout...'}
            </Text>
          </View>
        )}

        {/* Error state */}
        {tokenError && (
          <View style={styles.errorContainer}>
            <Icon name="alert-circle" size={48} color="#F44336" />
            <Text style={styles.errorText}>{tokenError}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                setAuthToken(null);
                setTokenError(null);
              }}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* WebView - only render when we have auth token */}
        {authToken && !tokenError && (
          <WebView
            ref={webViewRef}
            source={{uri: paymentUrl}}
            style={styles.webView}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onNavigationStateChange={handleNavigationStateChange}
            onMessage={handleMessage}
            injectedJavaScript={injectedJavaScript}
            // Intercept deep links before navigation
            onShouldStartLoadWithRequest={request => {
              const {url} = request;
              // Intercept custom URL scheme (deep links)
              if (url.startsWith('homegroups-app://')) {
                // Handle the deep link
                if (url.includes('payment-success')) {
                  try {
                    const urlObj = new URL(
                      url.replace('homegroups-app://', 'https://'),
                    );
                    const subscriptionId =
                      urlObj.searchParams.get('subscriptionId') || '';
                    onSuccess(subscriptionId);
                  } catch {
                    onSuccess('');
                  }
                } else if (url.includes('payment-cancelled')) {
                  onClose();
                } else if (url.includes('payment-error')) {
                  try {
                    const urlObj = new URL(
                      url.replace('homegroups-app://', 'https://'),
                    );
                    const errorMessage =
                      urlObj.searchParams.get('error') ||
                      'Payment failed. Please try again.';
                    onError(decodeURIComponent(errorMessage));
                  } catch {
                    onError('Payment failed. Please try again.');
                  }
                }
                // Don't let WebView navigate to the custom scheme
                return false;
              }
              // Allow normal HTTP(S) navigation
              return true;
            }}
            // Security settings
            javaScriptEnabled={true}
            domStorageEnabled={true}
            thirdPartyCookiesEnabled={true}
            sharedCookiesEnabled={true}
            // UX improvements
            startInLoadingState={true}
            scalesPageToFit={true}
            allowsBackForwardNavigationGestures={false}
            bounces={false}
            // Error handling
            onError={(syntheticEvent: WebViewErrorEvent) => {
              const {nativeEvent} = syntheticEvent;
              console.error('WebView error:', nativeEvent);
              onError('Failed to load payment page. Please try again.');
            }}
            onHttpError={(syntheticEvent: WebViewHttpErrorEvent) => {
              const {nativeEvent} = syntheticEvent;
              console.error('HTTP error:', nativeEvent.statusCode);
              if (nativeEvent.statusCode >= 400) {
                onError('Payment service unavailable. Please try again later.');
              }
            }}
          />
        )}

        {/* Footer with trust indicators */}
        <View style={styles.footer}>
          <View style={styles.trustBadges}>
            <Icon name="shield-check" size={16} color="#757575" />
            <Text style={styles.trustText}>
              Powered by Stripe • 256-bit encryption
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#212121',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 16,
  },
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  secureText: {
    fontSize: 12,
    color: '#4CAF50',
    marginLeft: 4,
    fontWeight: '500',
  },
  webView: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#757575',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#424242',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 24,
    backgroundColor: '#2196F3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    backgroundColor: '#FAFAFA',
  },
  trustBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustText: {
    fontSize: 12,
    color: '#757575',
    marginLeft: 6,
  },
});

export default SubscriptionWebView;
