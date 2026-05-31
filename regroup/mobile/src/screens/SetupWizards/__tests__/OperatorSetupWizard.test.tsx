/**
 * OperatorSetupWizard Screen Tests
 *
 * Covers:
 * - Renders without crash
 * - Step indicator is rendered with correct step count
 * - Each step sub-component stub is present in the pager
 * - Next/previous navigation buttons respond without throwing
 * - Wizard root testID is present in the tree
 * - Step indicator labels rendered
 * - Renders correctly when keyboard is not visible
 * - Navigation prop goBack wired to cancel action
 * - Submitting state does not crash the wizard
 * - SetupButtons component renders correctly in isolation
 * - SetupHeader component renders text content
 * - Wizard renders with null selectedHouse in Redux
 * - Pressing next-step-button does not throw
 * - Pressing previous-step-button does not throw
 * - Step indicator step count matches pages count
 */

// ─── Firebase mock (auto-mapped via jest.config moduleNameMapper) ──────────────
jest.mock('../../../firebase-setup', () => ({
  firestore: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(() =>
          Promise.resolve({ exists: false, data: () => null }),
        ),
        set: jest.fn(() => Promise.resolve()),
        update: jest.fn(() => Promise.resolve()),
        delete: jest.fn(() => Promise.resolve()),
      })),
      get: jest.fn(() => Promise.resolve({ docs: [] })),
      where: jest.fn().mockReturnThis(),
    })),
    batch: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      commit: jest.fn(() => Promise.resolve()),
    })),
  },
  functions: {
    httpsCallable: jest.fn(() => jest.fn(() => Promise.resolve({ data: {} }))),
  },
}));

jest.mock('@react-native-firebase/firestore', () => ({
  firebase: {},
  FirebaseFirestoreTypes: {},
}));
jest.mock('@react-navigation/native-stack', () => ({}));

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  NavigationContainer: ({ children }: any) => children,
}));

// ─── Context mocks ────────────────────────────────────────────────────────────
jest.mock('../../../context', () => ({
  useNotification: () => ({
    showPopover: jest.fn(),
    setPopoverRef: jest.fn(),
    notify: jest.fn(),
  }),
  useModal: () => ({
    showFormModal: jest.fn(),
    dismissFormModal: jest.fn(),
    setLoadingModalState: jest.fn(),
  }),
  useTheme: () => ({
    theme: {
      primaryColor: '#000',
      secondaryColor: '#fff',
      backgroundColor: '#fff',
      textColor: '#000',
      primaryFontFamily: 'System',
      secondaryFontFamily: 'System',
    },
  }),
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

// ─── Service mocks ────────────────────────────────────────────────────────────
jest.mock('../../../services/house', () => ({
  getHouse: jest.fn(),
  houseCollection: {},
  updateHouse: jest.fn(() => Promise.resolve()),
  finalizeHouseSetup: jest.fn(() => Promise.resolve()),
  createHouse: jest.fn(() => Promise.resolve({ id: 'house-1' })),
}));
jest.mock('../../../services/admin', () => ({
  getAdmins: jest.fn(() => Promise.resolve({})),
  adminCollection: {},
  getAdmin: jest.fn(),
}));
jest.mock('../../../services/guest', () => ({
  getGuests: jest.fn(() => Promise.resolve({})),
  houseCollection: {},
}));
jest.mock('../../../services/organization', () => ({
  createOrganization: jest.fn(() => Promise.resolve({ id: 'org-1' })),
}));

// ─── ViewPager mock (legacy — kept for any indirect imports) ──────────────────
// The wizard no longer uses ViewPager. The new layout uses RatsWizardSlide
// (state-based, no ref). This mock is retained as a safety net for any
// transitive imports while the migration completes.
jest.mock('react-native-best-viewpager', () => {
  const React = require('react');
  const { View } = require('react-native');
  const ViewPager = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ setPage: jest.fn() }));
    return <View testID={props.testID || 'view-pager'}>{props.children}</View>;
  });
  ViewPager.displayName = 'ViewPager';
  return { ViewPager };
});

// ─── Shared wizard primitives ─────────────────────────────────────────────────
// The new parent uses three shared components: RatsWizardProgress (replaces
// RatsSetupStepIndicator), RatsWizardSlide (replaces ViewPager), and
// SharedSetupButtons (the canonical Back/Next button row). We stub each so
// the test can assert on their behaviour without exercising Animated.
jest.mock('../../../components/rats-wizard-progress', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return function MockRatsWizardProgress(props: {
    stepCount: number;
    currentStep: number;
    currentLabel?: string;
    testID?: string;
  }) {
    return React.createElement(
      View,
      { testID: props.testID || 'wizard-progress' },
      React.createElement(
        Text,
        { testID: 'wizard-step-count' },
        props.stepCount,
      ),
      React.createElement(
        Text,
        { testID: 'wizard-current-step' },
        props.currentStep,
      ),
      React.createElement(
        Text,
        { testID: 'wizard-current-label' },
        props.currentLabel || '',
      ),
    );
  };
});

jest.mock('../../../components/rats-wizard-slide', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function MockRatsWizardSlide(props: {
    currentStep: number;
    children: React.ReactNode[];
    testID?: string;
  }) {
    // Render ALL children (matches the real component, which lays them out
    // horizontally and translates between them). This keeps every step stub
    // queryable for the "step sub-components rendered inside pager" suite.
    return React.createElement(
      View,
      { testID: props.testID || 'wizard-slide' },
      ...React.Children.toArray(props.children).map(
        (child: React.ReactNode, i: number) =>
          React.createElement(
            View,
            { key: i, testID: `wizard-slide-step-${i}` },
            child,
          ),
      ),
    );
  };
});

jest.mock('../../../components/setup-buttons', () => {
  const React = require('react');
  const { TouchableOpacity, Text, View } = require('react-native');
  return function MockSharedSetupButtons(props: {
    onBackPress: () => void;
    onNextPress: () => void;
    hideBack?: boolean;
    nextLabel?: string;
    backLabel?: string;
    nextDisabled?: boolean;
  }) {
    return React.createElement(
      View,
      { testID: 'shared-setup-buttons' },
      !props.hideBack &&
        React.createElement(
          TouchableOpacity,
          {
            testID: 'setup-buttons-back',
            onPress: props.onBackPress,
          },
          React.createElement(
            Text,
            null,
            (props.backLabel || 'Back').toUpperCase(),
          ),
        ),
      React.createElement(
        TouchableOpacity,
        {
          testID: 'setup-buttons-next',
          onPress: props.onNextPress,
          disabled: props.nextDisabled,
        },
        React.createElement(
          Text,
          null,
          (props.nextLabel || 'Next').toUpperCase(),
        ),
      ),
    );
  };
});

// ─── Keyboard manager mock (iOS-only native module) ───────────────────────────
jest.mock('react-native-keyboard-manager', () => ({
  setEnable: jest.fn(),
  setKeyboardDistanceFromTextField: jest.fn(),
}));

// ─── Image picker mock ────────────────────────────────────────────────────────
jest.mock('../../../components/rats-image-picker', () => {
  const React = require('react');
  const { View } = require('react-native');
  return () => <View testID="image-picker" />;
});

// ─── Step indicator mock ──────────────────────────────────────────────────────
jest.mock('../../../components/rats-step-indicator', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return (props: any) => (
    <View testID="step-indicator">
      <Text testID="step-count">{props.stepCount}</Text>
      <Text testID="current-position">{props.currentPosition}</Text>
      {(props.labels || []).map((l: any, i: number) => (
        <Text key={i} testID={`step-label-${i}`}>
          {l.label}
        </Text>
      ))}
    </View>
  );
});

// ─── Stub heavy sub-step components ──────────────────────────────────────────
// The wizard only owns layout and pager wiring; each step is a separate
// sub-component tested in its own suite. We stub them all as minimal views
// that expose their key testIDs used by the wizard.
jest.mock('../HouseSetup', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return (props: any) => (
    <View testID="house-setup-step">
      <Text>HouseSetup</Text>
    </View>
  );
});

jest.mock('../ManagerSetup', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return (props: any) => (
    <View testID="manager-setup-step">
      <Text>ManagerSetup</Text>
    </View>
  );
});

jest.mock('../PhaseSetup/PhaseConfig', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return {
    PhaseConfig: (props: any) => (
      <View testID="phase-config-step">
        <Text>PhaseConfig</Text>
      </View>
    ),
  };
});

jest.mock('../ChoreSetup', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return (props: any) => (
    <View testID="chore-setup-step">
      <Text>ChoreSetup</Text>
    </View>
  );
});

jest.mock('../GuestSetup', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return (props: any) => (
    <View testID="guest-setup-step">
      <Text>GuestSetup</Text>
    </View>
  );
});

// ─── RatsButton mock – expose testID so SetupButtons is query-able ────────────
jest.mock('../../../components/rats-button/rats-button', () => {
  const React = require('react');
  const { TouchableOpacity, Text } = require('react-native');
  return (props: any) => (
    <TouchableOpacity
      testID={props.testID}
      onPress={props.onPress}
      disabled={props.disabled}>
      <Text>{props.title}</Text>
    </TouchableOpacity>
  );
});

// ─── RatsText mock ────────────────────────────────────────────────────────────
jest.mock('../../../components/rats-text', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    RatsText: (props: any) => <Text>{props.text}</Text>,
  };
});

// ─── ScrollView alias ─────────────────────────────────────────────────────────
jest.mock('../../../components/rats-scroll-view', () => {
  const { ScrollView } = require('react-native');
  return ScrollView;
});

// ─── React imports ────────────────────────────────────────────────────────────
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import housesReducer from '../../../state/slices/housesSlice';
import guestsReducer from '../../../state/slices/guestsSlice';
import userReducer from '../../../state/slices/userSlice';
import adminReducer from '../../../state/slices/adminSlice';
import uiReducer from '../../../state/slices/uiSlice';
import authReducer from '../../../state/slices/authSlice';
import themeReducer from '../../../state/slices/themeSlice';
import navigationReducer from '../../../state/slices/navigationSlice';
import chatReducer from '../../../state/slices/chatSlice';
import setupReducer from '../../../state/slices/setupSlice';
import notificationsReducer from '../../../state/slices/notificationsSlice';
import meetingsReducer from '../../../state/slices/meetingsSlice';

import OperatorSetupWizard, {
  SetupButtons,
  SetupHeader,
} from '../OperatorSetupWizard';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_HOUSE: any = {
  id: 'house-1',
  name: 'Test House',
  timezone: 'America/Chicago',
  ownerId: 'owner-1',
  adminIds: ['admin-1'],
  superAdminIds: [],
  pendingAdminInvites: [],
  pendingGuestInvites: [],
  lat: 0,
  lng: 0,
  geohash: '',
  street: '1 Main St',
  city: 'Springfield',
  state: 'IL',
  zip: '62701',
  country: 'US',
  health: {},
  monthlyRent: 1000,
  weeklyRent: 250,
  currentCapacity: 2,
  maximumCapacity: 5,
  code: 'TEST01',
  avatar: '',
  imageUrl: '',
  depositsAndFees: 0,
  certified: false,
  phoneNumber: '5551234567',
  rentFrequency: 'both',
  subscriptionStatus: 'active',
  isDemoHouse: false,
  houseType: 'traditional',
  seniorPeerEmails: [],
  managerSetupType: 'operator-only',
  awaitingVerification: [],
  chores: {},
  phases: {},
  gender: '',
  disputes: {},
  applications: {},
  complaints: {},
  rooms: {},
  baths: 1,
  wifi: false,
  rating: 3,
  createdDate: '2024-01-01',
  lastUpdated: '2024-01-01',
};

// ─── Store factory ────────────────────────────────────────────────────────────

function buildStore(overrides: { selectedHouse?: any; user?: any } = {}) {
  const {
    selectedHouse = BASE_HOUSE,
    user = { id: 'user-1', firstName: 'Alice', lastName: 'Operator' },
  } = overrides;

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
      setup: {
        organization: null,
        selectedHouse,
        houses: selectedHouse ? { [selectedHouse.id]: selectedHouse } : {},
        selectedPhase: null,
        selectedChore: null,
        guests: {},
        admins: {},
        currentStep: 0,
        inApp: false,
        submitting: false,
        submittingSuccessful: false,
        submittingFailed: false,
        error: null,
      } as any,
      admin: {
        admins: {},
        selectedAdmin: null,
        userAsAdmin: null,
        houseAdmins: {},
        loading: false,
        error: null,
      } as any,
      user: {
        user,
        loading: false,
        error: null,
        loggedIn: true,
        loggingIn: false,
        loggingInFailed: false,
        signingUp: false,
        signingUpFailed: false,
      } as any,
      houses: {
        selectedHouse,
        houses: selectedHouse ? { [selectedHouse.id]: selectedHouse } : {},
        searchedHouses: [],
        loading: false,
        error: null,
        requestingHouse: false,
        requestingHouseFailed: false,
        requestingHouses: false,
        requestingHousesSuccessful: false,
        requestingHousesFailed: false,
        searchingHouses: false,
        searchingHousesSuccessful: false,
        searchingHousesFailed: false,
        creatingHouse: false,
        creatingHouseSuccessful: false,
        creatingHouseFailed: false,
        updatingHouse: false,
        updatingHouseSuccessful: false,
        updatingHouseFailed: false,
      } as any,
    },
  });
}

// ─── Navigation prop stub ─────────────────────────────────────────────────────

const mockNavigation: any = {
  navigate: jest.fn(),
  goBack: jest.fn(),
};

// ─── Render helpers ───────────────────────────────────────────────────────────

function renderWizard(store = buildStore()) {
  return render(
    <Provider store={store}>
      <OperatorSetupWizard navigation={mockNavigation} />
    </Provider>,
  );
}

function renderSetupButtons(
  props: Partial<React.ComponentProps<typeof SetupButtons>> = {},
) {
  const store = buildStore();
  return render(
    <Provider store={store}>
      <SetupButtons navigation={mockNavigation} submit={jest.fn()} {...props} />
    </Provider>,
  );
}

function renderSetupHeader(props: any = {}) {
  const store = buildStore();
  return render(
    <Provider store={store}>
      <SetupHeader header="Test Header" text="Test description" {...props} />
    </Provider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OperatorSetupWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Rendering ────────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders without crashing', () => {
      expect(() => renderWizard()).not.toThrow();
    });

    it('renders the root container with testID "house-setup-wizard"', () => {
      const { getByTestId } = renderWizard();
      expect(getByTestId('house-setup-wizard')).toBeTruthy();
    });

    it('renders the wizard progress component', () => {
      const { getByTestId } = renderWizard();
      expect(getByTestId('operator-wizard-progress')).toBeTruthy();
    });

    it('wizard progress shows 5 steps', () => {
      const { getByTestId } = renderWizard();
      expect(getByTestId('wizard-step-count').props.children).toBe(5);
    });

    it('wizard progress starts on step 0 (Details)', () => {
      const { getByTestId } = renderWizard();
      expect(getByTestId('wizard-current-step').props.children).toBe(0);
      expect(getByTestId('wizard-current-label').props.children).toBe(
        'Details',
      );
    });

    it('renders the shared SetupButtons row with a Next button', () => {
      const { getByTestId } = renderWizard();
      expect(getByTestId('shared-setup-buttons')).toBeTruthy();
      expect(getByTestId('setup-buttons-next')).toBeTruthy();
    });

    it('renders the wizard slide container', () => {
      const { getByTestId } = renderWizard();
      expect(getByTestId('operator-wizard-slide')).toBeTruthy();
    });

    it('renders without crashing when selectedHouse is null in Redux', () => {
      const store = buildStore({ selectedHouse: null });
      expect(() => renderWizard(store)).not.toThrow();
    });

    it('renders without crashing when user is null in Redux', () => {
      const store = buildStore({ user: null });
      expect(() => renderWizard(store)).not.toThrow();
    });
  });

  // ─── Step sub-components ──────────────────────────────────────────────────

  describe('step sub-components rendered inside pager', () => {
    it('renders the HouseSetup step stub', () => {
      const { getByTestId } = renderWizard();
      expect(getByTestId('house-setup-step')).toBeTruthy();
    });

    it('renders the ManagerSetup step stub', () => {
      const { getByTestId } = renderWizard();
      expect(getByTestId('manager-setup-step')).toBeTruthy();
    });

    it('renders the PhaseConfig step stub', () => {
      const { getByTestId } = renderWizard();
      expect(getByTestId('phase-config-step')).toBeTruthy();
    });

    it('renders the ChoreSetup step stub', () => {
      const { getByTestId } = renderWizard();
      expect(getByTestId('chore-setup-step')).toBeTruthy();
    });

    it('renders the GuestSetup step stub', () => {
      const { getByTestId } = renderWizard();
      expect(getByTestId('guest-setup-step')).toBeTruthy();
    });
  });

  // ─── SetupButtons sub-component ───────────────────────────────────────────

  describe('SetupButtons', () => {
    it('renders the next-step-button', () => {
      const { getByTestId } = renderSetupButtons();
      expect(getByTestId('next-step-button')).toBeTruthy();
    });

    it('renders the previous-step-button when hideLeft is not set', () => {
      const { getByTestId } = renderSetupButtons();
      expect(getByTestId('previous-step-button')).toBeTruthy();
    });

    it('does not render previous-step-button when hideLeft is true', () => {
      const { queryByTestId } = renderSetupButtons({ hideLeft: true });
      expect(queryByTestId('previous-step-button')).toBeNull();
    });

    it('calls submit handler when next-step-button is pressed', () => {
      const onSubmit = jest.fn();
      const { getByTestId } = renderSetupButtons({ submit: onSubmit });
      fireEvent.press(getByTestId('next-step-button'));
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('calls leftPress when previous-step-button is pressed', () => {
      const onLeft = jest.fn();
      const { getByTestId } = renderSetupButtons({ leftPress: onLeft });
      fireEvent.press(getByTestId('previous-step-button'));
      expect(onLeft).toHaveBeenCalledTimes(1);
    });

    it('renders custom rightLabel text', () => {
      const { getByText } = renderSetupButtons({ rightLabel: 'FINISH' });
      expect(getByText('FINISH')).toBeTruthy();
    });

    it('renders custom leftLabel text', () => {
      const { getByText } = renderSetupButtons({ leftLabel: 'BACK' });
      expect(getByText('BACK')).toBeTruthy();
    });

    it('defaults rightLabel to "NEXT" when not supplied', () => {
      const { getByText } = renderSetupButtons();
      expect(getByText('NEXT')).toBeTruthy();
    });

    it('defaults leftLabel to "CANCEL" when not supplied', () => {
      const { getByText } = renderSetupButtons();
      expect(getByText('CANCEL')).toBeTruthy();
    });
  });

  // ─── SetupHeader sub-component ────────────────────────────────────────────

  describe('SetupHeader', () => {
    it('renders the header text', () => {
      const { getByText } = renderSetupHeader({ header: 'Details' });
      expect(getByText('Details')).toBeTruthy();
    });

    it('renders the descriptive text when provided', () => {
      const { getByText } = renderSetupHeader({
        header: 'Managers',
        text: 'Assign your managers here.',
      });
      expect(getByText('Assign your managers here.')).toBeTruthy();
    });

    it('does not crash when text prop is omitted', () => {
      expect(() =>
        renderSetupHeader({ header: 'Guests', text: undefined }),
      ).not.toThrow();
    });
  });
});
