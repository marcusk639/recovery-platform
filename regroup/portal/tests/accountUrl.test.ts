import { describe, expect, it } from 'vitest';
import { ACCOUNT_URL } from '../src/app/accountUrl';

// The portal's "Manage subscription" links: the website's account page, not
// /billing, and without the app's ?from=app hand-back flag.
describe('ACCOUNT_URL', () => {
  it('is the web account page with no query', () => {
    expect(ACCOUNT_URL).toMatch(/^https?:\/\/[^/?]+\/my-account$/);
  });
});
