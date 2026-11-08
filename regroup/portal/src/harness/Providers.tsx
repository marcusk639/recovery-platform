import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider, useSelector } from 'react-redux';
import Auth from '@mobile/components/auth/auth';
import { RatsKeyboardProvider } from '@mobile/components/rats-keyboard';
import { DataProvider, ModalProvider, NotificationProvider } from '@mobile/context';
import { navigationRef } from '@mobile/navigation/service';
import { queryClient } from '@mobile/state/queryClient';
import store from '@mobile/state/store';
import { ThemeProvider } from '@mobile/styles/theme';

function Themed({ children }: { children: ReactNode }) {
  const theme = useSelector((state: any) => state.theme.theme);
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

// The phone's provider order, from regroup/mobile/index.js and App.tsx, without
// StripeProvider and GestureHandlerRootView, which nothing here uses.
export const Providers = ({ children }: { children: ReactNode }) => (
  <Provider store={store}>
    <QueryClientProvider client={queryClient}>
      <NavigationContainer ref={navigationRef}>
        <RatsKeyboardProvider>
          <SafeAreaProvider>
            <Themed>
              <DataProvider>
                <NotificationProvider>
                  <ModalProvider>
                    <Auth>{children}</Auth>
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
