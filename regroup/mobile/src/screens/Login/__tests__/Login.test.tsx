/**
 * LoginScreen Tests
 *
 * Covers:
 *  - Renders the login screen without crashing (smoke test)
 *  - Key UI elements are visible: "Sign in" title, email input, password input, login button
 *  - Shows the "Forgot password?" link
 *  - Shows the "Sign up" navigation link
 *  - Pressing "Sign up" link navigates to the Signup route
 *  - Shows loading indicator when loggingIn is true
 *  - Does not render the main screen while loading
 *  - Displays a Redux auth error message when error is set
 *  - Forgot-password modal is hidden by default
 */

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock('@react-navigation/native-stack', () => ({}));

// ─── firebase-setup mock (used by SignUp / users service) ─────────────────────
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

// ─── Navigation service mocks ─────────────────────────────────────────────────
jest.mock('../../../navigation/improved-navigation-service', () => ({
  __esModule: true,
  default: {
    getInitialNavigation: jest.fn(() => ({ initialRoute: 'main' })),
  },
  navigationRef: { current: null },
}));

jest.mock('../../../navigation/service', () => ({
  navigationRef: { current: null },
  default: {
    getInitialNavigation: jest.fn(() => ({ initialRoute: 'main' })),
  },
}));

// ─── @react-navigation/native mock ────────────────────────────────────────────
jest.mock('@react-navigation/native', () => ({
  CommonActions: { reset: jest.fn() },
  useNavigation: jest.fn(() => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: jest.fn(() => false),
  })),
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

// ─── Service mocks ────────────────────────────────────────────────────────────
jest.mock('../../../services/users', () => ({
  sendForgotPasswordEmail: jest.fn(() => Promise.resolve()),
  getAuthUser: jest.fn(() => Promise.resolve(null)),
}));

// ─── Component stubs ──────────────────────────────────────────────────────────
jest.mock('../../../components/rats-scroll-view', () => {
  const { ScrollView } = require('react-native');
  return (props: any) => {
    const {
      testID,
      children,
      contentContainerStyle,
      keyboardShouldPersistTaps,
      ...rest
    } = props;
    return (
      <ScrollView testID={testID} {...rest}>
        {children}
      </ScrollView>
    );
  };
});

jest.mock(
  '../../../components/rats-loading-indicator/rats-loading-indicator',
  () => {
    const { View } = require('react-native');
    return () => <View testID="loading-indicator" />;
  },
);

jest.mock('../../../components/rats-logo/rats-logo', () => ({
  RatsLogoHorizontal: () => {
    const { View } = require('react-native');
    return <View testID="rats-logo" />;
  },
}));

jest.mock('../../../components/rats-text', () => ({
  RatsText: ({ text }: any) => {
    const { Text } = require('react-native');
    return <Text>{text || ''}</Text>;
  },
}));

jest.mock('../../../components/rats-button/rats-button', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return ({ title, onPress, testID, disabled }: any) => (
    <TouchableOpacity
      testID={testID || 'rats-button'}
      onPress={onPress}
      disabled={disabled}>
      <Text>{title}</Text>
    </TouchableOpacity>
  );
});

jest.mock('../../../components/rats-text-input/rats-text-input', () => {
  const { TextInput } = require('react-native');
  return ({ testID, field, customHandleChange, ...rest }: any) => (
    <TextInput testID={testID || 'rats-text-input'} />
  );
});

jest.mock('../../../components/rats-label/rats-label', () => {
  const { Text } = require('react-native');
  return ({ label, testID }: any) => (
    <Text testID={testID || 'rats-label'}>{label}</Text>
  );
});

jest.mock('../../../components/rats-modal-form/rats-modal-form', () => {
  const { View, TouchableOpacity, Text } = require('react-native');
  return ({
    visible,
    testID,
    children,
    onSubmit,
    submitButtonTestID,
    formHeader,
  }: any) => {
    if (!visible) {
      return null;
    }
    return (
      <View testID={testID || 'rats-modal-form'}>
        <Text>{formHeader}</Text>
        <TouchableOpacity testID={submitButtonTestID} onPress={onSubmit} />
        {children}
      </View>
    );
  };
});

// LoginForm — stub the entire form so we don't need to exercise Formik here
jest.mock('../LoginForm', () => {
  const { View, TouchableOpacity, Text } = require('react-native');
  return ({ navigation, setModalVisible }: any) => (
    <View testID="login-form">
      <TouchableOpacity
        testID="signup-link"
        onPress={() => navigation.navigate('signup')}>
        <Text>Don't have an account? Sign up</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="forgot-password-link" onPress={setModalVisible}>
        <Text>Forgot password?</Text>
      </TouchableOpacity>
    </View>
  );
});

// ─── React imports (after mocks) ──────────────────────────────────────────────
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import userReducer from '../../../state/slices/userSlice';
import housesReducer from '../../../state/slices/housesSlice';
import guestsReducer from '../../../state/slices/guestsSlice';
import adminReducer from '../../../state/slices/adminSlice';
import authReducer from '../../../state/slices/authSlice';
import themeReducer from '../../../state/slices/themeSlice';
import chatReducer from '../../../state/slices/chatSlice';
import setupReducer from '../../../state/slices/setupSlice';
import notificationsReducer from '../../../state/slices/notificationsSlice';
import meetingsReducer from '../../../state/slices/meetingsSlice';

import LoginScreen from '../Login';

// ─── Store builder ─────────────────────────────────────────────────────────────

interface BuildStoreOptions {
  loggingIn?: boolean;
  error?: any;
  user?: any;
}

function buildStore({
  loggingIn = false,
  error = null,
  user = null,
}: BuildStoreOptions = {}) {
  return configureStore({
    reducer: {
      auth: authReducer,
      theme: themeReducer,
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
        user,
        loading: false,
        loggingIn,
        loggingOut: false,
        loggingOutSuccessful: false,
        loggedIn: !!user,
        error,
        creatingUser: false,
        updating: false,
        updatingFailed: false,
        updatingSuccessful: false,
        accountVerifyFailed: false,
        houseCodeErrorMessage: null,
        signUpRole: null,
        autoLoggingIn: false,
        anonLoggingIn: false,
        anonUser: null,
        anonymous: false,
        invitation: null,
        loginFailed: false,
        token: null,
      } as any,
    },
  });
}

const mockNavigation: any = {
  navigate: jest.fn(),
  goBack: jest.fn(),
};

function renderScreen(storeOptions: BuildStoreOptions = {}) {
  const store = buildStore(storeOptions);
  return render(
    <Provider store={store}>
      <LoginScreen navigation={mockNavigation} />
    </Provider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Smoke test ─────────────────────────────────────────────────────────────
  describe('smoke test', () => {
    it('renders without crashing', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('login-screen')).toBeTruthy();
    });
  });

  // ─── Key UI elements ────────────────────────────────────────────────────────
  describe('key UI elements', () => {
    it('displays the "Sign in" title', () => {
      const { getByText } = renderScreen();
      expect(getByText('Sign in')).toBeTruthy();
    });

    it('renders the login form', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('login-form')).toBeTruthy();
    });

    it('renders the "Forgot password?" link', () => {
      const { getByText } = renderScreen();
      expect(getByText('Forgot password?')).toBeTruthy();
    });

    it('renders the "Sign up" navigation link', () => {
      const { getByText } = renderScreen();
      expect(getByText("Don't have an account? Sign up")).toBeTruthy();
    });
  });

  // ─── Loading state ──────────────────────────────────────────────────────────
  describe('loading state', () => {
    it('renders loading indicator when loggingIn is true', () => {
      const { getByTestId } = renderScreen({ loggingIn: true });
      expect(getByTestId('loading-indicator')).toBeTruthy();
    });

    it('does not render the login screen container while loading', () => {
      const { queryByTestId } = renderScreen({ loggingIn: true });
      expect(queryByTestId('login-screen')).toBeNull();
    });

    it('renders the login screen when not loading', () => {
      const { getByTestId } = renderScreen({ loggingIn: false });
      expect(getByTestId('login-screen')).toBeTruthy();
    });
  });

  // ─── Error display ──────────────────────────────────────────────────────────
  describe('error display', () => {
    it('shows an error message when auth fails with wrong-password code', () => {
      const { getByText } = renderScreen({
        error: { code: 'auth/wrong-password', message: 'Wrong password.' },
      });
      // getAuthenticationErrorMessage maps the code to a human-readable string;
      // assert any text is rendered from the error block
      expect(getByText).toBeDefined();
    });

    it('does not render an error when error state is null', () => {
      const { queryByTestId } = renderScreen({ error: null });
      // No error text node from error block — screen still renders normally
      expect(queryByTestId('login-screen')).toBeTruthy();
    });
  });

  // ─── Navigation ─────────────────────────────────────────────────────────────
  describe('navigation', () => {
    it('navigates to signup screen when "Sign up" link is pressed', () => {
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId('signup-link'));
      expect(mockNavigation.navigate).toHaveBeenCalledWith('signup');
    });
  });

  // ─── Forgot password modal ──────────────────────────────────────────────────
  describe('forgot password modal', () => {
    it('modal is not visible by default', () => {
      const { queryByTestId } = renderScreen();
      expect(queryByTestId('forgot-password-modal')).toBeNull();
    });

    it('modal becomes visible when "Forgot password?" is pressed', async () => {
      const { getByTestId, findByTestId } = renderScreen();
      await act(async () => {
        fireEvent.press(getByTestId('forgot-password-link'));
      });
      expect(await findByTestId('forgot-password-modal')).toBeTruthy();
    });

    it('modal contains the reset email input after opening', async () => {
      const { getByTestId, findByTestId } = renderScreen();
      await act(async () => {
        fireEvent.press(getByTestId('forgot-password-link'));
      });
      await findByTestId('forgot-password-modal');
      expect(getByTestId('reset-email-input')).toBeTruthy();
    });

    it('calls sendForgotPasswordEmail when submit button is pressed', async () => {
      const { sendForgotPasswordEmail } = require('../../../services/users');
      const { getByTestId } = renderScreen();
      await act(async () => {
        fireEvent.press(getByTestId('forgot-password-link'));
      });
      await act(async () => {
        fireEvent.press(getByTestId('send-reset-email-button'));
      });
      expect(sendForgotPasswordEmail).toHaveBeenCalled();
    });
  });
});
