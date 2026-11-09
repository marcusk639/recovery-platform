import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { getPathFromState, NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider, useSelector } from 'react-redux';
import Auth from '@mobile/components/auth/auth';
import { RatsKeyboardProvider } from '@mobile/components/rats-keyboard';
import { DataProvider, ModalProvider, NotificationProvider } from '@mobile/context';
import { navigationRef } from '@mobile/navigation/service';
import { queryClient } from '@mobile/state/queryClient';
import store from '@mobile/state/store';
import { ThemeProvider } from '@mobile/styles/theme';
import { AlertHost } from '../adapter/alert/AlertHost';
import { Alert } from '../adapter/react-native';
import { trackNavigationState } from './current-house';
import { linkingConfig, stripQuery } from './urls';

function Themed({ children }: { children: ReactNode }) {
  const theme = useSelector((state: any) => state.theme.theme);
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

const linking = {
  ...linkingConfig(location.origin),
  getPathFromState: (state: any, options: any) => stripQuery(getPathFromState(state, options)),
};

// The phone's provider order, from regroup/mobile/index.js and App.tsx, without
// StripeProvider and GestureHandlerRootView, which nothing here uses.
export const Providers = ({ children }: { children: ReactNode }) => (
  <Provider store={store}>
    <QueryClientProvider client={queryClient}>
      <NavigationContainer
        ref={navigationRef}
        linking={linking}
        documentTitle={{ enabled: false }}
        onStateChange={trackNavigationState}
        onUnhandledAction={() => Alert.alert("This isn't available on the web yet. Please use the Regroup app on your phone.")}>
        <RatsKeyboardProvider>
          <SafeAreaProvider>
            <Themed>
              <DataProvider>
                <NotificationProvider>
                  <ModalProvider>
                    <Auth>{children}</Auth>
                    <AlertHost />
                  </ModalProvider>
                </NotificationProvider>
              </DataProvider>
            </Themed>
          </SafeAreaProvider>
        </RatsKeyboardProvider>
      </NavigationContainer>
    </QueryClientProvider>
  </Provider>
);
