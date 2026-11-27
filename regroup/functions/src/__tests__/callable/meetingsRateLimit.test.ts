// The 12-step meeting callables (findMeetings, userIsAtMeeting) spend money on
// a call (the recovery-api directory, Google Maps geocoding), so each account
// gets 60 calls an hour per callable. Drives the real callables and the real
// limiter against the in-memory Firestore; only the paid APIs are mocked.

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
jest.mock('../../api/firestore', () => require('../helpers/memFirestore').apiFirestore);

const mockFetchDirectoryMeetings = jest.fn();
jest.mock('../../api/recoveryApi', () => ({
  fetchDirectoryMeetings: mockFetchDirectoryMeetings,
}));
const mockGeocodeNAMeeting = jest.fn();
jest.mock('../../util/meetings', () => ({
  getCustomMeetings: jest.fn().mockResolvedValue([]),
  geocodeNAMeeting: mockGeocodeNAMeeting,
}));

import { HttpsError } from 'firebase-functions/v2/https';
import { MEETING_RATE_LIMITS, findMeetings, userIsAtMeeting } from '../../callable/meetings';
import { mem } from '../helpers/memFirestore';

const HOUR = 60 * 60 * 1000;
const T0 = 1_800_000_000_000;
const location = { lat: 30.267, lng: -97.743 };
const search = (uid: string) =>
  (findMeetings as Function)({
    data: { filters: { type: 'AA', location, day: '' } },
    auth: { uid },
  });
const checkIn = (uid: string) =>
  (userIsAtMeeting as Function)({
    data: { userLocation: location, meetingAddress: '1 Main St, Austin TX' },
    auth: { uid },
  });

const times = async (n: number, fn: () => Promise<unknown>) => {
  for (let i = 0; i < n; i++) await fn();
};
const refusal = async (p: Promise<unknown>): Promise<HttpsError> => {
  try {
    await p;
  } catch (err) {
    return err as HttpsError;
  }
  throw new Error('expected a refusal');
};

let now = T0;
beforeEach(() => {
  mem.reset();
  jest.clearAllMocks();
  now = T0;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  mockFetchDirectoryMeetings.mockResolvedValue([]);
  mockGeocodeNAMeeting.mockResolvedValue(location);
});
afterEach(() => jest.restoreAllMocks());

describe('meeting callable limits', () => {
  it('are 60 calls an hour per account, for each callable', () => {
    for (const limit of Object.values(MEETING_RATE_LIMITS)) {
      expect(limit).toMatchObject({ max: 60, windowMs: HOUR });
    }
    expect(MEETING_RATE_LIMITS.findMeetings.bucket).not.toBe(
      MEETING_RATE_LIMITS.userIsAtMeeting.bucket,
    );
  });
});

describe.each([
  ['findMeetings', search, () => mockFetchDirectoryMeetings],
  ['userIsAtMeeting', checkIn, () => mockGeocodeNAMeeting],
] as const)('%s per-account limit', (name, call, paidApi) => {
  it('serves calls under the limit', async () => {
    await times(59, () => call('uid-a'));
    expect(paidApi()).toHaveBeenCalledTimes(59);
  });

  it('serves the 60th call', async () => {
    await times(60, () => call('uid-a'));
    expect(paidApi()).toHaveBeenCalledTimes(60);
  });

  it('refuses the 61st call with resource-exhausted, without calling the paid API', async () => {
    await times(60, () => call('uid-a'));
    now = T0 + 20 * 60 * 1000;
    const err = await refusal(call('uid-a'));
    expect(err.code).toBe('resource-exhausted');
    expect(err.message).toMatch(/in the last hour\. Please try again in 40 minutes\.$/);
    expect(paidApi()).toHaveBeenCalledTimes(60);
  });

  it('serves calls again once the hour has passed', async () => {
    await times(60, () => call('uid-a'));
    now = T0 + HOUR - 1;
    await refusal(call('uid-a'));
    now = T0 + HOUR;
    await expect(call('uid-a')).resolves.toBeDefined();
    expect(paidApi()).toHaveBeenCalledTimes(61);
  });

  it('keeps each account separate', async () => {
    await times(60, () => call('uid-a'));
    await refusal(call('uid-a'));
    await expect(call('uid-b')).resolves.toBeDefined();
  });

  it(`does not share its count with the other callable`, async () => {
    await times(60, () => call('uid-a'));
    const other = name === 'findMeetings' ? checkIn : search;
    await expect(other('uid-a')).resolves.toBeDefined();
  });

  it('refuses a signed-out caller before counting', async () => {
    const callable = (name === 'findMeetings' ? findMeetings : userIsAtMeeting) as unknown;
    const err = await refusal((callable as Function)({ data: {} }));
    expect(err.code).toBe('unauthenticated');
    expect(mem.paths('rateLimits/')).toEqual([]);
  });
});
