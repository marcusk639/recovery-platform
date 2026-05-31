/**
 * NewAccount Screen Tests
 *
 * Covers:
 *  - Renders the screen without crashing (smoke test)
 *  - Renders the "About You" screen header
 *  - Renders the NewAccountForm
 *  - "Continue" / "Next" submit button is visible
 *  - Renders HelpIcon in the header
 *  - Displays a Redux error message when error state is set
 *  - Does not show an error section when error is null
 *  - Screen renders normally for a guest user
 *  - Screen renders normally for an admin user
 */

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock('@react-navigation/native-stack', () => ({}));

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

// ─── Display util mock ────────────────────────────────────────────────────────
jest.mock('../../../util/display', () => ({
  dayIsAfter: jest.fn(() => false),
  getTodaysDate: jest.fn(() => '2026-02-22'),
  getDateAndTime: jest.fn(() => 'Feb 22, 2026'),
  getCurrentTime: jest.fn(() => '2026-02-22T00:00:00.000Z'),
  getPickerItems: jest.fn(() => []),
}));

// ─── Debug logger mock ────────────────────────────────────────────────────────
jest.mock('../../../util/simple-debug-logger', () => ({
  logDebug: jest.fn(),
  logError: jest.fn(),
}));

// ─── Component stubs ──────────────────────────────────────────────────────────
jest.mock('../../../components/rats-scroll-view', () => {
  const { ScrollView } = require('react-native');
  return (props: any) => {
    const { testID, children, contentContainerStyle, ...rest } = props;
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

jest.mock('../../../components/rats-text', () => ({
  RatsText: ({ text, style }: any) => {
    const { Text } = require('react-native');
    return <Text style={style}>{text || ''}</Text>;
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

jest.mock('../../../components/rats-icon', () => ({
  RatsIcon: ({ testID, name }: any) => {
    const { View } = require('react-native');
    return <View testID={testID || `icon-${name}`} />;
  },
}));

// Stub ScreenHeader — renders just the header text so we can assert on it
jest.mock('../../../components/screen-header', () => {
  const { View, Text } = require('react-native');
  return ({ header, icon }: any) => (
    <View testID="screen-header">
      <Text testID="screen-header-text">{header}</Text>
      {icon}
    </View>
  );
});

// Stub HelpIcon
jest.mock('../../../components/help-icon', () => {
  const { TouchableOpacity } = require('react-native');
  return () => <TouchableOpacity testID="help-icon" />;
});

// Stub NewAccountForm — expose known testIDs so screen-level tests stay focused
jest.mock('../NewAccountForm', () => {
  const { View, TouchableOpacity, Text } = require('react-native');
  return ({ navigation }: any) => (
    <View testID="new-account-form">
      <TouchableOpacity testID="continue-button" onPress={() => {}}>
        <Text>Next</Text>
      </TouchableOpacity>
    </View>
  );
});

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

import NewAccount from '../NewAccount';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_GUEST_USER: any = {
  uid: 'user-1',
  id: 'user-1',
  firstName: 'Alice',
  lastName: 'Smith',
  email: 'alice@example.com',
  isAdmin: false,
  isGuest: true,
  guestId: 'guest-1',
  infoEntered: false,
};

const BASE_ADMIN_USER: any = {
  uid: 'user-2',
  id: 'user-2',
  firstName: 'Bob',
  lastName: 'Manager',
  email: 'bob@example.com',
  isAdmin: true,
  isGuest: false,
};

// ─── Store builder ─────────────────────────────────────────────────────────────

interface BuildStoreOptions {
  user?: any;
  updating?: boolean;
  error?: any;
  invitation?: any;
  selectedGuest?: any;
}

function buildStore({
  user = BASE_GUEST_USER,
  updating = false,
  error = null,
  invitation = null,
  selectedGuest = null,
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
        creatingUser: false,
        loggingIn: false,
        loggingOut: false,
        loggingOutSuccessful: false,
        loggedIn: !!user,
        error,
        updating,
        updatingFailed: false,
        updatingSuccessful: false,
        accountVerifyFailed: false,
        houseCodeErrorMessage: null,
        signUpRole: null,
        autoLoggingIn: false,
        anonLoggingIn: false,
        anonUser: null,
        anonymous: false,
        invitation,
        loginFailed: false,
        token: null,
      } as any,
      guests: {
        guests: selectedGuest ? { [selectedGuest.id]: selectedGuest } : {},
        selectedGuest: selectedGuest ?? null,
        userAsGuest: null,
        status: 'idle',
        error: null,
        updateStatus: 'idle',
        createStatus: 'idle',
        deleteStatus: 'idle',
        customizePhaseStatus: 'idle',
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
      <NewAccount navigation={mockNavigation} />
    </Provider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NewAccount Screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Smoke test ─────────────────────────────────────────────────────────────
  describe('smoke test', () => {
    it('renders without crashing', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('screen-header')).toBeTruthy();
    });

    it('renders with an admin user without crashing', () => {
      const { getByTestId } = renderScreen({ user: BASE_ADMIN_USER });
      expect(getByTestId('screen-header')).toBeTruthy();
    });
  });

  // ─── Key UI elements ────────────────────────────────────────────────────────
  describe('key UI elements', () => {
    it('displays the "About You" screen header', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('screen-header-text').props.children).toBe(
        'About You',
      );
    });

    it('renders the HelpIcon in the header', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('help-icon')).toBeTruthy();
    });

    it('renders the NewAccountForm', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('new-account-form')).toBeTruthy();
    });

    it('renders the "Next" submit button', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('continue-button')).toBeTruthy();
    });

    it('shows "Next" button label', () => {
      const { getByText } = renderScreen();
      expect(getByText('Next')).toBeTruthy();
    });
  });

  // ─── Error display ──────────────────────────────────────────────────────────
  describe('error display', () => {
    it('renders an error text when error state is set', () => {
      const { getByText } = renderScreen({
        error: { message: 'Something went wrong', code: 'some/error' },
      });
      expect(getByText('Something went wrong')).toBeTruthy();
    });

    it('does not render an error section when error is null', () => {
      const { queryByText } = renderScreen({ error: null });
      // Confirm the screen still renders cleanly with no leftover error text
      expect(queryByText('Something went wrong')).toBeNull();
    });

    it('uses nativeErrorMessage when nativeFirebaseError is set on the error object', () => {
      const { getByText } = renderScreen({
        error: {
          nativeFirebaseError: true,
          nativeErrorMessage: 'Native Firebase error occurred',
          message: 'Generic error',
          code: 'some/error',
        },
      });
      // The component reassigns error.message = error.nativeErrorMessage
      expect(getByText('Native Firebase error occurred')).toBeTruthy();
    });
  });

  // ─── User role variations ────────────────────────────────────────────────────
  describe('user role variations', () => {
    it('renders correctly for a guest user', () => {
      const { getByTestId } = renderScreen({ user: BASE_GUEST_USER });
      expect(getByTestId('new-account-form')).toBeTruthy();
    });

    it('renders correctly for an admin user', () => {
      const { getByTestId } = renderScreen({ user: BASE_ADMIN_USER });
      expect(getByTestId('new-account-form')).toBeTruthy();
    });

    it('renders with null user without crashing', () => {
      const { getByTestId } = renderScreen({ user: null });
      expect(getByTestId('screen-header')).toBeTruthy();
    });
  });

  // ─── Invitation ──────────────────────────────────────────────────────────────
  describe('with an invitation', () => {
    it('renders the screen without crashing when invitation is set', () => {
      const invitation = {
        id: 'inv-1',
        email: 'guest@example.com',
        houseId: 'house-1',
        type: 'guest',
        ownerId: 'owner-1',
      };
      const { getByTestId } = renderScreen({ invitation });
      expect(getByTestId('screen-header')).toBeTruthy();
    });
  });
});
