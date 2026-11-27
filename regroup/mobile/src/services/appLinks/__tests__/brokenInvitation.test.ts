/**
 * A link meant as an invitation that parseAppLink can't read (a mangled or
 * truncated email link) tells the user, instead of opening the app and doing
 * nothing. Any other unreadable link is still ignored. The web origin here is
 * the default, https://regroup-app.com (appLinkPrefixes, from RATS_WEB_URL).
 */
import { Alert } from 'react-native';
import { claimsInvitation, parseAppLink } from '../parseAppLink';
import { reportBrokenInvitationLink } from '../brokenInvitation';

const brokenInvitations = [
  'regroup-app://invite?token=bad!',
  'regroup-app://invite?token=',
  'regroup-app://invite',
  'com.rats.dev://invite?token=a%zz',
  'regroup-app://?type=invitation&token=bad!',
  'regroup-app://?type=invitation&house=h1',
  'https://regroup-app.com/invite?token=',
  'https://regroup-app.com/invite/?token=bad!',
  'https://regroup-app.com/invite#token=',
  'https://regroup-app.com/invite/#token=bad!',
  // The https token belongs in the fragment; in the query it is refused.
  'https://regroup-app.com/invite?token=abc',
];

const notInvitations = [
  'regroup-app://app/house',
  'regroup-app://checkout-return?result=nope',
  'regroup-app://?type=other&token=abc',
  'https://regroup-app.com/pricing',
  'https://evil.example/invite?token=',
  'http://regroup-app.com/invite?token=',
  'not a url',
];

describe('claimsInvitation', () => {
  it.each(brokenInvitations)('%s claims to be an invitation, and does not parse', (url) => {
    expect(claimsInvitation(url)).toBe(true);
    expect(parseAppLink(url)).toBeNull();
  });

  it.each(notInvitations)('%s does not claim to be an invitation', (url) => {
    expect(claimsInvitation(url)).toBe(false);
  });

  it('is true for a valid invitation too', () => {
    expect(claimsInvitation('https://regroup-app.com/invite#token=abc')).toBe(true);
  });
});

describe('reportBrokenInvitationLink', () => {
  let alert: jest.SpyInstance;
  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alert.mockRestore());

  it('tells the user a broken invitation link cannot be used', () => {
    expect(reportBrokenInvitationLink('regroup-app://invite?token=bad!')).toBe(true);
    expect(alert).toHaveBeenCalledTimes(1);
    const [title, message] = alert.mock.calls[0];
    expect(title).toMatch(/invitation/i);
    expect(message).toMatch(/new/i);
  });

  it('says nothing about a link that is not an invitation', () => {
    expect(reportBrokenInvitationLink('https://regroup-app.com/pricing')).toBe(false);
    expect(alert).not.toHaveBeenCalled();
  });

  it('never puts the link or its token in the message', () => {
    reportBrokenInvitationLink('regroup-app://invite?token=secret-ish!');
    expect(JSON.stringify(alert.mock.calls[0])).not.toContain('secret-ish');
  });
});
