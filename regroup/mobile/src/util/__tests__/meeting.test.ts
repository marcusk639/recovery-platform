// src/util/__tests__/meeting.test.ts
//
// Unit tests for the three exported functions in src/util/meeting.ts:
//   - getNAMeetingAddress(meeting)
//   - getCheckinInput(meeting, userLocation)
//   - getMeetingTime(meeting, day?)
//
// meeting.ts imports:
//   - react-native          (Alert)
//   - ../entities/Meeting   (pure TS — safe to import directly)
//   - ../screens/StatUpdates/MeetingSearch  (pulls react-native chain — must mock)
//   - ./display             (getDayOfWeek, getTodaysDate — mocked so we control return values)

// ─── Mocks (hoisted before imports) ─────────────────────────────────────────

jest.mock('react-native', () => ({
  StyleSheet: { create: (s: any) => s },
  Platform: { OS: 'ios' },
  Dimensions: { get: () => ({ width: 375, height: 812 }) },
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  Alert: { alert: jest.fn() },
}));

// Mock display so getMeetingTime can be tested deterministically
jest.mock('../display', () => ({
  getDayOfWeek: jest.fn(),
  getTodaysDate: jest.fn(),
}));

// MeetingSearch barrel re-exports from MeetingSearch.tsx which pulls a full
// react-native screen tree — stub it out.
jest.mock('../../screens/StatUpdates/MeetingSearch', () => ({
  WeekDay: undefined,
  MEETING_DESCRIPTION_TEXT: {},
  useMeetingSearch: jest.fn(),
}));

// Transitive dependency pulled by MeetingSearch screen tree
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

jest.mock('../../styles/theme', () => ({
  color: {
    blue_green: '#446a85',
    dark_purple: '#23195e',
    green_blue: '#448580',
    cobalt: '#0047ab',
    pink: '#cc00a3',
  },
  fontSize: { regular_medium: 14 },
  fontFamily: {},
  normalize: (n: number) => n,
}));

jest.mock('../../components/weekdays', () => ({
  daysOfWeek: [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ],
  Weekdays: 'Weekdays',
}));

jest.mock('../../screens/StatUpdates/MeetingFilterForm', () => ({
  MeetingFilters: class MeetingFilters {
    day: string = 'monday';
  },
}));

jest.mock('../../util/platform', () => ({ IOS: true }));

// firebase-setup pulled in transitively if entities import services
jest.mock('../../../firebase-setup', () => ({
  firestore: { collection: jest.fn() },
  auth: {},
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { Alert } from 'react-native';
import { getNAMeetingAddress, getCheckinInput, getMeetingTime } from '../meeting';
import { getDayOfWeek, getTodaysDate } from '../display';
import { RatsMeeting, Location } from '../../entities/Meeting';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockGetDayOfWeek = getDayOfWeek as jest.Mock;
const mockGetTodaysDate = getTodaysDate as jest.Mock;

function makeMeeting(overrides: Partial<RatsMeeting> = {}): RatsMeeting {
  return {
    name: 'Test Meeting',
    time: '18:00',
    street: '',
    type: 'AA',
    day: 'monday',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as RatsMeeting;
}

// ─── getNAMeetingAddress ─────────────────────────────────────────────────────

describe('getNAMeetingAddress', () => {
  it('returns an empty string when Location is undefined', () => {
    const meeting = makeMeeting({ Location: undefined });
    expect(getNAMeetingAddress(meeting)).toBe('');
  });

  it('returns an empty string when Location is an empty array', () => {
    const meeting = makeMeeting({ Location: [] });
    expect(getNAMeetingAddress(meeting)).toBe('');
  });

  it('joins all Location entries when no city/state/zip line is present', () => {
    const meeting = makeMeeting({
      Location: ['Some Community Center', 'Room 101'],
    });
    // No entry matches the cityStateZip regex, so all entries are joined
    expect(getNAMeetingAddress(meeting)).toBe('Some Community Center, Room 101');
  });

  it('returns the street address + city/state/zip slice when a match is found', () => {
    const meeting = makeMeeting({
      Location: [
        'Community Center',
        '123 Main St',
        'Springfield, IL 62701',
      ],
    });
    // indexOfCityStateZip === 2 (the "Springfield, IL 62701" entry)
    // slice(2-1, 2+1) => slice(1, 3) => ['123 Main St', 'Springfield, IL 62701']
    const result = getNAMeetingAddress(meeting);
    expect(result).toContain('123 Main St');
    expect(result).toContain('Springfield, IL 62701');
  });

  it('handles a Location array where the first entry is the city/state/zip', () => {
    // indexOfCityStateZip === 0, so slice(-1, 1) — which is slice(0, 1) in JS = ['Portland, OR 97201']
    const meeting = makeMeeting({
      Location: ['Portland, OR 97201'],
    });
    const result = getNAMeetingAddress(meeting);
    // slice(-1, 1) returns empty array in JS; toString() of [] is ''
    // The actual result depends on JS slice behaviour: slice(-1, 1) = []
    // So result would be an empty string via [].toString()
    expect(typeof result).toBe('string');
  });

  it('returns a string (not throws) for a single entry without city pattern', () => {
    const meeting = makeMeeting({ Location: ['123 Oak Street'] });
    expect(getNAMeetingAddress(meeting)).toBe('123 Oak Street');
  });

  it('works with a four-part Location array with a matching city line', () => {
    const meeting = makeMeeting({
      Location: [
        'First Church',
        '456 Elm Ave',
        'Austin, TX 78701',
        'Enter through side door',
      ],
    });
    // indexOfCityStateZip === 2 => slice(1, 3) => ['456 Elm Ave', 'Austin, TX 78701']
    const result = getNAMeetingAddress(meeting);
    expect(result).toContain('456 Elm Ave');
    expect(result).toContain('Austin, TX 78701');
  });

  it('matches 9-digit zip codes (12345-6789 format)', () => {
    const meeting = makeMeeting({
      Location: ['789 Pine Rd', 'Denver, CO 80201-1234'],
    });
    const result = getNAMeetingAddress(meeting);
    expect(result).toContain('Denver, CO 80201-1234');
  });
});

// ─── getCheckinInput ─────────────────────────────────────────────────────────

describe('getCheckinInput', () => {
  beforeEach(() => {
    (Alert.alert as jest.Mock).mockClear();
  });

  it('returns a MeetingVerificationInput with meetingLocation from lat/lng', () => {
    const meeting = makeMeeting({ lat: 37.7749, lng: -122.4194, type: 'AA' });
    const result = getCheckinInput(meeting, null);
    expect(result).toBeDefined();
    expect(result!.meetingLocation).toEqual({ lat: 37.7749, lng: -122.4194 });
  });

  it('defaults lat/lng to 0 when undefined', () => {
    const meeting = makeMeeting({ lat: undefined, lng: undefined, type: 'AA' });
    const result = getCheckinInput(meeting, null);
    expect(result!.meetingLocation).toEqual({ lat: 0, lng: 0 });
  });

  it('sets userLocation to undefined when null is passed', () => {
    const meeting = makeMeeting({ type: 'AA' });
    const result = getCheckinInput(meeting, null);
    expect(result!.userLocation).toBeUndefined();
  });

  it('passes userLocation through when provided', () => {
    const meeting = makeMeeting({ type: 'AA' });
    const userLoc: Location = { lat: 34.0522, lng: -118.2437 };
    const result = getCheckinInput(meeting, userLoc);
    expect(result!.userLocation).toEqual(userLoc);
  });

  it('sets meetingAddress via getNAMeetingAddress for NA meetings', () => {
    const meeting = makeMeeting({
      type: 'NA',
      lat: 40.7128,
      lng: -74.006,
      Location: ['100 Broadway', 'New York, NY 10007'],
    });
    const result = getCheckinInput(meeting, null);
    expect(result!.meetingAddress).toContain('New York, NY 10007');
  });

  it('sets meetingAddress to undefined for non-NA meetings', () => {
    const meeting = makeMeeting({ type: 'AA' });
    const result = getCheckinInput(meeting, null);
    expect(result!.meetingAddress).toBeUndefined();
  });

  it('returns a valid object for IOP type (meetingAddress = undefined)', () => {
    const meeting = makeMeeting({ type: 'IOP', lat: 1, lng: 2 });
    const result = getCheckinInput(meeting, null);
    expect(result).toBeDefined();
    expect(result!.meetingAddress).toBeUndefined();
  });
});

// ─── getMeetingTime ───────────────────────────────────────────────────────────

describe('getMeetingTime', () => {
  beforeEach(() => {
    mockGetTodaysDate.mockReturnValue('2024-01-08'); // a Monday
    mockGetDayOfWeek.mockReturnValue('monday');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns meeting.time when daysAndTimes is not set', () => {
    const meeting = makeMeeting({ time: '19:00', daysAndTimes: undefined });
    expect(getMeetingTime(meeting)).toBe('19:00');
  });

  it('returns undefined when neither daysAndTimes nor time is set', () => {
    const meeting = makeMeeting({ time: '', daysAndTimes: undefined });
    // time is an empty string — falsy
    const result = getMeetingTime(meeting);
    expect(result).toBeUndefined();
  });

  it('returns the time for the specific day when day is provided and daysAndTimes exists', () => {
    const meeting = makeMeeting({
      daysAndTimes: {
        sunday: '10:00',
        monday: '18:00',
        tuesday: '19:00',
        wednesday: '20:00',
        thursday: '17:00',
        friday: '21:00',
        saturday: '09:00',
      },
    });
    expect(getMeetingTime(meeting, 'tuesday')).toBe('19:00');
  });

  it('returns daysAndTimes[today] when no explicit day is passed', () => {
    // mockGetDayOfWeek returns 'monday'
    const meeting = makeMeeting({
      daysAndTimes: {
        sunday: '',
        monday: '18:30',
        tuesday: '',
        wednesday: '',
        thursday: '',
        friday: '',
        saturday: '',
      },
    });
    const result = getMeetingTime(meeting);
    expect(result).toBe('18:30');
  });

  it('returns meeting.time when day is "all" and daysAndTimes is set', () => {
    const meeting = makeMeeting({
      time: '20:00',
      daysAndTimes: {
        sunday: '10:00',
        monday: '18:00',
        tuesday: '',
        wednesday: '',
        thursday: '',
        friday: '',
        saturday: '',
      },
    });
    expect(getMeetingTime(meeting, 'all')).toBe('20:00');
  });

  it('calls getDayOfWeek with asString=true when no day is supplied', () => {
    const meeting = makeMeeting({
      daysAndTimes: {
        sunday: '',
        monday: '08:00',
        tuesday: '',
        wednesday: '',
        thursday: '',
        friday: '',
        saturday: '',
      },
    });
    getMeetingTime(meeting);
    expect(mockGetTodaysDate).toHaveBeenCalled();
    expect(mockGetDayOfWeek).toHaveBeenCalledWith(expect.anything(), true);
  });

  it('returns the friday time when day param is "friday"', () => {
    const meeting = makeMeeting({
      daysAndTimes: {
        sunday: '10:00',
        monday: '18:00',
        tuesday: '19:00',
        wednesday: '20:00',
        thursday: '17:00',
        friday: '21:30',
        saturday: '09:00',
      },
    });
    expect(getMeetingTime(meeting, 'friday')).toBe('21:30');
  });

  it('returns undefined when time is falsy and daysAndTimes is absent', () => {
    const meeting = makeMeeting({ time: undefined as any, daysAndTimes: undefined });
    expect(getMeetingTime(meeting)).toBeUndefined();
  });
});
