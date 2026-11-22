import { Linking } from 'react-native';

import {
  createInvitationFromLink,
  getInitialLink,
  getLinkType,
  onLink,
  resolveDeepLinkUrl,
} from '../native-deep-links';

describe('createInvitationFromLink — token deep links', () => {
  it('extracts token from a new-format link', () => {
    const inv = createInvitationFromLink({
      url: 'regroup-app://?type=invitation&token=abc.123_xyz-456',
    });
    expect(inv.token).toBe('abc.123_xyz-456');
    // Legacy fields are empty — the server fills them via peekInvitation.
    expect(inv.houseId).toBe('');
    expect(inv.email).toBe('');
  });

  it('still parses a legacy URL-payload link (backward compat)', () => {
    const inv = createInvitationFromLink({
      url: 'regroup-app://?type=invitation&invitationType=admin&house=h1&inviter=u1&email=a@x.com&owner=o1',
    });
    expect(inv.token).toBeUndefined();
    expect(inv.houseId).toBe('h1');
    expect(inv.email).toBe('a@x.com');
  });

  // The invitation email links to the web /redirect page; on iOS the
  // associated domain opens the app with that https URL as it is.
  it('reads the token from the email link the app receives as a universal link', () => {
    const inv = createInvitationFromLink({
      url: 'https://regroup-app.com/redirect?url=com.rats.dev%3A%2F%2F%3Ftype%3Dinvitation%26token%3Dabc.123',
    });
    expect(inv.token).toBe('abc.123');
  });
});

describe('resolveDeepLinkUrl', () => {
  const wrapped =
    'https://regroup-app.com/redirect?url=com.rats.dev%3A%2F%2F%3Ftype%3Dinvitation%26token%3Dabc';

  it('unwraps the /redirect link the invitation email sends', () => {
    expect(resolveDeepLinkUrl(wrapped)).toBe('com.rats.dev://?type=invitation&token=abc');
  });

  it('leaves app-scheme links unchanged', () => {
    expect(resolveDeepLinkUrl('regroup-app://?type=invitation&token=t')).toBe(
      'regroup-app://?type=invitation&token=t',
    );
  });

  it('does not unwrap to a URL outside the app', () => {
    const evil =
      'https://regroup-app.com/redirect?url=https%3A%2F%2Fevil.example%2F%3Ftype%3Dinvitation';
    expect(resolveDeepLinkUrl(evil)).toBe(evil);
  });

  it('unwraps one level only', () => {
    const nested = `https://regroup-app.com/redirect?url=${encodeURIComponent(wrapped)}`;
    expect(resolveDeepLinkUrl(nested)).toBe(nested);
  });
});

describe('getLinkType', () => {
  it.each([
    ['type first, more params after', 'regroup-app://?type=invitation&token=t'],
    ['type is the only param', 'com.rats.dev://?type=invitation'],
    ['type after another param', 'com.rats.dev://?token=t&type=invitation'],
    [
      'the email link received as a universal link',
      'https://regroup-app.com/redirect?url=com.rats.dev%3A%2F%2F%3Ftype%3Dinvitation%26token%3Dt',
    ],
  ])('reads an invitation link: %s', (_label, url) => {
    expect(getLinkType({ url })).toBe('invitation');
  });

  it('returns null for a link with no type', () => {
    expect(getLinkType({ url: 'https://regroup-app.com/privacy-policy' })).toBeNull();
  });

  it("returns null for a type the app doesn't handle", () => {
    expect(getLinkType({ url: 'regroup-app://?type=emailConfirmation&x=1' })).toBeNull();
  });
});

describe('getInitialLink and onLink hand screens the unwrapped link', () => {
  const wrapped =
    'https://regroup-app.com/redirect?url=com.rats.dev%3A%2F%2F%3Ftype%3Dinvitation%26token%3Dabc';

  it('getInitialLink', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValueOnce(wrapped);
    await expect(getInitialLink()).resolves.toEqual({
      url: 'com.rats.dev://?type=invitation&token=abc',
    });
  });

  it('onLink', () => {
    let handler: ((e: { url: string }) => void) | undefined;
    jest.spyOn(Linking, 'addEventListener').mockImplementationOnce((_type, h) => {
      handler = h as (e: { url: string }) => void;
      return { remove: jest.fn() } as never;
    });
    const listener = jest.fn();
    onLink(listener);
    handler?.({ url: wrapped });
    expect(listener).toHaveBeenCalledWith({ url: 'com.rats.dev://?type=invitation&token=abc' });
  });
});
