/**
 * Guards the single Stripe API version.
 *
 * The empty-string case is the interesting one. `??` does not catch '', and an
 * empty apiVersion is not inert: stripe-node picks its own default with `||`, so
 * STRIPE_API_VERSION= in a deployed .env would hand every client the SDK default
 * while looking like a deliberate override. That is invisible today only because
 * the SDK default happens to equal the pin, and the next SDK upgrade ends that.
 */

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
