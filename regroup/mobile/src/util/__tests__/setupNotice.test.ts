import { Alert } from 'react-native';
import { notifySetupCompletion, setupCompletionNotice } from '../setupNotice';

describe('setupCompletionNotice', () => {
  it.each([undefined, null, {}, { inviteFailures: 0, photoFailures: 0 }])(
    'returns null when nothing failed (%p)',
    (result) => {
      expect(setupCompletionNotice(result)).toBeNull();
    },
  );

  // There is no per-house invitations list: invites are re-sent from House
  // Settings (Admin Management, Guests), and photos added under Details.
  it('reports failed invitations', () => {
    expect(setupCompletionNotice({ inviteFailures: 2, photoFailures: 0 })).toBe(
      "Setup complete. 2 invitation(s) couldn't be sent — invite them again from House Settings.",
    );
  });

  it('reports failed photos', () => {
    expect(setupCompletionNotice({ inviteFailures: 0, photoFailures: 1 })).toBe(
      "Setup complete. 1 photo(s) couldn't upload — add them in House Settings > Details.",
    );
  });

  it('reports both', () => {
    expect(setupCompletionNotice({ inviteFailures: 1, photoFailures: 3 })).toBe(
      "Setup complete. 1 invitation(s) couldn't be sent — invite them again from House Settings. 3 photo(s) couldn't upload — add them in House Settings > Details.",
    );
  });

  it('names the houses and roles whose invitations failed, with where to redo each', () => {
    const notice = setupCompletionNotice({
      inviteFailures: 4,
      photoFailures: 0,
      failedInvites: [
        { houseId: 'a', houseName: 'Oak House', role: 'admin' },
        { houseId: 'a', houseName: 'Oak House', role: 'guest' },
        { houseId: 'a', houseName: 'Oak House', role: 'guest' },
        { houseId: 'b', houseName: 'Elm House', role: 'senior-peer' },
      ],
    });
    expect(notice).toBe(
      "Setup complete. Invitations couldn't be sent for Oak House (admin, guest) and Elm House (senior peer). " +
        'Re-invite admins from House Settings > Admin Management. ' +
        'Re-invite guests from House Settings > Guests. ' +
        "Senior peer invitations can't be re-sent in the app yet; contact support.",
    );
  });

  it('falls back to "a house" when a failed invitation has no house name', () => {
    expect(
      setupCompletionNotice({
        inviteFailures: 1,
        failedInvites: [{ houseId: 'a', houseName: '', role: 'guest' }],
      }),
    ).toBe(
      "Setup complete. Invitations couldn't be sent for a house (guest). Re-invite guests from House Settings > Guests.",
    );
  });

  it('ignores non-numeric counts', () => {
    expect(setupCompletionNotice({ inviteFailures: '2' })).toBeNull();
  });
});

describe('notifySetupCompletion', () => {
  beforeEach(() => jest.spyOn(Alert, 'alert').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('alerts with the notice when something failed', () => {
    notifySetupCompletion({ inviteFailures: 1, photoFailures: 0 });
    expect(Alert.alert).toHaveBeenCalledWith(setupCompletionNotice({ inviteFailures: 1 }));
  });

  it('does not alert when nothing failed', () => {
    notifySetupCompletion({ inviteFailures: 0, photoFailures: 0 });
    notifySetupCompletion(undefined);
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
