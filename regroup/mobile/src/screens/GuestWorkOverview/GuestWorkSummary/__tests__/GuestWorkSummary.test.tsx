/**
 * GuestWorkSummary Tests
 *
 * Covers:
 *   - Renders correctly with stat data from useStatSummary
 *   - Shows the Work stat card header
 *   - Bar graph renders with historical data
 *   - Loading state renders RatsLoadingIndicator (testID absent)
 *   - Add Hours and Add Job action buttons render
 *   - Add Hours button is disabled until a job is selected
 *   - showFormModal called with correct title on Add Job press
 *   - showFormModal called with job info on Add Hours press (after job selected)
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
    step: 2,
    jobs: [
      {
        employer: 'Acme Corp',
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zip: '62701',
        type: 'full-time',
      },
    ],
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
  statSum: 18,
  phaseRule: 20,
  percentage: 90,
  disputes: 0,
  daysRemaining: 2,
  graphData: [
    { x: '01/01', y: 20 },
    { x: '01/08', y: 15 },
    { x: '01/15', y: 18 },
  ],
  getBarFillColor: mockGetBarFillColor,
  isLoading: false,
  reports: [],
};

jest.mock('../../../../hooks/useStatSummary', () => ({
  useStatSummary: jest.fn(() => defaultStatSummary),
}));

// ─── Guest util ───────────────────────────────────────────────────────────────
jest.mock('../../../../util/guest', () => ({
  getPhaseRule: jest.fn(() => 20),
  getPhaseRuleForStat: jest.fn(() => 20),
  getPercentage: jest.fn((val: number, rule: number) =>
    rule > 0 ? Math.round((val / rule) * 100) : 0,
  ),
  getHealthByPercentage: jest.fn(() => 'good'),
  HEALTH_COLOR_MAP: { good: '#009A39', fair: '#ffbf00', poor: '#bb0000' },
  renderGuestJobs: jest.fn(() => null),
  renderWorkHoursInput: jest.fn(() => null),
}));

// ─── Display util ─────────────────────────────────────────────────────────────
jest.mock('../../../../util/display', () => ({
  getCurrentTime: jest.fn(() => '2024-01-01T00:00:00.000Z'),
  getDateAndTime: jest.fn(() => 'Jan 1, 2024'),
  camelCaseToDisplayForm: jest.fn((s: string) => s),
  getTodaysDate: jest.fn(() => '2024-01-01'),
  daysLeft: jest.fn(() => 2),
  getPickerItems: jest.fn(() => []),
  STAT_MAP: {
    medication: { label: 'Medication', icon: 'pills' },
    meeting: { label: 'Meetings', icon: 'users' },
    metPrimarySupporter: { label: 'Sponsor', icon: 'user' },
    hoursWorked: { label: 'Work', icon: 'briefcase' },
    choreCompleted: { label: 'Chores', icon: 'home' },
  },
}));

// ─── Address util ─────────────────────────────────────────────────────────────
jest.mock('../../../../util/address', () => ({
  getAddressDisplay: jest.fn((...args: string[]) =>
    args.filter(Boolean).join(', '),
  ),
}));

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock('@react-navigation/native-stack', () => ({}));

// ─── Formik / picker / input mocks ───────────────────────────────────────────
jest.mock('formik', () => ({
  Field: ({ component: Component, ...props }: any) => <Component {...props} />,
}));

jest.mock('../../../../components/rats-picker/rats-picker', () => 'RatsPicker');
jest.mock(
  '../../../../components/rats-text-input/rats-text-input',
  () => 'RatsTextInput',
);

// ─── Job entity mock ──────────────────────────────────────────────────────────
jest.mock('../../../../entities/Job', () => {
  class Job {
    employer = '';
    street = '';
    city = '';
    state = '';
    zip = '';
    type = '';
  }
  return {
    __esModule: true,
    default: Job,
    jobItems: { 'full-time': 'Full Time', 'part-time': 'Part Time' },
  };
});

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
import GuestWorkSummary from '../GuestWorkSummary';

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
      <GuestWorkSummary navigation={mockNavigation} />
    </Provider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('GuestWorkSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useStatSummary as jest.Mock).mockReturnValue(defaultStatSummary);
  });

  describe('Rendering', () => {
    it('renders without crashing', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('work-summary-screen')).toBeTruthy();
    });

    it('calls useStatSummary with the hoursWorked stat key', () => {
      renderScreen();
      expect(useStatSummary).toHaveBeenCalledWith('hoursWorked');
    });

    it('renders the Work card header', () => {
      const { getByText } = renderScreen();
      expect(getByText('Work')).toBeTruthy();
    });

    it('renders nothing for the stat card when guest is null', () => {
      (useStatSummary as jest.Mock).mockReturnValue({
        ...defaultStatSummary,
        guest: null,
      });
      const { queryByText } = renderScreen();
      expect(queryByText('Work')).toBeNull();
    });

    it('renders nothing for the stat card when house is null', () => {
      (useStatSummary as jest.Mock).mockReturnValue({
        ...defaultStatSummary,
        house: null,
      });
      const { queryByText } = renderScreen();
      expect(queryByText('Work')).toBeNull();
    });
  });

  describe('Stat Data', () => {
    it('renders the hours worked vs required', () => {
      const { getByText } = renderScreen();
      // StatSummaryScreen WeekDetails renders "statSum of phaseRule"
      expect(getByText('18 of 20')).toBeTruthy();
    });

    it('renders disputes count when greater than 0', () => {
      (useStatSummary as jest.Mock).mockReturnValue({
        ...defaultStatSummary,
        disputes: 3,
      });
      const { getByText } = renderScreen();
      expect(getByText('3')).toBeTruthy();
    });

    it('renders the days remaining', () => {
      const { getByText } = renderScreen();
      expect(getByText('2')).toBeTruthy();
    });
  });

  describe('Action Buttons', () => {
    it('renders the Add Hours button', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('add-hours-button')).toBeTruthy();
    });

    it('renders the Add Job button', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('add-job-button')).toBeTruthy();
    });

    it('does not call showFormModal for Add Hours when no job is selected (disabled)', () => {
      // Add Hours button is disabled (selectedJob === null) — pressing a
      // disabled RatsButton should not fire the handler.
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId('add-hours-button'));
      expect(mockShowFormModal).not.toHaveBeenCalled();
    });

    it('calls showFormModal with add.new.job title when Add Job is pressed', () => {
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId('add-job-button'));
      expect(mockShowFormModal).toHaveBeenCalledWith(
        expect.anything(),
        'add.new.job',
        true,
      );
    });

    it('does not open add-job modal when guest is null', () => {
      (useStatSummary as jest.Mock).mockReturnValue({
        ...defaultStatSummary,
        guest: null,
      });
      // stat card not rendered; buttons absent
      const { queryByTestId } = renderScreen();
      expect(queryByTestId('add-job-button')).toBeNull();
      expect(mockShowFormModal).not.toHaveBeenCalled();
    });
  });

  describe('Bar Graph', () => {
    it('renders the bar graph section header', () => {
      const { getByText } = renderScreen();
      expect(getByText('LAST TWO MONTHS')).toBeTruthy();
    });

    it('does not render the main screen when isLoading is true and graphData is empty', () => {
      (useStatSummary as jest.Mock).mockReturnValue({
        ...defaultStatSummary,
        isLoading: true,
        graphData: [],
      });
      const { queryByTestId } = renderScreen();
      expect(queryByTestId('work-summary-screen')).toBeNull();
    });
  });
});
