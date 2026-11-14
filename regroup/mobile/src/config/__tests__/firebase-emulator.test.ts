/**
 * Guards the fail-closed e2e emulator wiring.
 *
 * Two failures this exists to prevent:
 *  - a store build connecting an emulator (or even reaching the emulator module),
 *    which the old __DEV__ gate only approximated;
 *  - an e2e emulator build whose emulators are down silently carrying on
 *    against the project in its native config. The old try/catch did exactly
 *    that, and its comment said so ("falls back to production").
 */
// jest.setup.js replaces this module with a stub for every other suite.
jest.unmock('../firebase-emulator');

// firebase-setup cross-checks an e2e variant against the native project id.
let mockProjectId = '';
jest.mock('@react-native-firebase/app', () => ({
  __esModule: true,
  getApp: () => ({ options: { projectId: mockProjectId } }),
}));
// The modular SDK surface firebase-setup builds its instances from.
jest.mock('@react-native-firebase/auth', () => require('../../../__mocks__/firebase-modular/auth'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/storage', () =>
  require('../../../__mocks__/firebase-modular/storage'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('@react-native-firebase/messaging', () =>
  require('../../../__mocks__/firebase-modular/messaging'),
);

const PORTS = { auth: 19099, firestore: 18080, storage: 19199, functions: 15001 };

const mockFetch = jest.fn();
const originalFetch = global.fetch;
const originalVariant = process.env.E2E_VARIANT;

// Each test starts from a fresh module registry so firebase-setup re-runs its
// init, so these handles are re-required after every reset to stay the same
// instances the modules under test see.
let Platform: { OS: string };
let LaunchArguments: { value: jest.Mock };
type Sdk<K extends string> = { instance: object } & Record<K, jest.Mock>;
let auth: Sdk<'connectAuthEmulator'>;
let firestore: Sdk<'connectFirestoreEmulator'>;
let storage: Sdk<'connectStorageEmulator'>;
let functions: Sdk<'connectFunctionsEmulator'>;

const setVariant = (variant?: string) => {
  if (variant === undefined) {
    delete process.env.E2E_VARIANT;
  } else {
    process.env.E2E_VARIANT = variant;
  }
};

/** Every connect*Emulator call across the four SDKs, flattened. */
const allUseEmulatorCalls = () => [
  ...auth.connectAuthEmulator.mock.calls,
  ...firestore.connectFirestoreEmulator.mock.calls,
  ...storage.connectStorageEmulator.mock.calls,
  ...functions.connectFunctionsEmulator.mock.calls,
];

/** The instances connectToEmulators is handed, as firebase-setup hands them. */
const instances = () => ({
  auth: auth.instance,
  firestore: firestore.instance,
  storage: storage.instance,
  functions: functions.instance,
});

// Loads the real mobile-root firebase-setup. The `.ts` suffix sidesteps the
// jest.config.js moduleNameMapper that sends `../firebase-setup` to the mock.
const loadFirebaseSetup = () => require('../../../firebase-setup.ts');
const loadEmulatorModule = () => require('../firebase-emulator');

beforeEach(() => {
  jest.resetModules();
  ({ Platform } = require('react-native'));
  ({ LaunchArguments } = require('react-native-launch-arguments'));
  auth = require('@react-native-firebase/auth');
  firestore = require('@react-native-firebase/firestore');
  storage = require('@react-native-firebase/storage');
  functions = require('@react-native-firebase/functions');
  Platform.OS = 'ios';
  global.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true, status: 200 });
  LaunchArguments.value.mockReturnValue({});
});

afterEach(() => {
  jest.useRealTimers();
  global.fetch = originalFetch;
  setVariant(originalVariant);
});

describe('connectToEmulators', () => {
  it('points auth, firestore, storage and functions at the given host and ports', async () => {
    const { connectToEmulators } = loadEmulatorModule();

    await connectToEmulators({ host: '10.0.2.2', ports: PORTS, instances: instances() });

    expect(auth.connectAuthEmulator).toHaveBeenCalledWith(auth.instance, 'http://10.0.2.2:19099');
    expect(firestore.connectFirestoreEmulator).toHaveBeenCalledWith(
      firestore.instance,
      '10.0.2.2',
      18080,
    );
    expect(storage.connectStorageEmulator).toHaveBeenCalledWith(
      storage.instance,
      '10.0.2.2',
      19199,
    );
    expect(functions.connectFunctionsEmulator).toHaveBeenCalledWith(
      functions.instance,
      '10.0.2.2',
      15001,
    );
  });

  it('wires every SDK before the first probe can settle', () => {
    jest.useFakeTimers();
    const { connectToEmulators } = loadEmulatorModule();
    mockFetch.mockReturnValue(new Promise(() => {}));

    const pending = connectToEmulators({ host: '127.0.0.1', ports: PORTS, instances: instances() });
    pending.catch(() => {});

    expect(allUseEmulatorCalls()).toHaveLength(4);
  });

  it('health-probes each of the four ports', async () => {
    const { connectToEmulators } = loadEmulatorModule();

    await connectToEmulators({ host: '127.0.0.1', ports: PORTS, instances: instances() });

    const probed = mockFetch.mock.calls.map(([url]) => url).sort();
    expect(probed).toEqual(
      [
        'http://127.0.0.1:15001/',
        'http://127.0.0.1:18080/',
        'http://127.0.0.1:19099/',
        'http://127.0.0.1:19199/',
      ].sort(),
    );
  });

  it('treats any HTTP response, even an error status, as reachable', async () => {
    const { connectToEmulators } = loadEmulatorModule();
    mockFetch.mockResolvedValue({ ok: false, status: 404 });

    await expect(
      connectToEmulators({ host: '127.0.0.1', ports: PORTS, instances: instances() }),
    ).resolves.toBeUndefined();
  });

  it('rejects with E2EEmulatorUnreachable naming the port that refused', async () => {
    const { connectToEmulators, E2EEmulatorUnreachable } = loadEmulatorModule();
    mockFetch.mockImplementation((url: string) =>
      url.includes(':18080')
        ? Promise.reject(new TypeError('Network request failed'))
        : Promise.resolve({ ok: true, status: 200 }),
    );

    const result = connectToEmulators({ host: '127.0.0.1', ports: PORTS, instances: instances() });

    await expect(result).rejects.toBeInstanceOf(E2EEmulatorUnreachable);
    await expect(result).rejects.toThrow(/firestore.*127\.0\.0\.1:18080/);
  });

  it('rejects when a probe has not answered within 5 seconds', async () => {
    jest.useFakeTimers();
    const { connectToEmulators, E2EEmulatorUnreachable } = loadEmulatorModule();
    mockFetch.mockReturnValue(new Promise(() => {}));

    let outcome: unknown = 'pending';
    const settled = connectToEmulators({
      host: '127.0.0.1',
      ports: PORTS,
      instances: instances(),
    }).then(
      () => (outcome = 'resolved'),
      (error: unknown) => (outcome = error),
    );

    jest.advanceTimersByTime(4999);
    await Promise.resolve();
    expect(outcome).toBe('pending');

    jest.advanceTimersByTime(1);
    await settled;
    expect(outcome).toBeInstanceOf(E2EEmulatorUnreachable);
  });
});

describe('emulatorHost', () => {
  it('is the loopback address on iOS', () => {
    Platform.OS = 'ios';
    expect(loadEmulatorModule().emulatorHost()).toBe('127.0.0.1');
  });

  it("is the Android emulator's alias for the host machine on Android", () => {
    Platform.OS = 'android';
    expect(loadEmulatorModule().emulatorHost()).toBe('10.0.2.2');
  });
});

describe('emulatorPorts', () => {
  it('defaults to the Firebase CLI emulator ports', () => {
    expect(loadEmulatorModule().emulatorPorts()).toEqual({
      auth: 9099,
      firestore: 8080,
      storage: 9199,
      functions: 5001,
    });
  });

  it('takes each port from its launch argument', () => {
    LaunchArguments.value.mockReturnValue({
      e2eAuthPort: 19099,
      e2eFirestorePort: '18080',
      e2eStoragePort: 19199,
      e2eFunctionsPort: 15001,
    });
    expect(loadEmulatorModule().emulatorPorts()).toEqual(PORTS);
  });

  it('refuses a launch argument that is not a port', () => {
    LaunchArguments.value.mockReturnValue({ e2eFirestorePort: 'eighty' });
    expect(() => loadEmulatorModule().emulatorPorts()).toThrow(/e2eFirestorePort/);
  });
});

describe('app init (firebase-setup)', () => {
  it('never touches the emulators in a build without an e2e variant', async () => {
    setVariant(undefined);
    const emulator = loadEmulatorModule();
    const connectSpy = jest.spyOn(emulator, 'connectToEmulators');

    await loadFirebaseSetup().emulatorConnection;

    expect(connectSpy).not.toHaveBeenCalled();
    expect(allUseEmulatorCalls()).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('never touches the emulators in the staging variant', async () => {
    setVariant('staging');
    mockProjectId = 'regroup-e2e';

    await loadFirebaseSetup().emulatorConnection;

    expect(allUseEmulatorCalls()).toHaveLength(0);
  });

  it('connects all four SDKs in the emulator variant, with the platform host and launch-argument ports', async () => {
    setVariant('emulator');
    mockProjectId = 'demo-regroup-e2e';
    Platform.OS = 'android';
    LaunchArguments.value.mockReturnValue({ e2eFunctionsPort: 15001 });

    await loadFirebaseSetup().emulatorConnection;

    expect(auth.connectAuthEmulator).toHaveBeenCalledWith(auth.instance, 'http://10.0.2.2:9099');
    expect(firestore.connectFirestoreEmulator).toHaveBeenCalledWith(
      firestore.instance,
      '10.0.2.2',
      8080,
    );
    expect(storage.connectStorageEmulator).toHaveBeenCalledWith(storage.instance, '10.0.2.2', 9199);
    expect(functions.connectFunctionsEmulator).toHaveBeenCalledWith(
      functions.instance,
      '10.0.2.2',
      15001,
    );
  });

  it('lets an unreachable emulator reject app init, with no fallback', async () => {
    setVariant('emulator');
    mockProjectId = 'demo-regroup-e2e';
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));
    const { E2EEmulatorUnreachable } = loadEmulatorModule();

    await expect(loadFirebaseSetup().emulatorConnection).rejects.toBeInstanceOf(
      E2EEmulatorUnreachable,
    );
    // Still pointed at the (dead) emulators: nothing re-routed to a real project.
    expect(allUseEmulatorCalls()).toHaveLength(4);
  });
});

// A module, so its top-level names do not collide with other test files.
export {};
