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
jest.mock('@react-native-firebase/app', () => ({
  __esModule: true,
  default: { app: () => ({ options: { projectId: mockProjectId } }) },
}));

const originalVariant = process.env.E2E_VARIANT;
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

// A module, so its top-level names do not collide with other test files.
export {};
