// src/__tests__/triggers/adminProfileSync.test.ts
//
// Wiring of onUserAdminProfileSync: every users/{userId} update hands the
// before/after user to syncAdminProfile (covered in
// __tests__/admins/profileSync.test.ts), and it retries, up to the
// RETRY_CUTOFF_MS age cutoff.

jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentUpdated: jest.fn((options: unknown, handler: unknown) => ({ options, handler })),
}));
jest.mock('../../api/firestore', () => ({ ratsFirestore: { name: 'rats-db' } }));
jest.mock('../../admins/profileSync', () => ({
  syncAdminProfile: jest.fn(async () => ({ matched: 0, updated: 0 })),
}));

import { logger } from 'firebase-functions';
import { onUserAdminProfileSync } from '../../triggers/firestore/adminProfileSync';
import { syncAdminProfile } from '../../admins/profileSync';

const trigger = onUserAdminProfileSync as unknown as {
  options: { document: string; retry: boolean };
  handler: (event: unknown) => Promise<void>;
};
const snap = (data: Record<string, unknown> | undefined) => ({ data: () => data });

beforeEach(() => (syncAdminProfile as jest.Mock).mockClear());

describe('onUserAdminProfileSync', () => {
  it('listens on users/{userId} updates and retries on failure', () => {
    expect(trigger.options).toEqual({ document: 'users/{userId}', retry: true });
  });

  it('passes the uid and both versions, and propagates a failure', async () => {
    await trigger.handler({
      time: new Date().toISOString(),
      params: { userId: 'u1' },
      data: { before: snap({ phoneNumber: 'a' }), after: snap({ phoneNumber: 'b' }) },
    });
    expect(syncAdminProfile).toHaveBeenCalledWith(
      { name: 'rats-db' },
      'u1',
      { phoneNumber: 'a' },
      { phoneNumber: 'b' },
    );
    (syncAdminProfile as jest.Mock).mockRejectedValueOnce(new Error('aborted'));
    await expect(
      trigger.handler({
        params: { userId: 'u1' },
        data: { before: snap({}), after: snap({ phoneNumber: 'b' }) },
      }),
    ).rejects.toThrow('aborted');
  });

  it('treats an event with no time as fresh', async () => {
    await trigger.handler({
      params: { userId: 'u1' },
      data: { before: snap({ phoneNumber: 'a' }), after: snap({ phoneNumber: 'b' }) },
    });
    expect(syncAdminProfile).toHaveBeenCalledTimes(1);
  });

  it('stops retrying an event older than RETRY_CUTOFF_MS', async () => {
    const error = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    await trigger.handler({
      time: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
      params: { userId: 'u1' },
      data: { before: snap({ phoneNumber: 'a' }), after: snap({ phoneNumber: 'b' }) },
    });
    expect(syncAdminProfile).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      'admin_profile_sync.stale_event',
      expect.objectContaining({ uid: 'u1' }),
    );
    error.mockRestore();
  });
});
