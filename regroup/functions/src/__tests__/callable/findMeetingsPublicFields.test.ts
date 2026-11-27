// Custom meetings are searchable from every house (owner decision), so the
// result must not say which resident added a meeting or which house owns it.
// Owner rule: a custom meeting shows what a directory (Meeting Guide) meeting
// shows, plus daysAndTimes, which is where a custom meeting keeps its schedule.
// Drives the real findMeetings -> getCustomMeetings path; only the Firestore
// read and the recovery-api directory are mocked.

jest.mock('firebase-functions/v2/https', () => {
  const actual = jest.requireActual('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_opts: any, handler?: Function) => (typeof _opts === 'function' ? _opts : handler),
  };
});

jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const mockFetchDirectoryMeetings = jest.fn();
jest.mock('../../api/recoveryApi', () => ({
  fetchDirectoryMeetings: mockFetchDirectoryMeetings,
}));

jest.mock('../../api/api', () => ({ partialGeocode: jest.fn() }));

const mockGetMeetings = jest.fn();
jest.mock('../../api/firestore', () => ({
  getMeetings: mockGetMeetings,
  ratsFirestore: { collection: jest.fn() },
  app: {},
}));

import { findMeetings } from '../../callable/meetings';
import { toPublicMeeting } from '../../util/meetings';
import { mapDirectoryToRats } from '../../util/directoryMapping';
import { DirectoryMeeting } from '../../entities/DirectoryMeeting';

const fullDirectoryMeeting: DirectoryMeeting = {
  id: 'dir-1',
  source: 'external',
  provider: 'AA',
  name: 'AA Meeting',
  day: 'monday',
  time: '19:30',
  location: {
    address: '1 Main St',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    lat: 30.2,
    lng: -97.7,
  },
  online: true,
  link: 'https://zoom.example/j/9',
  onlineNotes: 'Use the side door',
  dataAsOf: '2026-11-01',
};

// The fields a directory search result carries when every field is set.
const DIRECTORY_KEYS = Object.entries(mapDirectoryToRats(fullDirectoryMeeting))
  .filter(([, value]) => value !== undefined)
  .map(([key]) => key);
const PUBLIC_KEYS = [...DIRECTORY_KEYS, 'daysAndTimes'];
const PRIVATE_KEYS = ['addedBy', 'houseId', 'createdAt', 'updatedAt', 'forced'];

const callerLocation = { lat: 30.267, lng: -97.743 };

// A resident of house A is searching.
const houseACaller = { uid: 'resident-a', token: { guest: { 'house-a': true } } };

const houseBOnlineMeeting = {
  id: 'custom-b-1',
  name: 'House B Zoom Group',
  time: '19:00',
  day: 'monday',
  type: 'CUSTOM',
  types: ['Open'],
  street: '9 Elm St',
  city: 'Austin',
  state: 'TX',
  zip: '78701',
  locationName: 'Back room',
  lat: 30.267,
  lng: -97.743,
  online: true,
  link: 'https://zoom.example/j/123',
  onlineNotes: 'Passcode on the house board',
  dataAsOf: '2026-11-01',
  verified: false,
  Location: ['Back room', '9 Elm St', 'Austin, TX 78701'],
  daysAndTimes: { monday: ['19:00'] },
  addedBy: 'Jane Resident',
  houseId: 'house-b',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
  forced: false,
  someFutureField: 'must not leak by default',
};

const houseBInPersonMeeting = {
  id: 'custom-b-2',
  name: 'House B Big Book',
  time: '08:00',
  day: 'tuesday',
  type: 'CUSTOM',
  street: '9 Elm St',
  lat: 30.2671,
  lng: -97.7431,
  onlineNotes: '',
  addedBy: 'John Resident',
  houseId: 'house-b',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const search = (type: string, criteria?: Record<string, unknown>) =>
  (findMeetings as Function)({
    data: { filters: { type, location: callerLocation, day: '' }, ...(criteria && { criteria }) },
    auth: houseACaller,
  });

const expectOnlyPublicKeys = (results: Record<string, unknown>[]) => {
  for (const result of results) {
    for (const key of PRIVATE_KEYS) expect(result).not.toHaveProperty(key);
    for (const key of Object.keys(result)) expect(PUBLIC_KEYS).toContain(key);
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchDirectoryMeetings.mockResolvedValue([]);
  mockGetMeetings.mockResolvedValue({
    docs: [houseBOnlineMeeting, houseBInPersonMeeting].map((m) => ({ id: m.id, data: () => m })),
  });
});

describe.each(['Custom', 'all'])('findMeetings type %s: custom meeting fields', (type) => {
  it("returns another house's custom meetings", async () => {
    const results = await search(type);
    const names = results.map((m: { name: string }) => m.name);
    expect(names).toEqual(expect.arrayContaining(['House B Zoom Group', 'House B Big Book']));
  });

  it('returns no resident, house, timestamp or forced field, and nothing off the allowlist', async () => {
    expectOnlyPublicKeys(await search(type));
  });

  it('applies the allowlist when search criteria are given too', async () => {
    const results = await search(type, { name: 'house b' });
    expect(results.length).toBeGreaterThan(0);
    expectOnlyPublicKeys(results);
  });

  it('returns exactly the fields a directory meeting shows, plus daysAndTimes', async () => {
    const results = await search(type);
    const online = results.find((m: { id: string }) => m.id === 'custom-b-1');
    expect(Object.keys(online).sort()).toEqual([...PUBLIC_KEYS].sort());
  });

  it('keeps the link and online notes of a custom online meeting', async () => {
    const results = await search(type);
    const online = results.find((m: { id: string }) => m.id === 'custom-b-1');
    expect(online).toMatchObject({
      online: true,
      link: 'https://zoom.example/j/123',
      onlineNotes: 'Passcode on the house board',
    });
  });
});

describe('toPublicMeeting', () => {
  it('leaves absent fields absent', () => {
    const result = toPublicMeeting(houseBInPersonMeeting);
    expect(result).not.toHaveProperty('link');
    expect(result).not.toHaveProperty('online');
    expect(result).not.toHaveProperty('Location');
    expect(result).toEqual({
      id: 'custom-b-2',
      name: 'House B Big Book',
      time: '08:00',
      day: 'tuesday',
      type: 'CUSTOM',
      street: '9 Elm St',
      lat: 30.2671,
      lng: -97.7431,
      onlineNotes: '',
    });
  });
});
