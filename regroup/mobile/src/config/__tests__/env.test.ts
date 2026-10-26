/**
 * Guards the build-time config accessors.
 *
 * The bug these exist to prevent: App.tsx read
 * `process.env.STRIPE_PUBLISHABLE_KEY ?? 'pk_test_placeholder'` with no babel
 * substitution configured, so every build — debug and release — initialised
 * Stripe with the placeholder and in-app rent collection could not work.
 */

const MODULE_PATH = '../env';

/** Re-requires the module with STRIPE_PUBLISHABLE_KEY set (or absent). */
const loadWithStripeKey = (key?: string) => {
  jest.resetModules();
  if (key === undefined) {
    delete process.env.STRIPE_PUBLISHABLE_KEY;
  } else {
    process.env.STRIPE_PUBLISHABLE_KEY = key;
  }
  return require(MODULE_PATH);
};

const loadWithWebUrl = (url?: string) => {
  jest.resetModules();
  if (url === undefined) {
    delete process.env.RATS_WEB_URL;
  } else {
    process.env.RATS_WEB_URL = url;
  }
  return require(MODULE_PATH);
};

describe('stripePublishableKey', () => {
  const originalKey = process.env.STRIPE_PUBLISHABLE_KEY;

  afterEach(() => {
    jest.resetModules();
    if (originalKey === undefined) {
      delete process.env.STRIPE_PUBLISHABLE_KEY;
    } else {
      process.env.STRIPE_PUBLISHABLE_KEY = originalKey;
    }
  });

  it('returns the configured key', () => {
    const env = loadWithStripeKey('pk_live_realkey123');
    expect(env.stripePublishableKey()).toBe('pk_live_realkey123');
    expect(env.isStripeConfigured()).toBe(true);
  });

  it('reports unconfigured rather than returning the placeholder', () => {
    const env = loadWithStripeKey(undefined);
    expect(env.stripePublishableKey()).toBe('');
    expect(env.isStripeConfigured()).toBe(false);
  });

  it('treats the historical placeholder as unconfigured', () => {
    // The literal that shipped in every build. Were it ever reintroduced as a
    // default, this must still read as "not configured".
    const env = loadWithStripeKey('pk_test_placeholder');
    expect(env.stripePublishableKey()).toBe('');
    expect(env.isStripeConfigured()).toBe(false);
  });

  it('distinguishes live keys from test keys', () => {
    const env = loadWithStripeKey('pk_live_realkey123');
    expect(env.isLiveStripeKey()).toBe(true);
    expect(env.isLiveStripeKey('pk_test_abc')).toBe(false);
    expect(env.isLiveStripeKey('')).toBe(false);
  });
});

describe('webBaseUrl', () => {
  const originalUrl = process.env.RATS_WEB_URL;

  afterEach(() => {
    jest.resetModules();
    if (originalUrl === undefined) {
      delete process.env.RATS_WEB_URL;
    } else {
      process.env.RATS_WEB_URL = originalUrl;
    }
  });

  it('honours the configured base url', () => {
    expect(loadWithWebUrl('https://staging.example.com').webBaseUrl()).toBe(
      'https://staging.example.com',
    );
  });

  it('strips trailing slashes so a path can be appended', () => {
    expect(loadWithWebUrl('https://staging.example.com///').webBaseUrl()).toBe(
      'https://staging.example.com',
    );
  });

  it('falls back to production when unset', () => {
    expect(loadWithWebUrl(undefined).webBaseUrl()).toBe('https://regroup-app.com');
  });
});

describe('e2eVariant / isE2EBuild', () => {
  const originalVariant = process.env.E2E_VARIANT;

  const loadWithVariant = (variant?: string) => {
    jest.resetModules();
    if (variant === undefined) {
      delete process.env.E2E_VARIANT;
    } else {
      process.env.E2E_VARIANT = variant;
    }
    return require(MODULE_PATH);
  };

  afterEach(() => {
    jest.resetModules();
    if (originalVariant === undefined) {
      delete process.env.E2E_VARIANT;
    } else {
      process.env.E2E_VARIANT = originalVariant;
    }
  });

  it('is null, and not an e2e build, when no variant was bundled', () => {
    const env = loadWithVariant(undefined);
    expect(env.e2eVariant()).toBeNull();
    expect(env.isE2EBuild()).toBe(false);
  });

  it('is null for an empty variant', () => {
    expect(loadWithVariant('').e2eVariant()).toBeNull();
  });

  it.each(['emulator', 'staging'])('recognises the %s variant as an e2e build', (variant) => {
    const env = loadWithVariant(variant);
    expect(env.e2eVariant()).toBe(variant);
    expect(env.isE2EBuild()).toBe(true);
  });

  it('does not treat an unknown variant as an e2e build', () => {
    const env = loadWithVariant('production');
    expect(env.e2eVariant()).toBeNull();
    expect(env.isE2EBuild()).toBe(false);
  });

  it('ignores __DEV__: a debug build without a variant is not an e2e build', () => {
    expect(__DEV__).toBe(true);
    expect(loadWithVariant(undefined).isE2EBuild()).toBe(false);
  });
});
