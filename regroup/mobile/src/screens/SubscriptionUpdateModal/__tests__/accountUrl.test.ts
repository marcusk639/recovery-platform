/**
 * Pins how SubscriptionUpdateModal builds its "Fix Subscription" URL.
 *
 * Regression cover for a defect found 2026-10-02: this modal hardcoded
 * https://regroup-app.com/my-account and ignored RATS_WEB_URL, so a staging or
 * dev build sent a lapsed operator to the PRODUCTION billing page. The sibling
 * paywall screen read the env var correctly, so the two deep links disagreed.
 *
 * The path differs from SubscriptionRequiredScreen's /billing on purpose:
 * /billing is a web redirect shim that already-shipped mobile builds have
 * compiled in, so only the host is shared. See webPortalUrl.test.ts.
 *
 * The URL is computed at module load, so each case re-imports with a fresh env.
 */

const MODAL = '../SubscriptionUpdateModal';

/** Re-imports the modal with RATS_WEB_URL set (or absent) and returns its account URL. */
function accountUrlFor(ratsWebUrl: string | undefined): string {
  jest.resetModules();
  if (ratsWebUrl === undefined) {
    delete process.env.RATS_WEB_URL;
  } else {
    process.env.RATS_WEB_URL = ratsWebUrl;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(MODAL).ACCOUNT_URL;
}

describe('SubscriptionUpdateModal account URL', () => {
  const original = process.env.RATS_WEB_URL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.RATS_WEB_URL;
    } else {
      process.env.RATS_WEB_URL = original;
    }
    jest.resetModules();
  });

  it('defaults to the production origin plus the my-account path', () => {
    expect(accountUrlFor(undefined)).toBe('https://regroup-app.com/my-account');
  });

  it('honours RATS_WEB_URL as a base rather than hardcoding production', () => {
    expect(accountUrlFor('https://staging.regroup-app.com')).toBe(
      'https://staging.regroup-app.com/my-account',
    );
  });

  it('does not double the separator when the base has trailing slashes', () => {
    expect(accountUrlFor('https://staging.regroup-app.com/')).toBe(
      'https://staging.regroup-app.com/my-account',
    );
    expect(accountUrlFor('https://staging.regroup-app.com///')).toBe(
      'https://staging.regroup-app.com/my-account',
    );
  });

  it('never sends a non-production build to the production host', () => {
    for (const base of [
      'https://staging.regroup-app.com',
      'http://localhost:4200',
    ]) {
      expect(accountUrlFor(base)).not.toContain('https://regroup-app.com');
    }
  });

  it('always produces a path, never a bare origin', () => {
    for (const base of [
      undefined,
      'https://regroup-app.com',
      'https://regroup-app.com/',
      'http://localhost:4200',
    ]) {
      expect(accountUrlFor(base)).toMatch(/\/my-account$/);
    }
  });
});
