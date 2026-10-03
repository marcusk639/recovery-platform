/**
 * Pins how SubscriptionRequiredScreen builds its "Manage Subscription" URL.
 *
 * Regression cover for two defects found 2026-09-28:
 *  1. The default pointed at /billing, which was never built as a web route, so
 *     released builds opened a 404. /billing is now a redirect to /my-account
 *     (regroup/web/src/app/app-routing.module.ts).
 *  2. RATS_WEB_URL was read as a COMPLETE url although the 2026-05-19 paywall
 *     design spec defines it as a base, so pointing it at a bare origin silently
 *     dropped the path and opened the marketing home page instead.
 *
 * The URL is computed at module load, so each case re-imports with a fresh env.
 */

const SCREEN = '../SubscriptionRequiredScreen';

/** Re-imports the screen with RATS_WEB_URL set (or absent) and returns its portal URL. */
function portalUrlFor(ratsWebUrl: string | undefined): string {
  jest.resetModules();
  if (ratsWebUrl === undefined) {
    delete process.env.RATS_WEB_URL;
  } else {
    process.env.RATS_WEB_URL = ratsWebUrl;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(SCREEN).WEB_PORTAL_URL as string;
}

describe('SubscriptionRequiredScreen web portal URL', () => {
  const original = process.env.RATS_WEB_URL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.RATS_WEB_URL;
    } else {
      process.env.RATS_WEB_URL = original;
    }
    jest.resetModules();
  });

  it('defaults to the production origin plus the billing path', () => {
    expect(portalUrlFor(undefined)).toBe('https://regroup-app.com/billing');
  });

  it('treats RATS_WEB_URL as a base and appends the billing path', () => {
    expect(portalUrlFor('https://staging.regroup-app.com')).toBe(
      'https://staging.regroup-app.com/billing',
    );
  });

  it('does not double the separator when the base has trailing slashes', () => {
    expect(portalUrlFor('https://staging.regroup-app.com/')).toBe(
      'https://staging.regroup-app.com/billing',
    );
    expect(portalUrlFor('https://staging.regroup-app.com///')).toBe(
      'https://staging.regroup-app.com/billing',
    );
  });

  it('always produces a path, never a bare origin', () => {
    for (const base of [
      undefined,
      'https://regroup-app.com',
      'https://regroup-app.com/',
      'http://localhost:4200',
    ]) {
      expect(portalUrlFor(base)).toMatch(/\/billing$/);
    }
  });

  it('supports a local emulator base', () => {
    expect(portalUrlFor('http://localhost:4200')).toBe('http://localhost:4200/billing');
  });
});
