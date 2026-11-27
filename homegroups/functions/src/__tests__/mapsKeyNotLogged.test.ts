// Both Maps proxies send the API key as a request param. An axios error keeps
// the request config (params.key included) in config, request and toJSON(), so
// logging the raw error logs the key. A failed Maps request must log only what
// failed, never the key or the caller's coordinates and search text.

import { inspect } from 'util';

jest.mock('firebase-functions/v2/https', () => {
  const actual = jest.requireActual('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (handler: Function) => handler,
    onRequest: (_opts: unknown, handler: Function) => handler,
  };
});

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};
jest.mock('firebase-functions/logger', () => mockLogger);

const mockAxiosGet = jest.fn();
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: mockAxiosGet },
}));

import { reverseGeocodeLocation } from '../callable/locationServices';
import { googlePlacesProxy } from '../http/googlePlacesProxy';

const { AxiosError } = jest.requireActual('axios');

const MAPS_KEY = 'maps-key-must-not-be-logged';
const SEARCH_TEXT = '123 Main St';

// What axios 1.x rejects with when Maps answers 403.
const axiosFailure = (url: string, config: { params?: object }) => {
  const fullConfig = { ...config, url, method: 'get', headers: {} };
  const response = {
    status: 403,
    statusText: 'Forbidden',
    config: fullConfig,
    data: {},
    headers: {},
  };
  return new AxiosError(
    'Request failed with status code 403',
    'ERR_BAD_REQUEST',
    fullConfig,
    { path: url },
    response,
  );
};

const everythingLogged = () =>
  inspect(
    Object.values(mockLogger).flatMap((fn) => fn.mock.calls),
    { depth: Infinity, showHidden: true, getters: true },
  );

let savedKey: string | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  savedKey = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = MAPS_KEY;
  mockAxiosGet.mockImplementation((url: string, config: { params?: object }) =>
    Promise.reject(axiosFailure(url, config)),
  );
});

afterEach(() => {
  if (savedKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
  else process.env.GOOGLE_MAPS_API_KEY = savedKey;
});

describe('reverseGeocodeLocation when Maps fails', () => {
  it('logs the failure without the key or the coordinates', async () => {
    await expect(
      (reverseGeocodeLocation as unknown as Function)({
        data: { latitude: 30.267153, longitude: -97.743057 },
        auth: { uid: 'member-a' },
      }),
    ).rejects.toMatchObject({ code: 'internal' });

    expect(mockLogger.error).toHaveBeenCalled();
    const dump = everythingLogged();
    expect(dump).toContain('403');
    expect(dump).not.toContain(MAPS_KEY);
    expect(dump).not.toContain('30.267153');
  });
});

describe('googlePlacesProxy when Maps fails', () => {
  it('answers 502 and logs the failure without the key or the search text', async () => {
    const res = { status: jest.fn(), json: jest.fn() };
    res.status.mockReturnValue(res);

    await (googlePlacesProxy as unknown as Function)(
      {
        path: '/place/autocomplete/json',
        query: { input: SEARCH_TEXT },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(502);
    expect(mockLogger.error).toHaveBeenCalled();
    const dump = everythingLogged();
    expect(dump).toContain('403');
    expect(dump).not.toContain(MAPS_KEY);
    expect(dump).not.toContain(SEARCH_TEXT);
  });
});
