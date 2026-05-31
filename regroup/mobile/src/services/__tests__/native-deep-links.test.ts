import { createInvitationFromLink } from '../native-deep-links';

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
});
