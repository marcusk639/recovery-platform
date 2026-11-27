// Every Google Maps URL carries the API key (and the geocode URLs carry the
// address). An axios error holds that URL in config.url, request.path and
// toJSON(), so a caller that logs the raw error logs the key. The Maps helpers
// must rethrow without it, and userIsAtMeeting must never log it.

import { inspect } from 'util';

jest.mock('firebase-functions/v2/https', () => {
  const actual = jest.requireActual('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_opts: any, handler?: Function) => (typeof _opts === 'function' ? _opts : handler),
  };
});

const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
jest.mock('firebase-functions', () => ({ logger: mockLogger }));

const mockAxiosGet = jest.fn();
jest.mock('axios', () => ({ __esModule: true, default: { get: mockAxiosGet } }));

jest.mock('../../api/firestore', () => ({
  getMeetings: jest.fn(),
  getNaMeetings: jest.fn(),
  ratsFirestore: { collection: jest.fn() },
  app: {},
}));
jest.mock('../../api/recoveryApi', () => ({ fetchDirectoryMeetings: jest.fn() }));

import { geocode, partialGeocode, reverseGeocode } from '../../api/api';
import { userIsAtMeeting } from '../../callable/meetings';

const createAxiosError = jest.requireActual('axios/lib/core/createError');

const MAPS_KEY = 'maps-key-must-not-be-logged';
const ADDRESS = '123 Main St, Austin TX';

// What axios 0.19 rejects with when Maps answers 403.
const axiosFailure = (url: string) => {
  const config = { url, method: 'get' };
  const response = { status: 403, statusText: 'Forbidden', config, data: {} };
  return createAxiosError(
    'Request failed with status code 403',
    config,
    null,
    { path: url.replace('https://maps.googleapis.com', '') },
    response,
  );
};

const everythingIn = (value: unknown) =>
  inspect(value, { depth: Infinity, showHidden: true, getters: true });

let savedKey: string | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  savedKey = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = MAPS_KEY;
  mockAxiosGet.mockImplementation((url: string) => Promise.reject(axiosFailure(url)));
});

afterEach(() => {
  if (savedKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
  else process.env.GOOGLE_MAPS_API_KEY = savedKey;
});

describe.each([
  ['partialGeocode', () => partialGeocode(ADDRESS)],
  ['geocode', () => geocode('123 Main St', 'Austin', 'TX')],
  ['reverseGeocode', () => reverseGeocode(30.267, -97.743)],
])('%s on a failed Maps request', (_name, request) => {
  it('rejects with an error that holds neither the key nor the URL', async () => {
    const error = await request().then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('403');
    const dump = everythingIn(error) + JSON.stringify(error);
    expect(dump).not.toContain(MAPS_KEY);
    expect(dump).not.toContain('maps.googleapis.com');
    expect(dump).not.toContain('123 Main St');
  });
});

describe('userIsAtMeeting when geocoding the meeting address fails', () => {
  it('returns false and logs neither the Maps key nor the address', async () => {
    const result = await (userIsAtMeeting as Function)({
      data: { userLocation: { lat: 30.267, lng: -97.743 }, meetingAddress: ADDRESS },
      auth: { uid: 'resident-a' },
    });

    expect(result).toBe(false);
    const logged = Object.values(mockLogger).flatMap((fn) => fn.mock.calls);
    expect(logged.length).toBeGreaterThan(0);
    const dump = everythingIn(logged);
    expect(dump).not.toContain(MAPS_KEY);
    expect(dump).not.toContain('123 Main St');
  });
});
