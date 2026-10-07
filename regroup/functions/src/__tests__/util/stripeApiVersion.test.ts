/**
 * Guards the single Stripe API version.
 *
 * The empty-string case is the interesting one. `??` does not catch '', and an
 * empty apiVersion is not inert: stripe-node picks its own default with `||`, so
 * STRIPE_API_VERSION= in a deployed .env would hand every client the SDK default
 * while looking like a deliberate override. That is invisible today only because
 * the SDK default happens to equal the pin, and the next SDK upgrade ends that.
 */

const mockLoggerInfo = jest.fn();
jest.mock('firebase-functions', () => ({
  logger: { info: mockLoggerInfo, warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const MODULE_PATH = '../../util/stripeApiVersion';
const PINNED = '2026-01-28.clover';

const load = (value?: string) => {
  jest.resetModules();
  if (value === undefined) {
    delete process.env.STRIPE_API_VERSION;
  } else {
    process.env.STRIPE_API_VERSION = value;
  }
  return require(MODULE_PATH).STRIPE_API_VERSION as string;
};

describe('STRIPE_API_VERSION', () => {
  const original = process.env.STRIPE_API_VERSION;

  afterEach(() => {
    jest.resetModules();
    if (original === undefined) {
      delete process.env.STRIPE_API_VERSION;
    } else {
      process.env.STRIPE_API_VERSION = original;
    }
  });

  it('uses the pinned version when the env var is unset', () => {
    expect(load(undefined)).toBe(PINNED);
  });

  it('honours a deployed override', () => {
    expect(load('2026-08-26.dahlia')).toBe('2026-08-26.dahlia');
  });

  it('treats an empty string as unset rather than as an override', () => {
    expect(load('')).toBe(PINNED);
  });

  it('treats whitespace as unset', () => {
    expect(load('   ')).toBe(PINNED);
  });

  it('trims a padded override rather than passing the padding to Stripe', () => {
    expect(load('  2026-08-26.dahlia  ')).toBe('2026-08-26.dahlia');
  });
});

/**
 * The resolution above is otherwise invisible at runtime. The only other signal is
 * the billing preflight, which is advisory until TIER_BILLING_ENABLED=true and can
 * be run without --strict — so without this line a divergent deployed override
 * could reach production with nothing recording the version in force.
 */
describe('STRIPE_API_VERSION startup log', () => {
  const original = process.env.STRIPE_API_VERSION;

  const loadWithLog = (value?: string) => {
    mockLoggerInfo.mockClear();
    jest.resetModules();
    if (value === undefined) {
      delete process.env.STRIPE_API_VERSION;
    } else {
      process.env.STRIPE_API_VERSION = value;
    }
    const mod = require(MODULE_PATH);
    return { mod, calls: mockLoggerInfo.mock.calls };
  };

  afterEach(() => {
    jest.resetModules();
    if (original === undefined) {
      delete process.env.STRIPE_API_VERSION;
    } else {
      process.env.STRIPE_API_VERSION = original;
    }
  });

  it('records the pinned version and says it came from the pin', () => {
    const { mod, calls } = loadWithLog(undefined);

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toContain('stripeApiVersion');
    expect(calls[0][1]).toEqual({
      apiVersion: PINNED,
      source: 'pin',
      pinned: PINNED,
    });
    expect(mod.STRIPE_API_VERSION_SOURCE).toBe('pin');
  });

  it('records an override as an override, alongside the pin it displaced', () => {
    // Both values are logged on purpose: "2026-08-26.dahlia, overriding
    // 2026-01-28.clover" is the line an operator needs to spot a divergent deploy
    // the preflight let through.
    const { mod, calls } = loadWithLog('2026-08-26.dahlia');

    expect(calls[0][1]).toEqual({
      apiVersion: '2026-08-26.dahlia',
      source: 'override',
      pinned: PINNED,
    });
    expect(mod.STRIPE_API_VERSION_SOURCE).toBe('override');
  });

  it('reports an empty override as the pin, not as an override', () => {
    // Matches the empty-string-as-unset rule above: an empty STRIPE_API_VERSION
    // must not be logged as a deliberate override.
    const { calls } = loadWithLog('');

    expect(calls[0][1]).toEqual({
      apiVersion: PINNED,
      source: 'pin',
      pinned: PINNED,
    });
  });
});
