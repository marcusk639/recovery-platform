jest.mock('firebase-functions/v2/https', () => {
  const actual = jest.requireActual('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_opts: any, handler?: Function) => (typeof _opts === 'function' ? _opts : handler),
  };
});

jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../config', () => ({ STRIPE_SECRET_KEY: { name: 'STRIPE_SECRET_KEY' } }));

const mockRun = jest.fn();
jest.mock('../../accountDeletion', () => ({
  runAccountDeletion: (...args: unknown[]) => mockRun(...args),
}));

import { logger } from 'firebase-functions';
import { deleteAccount } from '../../callable/account';

const handler = deleteAccount as unknown as (req: any) => Promise<any>;
const nowSec = () => Math.floor(Date.now() / 1000);
const req = (authTimeAgo = 10, data: unknown = {}) => ({
  auth: { uid: 'u1', token: { auth_time: nowSec() - authTimeAgo } },
  data,
});

describe('deleteAccount', () => {
  beforeEach(() => {
    mockRun.mockReset();
    mockRun.mockResolvedValue({ completed: [] });
  });

  it('rejects unauthenticated callers', async () => {
    await expect(handler({ data: {} })).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('refuses a stale sign-in', async () => {
    await expect(handler(req(301))).rejects.toMatchObject({
      code: 'failed-precondition',
      message: 'Please sign in again to delete your account',
    });
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('refuses to delete the shared demo account (case-insensitive)', async () => {
    const r = req();
    (r.auth.token as any).email = 'Demo_User@AppDemo.net';
    await expect(handler(r)).rejects.toMatchObject({
      code: 'permission-denied',
      message: "The demo account can't be deleted.",
    });
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("deletes the caller's own account only", async () => {
    const res = await handler(req(10, { uid: 'someone-else' }));
    expect(res).toEqual({ deleted: true });
    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(mockRun).toHaveBeenCalledWith('u1');
  });

  it('maps a deletion failure to a retryable error', async () => {
    mockRun.mockRejectedValue(Object.assign(new Error('secret detail'), { code: 'boom' }));
    await expect(handler(req())).rejects.toMatchObject({
      code: 'internal',
      message: "We couldn't finish deleting your account. Try again.",
    });
  });

  it('logs the failed step attached by the deletion run', async () => {
    mockRun.mockRejectedValue(
      Object.assign(new Error('x'), { code: 'storage/unknown', step: 'personal' }),
    );
    await expect(handler(req())).rejects.toMatchObject({ code: 'internal' });
    expect(logger.error).toHaveBeenCalledWith('deleteAccount failed', {
      uid: 'u1',
      code: 'storage/unknown',
      step: 'personal',
    });
  });
});
