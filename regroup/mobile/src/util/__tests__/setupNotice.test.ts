import { Alert } from 'react-native';
import { notifySetupCompletion, setupCompletionNotice } from '../setupNotice';

describe('setupCompletionNotice', () => {
  it.each([undefined, null, {}, { inviteFailures: 0, photoFailures: 0 }])(
    'returns null when nothing failed (%p)',
    (result) => {
      expect(setupCompletionNotice(result)).toBeNull();
    },
  );

  it('reports failed invitations', () => {
    expect(setupCompletionNotice({ inviteFailures: 2, photoFailures: 0 })).toBe(
      "Setup complete. 2 invitation(s) couldn't be sent — resend them from the house's invitations.",
    );
  });

  it('reports failed photos', () => {
    expect(setupCompletionNotice({ inviteFailures: 0, photoFailures: 1 })).toBe(
      "Setup complete. 1 photo(s) couldn't upload — add them in House Settings.",
    );
  });

  it('reports both', () => {
    expect(setupCompletionNotice({ inviteFailures: 1, photoFailures: 3 })).toBe(
      "Setup complete. 1 invitation(s) couldn't be sent — resend them from the house's invitations. 3 photo(s) couldn't upload — add them in House Settings.",
    );
  });

  it('ignores non-numeric counts', () => {
    expect(setupCompletionNotice({ inviteFailures: '2' })).toBeNull();
  });
});

describe("notifySetupCompletion", () => {
  beforeEach(() => jest.spyOn(Alert, 'alert').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('alerts with the notice when something failed', () => {
    notifySetupCompletion({ inviteFailures: 1, photoFailures: 0 });
    expect(Alert.alert).toHaveBeenCalledWith(
      setupCompletionNotice({ inviteFailures: 1 })
    );
  });

  it('does not alert when nothing failed', () => {
    notifySetupCompletion({ inviteFailures: 0, photoFailures: 0 });
    notifySetupCompletion(undefined);
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
