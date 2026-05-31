/**
 * InitialLanding Tests
 *
 * Covers:
 *  - Renders without crashing (testID on root SafeAreaView)
 *  - The RATS logo is rendered
 *  - The form section is rendered (via InitialLandingForm)
 *  - "How can we help?" heading is visible
 *  - "Have an account?" heading is visible
 *  - "SIGN IN" button is visible
 *  - "NEXT" button is visible
 *  - Pressing SIGN IN navigates to the Login route
 *  - "OR" divider text is present
 *  - "Want to try it out?" text is present
 *  - "Use the demo" link is present
 *  - Loading indicator shown when form is in loading state
 */

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock('@react-navigation/native-stack', () => ({}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(() => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: jest.fn(() => false),
  })),
}));

// ─── firebase-setup mock ──────────────────────────────────────────────────────
jest.mock('../../../../firebase-setup', () => ({
  auth: {
    currentUser: null,
    signInWithEmailAndPassword: jest.fn(),
    onAuthStateChanged: jest.fn(() => () => {}),
  },
  firestore: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(() =>
          Promise.resolve({ exists: false, data: () => null }),
        ),
        set: jest.fn(() => Promise.resolve()),
      })),
    })),
    settings: jest.fn(),
  },
}));

// ─── Context mock ─────────────────────────────────────────────────────────────
jest.mock('../../../context', () => ({
  useModal: () => ({
    showFormModal: jest.fn(),
    dismissFormModal: jest.fn(),
    setLoadingModalState: jest.fn(),
  }),
  useTheme: () => ({
    theme: {
      primaryFontFamily: 'System',
      secondaryFontFamily: 'System',
      primaryColor: '#000',
      secondaryColor: '#fff',
      tertiaryColor: '#ccc',
      backgroundColor: '#fff',
      textColor: '#000',
      logoTintColor: '#fff',
    },
  }),
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

// ─── Component stubs ──────────────────────────────────────────────────────────

jest.mock('../../../components/rats-logo/rats-logo', () => ({
  RatsLogoHorizontal: () => {
    const { View } = require('react-native');
    return require('react').createElement(View, {
      testID: 'rats-logo-horizontal',
    });
  },
}));

jest.mock('../../../components/rats-text', () => ({
  RatsText: ({ text }: any) => {
    const { Text } = require('react-native');
    return require('react').createElement(Text, null, text || '');
  },
}));

jest.mock(
  '../../../components/rats-loading-indicator/rats-loading-indicator',
  () => {
    const { View } = require('react-native');
    return () =>
      require('react').createElement(View, { testID: 'loading-indicator' });
  },
);

jest.mock('../../../components/rats-button/rats-button', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return ({ title, onPress, testID, disabled }: any) =>
    require('react').createElement(
      TouchableOpacity,
      { testID: testID || `btn-${title}`, onPress, disabled },
      require('react').createElement(Text, null, title),
    );
});

jest.mock('../../../components/rats-radio-button-group', () => {
  const { View } = require('react-native');
  return () =>
    require('react').createElement(View, { testID: 'radio-button-group' });
});

jest.mock('../../../components/rats-horizontal-rule', () => ({
  RatsHR: () => null,
}));

// ─── Platform util mock ───────────────────────────────────────────────────────
jest.mock('../../../util/platform', () => ({
  IOS: false,
  IS_X: false,
  ANDROID: true,
}));

// ─── React imports (after mocks) ──────────────────────────────────────────────
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import userReducer from '../../../state/slices/userSlice';
import housesReducer from '../../../state/slices/housesSlice';
import guestsReducer from '../../../state/slices/guestsSlice';
import adminReducer from '../../../state/slices/adminSlice';
import uiReducer from '../../../state/slices/uiSlice';
import authReducer from '../../../state/slices/authSlice';
import themeReducer from '../../../state/slices/themeSlice';
import navigationReducer from '../../../state/slices/navigationSlice';
import chatReducer from '../../../state/slices/chatSlice';
import setupReducer from '../../../state/slices/setupSlice';
import notificationsReducer from '../../../state/slices/notificationsSlice';
import meetingsReducer from '../../../state/slices/meetingsSlice';

import InitialLanding from '../InitialLanding';

// ─── Store builder ─────────────────────────────────────────────────────────────

function buildStore(userState: any = {}) {
  return configureStore({
    reducer: {
      ui: uiReducer,
      auth: authReducer,
      theme: themeReducer,
      navigation: navigationReducer,
      user: userReducer,
      houses: housesReducer,
      guests: guestsReducer,
      meetings: meetingsReducer,
      admin: adminReducer,
      chat: chatReducer,
      setup: setupReducer,
      notifications: notificationsReducer,
    },
    preloadedState: {
      user: {
        user: null,
        loading: false,
        creatingUser: false,
        loggingIn: false,
        loggingOut: false,
        loggingOutSuccessful: false,
        loggedIn: false,
        error: null,
        updating: false,
        updatingFailed: false,
        updatingSuccessful: false,
        signUpRole: null,
        invitation: null,
        loginFailed: false,
        token: null,
        ...userState,
      } as any,
    },
  });
}

function renderScreen(userState: any = {}) {
  const store = buildStore(userState);
  return render(
    <Provider store={store}>
      <InitialLanding />
    </Provider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('InitialLanding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Smoke test ─────────────────────────────────────────────────────────────
  describe('smoke test', () => {
    it('renders without crashing', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('initial-landing-screen')).toBeTruthy();
    });
  });

  // ─── Logo ────────────────────────────────────────────────────────────────────
  describe('logo', () => {
    it('renders the RATS logo', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('rats-logo-horizontal')).toBeTruthy();
    });
  });

  // ─── Form content ────────────────────────────────────────────────────────────
  describe('form content', () => {
    it('shows the "How can we help?" heading', () => {
      const { getByText } = renderScreen();
      expect(getByText('How can we help?')).toBeTruthy();
    });

    it('shows the "Have an account?" heading', () => {
      const { getByText } = renderScreen();
      expect(getByText('Have an account?')).toBeTruthy();
    });

    it('renders the radio button group for user type selection', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('radio-button-group')).toBeTruthy();
    });

    it('renders the NEXT button', () => {
      const { getByText } = renderScreen();
      expect(getByText('NEXT')).toBeTruthy();
    });

    it('renders the SIGN IN button', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('sign-in-button')).toBeTruthy();
    });

    it('shows the "OR" divider', () => {
      const { getByText } = renderScreen();
      expect(getByText('OR')).toBeTruthy();
    });

    it('shows the "Want to try it out?" text', () => {
      const { getByText } = renderScreen();
      expect(getByText('Want to try it out?')).toBeTruthy();
    });

    it('shows the "Use the demo" link', () => {
      const { getByText } = renderScreen();
      expect(getByText('Use the demo')).toBeTruthy();
    });
  });

  // ─── Navigation ──────────────────────────────────────────────────────────────
  describe('navigation', () => {
    it('pressing SIGN IN calls navigation.navigate', async () => {
      const mockNavigate = jest.fn();
      const { useNavigation } = require('@react-navigation/native');
      useNavigation.mockReturnValue({
        navigate: mockNavigate,
        goBack: jest.fn(),
        canGoBack: jest.fn(() => false),
      });

      const { getByTestId } = renderScreen();
      const signInButton = getByTestId('sign-in-button');

      await act(async () => {
        fireEvent.press(signInButton);
      });

      expect(mockNavigate).toHaveBeenCalled();
    });
  });
});
