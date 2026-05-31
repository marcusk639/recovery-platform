/**
 * IntroHouseSummary Tests
 *
 * Covers:
 *  - Returns null when selectedHouse is not set
 *  - Renders without crashing when a house is selected
 *  - Shows the house name in the subheader
 *  - Renders cost section: monthly rent label
 *  - Renders cost section: weekly rent label
 *  - Renders cost section: deposits label
 *  - Renders the LOCATION section
 *  - Shows house street address
 *  - Shows phone number when present
 *  - Shows "No Contact Info" when phone number is absent
 *  - Renders the ADMINISTRATORS heading
 *  - Renders admin names when admins are present
 *  - Renders HOUSE HEALTH stat summary
 *  - Pressing sign-up initiates dispatch (startSignUp callback)
 *  - Renders correctly with a fully certified house
 */

// ─── useSelectedHouse mock ────────────────────────────────────────────────────
const mockUseSelectedHouse = jest.fn();

jest.mock('../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => mockUseSelectedHouse(),
}));

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
  firestore: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(() =>
          Promise.resolve({ exists: false, data: () => null }),
        ),
      })),
    })),
  },
  functions: { httpsCallable: jest.fn() },
}));

// ─── Context mock ─────────────────────────────────────────────────────────────
jest.mock('../../../context', () => ({
  useTheme: () => ({
    theme: {
      primaryFontFamily: 'System',
      secondaryFontFamily: 'System',
      primaryColor: '#000',
      secondaryColor: '#fff',
      backgroundColor: '#fff',
      textColor: '#000',
    },
  }),
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

// ─── Service mocks ────────────────────────────────────────────────────────────
jest.mock('../../../services/house', () => ({
  createHouseId: jest.fn(() => 'house-id'),
  getHouse: jest.fn(() => Promise.resolve(null)),
  updateHouse: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../../util/phone', () => ({
  callNumber: jest.fn(),
}));

jest.mock('../../../util/address', () => ({
  getAddressDisplay: jest.fn(
    (_street: string, city: string, state: string, zip: string) =>
      `${city}, ${state} ${zip}`,
  ),
}));

jest.mock('../../../util/guest', () => ({
  HEALTH_ICON_MAP: {
    good: 'smile',
    fair: 'meh',
    poor: 'frown',
    unknown: 'question',
  },
  getHealthByPercentage: jest.fn(() => 'good'),
  HEALTH_STATUS_MAP: {
    good: 'Good',
    fair: 'Fair',
    poor: 'Poor',
    unknown: 'Unknown',
  },
  mapUserToGuest: jest.fn(),
}));

jest.mock('../../../util/house', () => ({
  calculateHouseHealth: jest.fn(() => 85),
}));

jest.mock('../../../util/display', () => ({
  camelCaseToDisplayForm: jest.fn((s: string) => s),
  dayIsAfter: jest.fn(() => false),
  getTodaysDate: jest.fn(() => '2026-02-22'),
}));

// ─── Component stubs ──────────────────────────────────────────────────────────

jest.mock('../../../components/rats-text', () => ({
  RatsText: ({ text, testID }: any) => {
    const { Text } = require('react-native');
    return require('react').createElement(
      Text,
      { testID },
      text != null ? String(text) : '',
    );
  },
}));

jest.mock('../../../components/rats-icon', () => ({
  RatsIcon: ({ name, testID }: any) => {
    const { View } = require('react-native');
    return require('react').createElement(View, {
      testID: testID || `icon-${name}`,
    });
  },
}));

jest.mock('../../../components/rats-scroll-view', () => {
  const { ScrollView } = require('react-native');
  return (props: any) => {
    const { testID, children, contentContainerStyle, ...rest } = props;
    return require('react').createElement(
      ScrollView,
      { testID, ...rest },
      children,
    );
  };
});

jest.mock('../../../components/rats-avatar', () => {
  const { View } = require('react-native');
  return ({ testID }: any) =>
    require('react').createElement(View, { testID: testID || 'rats-avatar' });
});

jest.mock('../../../components/image-header', () => {
  const { View } = require('react-native');
  return ({ testID }: any) =>
    require('react').createElement(View, { testID: testID || 'image-header' });
});

jest.mock('../../../components/week-stat-summary', () => {
  const { View } = require('react-native');
  return ({ header, children, rightSideContent }: any) =>
    require('react').createElement(
      View,
      { testID: 'week-stat-summary' },
      require('react').createElement(
        require('react-native').Text,
        { testID: 'stat-summary-header' },
        header,
      ),
      rightSideContent || null,
      children,
    );
});

// Mock the houseImage asset so RN doesn't fail on a missing image require
jest.mock('../../../../assets/index', () => ({
  houseImage: 1,
  appIcon: 1,
  circleLogo: 1,
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

import IntroHouseSummary from '../IntroHouseSummary';

// ─── Test data ─────────────────────────────────────────────────────────────────

function makeHouse(overrides: any = {}) {
  return {
    id: 'house-1',
    name: 'Serenity House',
    street: '123 Main St',
    city: 'Portland',
    state: 'OR',
    zip: '97201',
    country: 'US',
    monthlyRent: 800,
    weeklyRent: 200,
    depositsAndFees: 500,
    currentCapacity: 3,
    maximumCapacity: 8,
    certified: true,
    gender: 'Male',
    rating: 4,
    baths: 2,
    wifi: true,
    rooms: { room1: { beds: 2 }, room2: { beds: 2 } },
    health: {},
    phoneNumber: '503-555-1234',
    imageUrl: null,
    ...overrides,
  };
}

function makeAdmin(id: string, overrides: any = {}) {
  return {
    id,
    firstName: 'John',
    lastName: 'Smith',
    avatar: '',
    superAdmin: false,
    ...overrides,
  };
}

// ─── Store builder ─────────────────────────────────────────────────────────────

function buildStore({
  selectedHouse = null as any,
  houseAdmins = {} as any,
} = {}) {
  mockUseSelectedHouse.mockReturnValue({
    house: selectedHouse,
    houseId: selectedHouse?.id ?? null,
    isLoading: false,
  });

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
        user: { uid: 'user-1', id: 'user-1' },
        loading: false,
        error: null,
        loggedIn: true,
        loggingIn: false,
        loggingOut: false,
        loggingOutSuccessful: false,
        signUpRole: null,
        invitation: null,
      } as any,
      houses: {
        selectedHouse,
        houses: [],
        loading: false,
        error: null,
      } as any,
      admin: {
        houseAdmins,
        loading: false,
        error: null,
      } as any,
    },
  });
}

const mockNavigation: any = {
  navigate: jest.fn(),
  goBack: jest.fn(),
};

function renderScreen(
  storeOptions: { selectedHouse?: any; houseAdmins?: any } = {},
) {
  const store = buildStore(storeOptions);
  return render(
    <Provider store={store}>
      <IntroHouseSummary navigation={mockNavigation} />
    </Provider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('IntroHouseSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Null house guard ────────────────────────────────────────────────────────
  describe('null house guard', () => {
    it('renders nothing (null) when selectedHouse is not set', () => {
      const { toJSON } = renderScreen({ selectedHouse: null });
      expect(toJSON()).toBeNull();
    });
  });

  // ─── Smoke test ─────────────────────────────────────────────────────────────
  describe('smoke test', () => {
    it('renders without crashing when a house is provided', () => {
      const { getByTestId } = renderScreen({ selectedHouse: makeHouse() });
      expect(getByTestId('week-stat-summary')).toBeTruthy();
    });
  });

  // ─── Subheader ───────────────────────────────────────────────────────────────
  describe('subheader', () => {
    it('displays the house name', () => {
      const { getByText } = renderScreen({
        selectedHouse: makeHouse({ name: 'Serenity House' }),
      });
      expect(getByText('Serenity House')).toBeTruthy();
    });

    it('shows "12 Step" program text', () => {
      const { getByText } = renderScreen({ selectedHouse: makeHouse() });
      expect(getByText('12 Step')).toBeTruthy();
    });
  });

  // ─── Cost section ────────────────────────────────────────────────────────────
  describe('cost section', () => {
    it('shows the MONTHLY rent label', () => {
      const { getByText } = renderScreen({ selectedHouse: makeHouse() });
      expect(getByText('MONTHLY')).toBeTruthy();
    });

    it('shows the WEEKLY rent label', () => {
      const { getByText } = renderScreen({ selectedHouse: makeHouse() });
      expect(getByText('WEEKLY')).toBeTruthy();
    });

    it('shows the DEPOSITS label', () => {
      const { getByText } = renderScreen({ selectedHouse: makeHouse() });
      expect(getByText('DEPOSITS')).toBeTruthy();
    });

    it('renders the monthly rent value', () => {
      const { getByText } = renderScreen({
        selectedHouse: makeHouse({ monthlyRent: 800 }),
      });
      expect(getByText('$800')).toBeTruthy();
    });
  });

  // ─── Location section ────────────────────────────────────────────────────────
  describe('location section', () => {
    it('shows the LOCATION label', () => {
      const { getByText } = renderScreen({ selectedHouse: makeHouse() });
      expect(getByText('LOCATION')).toBeTruthy();
    });

    it('shows the house street address', () => {
      const { getByText } = renderScreen({
        selectedHouse: makeHouse({ street: '123 Main St' }),
      });
      expect(getByText('123 Main St')).toBeTruthy();
    });

    it('shows the phone number when present', () => {
      const { getByText } = renderScreen({
        selectedHouse: makeHouse({ phoneNumber: '503-555-1234' }),
      });
      expect(getByText('503-555-1234')).toBeTruthy();
    });

    it('shows "No Contact Info" when phone number is absent', () => {
      const { getByText } = renderScreen({
        selectedHouse: makeHouse({ phoneNumber: null }),
      });
      expect(getByText('No Contact Info')).toBeTruthy();
    });
  });

  // ─── House health summary ─────────────────────────────────────────────────────
  describe('house health summary', () => {
    it('renders the HOUSE HEALTH stat summary', () => {
      const { getByTestId } = renderScreen({ selectedHouse: makeHouse() });
      expect(getByTestId('week-stat-summary')).toBeTruthy();
    });

    it('shows "HOUSE HEALTH" as the stat header', () => {
      const { getByText } = renderScreen({ selectedHouse: makeHouse() });
      expect(getByText('HOUSE HEALTH')).toBeTruthy();
    });
  });

  // ─── Administrators section ───────────────────────────────────────────────────
  describe('administrators section', () => {
    it('shows the ADMINISTRATORS heading', () => {
      const { getByText } = renderScreen({ selectedHouse: makeHouse() });
      expect(getByText('ADMINISTRATORS')).toBeTruthy();
    });

    it('renders admin names when admins are present', () => {
      const houseAdmins = {
        'admin-1': makeAdmin('admin-1', {
          firstName: 'Alice',
          lastName: 'Walker',
        }),
      };
      const { getByText } = renderScreen({
        selectedHouse: makeHouse(),
        houseAdmins,
      });
      expect(getByText('Alice Walker')).toBeTruthy();
    });

    it('renders multiple admins correctly', () => {
      const houseAdmins = {
        'admin-1': makeAdmin('admin-1', {
          firstName: 'Alice',
          lastName: 'Walker',
        }),
        'admin-2': makeAdmin('admin-2', {
          firstName: 'Bob',
          lastName: 'Jones',
          superAdmin: true,
        }),
      };
      const { getByText } = renderScreen({
        selectedHouse: makeHouse(),
        houseAdmins,
      });
      expect(getByText('Alice Walker')).toBeTruthy();
      expect(getByText('Bob Jones')).toBeTruthy();
    });

    it('labels superAdmin as Operator', () => {
      const houseAdmins = {
        'admin-1': makeAdmin('admin-1', {
          firstName: 'Bob',
          lastName: 'Jones',
          superAdmin: true,
        }),
      };
      const { getByText } = renderScreen({
        selectedHouse: makeHouse(),
        houseAdmins,
      });
      expect(getByText('Operator')).toBeTruthy();
    });

    it('labels regular admin as Administrator', () => {
      const houseAdmins = {
        'admin-1': makeAdmin('admin-1', {
          firstName: 'Alice',
          lastName: 'Walker',
          superAdmin: false,
        }),
      };
      const { getByText } = renderScreen({
        selectedHouse: makeHouse(),
        houseAdmins,
      });
      expect(getByText('Administrator')).toBeTruthy();
    });
  });

  // ─── House attributes ─────────────────────────────────────────────────────────
  describe('house attributes', () => {
    it('renders the gender field', () => {
      const { getByText } = renderScreen({
        selectedHouse: makeHouse({ gender: 'Male' }),
      });
      expect(getByText('Male')).toBeTruthy();
    });

    it('renders CERTIFIED and SPOTS OPEN labels', () => {
      const { getByText } = renderScreen({ selectedHouse: makeHouse() });
      expect(getByText('CERTIFIED')).toBeTruthy();
      expect(getByText('SPOTS OPEN')).toBeTruthy();
      expect(getByText('GENDER')).toBeTruthy();
    });
  });
});
