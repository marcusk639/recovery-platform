/**
 * BaseActivityScreen Tests
 *
 * Tests the getActivityDescription pure helper which resolves a human-readable
 * description from an Activity's typed data union.
 */

// ─── Mocks required to import BaseActivityScreen.tsx ─────────────────────────

jest.mock('@react-navigation/native-stack', () => ({}));

jest.mock('react-native', () => ({
  StyleSheet: { create: (s: any) => s },
  Platform: { OS: 'ios', select: (o: any) => o.ios },
  Dimensions: { get: () => ({ width: 375, height: 812 }) },
  View: 'View',
  Text: 'Text',
  ScrollView: 'ScrollView',
  FlatList: 'FlatList',
  TouchableOpacity: 'TouchableOpacity',
}));

jest.mock('react-native-size-matters', () => ({
  moderateScale: (n: number) => n,
}));

jest.mock('@callstack/react-theme-provider', () => ({
  createTheming: () => ({
    ThemeProvider: 'ThemeProvider',
    withTheme: (c: any) => c,
    useTheme: jest.fn(),
  }),
}));

jest.mock('../../../styles/theme', () => ({
  normalize: (n: number) => n,
  CARD_STYLE: {},
  MODAL_STYLE: {},
  MODAL_CONTAINER_STYLE: {},
  STAT_BUTTON: {},
  STAT_BUTTON_TEXT: {},
  color: { green: '#0f0', red: '#f00', baby_blue: '#adf', white: '#fff', dark_grey: '#333' },
  fontSize: { regular: 14 },
  fontFamily: { bold: 'bold', roboto: 'Roboto' },
}));

jest.mock('../../../util/display', () => ({
  STAT_MAP: {},
  getDateAndTime: jest.fn((v: any) => String(v)),
}));

jest.mock('../../../components/card-list/card-list', () => ({
  CardItem: 'CardItem',
  ActivityItem: 'ActivityItem',
}));

jest.mock('../../../context/auth', () => ({
  AuthConsumer: ({ children }: any) => children({ token: { role: {} } }),
}));

jest.mock('../../../components/rats-flat-list', () => ({
  RatsFlatList: 'FlatList',
}));

jest.mock('../../../components/rats-search-bar', () => 'RatsSearchBar');
jest.mock('../../../components/rats-modal', () => 'RatsModal');
jest.mock('../../../components/rats-scroll-view', () => 'ScrollView');
jest.mock('../../../components/screen-header', () => 'ScreenHeader');
jest.mock('../../../components/rats-text-input/rats-text-input', () => 'RatsTextInput');
jest.mock('../../../components/rats-text', () => ({ RatsText: 'RatsText' }));
jest.mock('../../../components/rats-button/rats-button', () => 'RatsButton');
jest.mock('../../../components/auth/auth', () => ({}));

jest.mock('../../../util/house', () => ({
  getDisputesForActivity: jest.fn(() => []),
  getChallengesFromDisputes: jest.fn(() => []),
}));

jest.mock('../../../util/roles', () => ({
  isAdmin: jest.fn(() => false),
}));

jest.mock('../../../util/form', () => ({
  renderField: jest.fn(() => null),
}));

jest.mock('formik', () => ({
  Formik: ({ children, initialValues }: any) => children({ handleSubmit: jest.fn(), values: initialValues }),
}));

jest.mock('../../../hooks/useBaseActivityScreen', () => ({
  useBaseActivityScreen: jest.fn(),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { getActivityDescription } from '../BaseActivityScreen';
import { Activity, ActivityType, ActivityStatus } from '../../../entities/ActivityModel';

// ─── Fixture helper ───────────────────────────────────────────────────────────

function makeActivity(data: any): Activity {
  return {
    id: 'act-1',
    guestId: 'guest-1',
    houseId: 'house-1',
    type: ActivityType.MEETING,
    timestamp: new Date(),
    data,
    loggedBy: 'user-1',
    loggedAt: new Date(),
    verified: false,
    status: ActivityStatus.ACTIVE,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getActivityDescription', () => {
  it('returns meetingName for meeting activities', () => {
    const activity = makeActivity({ type: 'meeting', meetingName: 'Monday Night AA', meetingType: 'AA', duration: 60 });
    expect(getActivityDescription(activity)).toBe('Monday Night AA');
  });

  it('returns jobName for work activities', () => {
    const activity = makeActivity({ type: 'work', jobName: 'Acme Restaurant', hoursWorked: 8 });
    expect(getActivityDescription(activity)).toBe('Acme Restaurant');
  });

  it('returns choreName for chore activities', () => {
    const activity = makeActivity({ type: 'chore', choreType: 'daily', choreName: 'Kitchen Cleanup' });
    expect(getActivityDescription(activity)).toBe('Kitchen Cleanup');
  });

  it('returns medicationName for medication activities', () => {
    const activity = makeActivity({ type: 'medication', medicationName: 'Antabuse' });
    expect(getActivityDescription(activity)).toBe('Antabuse');
  });

  it('returns supporterName for primary supporter activities', () => {
    const activity = makeActivity({ type: 'primary_supporter', supporterId: 's1', supporterName: 'John Smith' });
    expect(getActivityDescription(activity)).toBe('John Smith');
  });

  it('returns fallback string when data has no known name field', () => {
    const activity = makeActivity({ type: 'meeting', meetingType: 'AA', duration: 60 });
    expect(getActivityDescription(activity)).toBe('Activity completed');
  });

  it('returns fallback string when data is empty object', () => {
    const activity = makeActivity({});
    expect(getActivityDescription(activity)).toBe('Activity completed');
  });

  it('prefers meetingName over other fields when both exist', () => {
    // Unusual but defensively tests priority order
    const activity = makeActivity({ type: 'meeting', meetingName: 'The Meeting', jobName: 'Should be ignored', meetingType: 'AA', duration: 60 });
    expect(getActivityDescription(activity)).toBe('The Meeting');
  });

  it('falls through to jobName when meetingName is absent', () => {
    const activity = makeActivity({ type: 'work', jobName: 'My Job', hoursWorked: 4 });
    expect(getActivityDescription(activity)).toBe('My Job');
  });
});
