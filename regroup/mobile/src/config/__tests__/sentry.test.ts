/**
 * e2e builds must not report to the production Sentry project. Before this, an
 * e2e emulator build that crashed on purpose (E2EEmulatorUnreachable) was sent
 * to production Sentry tagged 'production'.
 */

const loadWithVariant = (variant?: string) => {
  jest.resetModules();
  if (variant === undefined) {
    delete process.env.E2E_VARIANT;
  } else {
    process.env.E2E_VARIANT = variant;
  }
  return require('../sentry') as typeof import('../sentry');
};

describe('sentryOptions', () => {
  const original = process.env.E2E_VARIANT;

  afterEach(() => {
    jest.resetModules();
    if (original === undefined) {
      delete process.env.E2E_VARIANT;
    } else {
      process.env.E2E_VARIANT = original;
    }
  });

  it('is enabled for a store build, tagged by __DEV__', () => {
    const options = loadWithVariant(undefined).sentryOptions();
    expect(options.enabled).toBe(true);
    expect(options.environment).toBe(__DEV__ ? 'development' : 'production');
    expect(options.dsn).toMatch(/^https:\/\/.+@sentry\.io\//);
  });

  it.each(['emulator', 'staging'])('is disabled for the %s e2e build', (variant) => {
    const options = loadWithVariant(variant).sentryOptions();
    expect(options.enabled).toBe(false);
    expect(options.environment).toBe(`e2e-${variant}`);
    expect(options.dsn).toBeUndefined();
  });

  it('treats an unrecognised variant as a store build', () => {
    const options = loadWithVariant('production').sentryOptions();
    expect(options.enabled).toBe(true);
    expect(options.environment).not.toMatch(/^e2e-/);
  });
});
