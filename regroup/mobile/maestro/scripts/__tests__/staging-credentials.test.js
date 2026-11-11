const { parseOperatorCredentials } = require('../staging-credentials');

// What `npm run e2e:staging-operator` prints (regroup/e2e formatRunResult).
const OUTPUT = [
  'Staging operator ready (regroup-e2e, Stripe test mode).',
  '',
  '  Email:         operator-20261110-193000-ab12@rats-e2e.com',
  '  Password:      -Zx_9q8w7e6r5t4y3u2i1o',
  '  uid:           u123',
  '  Plan:          traditional starter, billed every month',
  '',
].join('\n');

describe('parseOperatorCredentials', () => {
  it('reads the email and password the operator command prints', () => {
    expect(parseOperatorCredentials(OUTPUT)).toEqual({
      email: 'operator-20261110-193000-ab12@rats-e2e.com',
      password: '-Zx_9q8w7e6r5t4y3u2i1o',
    });
  });

  it('refuses output without a password line', () => {
    expect(() => parseOperatorCredentials('  Email:         operator-x@rats-e2e.com\n')).toThrow(
      /no Password: line/,
    );
  });

  it('refuses output without an email line', () => {
    expect(() => parseOperatorCredentials('  Password:      abc\n')).toThrow(/no Email: line/);
  });

  it('refuses an email outside the e2e test domain', () => {
    const text = OUTPUT.replace('@rats-e2e.com', '@example.com');
    expect(() => parseOperatorCredentials(text)).toThrow(/not an @rats-e2e\.com/);
  });
});
