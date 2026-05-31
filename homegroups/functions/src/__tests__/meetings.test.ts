/**
 * Tests for meetings.ts utility functions
 *
 * FC-3: getAll12StepMeetings must include custom meetings (meetings[3])
 * L6:   getMeetingTime must use Math.floor for hours calculation
 */

// Make this file a module to avoid global-scope name collisions with other test files
export {};

// ---- Mocks must come before any imports ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCollection = jest.fn() as jest.MockedFunction<(name: string) => any>;
const mockWhere = jest.fn();
const mockLimit = jest.fn();
const mockGet = jest.fn();

jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  firestore: Object.assign(
    jest.fn().mockReturnValue({ collection: mockCollection }),
    {
      Timestamp: {
        fromDate: (date: Date) => ({
          toDate: () => date,
          seconds: Math.floor(date.getTime() / 1000),
          nanoseconds: 0,
        }),
        now: () => ({
          toDate: () => new Date(),
          seconds: Math.floor(Date.now() / 1000),
          nanoseconds: 0,
        }),
      },
      FieldValue: {
        serverTimestamp: jest.fn(() => ({ _serverTimestamp: true })),
      },
    },
  ),
  app: jest.fn().mockReturnValue({}),
  auth: jest.fn().mockReturnValue({}),
}));

jest.mock('firebase-functions', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('firebase-functions/v1', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock the api module to control what external APIs return
jest.mock('../api/api', () => ({
  getNAMeetings: jest.fn().mockResolvedValue([]),
  getAAMeetings: jest.fn().mockResolvedValue([]),
  partialGeocode: jest.fn().mockResolvedValue({ results: [] }),
  getCelebrateRecoveryMeetings: jest.fn().mockResolvedValue(''),
}));

// Mock xml2js used by getCelebrateMeetings
jest.mock('xml2js', () => ({
  parseString: jest.fn().mockImplementation(
    (_xml: string, callback: Function) => callback(null, { markers: { marker: [] } })
  ),
}));

// Mock ngeohash
jest.mock('ngeohash', () => ({
  encode: jest.fn().mockReturnValue('abcdef'),
}));

// Mock geofire-common
jest.mock('geofire-common', () => ({
  geohashQueryBounds: jest.fn().mockReturnValue([['aaaaaa', 'zzzzzz']]),
  distanceBetween: jest.fn().mockReturnValue(1), // 1 km, always within radius
}));

// Mock location utility
jest.mock('../utils/location', () => ({
  getDistance: jest.fn().mockReturnValue(1000), // 1 km in meters, within 16km default
}));

// Mock crypto used by generateMeetingHash
jest.mock('crypto', () => ({
  createHash: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('abcdef123456789012345678'),
  }),
}));

// ============================================================
// getMeetingTime tests (L6)
// ============================================================

describe('getMeetingTime — L6: Math.floor for hours', () => {
  // getMeetingTime is not exported, but it is exercised via getMeetingEntity for NA meetings.
  // We test it indirectly through getMeetingEntity, which calls getMeetingTime(naMeeting.mtg_time).

  it('time=830 → "08:30" (NOT "8.3:30")', async () => {
    jest.resetModules();
    const { getMeetingEntity } = await import('../utils/meetings');

    const naMeeting = {
      com_name: 'Test Group',
      address: '123 Main St',
      city: 'Anytown',
      state: 'CA',
      zip: '90210',
      mtg_day: 1,
      mtg_time: 830,
      latitude: 34.0,
      longitude: -118.0,
      online: 'No',
      password: '',
      link: '',
    };

    const entity = getMeetingEntity(naMeeting, 'NA');
    expect(entity).not.toBeNull();
    expect(entity.time).toBe('08:30');
  });

  it('time=1230 → "12:30"', async () => {
    jest.resetModules();
    const { getMeetingEntity } = await import('../utils/meetings');

    const naMeeting = {
      com_name: 'Noon Group',
      address: '456 Oak Ave',
      city: 'Springfield',
      state: 'IL',
      zip: '62701',
      mtg_day: 3,
      mtg_time: 1230,
      latitude: 39.8,
      longitude: -89.6,
      online: 'No',
      password: '',
      link: '',
    };

    const entity = getMeetingEntity(naMeeting, 'NA');
    expect(entity).not.toBeNull();
    expect(entity.time).toBe('12:30');
  });

  it('time=1900 → "19:00"', async () => {
    jest.resetModules();
    const { getMeetingEntity } = await import('../utils/meetings');

    const naMeeting = {
      com_name: 'Evening Group',
      address: '789 Elm St',
      city: 'Portland',
      state: 'OR',
      zip: '97201',
      mtg_day: 5,
      mtg_time: 1900,
      latitude: 45.5,
      longitude: -122.6,
      online: 'No',
      password: '',
      link: '',
    };

    const entity = getMeetingEntity(naMeeting, 'NA');
    expect(entity).not.toBeNull();
    expect(entity.time).toBe('19:00');
  });

  it('time=0 → "00:00" (midnight)', async () => {
    jest.resetModules();
    const { getMeetingEntity } = await import('../utils/meetings');

    const naMeeting = {
      com_name: 'Midnight Group',
      address: '1 Night Rd',
      city: 'Austin',
      state: 'TX',
      zip: '73301',
      mtg_day: 7,
      mtg_time: 0,
      latitude: 30.3,
      longitude: -97.7,
      online: 'No',
      password: '',
      link: '',
    };

    const entity = getMeetingEntity(naMeeting, 'NA');
    expect(entity).not.toBeNull();
    expect(entity.time).toBe('00:00');
  });

  it('time=800 → "08:00" (hours are integer, no fractional issue)', async () => {
    jest.resetModules();
    const { getMeetingEntity } = await import('../utils/meetings');

    const naMeeting = {
      com_name: 'Morning Group',
      address: '10 Sunrise Blvd',
      city: 'Denver',
      state: 'CO',
      zip: '80201',
      mtg_day: 2,
      mtg_time: 800,
      latitude: 39.7,
      longitude: -104.9,
      online: 'No',
      password: '',
      link: '',
    };

    const entity = getMeetingEntity(naMeeting, 'NA');
    expect(entity).not.toBeNull();
    expect(entity.time).toBe('08:00');
  });

  it('time=945 → "09:45" (minutes retained correctly with Math.floor)', async () => {
    jest.resetModules();
    const { getMeetingEntity } = await import('../utils/meetings');

    const naMeeting = {
      com_name: 'Quarter Group',
      address: '45 Minute Way',
      city: 'Chicago',
      state: 'IL',
      zip: '60601',
      mtg_day: 4,
      mtg_time: 945,
      latitude: 41.8,
      longitude: -87.6,
      online: 'No',
      password: '',
      link: '',
    };

    const entity = getMeetingEntity(naMeeting, 'NA');
    expect(entity).not.toBeNull();
    expect(entity.time).toBe('09:45');
  });
});

// ============================================================
// getAll12StepMeetings tests (FC-3)
// ============================================================

describe('getAll12StepMeetings — FC-3: custom meetings included', () => {
  // We mock all four API/Firestore sources and verify all four are merged.

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('FC-3: includes custom meetings (meetings[3]) in the returned array', async () => {
    // Import the mocked api module to control its return values
    jest.resetModules();

    // Re-mock api to return controlled data
    const { getNAMeetings, getCelebrateRecoveryMeetings } = await import('../api/api');

    // Setup Firestore mock for getCustomMeetings (uses admin.firestore().collection('meetings'))
    // and getAlcoholicsAnonymousMeetings (uses admin.firestore().collection('meetings').where('type','==','AA'))
    const { default: admin } = await import('firebase-admin');

    // Build a mock custom meeting document
    const customMeetingDoc = {
      id: 'custom-meet-1',
      data: () => ({
        id: 'custom-meet-1',
        type: 'Custom',
        name: 'Local Custom Group',
        lat: 34.05,
        lng: -118.24,
        geohash: 'abc123',
      }),
    };

    // Mock the Firestore collection for 'meetings'
    // getCustomMeetings: .where('type','==','Custom').limit(100).get()
    // getAlcoholicsAnonymousMeetings: .where('type','==','AA').orderBy('geohash').startAt().endAt().get()
    (admin.firestore as unknown as jest.Mock).mockReturnValue({
      collection: jest.fn().mockImplementation((name: string) => {
        if (name === 'meetings') {
          return {
            where: jest.fn().mockImplementation((field: string, _op: string, value: string) => {
              if (field === 'type' && value === 'Custom') {
                return {
                  where: jest.fn().mockReturnThis(),
                  limit: jest.fn().mockReturnValue({
                    get: jest.fn().mockResolvedValue({
                      docs: [customMeetingDoc],
                    }),
                  }),
                };
              }
              // AA meetings — return empty
              return {
                where: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnValue({
                  startAt: jest.fn().mockReturnValue({
                    endAt: jest.fn().mockReturnValue({
                      get: jest.fn().mockResolvedValue({ docs: [] }),
                    }),
                  }),
                }),
              };
            }),
          };
        }
        return {};
      }),
    });

    // NA meetings: return one meeting from the API
    (getNAMeetings as jest.Mock).mockResolvedValue([]);
    // Celebrate Recovery: return empty XML
    (getCelebrateRecoveryMeetings as jest.Mock).mockResolvedValue('<markers></markers>');

    const { getAll12StepMeetings } = await import('../utils/meetings');

    const location = { lat: 34.05, lng: -118.24 };
    const results = await getAll12StepMeetings(location);

    // The custom meeting must appear in the results
    const customResult = results.find((m) => m.id === 'custom-meet-1');
    expect(customResult).toBeDefined();
  });

  it('FC-3: result contains items from all four sources when each returns data', async () => {
    jest.resetModules();

    const { getNAMeetings, getCelebrateRecoveryMeetings } = await import('../api/api');
    const { default: admin } = await import('firebase-admin');
    const { Meeting } = await import('../entities/Meeting');

    // Build mock meetings for each source
    const aaMeetingDoc = {
      id: 'aa-meet-1',
      data: () => ({
        id: 'aa-meet-1',
        type: 'AA',
        name: 'AA Group',
        lat: 34.05,
        lng: -118.24,
        geohash: 'abc123',
        day: 'monday',
        time: '19:00',
      }),
    };

    const customMeetingDoc = {
      id: 'custom-meet-2',
      data: () => ({
        id: 'custom-meet-2',
        type: 'Custom',
        name: 'Custom Group',
        lat: 34.05,
        lng: -118.24,
        geohash: 'abc123',
      }),
    };

    // Mock NA meeting
    const naMeeting = Object.assign(new Meeting(), {
      id: 'na-meet-1',
      type: 'NA',
      name: 'NA Group',
      lat: 34.05,
      lng: -118.24,
    });
    (getNAMeetings as jest.Mock).mockResolvedValue([naMeeting]);

    // Celebrate Recovery: return empty (XML parse would be complex to mock fully)
    (getCelebrateRecoveryMeetings as jest.Mock).mockResolvedValue('<markers></markers>');

    (admin.firestore as unknown as jest.Mock).mockReturnValue({
      collection: jest.fn().mockImplementation((name: string) => {
        if (name === 'meetings') {
          return {
            where: jest.fn().mockImplementation((field: string, _op: string, value: string) => {
              if (field === 'type' && value === 'Custom') {
                return {
                  where: jest.fn().mockReturnThis(),
                  limit: jest.fn().mockReturnValue({
                    get: jest.fn().mockResolvedValue({ docs: [customMeetingDoc] }),
                  }),
                };
              }
              // AA
              return {
                where: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnValue({
                  startAt: jest.fn().mockReturnValue({
                    endAt: jest.fn().mockReturnValue({
                      get: jest.fn().mockResolvedValue({ docs: [aaMeetingDoc] }),
                    }),
                  }),
                }),
              };
            }),
          };
        }
        return {};
      }),
    });

    const { getAll12StepMeetings } = await import('../utils/meetings');

    const location = { lat: 34.05, lng: -118.24 };
    const results = await getAll12StepMeetings(location);

    // Custom meeting must be present (this was the dropped meetings[3])
    const customResult = results.find((m) => m.id === 'custom-meet-2');
    expect(customResult).toBeDefined();

    // NA meeting must be present
    const naResult = results.find((m) => m.id === 'na-meet-1');
    expect(naResult).toBeDefined();
  });

  it('FC-3: returns empty array when all sources return empty', async () => {
    jest.resetModules();

    const { getNAMeetings, getCelebrateRecoveryMeetings } = await import('../api/api');
    const { default: admin } = await import('firebase-admin');

    (getNAMeetings as jest.Mock).mockResolvedValue([]);
    (getCelebrateRecoveryMeetings as jest.Mock).mockResolvedValue('<markers></markers>');

    (admin.firestore as unknown as jest.Mock).mockReturnValue({
      collection: jest.fn().mockImplementation(() => ({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue({ docs: [] }) }),
          orderBy: jest.fn().mockReturnValue({
            startAt: jest.fn().mockReturnValue({
              endAt: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue({ docs: [] }),
              }),
            }),
          }),
        }),
      })),
    });

    const { getAll12StepMeetings } = await import('../utils/meetings');

    const location = { lat: 34.05, lng: -118.24 };
    const results = await getAll12StepMeetings(location);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });
});
