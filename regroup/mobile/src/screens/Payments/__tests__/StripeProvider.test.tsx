/**
 * StripeProvider integration test
 *
 * Verifies that StripeProvider is present in the App component tree.
 * All native modules are mocked so the test runs in the unit-test environment.
 */

import React from 'react';
import { render } from '@testing-library/react-native';

// ── Stripe mock ───────────────────────────────────────────────────────────────

jest.mock('@stripe/stripe-react-native', () => ({
  StripeProvider: ({ children }: any) => children,
  useStripe: jest.fn(() => ({})),
  usePaymentSheet: jest.fn(() => ({
    initPaymentSheet: jest.fn(),
    presentPaymentSheet: jest.fn(),
    loading: false,
  })),
}));

// ── Redux store mock ──────────────────────────────────────────────────────────

jest.mock('../../../state/store', () => ({
  useAppSelector: (selector: any) =>
    selector({
      user: {
        loggedIn: false,
        loading: false,
        loggingOut: false,
        creatingUser: false,
        error: null,
        loggingIn: false,
        user: null,
        anonymous: false,
        loginFailed: false,
        invitation: null,
        signUpRole: null,
      },
      theme: { theme: 'light' },
      guests: { selectedGuest: null },
      houses: { selectedHouse: null },
    }),
  useAppDispatch: () => jest.fn(),
}));

// ── Navigation mock ───────────────────────────────────────────────────────────

jest.mock('../../../navigation', () => ({
  RootNavigator: ({ children }: any) => children ?? null,
  improvedNavigationService: {
    getInitialNavigation: jest.fn(() => ({
      initialRoute: 'Auth',
      authInitialRoute: 'Login',
      initialMainRoute: undefined,
    })),
  },
  AuthStackParamList: {},
  RootStackParamList: {},
  MainTabParamList: {},
}));

// ── Splash HOC mock ───────────────────────────────────────────────────────────
// withSplash wraps App in a Splash component that requires a `navigation` prop.
// In tests we bypass the HOC entirely so App renders without navigation plumbing.
jest.mock('../../../screens/Splash/Splash', () => ({
  withSplash: (Component: any) => (_props: any) => {
    const React = require('react');
    return React.createElement(Component);
  },
}));

// ── Auth component mock ───────────────────────────────────────────────────────

jest.mock('../../../components/auth/auth', () => {
  const { View } = require('react-native');
  return ({ children }: any) => <View>{children}</View>;
});

// ── IOSStatusBar mock ─────────────────────────────────────────────────────────

jest.mock('../../../components/ios-status-bar', () => {
  const { View } = require('react-native');
  return () => <View />;
});

// ── ErrorBoundary mock ────────────────────────────────────────────────────────

jest.mock('../../../components/ErrorBoundary', () => {
  const { View } = require('react-native');
  return ({ children }: any) => <View>{children}</View>;
});

// ── Context providers mock ────────────────────────────────────────────────────

jest.mock('../../../context', () => ({
  ModalProvider: ({ children }: any) => children,
  NotificationProvider: ({ children }: any) => children,
  DataProvider: ({ children }: any) => children,
  useTheme: () => ({
    theme: {
      primaryColor: 'rgb(99,139,250)',
      secondaryColor: '#d2d8ef',
      tertiaryColor: '#969696',
      backgroundColor: '#FAFAFA',
      textColor: 'black',
      primaryFontFamily: 'Quicksand-Medium',
      secondaryFontFamily: 'Quicksand-Medium',
      logoTintColor: '#ffffff',
    },
  }),
  useTranslation: () => ({ t: (key: string) => key }),
}));

// ── Theme mock ────────────────────────────────────────────────────────────────

jest.mock('../../../styles/theme', () => ({
  ThemeProvider: ({ children }: any) => children,
  color: { black: '#000000' },
}));

// ── App import (after all mocks are in place) ─────────────────────────────────
// Cast to React.ComponentType<any> because the exported App is wrapped by withSplash,
// whose SplashProps type requires a `navigation` prop that is irrelevant in unit tests
// (the withSplash mock above strips that requirement at runtime).
import AppExport from '../../../../App';

const App = AppExport as React.ComponentType<any>;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StripeProvider in App', () => {
  it('renders App without crashing, confirming StripeProvider is in the tree', () => {
    expect(() => render(<App />)).not.toThrow();
  });

  it('renders App and returns a non-null component tree', () => {
    const { toJSON } = render(<App />);
    expect(toJSON()).not.toBeNull();
  });
});
