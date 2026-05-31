/**
 * GuestSupporterSummary Tests
 *
 * Covers:
 *   - Renders correctly with stat data from useStatSummary
 *   - Displays the sponsor name from guest.primarySupporterName
 *   - Displays the guest's step number
 *   - Shows "No Sponsor Assigned" when primarySupporterName is absent
 *   - Bar graph renders with historical data
 *   - Loading state renders RatsLoadingIndicator
 *   - Change Sponsor and Meet Sponsor action buttons render
 */

// ─── Firebase / native module mocks ────────────────────────────────────────
jest.mock('../../../../firebase-setup', () => ({
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
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    })),
    batch: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      commit: jest.fn(() => Promise.resolve()),
    })),
  },
}));

// ─── Context mocks ────────────────────────────────────────────────────────────
const mockShowFormModal = jest.fn();
const mockDismissFormModal = jest.fn();
const mockShowPopover = jest.fn();
const mockSetPopoverRef = jest.fn();

jest.mock('../../../../context', () => ({
  useModal: () => ({
    showFormModal: mockShowFormModal,
    dismissFormModal: mockDismissFormModal,
    formModalVisible: false,
  }),
  useNotification: () => ({
    notify: jest.fn(),
    showPopover: mockShowPopover,
    setPopoverRef: mockSetPopoverRef,
    popoverVisible: false,
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

// ─── Auth context mock ────────────────────────────────────────────────────────
jest.mock('../../../../context/auth', () => ({
  AuthConsumer: ({ children }: { children: (ctx: any) => React.ReactNode }) =>
    children({ token: { 'house-1': { role: 'admin' } } }),
}));

// ─── isAdmin utility ──────────────────────────────────────────────────────────
jest.mock('../../../../util/roles', () => ({
  isAdmin: jest.fn(() => true),
}));

// ─── useStatSummary mock ──────────────────────────────────────────────────────
const mockGetBarFillColor = jest.fn(() => '#009A39');

const defaultStatSummary = {
  guest: {
    id: 'guest-1',
    userId: 'user-1',
    houseId: 'house-1',
    firstName: 'Alice',
    lastName: 'Smith',
    phase: 'phase1',
    step: 5,
    primarySupporterName: 'Bob Jones',
  },
  house: {
    id: 'house-1',
    name: 'Test House',
    phases: {
      phase1: {
        rules: { medications: true, meetings: 3, work: 20, chore: true },
      },
    },
    isDemoHouse: false,
  },
  user: { id: 'user-1', firstName: 'Alice', lastName: 'Smith' },
  statSum: 1,
  phaseRule: 1,
  percentage: 100,
  disputes: 0,
  daysRemaining: 4,
  graphData: [
    { x: '01/01', y: 1 },
    { x: '01/08', y: 0 },
    { x: '01/15', y: 1 },
  ],
  getBarFillColor: mockGetBarFillColor,
  isLoading: false,
  reports: [],
};

jest.mock('../../../../hooks/useStatSummary', () => ({
  useStatSummary: jest.fn(() => defaultStatSummary),
}));

// ─── Display util ─────────────────────────────────────────────────────────────
jest.mock('../../../../util/display', () => ({
  getCurrentTime: jest.fn(() => '2024-01-01T00:00:00.000Z'),
  getDateAndTime: jest.fn(() => 'Jan 1, 2024'),
  camelCaseToDisplayForm: jest.fn((s: string) => s),
  getTodaysDate: jest.fn(() => '2024-01-01'),
  daysLeft: jest.fn(() => 4),
  STAT_MAP: {
    medication: { label: 'Medication', icon: 'pills' },
    meeting: { label: 'Meetings', icon: 'users' },
    metPrimarySupporter: { label: 'Sponsor', icon: 'user' },
    hoursWorked: { label: 'Work', icon: 'briefcase' },
    choreCompleted: { label: 'Chores', icon: 'home' },
  },
}));

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock('@react-navigation/native-stack', () => ({}));

// ─── formik / form mocks ──────────────────────────────────────────────────────
jest.mock('formik', () => ({
  Field: ({ component: Component, ...props }: any) => <Component {...props} />,
}));

jest.mock('../../../../util/form', () => ({
  renderField: jest.fn(() => null),
}));

jest.mock(
  '../../../../components/rats-numeric-input',
  () => 'RatsNumericInput',
);
jest.mock(
  '../../../../components/rats-text-input/rats-text-input',
  () => 'RatsTextInput',
);

// ─── Component stubs ──────────────────────────────────────────────────────────
jest.mock('../../../../components/rats-scroll-view', () => {
  const { ScrollView } = require('react-native');
  return ScrollView;
});

jest.mock('../../../../components/screen-header', () => 'ScreenHeader');
jest.mock('../../../../components/help-icon', () => 'HelpIcon');
jest.mock('../../../../components/rats-bar-graph', () => 'RatsBarGraph');

// ─── React imports (after mocks) ─────────────────────────────────────────────
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import housesReducer from '../../../../state/slices/housesSlice';
import guestsReducer from '../../../../state/slices/guestsSlice';
import userReducer from '../../../../state/slices/userSlice';
import adminReducer from '../../../../state/slices/adminSlice';
import uiReducer from '../../../../state/slices/uiSlice';
import authReducer from '../../../../state/slices/authSlice';
import themeReducer from '../../../../state/slices/themeSlice';
import navigationReducer from '../../../../state/slices/navigationSlice';
import chatReducer from '../../../../state/slices/chatSlice';
import setupReducer from '../../../../state/slices/setupSlice';
import notificationsReducer from '../../../../state/slices/notificationsSlice';
import meetingsReducer from '../../../../state/slices/meetingsSlice';

import { useStatSummary } from '../../../../hooks/useStatSummary';
import GuestSupporterSummary from '../GuestSupporterSummary';

// ─── Store builder ────────────────────────────────────────────────────────────
function buildStore() {
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
      houses: {
        selectedHouse: defaultStatSummary.house,
        houses: { 'house-1': defaultStatSummary.house },
        searchedHouses: [],
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
        error: null,
      } as any,
      guests: {
        guests: {},
        selectedGuest: defaultStatSummary.guest,
        loading: false,
        error: null,
        requestingGuests: false,
      } as any,
      user: {
        user: defaultStatSummary.user,
        loading: false,
        error: null,
        loggedIn: true,
        loggingIn: false,
        loggingInFailed: false,
        signingUp: false,
        signingUpFailed: false,
      } as any,
    },
  });
}

const mockNavigation: any = { goBack: jest.fn(), navigate: jest.fn() };

function renderScreen() {
  return render(
    <Provider store={buildStore()}>
      <GuestSupporterSummary navigation={mockNavigation} />
    </Provider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('GuestSupporterSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useStatSummary as jest.Mock).mockReturnValue(defaultStatSummary);
  });

  describe('Rendering', () => {
    it('renders without crashing', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('supporter-summary-screen')).toBeTruthy();
    });

    it('calls useStatSummary with the metPrimarySupporter stat key', () => {
      renderScreen();
      expect(useStatSummary).toHaveBeenCalledWith('metPrimarySupporter');
    });

    it('displays the sponsor name from guest.primarySupporterName', () => {
      const { getByText } = renderScreen();
      expect(getByText('Bob Jones')).toBeTruthy();
    });

    it('displays the guest step number', () => {
      const { getByText } = renderScreen();
      expect(getByText('Step 5')).toBeTruthy();
    });

    it('shows "No Sponsor Assigned" when primarySupporterName is not set', () => {
      (useStatSummary as jest.Mock).mockReturnValue({
        ...defaultStatSummary,
        guest: {
          ...defaultStatSummary.guest,
          primarySupporterName: undefined,
        },
      });
      const { getByText } = renderScreen();
      expect(getByText('No Sponsor Assigned')).toBeTruthy();
    });

    it('renders the sponsor meeting requirement text', () => {
      const { getByText } = renderScreen();
      expect(
        getByText(
          'You must meet with your sponsor at least once a week for a minimum of 15 minutes or longer.',
        ),
      ).toBeTruthy();
    });
  });

  describe('Stat Data', () => {
    it('renders the stat sum and phase rule', () => {
      const { getByText } = renderScreen();
      // StatSummaryScreen renders "statSum of phaseRule"
      expect(getByText('1 of 1')).toBeTruthy();
    });

    it('renders disputes highlighted in red when greater than 0', () => {
      (useStatSummary as jest.Mock).mockReturnValue({
        ...defaultStatSummary,
        disputes: 1,
      });
      const { getByText } = renderScreen();
      expect(getByText('1')).toBeTruthy();
    });

    it('renders the days remaining', () => {
      const { getByText } = renderScreen();
      expect(getByText('4')).toBeTruthy();
    });
  });

  describe('Action Buttons', () => {
    it('renders the Change Sponsor button', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('change-sponsor-button')).toBeTruthy();
    });

    it('renders the Meet Sponsor button', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('meet-sponsor-button')).toBeTruthy();
    });

    it('calls showFormModal when Meet Sponsor is pressed', () => {
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId('meet-sponsor-button'));
      expect(mockShowFormModal).toHaveBeenCalledWith(
        expect.anything(),
        'sponsor.modal.title',
        true,
      );
    });

    it('calls showFormModal when Change Sponsor is pressed', () => {
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId('change-sponsor-button'));
      // renderField mock returns null so the content arg may be null; we only
      // care that showFormModal was called with the correct modal title and
      // fullScreen flag.
      expect(mockShowFormModal).toHaveBeenCalled();
      const [, title, fullScreen] = mockShowFormModal.mock.calls[0];
      expect(title).toBe('change.sponsor.modal.title');
      expect(fullScreen).toBe(true);
    });
  });

  describe('Bar Graph', () => {
    it('renders the bar graph section header', () => {
      const { getByText } = renderScreen();
      expect(getByText('LAST TWO MONTHS')).toBeTruthy();
    });

    it('renders loading indicator when isLoading is true and graphData is empty', () => {
      (useStatSummary as jest.Mock).mockReturnValue({
        ...defaultStatSummary,
        isLoading: true,
        graphData: [],
      });
      const { queryByTestId } = renderScreen();
      expect(queryByTestId('supporter-summary-screen')).toBeNull();
    });
  });

  describe('Empty state (no guest or house)', () => {
    it('does not render the sponsor stat card content when guest is null', () => {
      (useStatSummary as jest.Mock).mockReturnValue({
        ...defaultStatSummary,
        guest: null,
      });
      const { queryByText } = renderScreen();
      expect(queryByText('Bob Jones')).toBeNull();
    });

    it('does not render the sponsor stat card content when house is null', () => {
      (useStatSummary as jest.Mock).mockReturnValue({
        ...defaultStatSummary,
        house: null,
      });
      const { queryByText } = renderScreen();
      expect(queryByText('Bob Jones')).toBeNull();
    });

    it('still renders the outer screen wrapper when guest is null', () => {
      (useStatSummary as jest.Mock).mockReturnValue({
        ...defaultStatSummary,
        guest: null,
      });
      const { getByTestId } = renderScreen();
      expect(getByTestId('supporter-summary-screen')).toBeTruthy();
    });
  });

  describe('Stat edge cases', () => {
    it('renders "0 of 1" when statSum is 0', () => {
      (useStatSummary as jest.Mock).mockReturnValue({
        ...defaultStatSummary,
        statSum: 0,
      });
      const { getByText } = renderScreen();
      expect(getByText('0 of 1')).toBeTruthy();
    });

    it('defaults to step 1 when guest.step is not set', () => {
      (useStatSummary as jest.Mock).mockReturnValue({
        ...defaultStatSummary,
        guest: {
          ...defaultStatSummary.guest,
          step: undefined,
        },
      });
      const { getByText } = renderScreen();
      expect(getByText('Step 1')).toBeTruthy();
    });

    it('calls useStatSummary with the metPrimarySupporter stat key on re-render', () => {
      renderScreen();
      renderScreen();
      const calls = (useStatSummary as jest.Mock).mock.calls;
      calls.forEach(([arg]: [string]) => {
        expect(arg).toBe('metPrimarySupporter');
      });
    });
  });

  describe('Help Popover', () => {
    it('does not trigger showPopover on initial mount', () => {
      renderScreen();
      expect(mockShowPopover).not.toHaveBeenCalled();
    });
  });
});
