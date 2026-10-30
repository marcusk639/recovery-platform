/**
 * App init (mobile-root firebase-setup.ts) guards that sit beside the emulator
 * gate:
 *  - an e2e variant must be running against its own Firebase project. An
 *    E2E_VARIANT left in a developer's .env is inlined into whatever they
 *    bundle, so a store build carrying a variant must die at startup rather
 *    than relax e2e-only UI against production;
 *  - react-native-launch-arguments runs native code when first loaded, so only
 *    the emulator variant may load it.
 */
jest.unmock('../firebase-emulator');

let mockProjectId = '';
const mockApp = { options: { projectId: '' } };
jest.mock('@react-native-firebase/app', () => ({
  __esModule: true,
  getApp: () => {
    mockApp.options.projectId = mockProjectId;
    return mockApp;
  },
}));
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
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

const originalVariant = process.env.E2E_VARIANT;
const originalStripeKey = process.env.STRIPE_PUBLISHABLE_KEY;
const originalFetch = global.fetch;

const setVariant = (variant?: string) => {
  if (variant === undefined) {
    delete process.env.E2E_VARIANT;
  } else {
    process.env.E2E_VARIANT = variant;
  }
};

// The `.ts` suffix sidesteps the moduleNameMapper that sends
// `../firebase-setup` to the shared mock.
const loadFirebaseSetup = () => require('../../../firebase-setup.ts');

beforeEach(() => {
  jest.resetModules();
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, status: 200 }),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  setVariant(originalVariant);
  if (originalStripeKey === undefined) {
    delete process.env.STRIPE_PUBLISHABLE_KEY;
  } else {
    process.env.STRIPE_PUBLISHABLE_KEY = originalStripeKey;
  }
});

describe('e2e variant / Firebase project cross-check', () => {
  it.each([
    ['emulator', 'phoenix-cleanhouse', 'demo-regroup-e2e'],
    ['staging', 'phoenix-cleanhouse', 'regroup-e2e'],
    ['emulator', 'regroup-e2e', 'demo-regroup-e2e'],
    ['staging', 'demo-regroup-e2e', 'regroup-e2e'],
  ])('refuses to start the %s variant against %s', (variant, actual, expected) => {
    setVariant(variant);
    mockProjectId = actual;

    let thrown: unknown;
    try {
      loadFirebaseSetup();
    } catch (error) {
      thrown = error;
    }

    const { E2EProjectMismatch } = require('../firebase-emulator');
    expect(thrown).toBeInstanceOf(E2EProjectMismatch);
    expect(String(thrown)).toContain(actual);
    expect(String(thrown)).toContain(expected);
    expect(String(thrown)).toContain(variant);
  });

  it.each([
    ['emulator', 'demo-regroup-e2e'],
    ['staging', 'regroup-e2e'],
  ])('starts the %s variant against %s', async (variant, projectId) => {
    setVariant(variant);
    mockProjectId = projectId;

    await expect(loadFirebaseSetup().emulatorConnection).resolves.toBeUndefined();
  });

  it('skips the check in a build without an e2e variant', async () => {
    setVariant(undefined);
    mockProjectId = 'phoenix-cleanhouse';

    await expect(loadFirebaseSetup().emulatorConnection).resolves.toBeUndefined();
  });
});

describe('e2e variant / live Stripe key', () => {
  // babel.config.js already refuses to bundle one; this is the runtime backstop
  // for a bundle built some other way (a Metro started with E2E_VARIANT).
  it.each([
    ['emulator', 'demo-regroup-e2e'],
    ['staging', 'regroup-e2e'],
  ])('refuses to start the %s variant with a live key', (variant, projectId) => {
    setVariant(variant);
    mockProjectId = projectId;
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_live_abc123';

    let thrown: unknown;
    try {
      loadFirebaseSetup();
    } catch (error) {
      thrown = error;
    }

    const { E2ELiveStripeKey } = require('../firebase-emulator');
    expect(thrown).toBeInstanceOf(E2ELiveStripeKey);
    expect(String(thrown)).toContain(variant);
    expect(String(thrown)).not.toContain('abc123');
  });

  it('starts an e2e variant with a test key', async () => {
    setVariant('staging');
    mockProjectId = 'regroup-e2e';
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_abc';

    await expect(loadFirebaseSetup().emulatorConnection).resolves.toBeUndefined();
  });

  it('allows a live key in a build without an e2e variant', async () => {
    setVariant(undefined);
    mockProjectId = 'phoenix-cleanhouse';
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_live_abc';

    await expect(loadFirebaseSetup().emulatorConnection).resolves.toBeUndefined();
  });

  it('assertE2EStripeKey accepts an unconfigured key', () => {
    const { assertE2EStripeKey } = require('../firebase-emulator');
    expect(() => assertE2EStripeKey('emulator', '')).not.toThrow();
  });
});

describe('react-native-launch-arguments loading', () => {
  const loadWithFactorySpy = () => {
    const factory = jest.fn(() => ({ LaunchArguments: { value: () => ({}) } }));
    jest.isolateModules(() => {
      jest.doMock('react-native-launch-arguments', factory);
      loadFirebaseSetup();
    });
    return factory;
  };

  it('is never loaded in a build without an e2e variant', () => {
    setVariant(undefined);
    mockProjectId = 'phoenix-cleanhouse';
    expect(loadWithFactorySpy()).not.toHaveBeenCalled();
  });

  it('is never loaded in the staging variant', () => {
    setVariant('staging');
    mockProjectId = 'regroup-e2e';
    expect(loadWithFactorySpy()).not.toHaveBeenCalled();
  });

  it('is loaded in the emulator variant, for its ports', () => {
    setVariant('emulator');
    mockProjectId = 'demo-regroup-e2e';
    expect(loadWithFactorySpy()).toHaveBeenCalledTimes(1);
  });
});

describe('SDK instances', () => {
  it('builds Firestore with ignoreUndefinedProperties on the default app', () => {
    setVariant(undefined);
    mockProjectId = 'phoenix-cleanhouse';

    const setup = loadFirebaseSetup();
    const firestoreSdk = require('@react-native-firebase/firestore');

    expect(firestoreSdk.initializeFirestore).toHaveBeenCalledTimes(1);
    expect(firestoreSdk.initializeFirestore).toHaveBeenCalledWith(mockApp, {
      ignoreUndefinedProperties: true,
    });
    expect(setup.firestore).toBe(firestoreSdk.instance);
  });

  it('connects the emulator to the same Firestore instance initializeFirestore built, after it', async () => {
    setVariant('emulator');
    mockProjectId = 'demo-regroup-e2e';

    const setup = loadFirebaseSetup();
    await setup.emulatorConnection;
    const firestoreSdk = require('@react-native-firebase/firestore');
    const built = await firestoreSdk.initializeFirestore.mock.results[0].value;

    expect(firestoreSdk.connectFirestoreEmulator).toHaveBeenCalledTimes(1);
    expect(firestoreSdk.connectFirestoreEmulator.mock.calls[0][0]).toBe(built);
    expect(setup.firestore).toBe(built);
    expect(firestoreSdk.initializeFirestore.mock.invocationCallOrder[0]).toBeLessThan(
      firestoreSdk.connectFirestoreEmulator.mock.invocationCallOrder[0],
    );
  });

  it('logs a failed Firestore initialization instead of throwing at import', async () => {
    setVariant(undefined);
    mockProjectId = 'phoenix-cleanhouse';
    const failure = new Error('settings rejected');
    require('@react-native-firebase/firestore').initializeFirestore.mockImplementationOnce(() => {
      throw failure;
    });

    expect(() => loadFirebaseSetup()).not.toThrow();
    await new Promise(process.nextTick);

    const { logException } = require('../../util/logging');
    expect(logException).toHaveBeenCalledWith(failure, 'firebase-setup: initializeFirestore');
  });

  it('callHttpsFunction calls httpsCallable(functions, name) with the payload', async () => {
    setVariant(undefined);
    mockProjectId = 'phoenix-cleanhouse';
    const functionsSdk = require('@react-native-firebase/functions');
    const callable = jest.fn(() => Promise.resolve({ data: { ok: true } }));
    const httpsCallable = jest.spyOn(functionsSdk, 'httpsCallable').mockReturnValue(callable);

    const setup = loadFirebaseSetup();
    const result = await setup.callHttpsFunction('findMeetings', { lat: 1 });

    expect(httpsCallable).toHaveBeenCalledWith(functionsSdk.instance, 'findMeetings');
    expect(callable).toHaveBeenCalledWith({ lat: 1 });
    expect(result).toEqual({ data: { ok: true } });
  });
});

// A module, so its top-level names do not collide with other test files.
export {};
