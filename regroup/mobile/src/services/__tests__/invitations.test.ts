jest.mock('../../../firebase-setup', () => ({
  functions: {
    httpsCallable: jest.fn(),
  },
}));

import {
  createInvitation,
  peekInvitation,
  redeemInvitation,
} from '../invitations';
import { functions } from '../../../firebase-setup';

beforeEach(() => jest.clearAllMocks());

describe('invitations service', () => {
  it('createInvitation passes the payload to the CF and returns the token', async () => {
    const mockCall = jest.fn().mockResolvedValue({
      data: { token: 'TOK-1' },
    });
    (functions.httpsCallable as jest.Mock).mockReturnValue(mockCall);

    const result = await createInvitation({
      email: 'x@x.com',
      houseId: 'h',
      role: 'admin',
    });
    expect(functions.httpsCallable).toHaveBeenCalledWith('createInvitation');
    expect(mockCall).toHaveBeenCalledWith({
      email: 'x@x.com',
      houseId: 'h',
      role: 'admin',
    });
    expect(result).toEqual({ token: 'TOK-1' });
  });

  it('peekInvitation passes the token and returns metadata', async () => {
    const mockCall = jest.fn().mockResolvedValue({
      data: {
        houseId: 'h',
        role: 'guest',
        invitedEmail: 'x@x.com',
        initialPhase: 'Phase 1',
      },
    });
    (functions.httpsCallable as jest.Mock).mockReturnValue(mockCall);

    const result = await peekInvitation('TOK-1');
    expect(functions.httpsCallable).toHaveBeenCalledWith('peekInvitation');
    expect(mockCall).toHaveBeenCalledWith({ token: 'TOK-1' });
    expect(result).toEqual({
      houseId: 'h',
      role: 'guest',
      invitedEmail: 'x@x.com',
      initialPhase: 'Phase 1',
    });
  });

  it('redeemInvitation passes the token', async () => {
    const mockCall = jest.fn().mockResolvedValue({
      data: { houseId: 'h', role: 'admin' },
    });
    (functions.httpsCallable as jest.Mock).mockReturnValue(mockCall);

    const result = await redeemInvitation('TOK-1');
    expect(functions.httpsCallable).toHaveBeenCalledWith('redeemInvitation');
    expect(mockCall).toHaveBeenCalledWith({ token: 'TOK-1' });
    expect(result).toEqual({ houseId: 'h', role: 'admin' });
  });
});
