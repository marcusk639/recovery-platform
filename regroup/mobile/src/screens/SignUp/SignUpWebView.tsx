import React, { useRef, useEffect, useCallback } from 'react';
import { WebView } from 'react-native-webview';
import { User } from '../../entities/User';
import { login } from '../../state/slices/userSlice';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { bottomSpace } from '../../util/platform';
import { useAppDispatch } from '../../state/store';

interface Props {
  user: User;
  navigation: { goBack: () => void };
}

const SignUpWebView: React.FC<Props> = props => {
  const { user, navigation } = props;

  const dispatch = useAppDispatch();
  const webViewRef = useRef<WebView | null>(null);

  const injectData = useCallback(() => {
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        window.user = ${user}
      `);
    }
  }, [user]);

  const handleEvent = useCallback(
    (event: any) => {
      if (event && event.nativeEvent && event.nativeEvent.data) {
        const data = JSON.parse(event.nativeEvent.data);
        if (data && data.email && data.password) {
          dispatch(login({ email: data.email, password: data.password }));
        }
        if (data && data.back) {
          navigation.goBack();
        }
      }
    },
    [dispatch, navigation],
  );

  useEffect(() => {
    // componentDidMount equivalent - empty for now
  }, []);

  return (
    <WebView
      onMessage={handleEvent}
      renderLoading={() => (
        <RatsLoadingIndicator
          containerStyle={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />
      )}
      startInLoadingState
      ref={ref => {
        webViewRef.current = ref;
      }}
      injectedJavaScript={'window.launchedFromMobile = true'}
      source={{ uri: 'https://rats-dev.web.app/pricing' }}
    />
  );
};

/**
 * Sign Up WebView
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Removed old Redux action imports (userActions)
 * - Added RTK import: login from userSlice
 * - Fixed import path: ../../state/hooks → ../../state/store
 * - Replaced 1 dispatch call with RTK thunk
 */
export default SignUpWebView;
