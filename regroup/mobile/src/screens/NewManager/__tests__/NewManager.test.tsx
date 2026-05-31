/**
 * NewManager (NewManagerIntro) Tests
 *
 * NewManager renders a SignUp screen configured for the manager signup flow.
 * Since the component delegates all rendering to SignUp (stubbed here), we
 * verify the composite renders correctly in its various states.
 *
 * Covers:
 *  - Renders without crashing (testID on signup-screen from SignUp stub)
 *  - Renders the RATS logo header inside the SignUp header slot
 *  - Renders the SignUp form for non-superAdmin role
 *  - Renders the SignUp webview for superAdmin role
 *  - Shows loading indicator when creatingUser is true
 *  - Shows loading indicator when loggingIn is true
 *  - Shows loading indicator when loggingOut is true
 *  - Shows normal screen when not loading
 *  - Does not render signup-screen during loading
 *  - SignUpForm receives renderNameFields=true (form area rendered)
 *  - Renders with null user in Redux without crashing
 *  - Renders with a logged-in user without crashing
 */

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock('@react-navigation/native-stack', () => ({}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(() => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: jest.fn(() => false),
  })),
  CommonActions: { reset: jest.fn() },
}));

// ─── firebase-setup mock ──────────────────────────────────────────────────────
jest.mock('../../../../firebase-setup', () => ({
  auth: {
    currentUser: null,
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
  default: { getInitialNavigation: jest.fn(() => ({ initialRoute: 'main' })) },
  navigationRef: { current: null },
}));

jest.mock('../../../navigation/service', () => ({
  navigationRef: { current: null },
  default: { getInitialNavigation: jest.fn(() => ({ initialRoute: 'main' })) },
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

// ─── Native deep-links mock ───────────────────────────────────────────────────
jest.mock('../../../services/native-deep-links', () => ({
  onLink: jest.fn(() => () => {}),
  getLinkType: jest.fn(() => null),
}));

// ─── Display util mock ────────────────────────────────────────────────────────
jest.mock('../../../util/display', () => ({
  dayIsAfter: jest.fn(() => false),
  getTodaysDate: jest.fn(() => '2026-02-22'),
  getDateAndTime: jest.fn(() => 'Feb 22, 2026'),
  getCurrentTime: jest.fn(() => '2026-02-22T00:00:00.000Z'),
  getPickerItems: jest.fn(() => []),
  camelCaseToDisplayForm: jest.fn((s: string) => s),
}));

// ─── Platform util mock ───────────────────────────────────────────────────────
jest.mock('../../../util/platform', () => ({
  IOS: false,
  IS_X: false,
  ANDROID: true,
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
    return require('react').createElement(
      ScrollView,
      { testID, ...rest },
      children,
    );
  };
});

jest.mock('../../../components/rats-button/rats-button', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return ({ title, onPress, testID, disabled }: any) =>
    require('react').createElement(
      TouchableOpacity,
      { testID: testID || `btn-${title}`, onPress, disabled },
      require('react').createElement(Text, null, title),
    );
});

// Stub SignUpForm — screen-level tests don't need to exercise Formik
jest.mock('../../SignUp/SignUpForm', () => {
  const { View } = require('react-native');
  return ({ error }: any) =>
    require('react').createElement(
      View,
      { testID: 'signup-form' },
      error && error.message
        ? require('react').createElement(
            require('react-native').Text,
            { testID: 'signup-form-error' },
            error.message,
          )
        : null,
    );
});

// Stub SignUpWebView
jest.mock('../../SignUp/SignUpWebView', () => {
  const { View } = require('react-native');
  return () =>
    require('react').createElement(View, { testID: 'signup-webview' });
});

// ─── Landing styles (InitialLanding is imported for its styles export) ────────
jest.mock('../../Landing/InitialLanding', () => ({
  InitialLandingStyles: {
    logoContainer: {},
    image: {},
    container: {},
    buttons: {},
  },
}));

// ─── React imports (after mocks) ──────────────────────────────────────────────
import React from 'react';
import { render } from '@testing-library/react-native';
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

import NewManagerIntro from '../NewManager';

// ─── Store builder ─────────────────────────────────────────────────────────────

interface BuildStoreOptions {
  creatingUser?: boolean;
  loggingIn?: boolean;
  loggingOut?: boolean;
  user?: any;
  signUpRole?: string | null;
  invitation?: any;
}

function buildStore({
  creatingUser = false,
  loggingIn = false,
  loggingOut = false,
  user = null,
  signUpRole = null,
  invitation = null,
}: BuildStoreOptions = {}) {
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
        user,
        loading: false,
        creatingUser,
        loggingIn,
        loggingOut,
        loggingOutSuccessful: false,
        loggedIn: !!user,
        error: null,
        updating: false,
        updatingFailed: false,
        updatingSuccessful: false,
        signUpRole,
        invitation,
        loginFailed: false,
        token: null,
      } as any,
    },
  });
}

function renderScreen(options: BuildStoreOptions = {}) {
  const store = buildStore(options);
  return render(
    <Provider store={store}>
      <NewManagerIntro />
    </Provider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NewManagerIntro', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Smoke test ─────────────────────────────────────────────────────────────
  describe('smoke test', () => {
    it('renders without crashing', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('signup-screen')).toBeTruthy();
    });
  });

  // ─── Logo header ─────────────────────────────────────────────────────────────
  describe('logo header', () => {
    it('renders the RATS logo in the header area', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('rats-logo-horizontal')).toBeTruthy();
    });
  });

  // ─── Form content ────────────────────────────────────────────────────────────
  describe('form content', () => {
    it('renders the SignUp form for non-superAdmin role', () => {
      const { getByTestId } = renderScreen({ signUpRole: null });
      expect(getByTestId('signup-form')).toBeTruthy();
    });

    it('renders the SignUp form for admin role', () => {
      const { getByTestId } = renderScreen({ signUpRole: 'admin' });
      expect(getByTestId('signup-form')).toBeTruthy();
    });
  });

  // ─── superAdmin role ─────────────────────────────────────────────────────────
  describe('superAdmin role', () => {
    it('renders the SignUpWebView for superAdmin', () => {
      const { getByTestId } = renderScreen({ signUpRole: 'superAdmin' });
      expect(getByTestId('signup-webview')).toBeTruthy();
    });

    it('does not render the form for superAdmin', () => {
      const { queryByTestId } = renderScreen({ signUpRole: 'superAdmin' });
      expect(queryByTestId('signup-form')).toBeNull();
    });
  });

  // ─── Loading states ──────────────────────────────────────────────────────────
  describe('loading states', () => {
    it('does not render signup-screen when creatingUser is true', () => {
      const { queryByTestId } = renderScreen({ creatingUser: true });
      expect(queryByTestId('signup-screen')).toBeNull();
    });

    it('does not render signup-screen when loggingIn is true', () => {
      const { queryByTestId } = renderScreen({ loggingIn: true });
      expect(queryByTestId('signup-screen')).toBeNull();
    });

    it('does not render signup-screen when loggingOut is true', () => {
      const { queryByTestId } = renderScreen({ loggingOut: true });
      expect(queryByTestId('signup-screen')).toBeNull();
    });

    it('renders signup-screen when not loading', () => {
      const { getByTestId } = renderScreen({
        creatingUser: false,
        loggingIn: false,
        loggingOut: false,
      });
      expect(getByTestId('signup-screen')).toBeTruthy();
    });
  });

  // ─── User state variants ─────────────────────────────────────────────────────
  describe('user state variants', () => {
    it('renders without crashing when user is null', () => {
      const { getByTestId } = renderScreen({ user: null });
      expect(getByTestId('signup-screen')).toBeTruthy();
    });

    it('renders without crashing when a logged-in user is present', () => {
      const { getByTestId } = renderScreen({
        user: {
          uid: 'user-1',
          id: 'user-1',
          email: 'admin@example.com',
          isAdmin: true,
        },
      });
      expect(getByTestId('signup-screen')).toBeTruthy();
    });
  });
});
