// src/__tests__/callable/getAppConfig.test.ts
//
// getAppConfig is the minimum-version gate's source (launch plan P5 Task 13).
// The app fails open on anything it can't use, so the server's job is to
// report config/app.minVersion faithfully, reduce anything malformed to null,
// and never need a signed-in caller (the gate runs before sign-in).

jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_optsOrHandler: any, handler?: Function) =>
    typeof _optsOrHandler === 'function' ? _optsOrHandler : handler,
}));

jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockGet = jest.fn();
const mockDoc = jest.fn(() => ({ get: mockGet }));
const mockCollection = jest.fn(() => ({ doc: mockDoc }));
jest.mock('firebase-admin', () => ({
  firestore: () => ({ collection: mockCollection }),
}));

const loadGetAppConfig = (): ((req: unknown) => Promise<any>) => {
  let handler: any;
  jest.isolateModules(() => {
    handler = require('../../callable/getAppConfig').getAppConfig;
  });
  return handler;
};

const snapshot = (data: Record<string, unknown> | undefined) => ({
  exists: data !== undefined,
  get: (field: string) => (data ? data[field] : undefined),
});

const NULLS = { minVersion: { ios: null, android: null } };

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.FUNCTIONS_EMULATOR;
});

describe('getAppConfig', () => {
  it('reads config/app and returns the minimum version per platform', async () => {
    mockGet.mockResolvedValue(snapshot({ minVersion: { ios: '1.54', android: '0.56.1' } }));
    const result = await loadGetAppConfig()({ data: {}, auth: null });
    expect(mockCollection).toHaveBeenCalledWith('config');
    expect(mockDoc).toHaveBeenCalledWith('app');
    expect(result).toEqual({ minVersion: { ios: '1.54', android: '0.56.1' } });
  });

  it('needs no auth: an unauthenticated caller gets the config', async () => {
    mockGet.mockResolvedValue(snapshot({ minVersion: { ios: '2.0' } }));
    await expect(loadGetAppConfig()({ data: {} })).resolves.toEqual({
      minVersion: { ios: '2.0', android: null },
    });
  });

  it('returns nulls when config/app is missing', async () => {
    mockGet.mockResolvedValue(snapshot(undefined));
    await expect(loadGetAppConfig()({ data: {}, auth: null })).resolves.toEqual(NULLS);
  });

  it('returns nulls when minVersion is absent or not a map', async () => {
    mockGet.mockResolvedValue(snapshot({ minVersion: '1.54' }));
    await expect(loadGetAppConfig()({ data: {}, auth: null })).resolves.toEqual(NULLS);
  });

  it('reduces a malformed value to null for that platform only', async () => {
    mockGet.mockResolvedValue(snapshot({ minVersion: { ios: 'latest', android: '0.56' } }));
    await expect(loadGetAppConfig()({ data: {}, auth: null })).resolves.toEqual({
      minVersion: { ios: null, android: '0.56' },
    });
  });

  it.each([[154], ['1.'], ['1..2'], ['v1.2'], ['1.2.3.4'], [''], [null]])(
    'treats %p as no minimum',
    async (value) => {
      mockGet.mockResolvedValue(snapshot({ minVersion: { ios: value, android: value } }));
      await expect(loadGetAppConfig()({ data: {}, auth: null })).resolves.toEqual(NULLS);
    },
  );

  it('fails open: a failed read returns nulls instead of throwing', async () => {
    mockGet.mockRejectedValue(new Error('unavailable'));
    await expect(loadGetAppConfig()({ data: {}, auth: null })).resolves.toEqual(NULLS);
  });

  it('caches the value for 60 s', async () => {
    jest.useFakeTimers();
    try {
      mockGet.mockResolvedValue(snapshot({ minVersion: { ios: '1.54' } }));
      const getAppConfig = loadGetAppConfig();
      await getAppConfig({ data: {} });
      mockGet.mockResolvedValue(snapshot({ minVersion: { ios: '9.0' } }));
      await expect(getAppConfig({ data: {} })).resolves.toEqual({
        minVersion: { ios: '1.54', android: null },
      });
      jest.advanceTimersByTime(60_001);
      await expect(getAppConfig({ data: {} })).resolves.toEqual({
        minVersion: { ios: '9.0', android: null },
      });
      expect(mockGet).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not cache a failed read', async () => {
    const getAppConfig = loadGetAppConfig();
    mockGet.mockRejectedValueOnce(new Error('unavailable'));
    await getAppConfig({ data: {} });
    mockGet.mockResolvedValue(snapshot({ minVersion: { android: '0.56' } }));
    await expect(getAppConfig({ data: {} })).resolves.toEqual({
      minVersion: { ios: null, android: '0.56' },
    });
  });

  it('reads on every call in the Functions emulator, so a Maestro flow can flip it', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    const getAppConfig = loadGetAppConfig();
    mockGet.mockResolvedValue(snapshot({ minVersion: { ios: '99.0' } }));
    await getAppConfig({ data: {} });
    mockGet.mockResolvedValue(snapshot(undefined));
    await expect(getAppConfig({ data: {} })).resolves.toEqual(NULLS);
  });
});
