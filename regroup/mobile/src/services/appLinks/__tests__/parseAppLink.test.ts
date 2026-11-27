/**
 * parseAppLink is the only parser for incoming app links (launch P5 Task 3).
 * The web origin in these cases is the default, https://regroup-app.com
 * (appLinkPrefixes, from RATS_WEB_URL).
 */
import { parseAppLink, parseQuery } from '../parseAppLink';

const invitation = { kind: 'invitation', token: 'abc' };

describe('parseAppLink — token invitations', () => {
  it.each([
    'regroup-app://?type=invitation&token=abc',
    'com.rats.dev://?type=invitation&token=abc',
    'regroup-app://invite?token=abc',
    'https://regroup-app.com/invite#token=abc',
    'https://regroup-app.com/invite?utm_source=email&utm_campaign=x#token=abc',
    'https://regroup-app.com/invite/#token=abc',
    'https://REGROUP-APP.com/invite#token=abc',
  ])('parses %s as the same invitation', (url) => {
    expect(parseAppLink(url)).toEqual(invitation);
  });

  // The emailed https link carries the token in the fragment, which a browser
  // never sends, so it stays out of the web request logs (createInvitation's
  // buildInviteLink). A token in the https query is what those logs record.
  it.each([
    ['a token in the query', 'https://regroup-app.com/invite?token=abc'],
    ['a token in the query beside an empty fragment', 'https://regroup-app.com/invite?token=abc#'],
    ['an empty fragment token', 'https://regroup-app.com/invite#token='],
    ['two different fragment tokens', 'https://regroup-app.com/invite#token=a&token=b'],
    ['an invalid fragment token', 'https://regroup-app.com/invite#token=a%20b'],
    ['malformed percent-encoding in the fragment', 'https://regroup-app.com/invite#token=%E0%A4%A'],
  ])('returns null for an https /invite link with %s', (_label, url) => {
    expect(parseAppLink(url)).toBeNull();
  });

  it('reads the custom-scheme invite token from the query, not the fragment', () => {
    expect(parseAppLink('regroup-app://invite?token=abc#token=other')).toEqual(invitation);
    expect(parseAppLink('regroup-app://invite#token=abc')).toBeNull();
  });

  it('reads ?type=invitation when it is the last parameter', () => {
    expect(parseAppLink('regroup-app://?token=abc&type=invitation')).toEqual(invitation);
  });

  it('decodes a percent-encoded token', () => {
    expect(parseAppLink('regroup-app://invite?token=a%2Db')).toEqual({
      kind: 'invitation',
      token: 'a-b',
    });
  });

  it('accepts a duplicate type when one of them is invitation', () => {
    expect(parseAppLink('regroup-app://?type=other&type=invitation&token=abc')).toEqual(invitation);
  });

  it('keeps everything after a second ? inside the query', () => {
    // The token value is "abc?x=1", which is not a valid token.
    expect(parseAppLink('regroup-app://?type=invitation&token=abc?x=1')).toBeNull();
    expect(parseAppLink('regroup-app://invite?utm=a?b&token=abc')).toEqual(invitation);
  });

  it.each([
    ['an empty token', 'regroup-app://?type=invitation&token='],
    ['a missing token on /invite', 'https://regroup-app.com/invite'],
    ['a token with a space', 'regroup-app://invite?token=a%20b'],
    ['a token with a slash', 'regroup-app://invite?token=a%2Fb'],
    ['malformed percent-encoding', 'regroup-app://invite?token=%E0%A4%A'],
    ['two different tokens', 'regroup-app://invite?token=a&token=b'],
    ['an over-long token', `regroup-app://invite?token=${'a'.repeat(257)}`],
  ])('returns null for %s', (_label, url) => {
    expect(parseAppLink(url)).toBeNull();
  });
});

describe('parseAppLink — legacy params invitations', () => {
  it('returns the params of a legacy invitation link', () => {
    expect(
      parseAppLink(
        'regroup-app://?type=invitation&invitationType=guest&house=h1&inviter=u1&email=a%40rats-e2e.com&owner=&initialPhase=Phase+1',
      ),
    ).toEqual({
      kind: 'invitation-legacy',
      params: {
        type: 'invitation',
        invitationType: 'guest',
        house: 'h1',
        inviter: 'u1',
        email: 'a@rats-e2e.com',
        owner: '',
        initialPhase: 'Phase 1',
      },
    });
  });

  it('accepts the legacy com.rats.dev:// scheme', () => {
    expect(
      parseAppLink('com.rats.dev://?type=invitation&house=h1&email=a@rats-e2e.com')?.kind,
    ).toBe('invitation-legacy');
  });

  it.each([
    ['no house', 'regroup-app://?type=invitation&email=a@rats-e2e.com'],
    ['no email', 'regroup-app://?type=invitation&house=h1'],
    ['no type', 'regroup-app://?house=h1&email=a@rats-e2e.com'],
    ['the https origin', 'https://regroup-app.com/?type=invitation&house=h1&email=a@x.com'],
  ])('returns null with %s', (_label, url) => {
    expect(parseAppLink(url)).toBeNull();
  });
});

describe('parseAppLink — checkout return', () => {
  it.each([
    ['https://regroup-app.com/checkout-return?result=success', 'success'],
    ['regroup-app://checkout-return?result=canceled', 'canceled'],
    ['regroup-app://app/checkout-return?result=portal', 'portal'],
    // app-links.json claims /app/*, so the https form reaches the app too.
    ['https://regroup-app.com/app/checkout-return?result=success', 'success'],
  ])('parses %s', (url, result) => {
    expect(parseAppLink(url)).toEqual({ kind: 'checkout-return', result });
  });

  it.each([
    'regroup-app://app/checkout-return',
    'regroup-app://app/checkout-return?result=paid',
    'regroup-app://app/checkout-return?result=success&result=canceled',
    'https://regroup-app.com/app/checkout-return?result=paid',
    'https://evil.example/app/checkout-return?result=success',
  ])('returns null for %s', (url) => {
    expect(parseAppLink(url)).toBeNull();
  });
});

describe('parseAppLink — links it does not claim', () => {
  it.each([
    ['another https host', 'https://evil.example/invite#token=abc'],
    ['a look-alike host', 'https://regroup-app.com.evil.example/invite#token=abc'],
    ['userinfo before another host', 'https://regroup-app.com@evil.example/invite#token=abc'],
    ['http on the web host', 'http://regroup-app.com/invite#token=abc'],
    ['a port on the web host', 'https://regroup-app.com:8443/invite#token=abc'],
    ['an unregistered scheme', 'regroup://?type=invitation&token=abc'],
    ['a page the app does not claim', 'https://regroup-app.com/pricing'],
    ['a navigation route', 'regroup-app://app/house'],
    [
      'a navigation route with an invitation query',
      'regroup-app://app/house?type=invitation&token=abc',
    ],
    ['an empty string', ''],
    ['not a url', 'invitation token abc'],
  ])('returns null for %s', (_label, url) => {
    expect(parseAppLink(url)).toBeNull();
  });

  it('returns null for a non-string', () => {
    expect(parseAppLink(undefined as unknown as string)).toBeNull();
  });
});

describe('parseQuery', () => {
  it('collects repeated keys and decodes + as a space', () => {
    expect(parseQuery('a=1&a=2&b=x+y&c')).toEqual(
      new Map([
        ['a', ['1', '2']],
        ['b', ['x y']],
        ['c', ['']],
      ]),
    );
  });

  it('returns null on malformed percent-encoding in a key the parser reads', () => {
    expect(parseQuery('token=%ZZ')).toBeNull();
    expect(parseQuery('type=%E0%A4%A')).toBeNull();
    expect(parseQuery('result=%')).toBeNull();
    expect(parseQuery('email=a%G0@x.com')).toBeNull();
  });

  it('skips a malformed pair in any other key', () => {
    expect(parseQuery('utm_source=%ZZ&token=abc')).toEqual(new Map([['token', ['abc']]]));
    expect(parseQuery('%ZZ=1&a=2')).toEqual(new Map([['a', ['2']]]));
  });
});

describe('parseAppLink with a malformed tracking parameter', () => {
  it('still parses the invitation', () => {
    expect(
      parseAppLink('https://regroup-app.com/invite?utm_campaign=50%off#token=abc'),
    ).toEqual({ kind: 'invitation', token: 'abc' });
  });

  it('still rejects a malformed token', () => {
    expect(parseAppLink('regroup-app://invite?token=ab%ZZ&utm_source=x')).toBeNull();
  });
});

// The web /redirect page is gone (owner decision 2026-11-27): emails link to
// /invite, and no invitation outside pre-launch testing used the old wrapper.
describe('parseAppLink — the old web /redirect wrapper', () => {
  const wrap = (inner: string) => `https://regroup-app.com/redirect?url=${encodeURIComponent(inner)}`;

  it('no longer unwraps a custom-scheme token invitation', () => {
    expect(parseAppLink(wrap('com.rats.dev://?type=invitation&token=abc'))).toBeNull();
  });

  it('refuses a wrapped link that is not a custom-scheme app link', () => {
    expect(parseAppLink(wrap('https://regroup-app.com/invite#token=abc'))).toBeNull();
    expect(parseAppLink(wrap('https://evil.example/?type=invitation&token=abc'))).toBeNull();
  });

  it('unwraps one level only', () => {
    expect(parseAppLink(wrap(wrap('regroup-app://invite?token=abc')))).toBeNull();
  });

  it('is not a route on the custom scheme', () => {
    expect(
      parseAppLink(`regroup-app://redirect?url=${encodeURIComponent('regroup-app://invite?token=abc')}`),
    ).toBeNull();
  });
});
