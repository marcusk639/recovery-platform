// src/__tests__/util/user.test.ts

const mockGetUsers = jest.fn();
jest.mock('../../api/firestore', () => ({
  getUsers: mockGetUsers,
}));

const mockAuthUpdateUser = jest.fn();
jest.mock('firebase-admin', () => ({
  auth: jest.fn(() => ({ updateUser: mockAuthUpdateUser })),
}));

jest.mock('../../util/email', () => ({
  regroupEmail: 'admin@regroup-app.com',
}));

import { getGuestsAsUsers, _verifyUserEmail, createConfirmationEmail, getUsersByEmail } from '../../util/user';

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// getUsersByEmail
// ---------------------------------------------------------------------------

describe('getUsersByEmail', () => {
  it('calls getUsers with "email" field and lowercased value', async () => {
    mockGetUsers.mockResolvedValue({ docs: [] });
    await getUsersByEmail('User@Example.COM');
    expect(mockGetUsers).toHaveBeenCalledWith('email', 'user@example.com');
  });

  it('returns the result from getUsers', async () => {
    const fakeResult = { docs: [{ data: () => ({ uid: 'u1', email: 'u1@test.com' }) }] };
    mockGetUsers.mockResolvedValue(fakeResult);
    const result = await getUsersByEmail('u1@test.com');
    expect(result).toBe(fakeResult);
  });
});

// ---------------------------------------------------------------------------
// getGuestsAsUsers
// ---------------------------------------------------------------------------

describe('getGuestsAsUsers', () => {
  it('returns an array of users matching the provided guests', async () => {
    const fakeUser = { uid: 'u1', email: 'u1@test.com' };
    mockGetUsers.mockResolvedValue({
      docs: [{ data: () => fakeUser }],
    });
    const guests = [{ userId: 'u1', houseId: 'h1' } as any];
    const result = await getGuestsAsUsers(guests);
    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe('u1');
  });

  it('calls getUsers with "uid" field for each guest', async () => {
    const fakeUser = { uid: 'u2', email: 'u2@test.com' };
    mockGetUsers.mockResolvedValue({
      docs: [{ data: () => fakeUser }],
    });
    const guests = [{ userId: 'u2', houseId: 'h2' } as any];
    await getGuestsAsUsers(guests);
    expect(mockGetUsers).toHaveBeenCalledWith('uid', 'u2');
  });

  it('returns an empty array when no guests are provided', async () => {
    const result = await getGuestsAsUsers([]);
    expect(result).toHaveLength(0);
    expect(mockGetUsers).not.toHaveBeenCalled();
  });

  it('handles multiple guests and returns one user per guest', async () => {
    const fakeUser1 = { uid: 'u1', email: 'u1@test.com' };
    const fakeUser2 = { uid: 'u2', email: 'u2@test.com' };
    mockGetUsers
      .mockResolvedValueOnce({ docs: [{ data: () => fakeUser1 }] })
      .mockResolvedValueOnce({ docs: [{ data: () => fakeUser2 }] });

    const guests = [
      { userId: 'u1', houseId: 'h1' } as any,
      { userId: 'u2', houseId: 'h1' } as any,
    ];
    const result = await getGuestsAsUsers(guests);
    expect(result).toHaveLength(2);
    expect(result[0].uid).toBe('u1');
    expect(result[1].uid).toBe('u2');
  });
});

// ---------------------------------------------------------------------------
// _verifyUserEmail
// ---------------------------------------------------------------------------

describe('_verifyUserEmail', () => {
  it('calls auth().updateUser with emailVerified: true', async () => {
    mockAuthUpdateUser.mockResolvedValue({});
    await _verifyUserEmail('user-123');
    expect(mockAuthUpdateUser).toHaveBeenCalledWith('user-123', { emailVerified: true });
  });

  it('returns the result of auth().updateUser', async () => {
    const fakeResult = { uid: 'user-123', emailVerified: true };
    mockAuthUpdateUser.mockResolvedValue(fakeResult);
    const result = await _verifyUserEmail('user-123');
    expect(result).toBe(fakeResult);
  });
});

// ---------------------------------------------------------------------------
// createConfirmationEmail
// ---------------------------------------------------------------------------

describe('createConfirmationEmail', () => {
  it('sends to the provided email address', () => {
    const email = createConfirmationEmail('test@example.com', 'https://example.com/verify');
    expect(email.to).toBe('test@example.com');
  });

  it('includes the verify link in html', () => {
    const email = createConfirmationEmail('test@example.com', 'https://example.com/verify');
    expect(email.html).toContain('https://example.com/verify');
  });

  it('includes the verify link in text body', () => {
    const email = createConfirmationEmail('test@example.com', 'https://example.com/verify');
    expect(email.text).toContain('https://example.com/verify');
  });

  it('sets subject to "Email Confirmation"', () => {
    const email = createConfirmationEmail('test@example.com', 'https://example.com/verify');
    expect(email.subject).toBe('Email Confirmation');
  });

  it('uses generic greeting when name is not provided', () => {
    const email = createConfirmationEmail('test@example.com', 'https://example.com/verify');
    expect(email.html).toContain('Hello,');
    expect(email.text).toContain('Hello,');
  });

  it('uses personalized greeting when name is provided', () => {
    const email = createConfirmationEmail('test@example.com', 'https://example.com/verify', 'Alice');
    expect(email.html).toContain('Hello Alice,');
    expect(email.text).toContain('Hello Alice,');
  });

  it('wraps a regroup-app:// custom scheme link in a web redirect URL', () => {
    const deepLink = 'regroup-app://verify?token=abc';
    const email = createConfirmationEmail('test@example.com', deepLink);
    expect(email.html).toContain('https://regroup-app.com/redirect?url=');
    expect(email.html).not.toContain('regroup-app://verify');
  });

  it('uses a regular https link directly without wrapping', () => {
    const link = 'https://example.com/verify?token=xyz';
    const email = createConfirmationEmail('test@example.com', link);
    expect(email.html).toContain(link);
  });

  it('sets from field using regroupEmail', () => {
    const email = createConfirmationEmail('test@example.com', 'https://example.com/verify');
    expect(email.from).toContain('admin@regroup-app.com');
  });
});
