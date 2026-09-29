// src/__tests__/util/superAdminClaim.test.ts

const mockGetUser = jest.fn();
const mockSetCustomUserClaims = jest.fn();
jest.mock('firebase-admin', () => ({
  auth: jest.fn(() => ({
    getUser: mockGetUser,
    setCustomUserClaims: mockSetCustomUserClaims,
  })),
}));

const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();
jest.mock('firebase-functions', () => ({
  logger: { warn: mockLoggerWarn, error: mockLoggerError, info: jest.fn() },
}));

import { grantPotentialSuperAdminClaim } from '../../util/superAdminClaim';

const mockUser = (claims: Record<string, unknown> = {}) => ({
  customClaims: claims,
});

beforeEach(() => jest.clearAllMocks());

describe('grantPotentialSuperAdminClaim', () => {
  it('grants the claim on a user with no existing claims', async () => {
    mockGetUser.mockResolvedValue(mockUser({}));
    mockSetCustomUserClaims.mockResolvedValue(undefined);

    const granted = await grantPotentialSuperAdminClaim('user-1');

    expect(granted).toBe(true);
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('user-1', {
      potentialSuperAdmin: true,
    });
  });

  // The critical case: setCustomUserClaims REPLACES the whole claims object,
  // so an existing admin/superAdmin claim must be read and spread back in,
  // never dropped.
  it('preserves existing admin and superAdmin claims (merge, not overwrite)', async () => {
    const existing = {
      admin: { 'house-1': true },
      superAdmin: { 'house-2': true },
    };
    mockGetUser.mockResolvedValue(mockUser(existing));
    mockSetCustomUserClaims.mockResolvedValue(undefined);

    const granted = await grantPotentialSuperAdminClaim('user-1');

    expect(granted).toBe(true);
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('user-1', {
      admin: { 'house-1': true },
      superAdmin: { 'house-2': true },
      potentialSuperAdmin: true,
    });
  });

  it('is idempotent: a second call with the claim already set is a no-op success', async () => {
    mockGetUser.mockResolvedValue(mockUser({ potentialSuperAdmin: true }));

    const granted = await grantPotentialSuperAdminClaim('user-1');

    expect(granted).toBe(true);
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });

  it('retries once on failure, and succeeds if the retry works', async () => {
    mockGetUser.mockResolvedValue(mockUser({}));
    mockSetCustomUserClaims
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(undefined);

    const granted = await grantPotentialSuperAdminClaim('user-1');

    expect(granted).toBe(true);
    expect(mockSetCustomUserClaims).toHaveBeenCalledTimes(2);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ userId: 'user-1' }),
    );
  });

  it('does not throw when both attempts fail, and reports not-granted', async () => {
    mockGetUser.mockResolvedValue(mockUser({}));
    mockSetCustomUserClaims.mockRejectedValue(new Error('persistent'));

    const granted = await grantPotentialSuperAdminClaim('user-1');

    expect(granted).toBe(false);
    expect(mockSetCustomUserClaims).toHaveBeenCalledTimes(2);
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ userId: 'user-1' }),
    );
    // No PII in the log payload — uid only.
    const [, errorPayload] = mockLoggerError.mock.calls[0];
    expect(Object.keys(errorPayload)).toEqual(expect.arrayContaining(['userId', 'error']));
  });

  it('does not throw when auth().getUser itself fails on both attempts', async () => {
    mockGetUser.mockRejectedValue(new Error('network down'));

    const granted = await grantPotentialSuperAdminClaim('user-1');

    expect(granted).toBe(false);
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });

  it('treats a user record with no customClaims at all as having none', async () => {
    mockGetUser.mockResolvedValue({ customClaims: undefined });
    mockSetCustomUserClaims.mockResolvedValue(undefined);

    const granted = await grantPotentialSuperAdminClaim('user-1');

    expect(granted).toBe(true);
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('user-1', {
      potentialSuperAdmin: true,
    });
  });

  it('logs a string message when a non-Error value is thrown', async () => {
    mockGetUser.mockResolvedValue(mockUser({}));
    mockSetCustomUserClaims.mockRejectedValue('boom');

    const granted = await grantPotentialSuperAdminClaim('user-1');

    expect(granted).toBe(false);
    const [, errorPayload] = mockLoggerError.mock.calls[0];
    expect(errorPayload.error).toBe('boom');
  });
});
