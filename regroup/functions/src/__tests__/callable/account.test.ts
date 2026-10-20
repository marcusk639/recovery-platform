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
import { readFileSync } from 'fs';
import { join } from 'path';
import { deleteAccount, PARTIAL_MESSAGE } from '../../callable/account';

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

  it.each([
    ['missing', undefined],
    ['a string', '1700000000'],
    ['NaN', Number.NaN],
  ])('refuses a %s auth_time', async (_label, authTime) => {
    const r = req();
    (r.auth.token as any).auth_time = authTime;
    await expect(handler(r)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('accepts a sign-in exactly 300 seconds old and refuses 300.001', async () => {
    const nowMs = 1_800_000_000_000;
    const spy = jest.spyOn(Date, 'now').mockReturnValue(nowMs);
    try {
      const at = (ageSec: number) => ({
        auth: { uid: 'u1', token: { auth_time: nowMs / 1000 - ageSec } },
        data: {},
      });
      await expect(handler(at(300))).resolves.toEqual({ deleted: true });
      await expect(handler(at(300.001))).rejects.toMatchObject({ code: 'failed-precondition' });
      expect(mockRun).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('ignores a non-string email claim instead of crashing', async () => {
    const r = req();
    (r.auth.token as any).email = { value: 'demo_user@appdemo.net' };
    await expect(handler(r)).resolves.toEqual({ deleted: true });
    expect(mockRun).toHaveBeenCalledWith('u1');
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

  it('says part of the account was removed when earlier steps already ran', async () => {
    mockRun.mockRejectedValue(
      Object.assign(new Error('secret detail'), { step: 'personal', partial: true }),
    );
    const err = await handler(req()).catch((e: unknown) => e);
    expect(err).toMatchObject({
      code: 'internal',
      message: PARTIAL_MESSAGE,
      details: { partial: true },
    });
    expect(PARTIAL_MESSAGE).toBe(
      'Part of your account was already removed. Please try again; contact support if this keeps happening.',
    );
  });

  it('uses the plain retry message when nothing was removed yet', async () => {
    mockRun.mockRejectedValue(Object.assign(new Error('x'), { step: 'operator', partial: false }));
    await expect(handler(req())).rejects.toMatchObject({
      code: 'internal',
      message: "We couldn't finish deleting your account. Try again.",
    });
  });

  it('is exported from the functions entry point', () => {
    const entry = readFileSync(join(__dirname, '../../index.ts'), 'utf8');
    expect(entry).toMatch(/export \{ deleteAccount \} from '\.\/callable\/account';/);
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
