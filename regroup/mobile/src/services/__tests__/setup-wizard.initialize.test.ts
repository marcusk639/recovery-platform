// src/services/__tests__/setup-wizard.initialize.test.ts
//
// initializeHouses: payload contents, error mapping before vs after the
// createHouses callable succeeds, invite-failure reporting and photo failures.
// (setup-wizard.test.ts covers the happy paths and the other exports.)

jest.mock('../../../firebase-setup', () => ({
  firestore: { collection: jest.fn(), batch: jest.fn() },
  functions: { httpsCallable: jest.fn() },
}));

const mockHouseUpdate = jest.fn(() => Promise.resolve());
jest.mock('../house', () => ({
  houseCollection: { doc: jest.fn(() => ({ update: mockHouseUpdate })) },
}));
jest.mock('../invitations', () => ({ createInvitation: jest.fn() }));
jest.mock('../storage', () => ({ uploadHousePhoto: jest.fn() }));
jest.mock('../users', () => ({
  refreshClaims: jest.fn(),
  getAuthUser: jest.fn(),
}));
jest.mock('../subscription', () => ({ createHouses: jest.fn() }));
jest.mock('../../util/house', () => ({ getInitialPhase: jest.fn(() => undefined) }));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));
jest.mock('../../util/forEach', () => ({
  asyncForEach: jest.fn(async (items: any, fn: any) => {
    for (const item of Object.values(items)) await fn(item);
  }),
}));
jest.mock('../../../google/timezone', () => ({
  getTimezone: jest.fn(() => Promise.resolve('America/Chicago')),
}));

import { createHouses } from '../subscription';
import { getAuthUser } from '../users';
import { createInvitation } from '../invitations';
import { uploadHousePhoto } from '../storage';
import { logException } from '../../util/logging';
import { initializeHouses } from '../setup-wizard';
import {
  CREATE_HOUSES_CONTACT_SUPPORT_MESSAGE,
  CREATE_HOUSES_RETRY_MESSAGE,
  HOUSES_CREATED_RESTART_MESSAGE,
} from '../setup-wizard-errors';
import { Houses } from '../../types';
import { User } from '../../entities/User';

const operator = { id: 'op', email: 'op@test.com' } as unknown as User;
const makeHouses = (extra: Record<string, unknown> = {}): Houses =>
  ({
    h1: {
      id: 'h1',
      name: 'House One',
      lat: 41.8,
      lng: -87.6,
      pendingAdminInvites: ['a@test.com'],
      pendingGuestInvites: ['g@test.com'],
      ...extra,
    },
  } as unknown as Houses);
const created = {
  houseIds: ['server-h1'],
  idMap: { h1: 'server-h1' },
  admin: { id: 'admin-1' },
  subscriptionMetadata: {},
};
const fnError = (code: string, message: string) => Object.assign(new Error(message), { code });
const payloads = () => (createHouses as jest.Mock).mock.calls.map(([p]) => p);

beforeEach(() => {
  jest.clearAllMocks();
  (createHouses as jest.Mock).mockResolvedValue(created);
  (getAuthUser as jest.Mock).mockResolvedValue({ uid: 'op' });
  (createInvitation as jest.Mock).mockResolvedValue({ token: 't' });
  (uploadHousePhoto as jest.Mock).mockImplementation((_u: string, h: { id: string }) =>
    Promise.resolve({ houseId: h.id, url: `https://cdn/${h.id}` }),
  );
});

describe('initializeHouses — payload', () => {
  it("sends the wizard's certified answer", async () => {
    await initializeHouses(makeHouses({ certified: true }), operator);
    expect(payloads()[0][0]).toMatchObject({ requestKey: 'h1', certified: true });
  });

  it('two calls with the same houses send identical requestKeys', async () => {
    const houses = makeHouses();
    await initializeHouses(houses, operator);
    await initializeHouses(houses, operator);
    const [first, second] = payloads();
    expect(first.map((p: any) => p.requestKey)).toEqual(['h1']);
    expect(second.map((p: any) => p.requestKey)).toEqual(['h1']);
  });
});

describe('initializeHouses — createHouses failures', () => {
  it.each(['failed-precondition', 'invalid-argument'])(
    'surfaces the server message for %s',
    async (code) => {
      const err = fnError(code, 'Property limit reached for your plan');
      (createHouses as jest.Mock).mockRejectedValueOnce(err);
      const thrown = await initializeHouses(makeHouses(), operator).catch((e) => e);
      expect(thrown.message).toBe('Property limit reached for your plan');
      expect(thrown.cause).toBe(err);
      expect(getAuthUser).not.toHaveBeenCalled();
    },
  );

  // These refusals mean the account is inconsistent; the server logs them with
  // the uid, and the operator is told to contact support.
  it.each([
    ['already-exists', 'A house with this id already exists'],
    ['permission-denied', 'Admin profile does not belong to this user'],
  ])('does not pass the %s server message through', async (code, message) => {
    const err = fnError(code, message);
    (createHouses as jest.Mock).mockRejectedValueOnce(err);
    const thrown = await initializeHouses(makeHouses(), operator).catch((e) => e);
    expect(thrown.message).toBe(CREATE_HOUSES_CONTACT_SUPPORT_MESSAGE);
    expect(thrown.cause).toBe(err);
  });

  it('a server "Houses were created" internal error says the houses were created', async () => {
    const err = fnError('internal', 'Houses were created but access could not be granted.');
    (createHouses as jest.Mock).mockRejectedValueOnce(err);
    const thrown = await initializeHouses(makeHouses(), operator).catch((e) => e);
    expect(thrown.message).toBe(HOUSES_CREATED_RESTART_MESSAGE);
    expect(thrown.cause).toBe(err);
  });

  it('accepts web-SDK style prefixed codes', async () => {
    const err = fnError('functions/failed-precondition', 'Property limit reached for your plan');
    (createHouses as jest.Mock).mockRejectedValueOnce(err);
    const thrown = await initializeHouses(makeHouses(), operator).catch((e) => e);
    expect(thrown.message).toBe('Property limit reached for your plan');
    expect(thrown.cause).toBe(err);
  });

  it.each([
    ['internal', fnError('internal', 'INTERNAL')],
    ['unavailable (network)', fnError('unavailable', 'Network error')],
    ['unknown', new Error('boom')],
    ['non-Error', 'string rejection'],
  ])('uses the generic retry message for %s', async (_label, err) => {
    (createHouses as jest.Mock).mockRejectedValueOnce(err);
    const thrown = await initializeHouses(makeHouses(), operator).catch((e) => e);
    expect(thrown.message).toBe(CREATE_HOUSES_RETRY_MESSAGE);
    expect(thrown.cause).toBe(err);
    expect(logException).toHaveBeenCalledWith(err, expect.any(String));
  });
});

describe('initializeHouses — failures after createHouses succeeded', () => {
  it('a token refresh failure says the houses were created', async () => {
    const err = new Error('token refresh failed');
    (getAuthUser as jest.Mock).mockRejectedValueOnce(err);
    const thrown = await initializeHouses(makeHouses(), operator).catch((e) => e);
    expect(thrown.message).toBe(HOUSES_CREATED_RESTART_MESSAGE);
    expect(thrown.cause).toBe(err);
    expect(logException).toHaveBeenCalledWith(err, expect.stringContaining('server-h1'));
    expect(createInvitation).not.toHaveBeenCalled();
  });

  it('an id-mapping failure says the houses were created', async () => {
    (createHouses as jest.Mock).mockResolvedValueOnce({ ...created, idMap: undefined });
    await expect(initializeHouses(makeHouses(), operator)).rejects.toThrow(
      HOUSES_CREATED_RESTART_MESSAGE,
    );
    expect(getAuthUser).not.toHaveBeenCalled();
  });
});

describe('initializeHouses — invitations', () => {
  it('reports and logs failed invitations without emails', async () => {
    (createInvitation as jest.Mock)
      .mockRejectedValueOnce(new Error('send failed'))
      .mockResolvedValueOnce({ token: 't' });
    const result = await initializeHouses(makeHouses(), operator);

    expect(result.inviteFailures).toBe(1);
    expect(result.inviteError).toBeUndefined();
    expect(logException).toHaveBeenCalledWith(
      expect.any(Error),
      'houses=server-h1 sent=1 failed=1',
    );
    const logged = JSON.stringify((logException as jest.Mock).mock.calls);
    expect(logged).not.toContain('@test.com');
  });

  it('names the failed house/role pairs and logs each rejection code without emails', async () => {
    (createInvitation as jest.Mock)
      .mockRejectedValueOnce(fnError('invalid-argument', 'bad address a@test.com'))
      .mockRejectedValueOnce(new Error('g@test.com unreachable'));
    const result = await initializeHouses(makeHouses(), operator);

    expect(result.inviteFailures).toBe(2);
    expect(result.failedInvites).toEqual([
      { houseId: 'server-h1', houseName: 'House One', role: 'admin' },
      { houseId: 'server-h1', houseName: 'House One', role: 'guest' },
    ]);
    const messages = (logException as jest.Mock).mock.calls.map(([, m]) => m);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/house=server-h1 role=admin code=invalid-argument/),
        expect.stringMatching(/house=server-h1 role=guest code=unknown/),
      ]),
    );
    const logged = JSON.stringify((logException as jest.Mock).mock.calls, (_k, v) =>
      v instanceof Error ? v.message : v,
    );
    expect(logged).not.toContain('@test.com');
    expect(logged).not.toContain('House One');
  });

  const threeLists = () => makeHouses({ seniorPeerEmails: ['s@test.com'] });
  const loggedText = () =>
    JSON.stringify((logException as jest.Mock).mock.calls, (_k, v) =>
      v instanceof Error ? `${v.message} ${v.stack ?? ''}` : v,
    );

  it('counts every list when createInvitation throws synchronously', async () => {
    (createInvitation as jest.Mock).mockImplementation(({ email }: { email: string }) => {
      throw new Error(`cannot invite ${email}`);
    });
    const result = await initializeHouses(threeLists(), operator);

    expect(result.inviteFailures).toBe(3);
    expect(result.failedInvites.map((f: { role: string }) => f.role).sort()).toEqual([
      'admin',
      'guest',
      'senior-peer',
    ]);
    expect(loggedText()).not.toContain('@test.com');
  });

  it('counts every list when sendAllInvites itself throws synchronously', async () => {
    const { getInitialPhase } = jest.requireMock('../../util/house');
    (getInitialPhase as jest.Mock).mockImplementationOnce(() => {
      throw new Error('phase lookup failed for a@test.com');
    });
    const result = await initializeHouses(threeLists(), operator);

    expect(result.inviteError).toBeDefined();
    expect(result.inviteFailures).toBe(3);
    expect(result.failedInvites).toHaveLength(3);
    expect(loggedText()).not.toContain('@test.com');
  });

  it('reports zero failures when every invitation is sent', async () => {
    const result = await initializeHouses(makeHouses(), operator);
    expect(result.inviteFailures).toBe(0);
    expect(result.failedInvites).toEqual([]);
    expect(logException).not.toHaveBeenCalled();
  });
});

describe('initializeHouses — photos', () => {
  it('clears a failed photo instead of returning the local file path', async () => {
    (uploadHousePhoto as jest.Mock).mockRejectedValueOnce(new Error('upload failed'));
    const result = await initializeHouses(
      makeHouses({ imageUrl: 'file://local.jpg', avatar: 'file://local.jpg' }),
      operator,
    );

    expect(result.photoFailures).toBe(1);
    expect(result.houses['server-h1']).toMatchObject({ imageUrl: '', avatar: '' });
    expect(mockHouseUpdate).not.toHaveBeenCalled();
    expect(result.user.orgSetupCompleted).toBe(true);
  });
});
