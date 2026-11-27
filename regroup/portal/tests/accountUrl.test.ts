import { describe, expect, it, vi } from 'vitest';

// Mocked, as the other portal tests mock @mobile modules: CI's portal job
// installs only the portal's dependencies, and importing the mobile module
// makes vitest read regroup/mobile/tsconfig.json, which extends a package
// only the mobile install provides.
vi.mock('@mobile/config/env', () => ({ webBaseUrl: () => 'https://regroup-app.com' }));

import { ACCOUNT_URL } from '../src/app/accountUrl';

// The portal's "Manage subscription" links: the website's account page, not
// /billing, and without the app's ?from=app hand-back flag.
describe('ACCOUNT_URL', () => {
  it('is the web account page with no query', () => {
    expect(ACCOUNT_URL).toBe('https://regroup-app.com/my-account');
  });
});
