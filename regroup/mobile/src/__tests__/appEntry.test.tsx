/**
 * index.js: an e2e emulator build whose emulators are unreachable must stop.
 *
 * firebase-setup exports emulatorConnection with no catch; index.js is the one
 * place that turns its rejection into ErrorUtils.reportFatalError (red screen in
 * debug, crash in release). Without that, the rejection is only a warning.
 */
jest.mock('../../App', () => () => null);
jest.mock('../../i18n', () => ({}));
jest.mock('../state/store', () => ({ __esModule: true, default: {} }));
jest.mock('../state/queryClient', () => ({ queryClient: {} }));
jest.mock('../navigation/service', () => ({ navigationRef: { current: null } }));

const reportFatalError = jest.fn();
const startupOrder: string[] = [];
const ensureNotificationChannels = jest.fn(() => {
  startupOrder.push('notification channels');
  return Promise.resolve();
});
const originalErrorUtils = (global as any).ErrorUtils;

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

/** Loads index.js in its own registry; returns its registerComponent spy. */
const loadEntryWith = (emulatorConnection: Promise<void>) => {
  let registerComponent: jest.SpyInstance | undefined;
  jest.isolateModules(() => {
    jest.doMock('../../firebase-setup', () => {
      startupOrder.push('firebase-setup');
      return { emulatorConnection };
    });
    jest.doMock('../services/notifications/channels', () => ({ ensureNotificationChannels }));
    const { AppRegistry } = require('react-native');
    registerComponent = jest
      .spyOn(AppRegistry, 'registerComponent')
      .mockImplementation(() => 'rats');
    require('../../index');
  });
  return registerComponent!;
};

beforeEach(() => {
  reportFatalError.mockReset();
  ensureNotificationChannels.mockClear();
  startupOrder.length = 0;
  (global as any).ErrorUtils = { ...originalErrorUtils, reportFatalError };
});

afterEach(() => {
  (global as any).ErrorUtils = originalErrorUtils;
  jest.restoreAllMocks();
});

describe('app entry (index.js)', () => {
  it('reports an emulator connection failure as fatal', async () => {
    const failure = new Error('E2E emulator build cannot reach the Firebase emulators');

    loadEntryWith(Promise.reject(failure));
    await flushPromises();

    expect(reportFatalError).toHaveBeenCalledWith(failure);
  });

  it('starts normally when there is nothing to connect', async () => {
    const registerComponent = loadEntryWith(Promise.resolve());
    await flushPromises();

    expect(reportFatalError).not.toHaveBeenCalled();
    expect(registerComponent).toHaveBeenCalledWith('rats', expect.any(Function));
  });

  it('creates the Android notification channels once, after firebase-setup', async () => {
    loadEntryWith(Promise.resolve());
    await flushPromises();

    expect(ensureNotificationChannels).toHaveBeenCalledTimes(1);
    expect(startupOrder).toEqual(['firebase-setup', 'notification channels']);
  });
});

// A module, so its top-level names do not collide with other test files.
export {};
