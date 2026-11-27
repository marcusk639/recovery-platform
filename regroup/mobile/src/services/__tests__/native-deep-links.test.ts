import { Linking } from 'react-native';

import {
  createInvitationFromLink,
  getInitialLink,
  getLinkType,
  isValidDeepLink,
  onLink,
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

  // The web /redirect page is gone (owner decision 2026-11-27): emails link
  // to /invite, and no invitation outside pre-launch testing used the old form.
  it('refuses the old /redirect email link', () => {
    expect(() =>
      createInvitationFromLink({
        url: 'https://regroup-app.com/redirect?url=com.rats.dev%3A%2F%2F%3Ftype%3Dinvitation%26token%3Dabc.123',
      }),
    ).toThrow('Failed to parse invitation link');
  });
});

describe('the old /redirect wrapper is not unwrapped', () => {
  const wrapped =
    'https://regroup-app.com/redirect?url=com.rats.dev%3A%2F%2F%3Ftype%3Dinvitation%26token%3Dabc';

  it('is not a link the app handles', () => {
    expect(isValidDeepLink(wrapped)).toBe(false);
  });

  it('still handles the app-scheme link it used to carry', () => {
    expect(isValidDeepLink('regroup-app://?type=invitation&token=t')).toBe(true);
  });

  it('does not handle one wrapping a URL outside the app', () => {
    const evil =
      'https://regroup-app.com/redirect?url=https%3A%2F%2Fevil.example%2F%3Ftype%3Dinvitation';
    expect(isValidDeepLink(evil)).toBe(false);
  });

  it('does not handle a nested wrapper', () => {
    const nested = `https://regroup-app.com/redirect?url=${encodeURIComponent(wrapped)}`;
    expect(isValidDeepLink(nested)).toBe(false);
  });
});

describe('getLinkType', () => {
  it.each([
    ['type first, more params after', 'regroup-app://?type=invitation&token=t'],
    ['type is the only param', 'com.rats.dev://?type=invitation'],
    ['type after another param', 'com.rats.dev://?token=t&type=invitation'],
  ])('reads an invitation link: %s', (_label, url) => {
    expect(getLinkType({ url })).toBe('invitation');
  });

  it('returns null for the old /redirect email link', () => {
    expect(
      getLinkType({
        url: 'https://regroup-app.com/redirect?url=com.rats.dev%3A%2F%2F%3Ftype%3Dinvitation%26token%3Dt',
      }),
    ).toBeNull();
  });

  it('returns null for a link with no type', () => {
    expect(getLinkType({ url: 'https://regroup-app.com/privacy-policy' })).toBeNull();
  });

  it("returns null for a type the app doesn't handle", () => {
    expect(getLinkType({ url: 'regroup-app://?type=emailConfirmation&x=1' })).toBeNull();
  });
});

describe('getInitialLink and onLink drop the old /redirect link', () => {
  const wrapped =
    'https://regroup-app.com/redirect?url=com.rats.dev%3A%2F%2F%3Ftype%3Dinvitation%26token%3Dabc';

  it('getInitialLink', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValueOnce(wrapped);
    await expect(getInitialLink()).resolves.toBeNull();
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
    expect(listener).not.toHaveBeenCalled();
  });
});
