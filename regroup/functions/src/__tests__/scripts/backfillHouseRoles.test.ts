// Backfill of house-roles records for existing staff-claim holders
// (scripts/backfillHouseRoles). In-memory Firestore and a fake Auth;
// scriptBootstrap is stubbed so importing is inert.
jest.mock('../../scripts/scriptBootstrap', () => ({}));
jest.mock('firebase-admin', () => ({ firestore: jest.fn(), auth: jest.fn() }));

import { mem, memDb } from '../helpers/memFirestore';
import { backfillHouseRoles } from '../../scripts/backfillHouseRoles';

const H = 'h';
const A = { admin: { [H]: true } };
const users: Array<{ uid: string; customClaims: Record<string, unknown> }> = [
  { uid: 'owner', customClaims: { admin: { [H]: true }, superAdmin: { [H]: true } } },
  { uid: 'listed', customClaims: { admin: [H] } }, // legacy array shape
  { uid: 'invited', customClaims: A },
  { uid: 'peer', customClaims: { ...A, guest: { [H]: true } } },
  { uid: 'exPeer', customClaims: A },
  { uid: 'unknown', customClaims: A },
  { uid: 'resident', customClaims: { guest: { [H]: true } } },
];
// Two pages, to cover paging. getUser reads the same list (the stale pass
// re-reads each account's claims right before acting).
const authClient = {
  getUser: jest.fn(async (uid: string) => {
    const u = users.find((x) => x.uid === uid);
    if (!u) throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
    return u;
  }),
  listUsers: jest.fn(async (_max: number, token?: string) =>
    token ? { users: users.slice(4) } : { users: users.slice(0, 4), pageToken: 'p2' },
  ),
};

beforeEach(() => {
  mem.reset();
  mem.seed(`houses/${H}`, {
    id: H,
    ownerId: 'owner',
    superAdminId: 'owner',
    adminIds: ['adm-listed'],
  });
  mem.seed('admins/adm-listed', { userId: 'listed', houseIds: [H] });
  // Server-written evidence for the owner (scripts/backfillHouseOwners).
  mem.seed('users/owner', { subscriptionMetadata: { status: 'active', houses: { [H]: {} } } });
  mem.seed('invitations/T', {
    houseId: H,
    role: 'admin',
    inviterUid: 'owner',
    redeemedByUid: 'invited',
  });
  mem.seed('guests/peer-doc', { houseId: H, userId: 'peer', status: 'active', isAdmin: true });
  mem.seed('guests/ex-doc', { houseId: H, userId: 'exPeer', status: 'discharged', isAdmin: true });
});

it('writes manager only when unambiguous; every other staff holder is peerLeader, listed for review', async () => {
  const report = await backfillHouseRoles(memDb, authClient, { apply: false });
  const tiers = Object.fromEntries(report.toWrite.map((r) => [r.uid, `${r.tier}:${r.reason}`]));
  // superAdminId and ownerId agree: the primary owner record (pass 1).
  expect(report.owners).toEqual([
    {
      uid: 'owner',
      houseId: H,
      tier: 'owner',
      reason: expect.stringMatching(/^fields, subscription and claim agree/),
    },
  ]);
  expect(tiers).toEqual({
    listed: 'manager:manager-unambiguous', // in adminIds through its admins doc
    invited: 'manager:manager-unambiguous', // admin invitation from the owner
    peer: 'peerLeader:active-resident-isAdmin',
    exPeer: 'peerLeader:has-guest-doc', // ever had a guest doc here
    unknown: 'peerLeader:staff-not-resident',
  });
  expect(report.review.map((r) => r.uid).sort()).toEqual(['exPeer', 'peer', 'unknown']);
});

it('dry run writes nothing; apply writes once and never overwrites', async () => {
  await backfillHouseRoles(memDb, authClient, { apply: false });
  expect(mem.get(`house-roles/${H}_peer`)).toBeUndefined();

  mem.seed(`house-roles/${H}_listed`, { tier: 'peerLeader', via: 'invitation' });
  const first = await backfillHouseRoles(memDb, authClient, { apply: true });
  expect(first.existing).toBe(1);
  expect(mem.get(`house-roles/${H}_peer`)).toMatchObject({ tier: 'peerLeader', via: 'backfill' });
  expect(mem.get(`house-roles/${H}_listed`)).toMatchObject({
    tier: 'peerLeader',
    via: 'invitation',
  });

  const second = await backfillHouseRoles(memDb, authClient, { apply: true });
  expect(second.toWrite).toEqual([]);
});

it('a record created meanwhile (a grant racing the backfill) is skipped, not an error', async () => {
  // Between the existence check and the create, a grant records "unknown".
  const racing: any = {
    ...memDb,
    collection: (name: string) => {
      const col = memDb.collection(name);
      if (name !== 'house-roles') return col;
      return {
        ...col,
        doc: (id: string) => {
          const ref = col.doc(id);
          return {
            ...ref,
            create: async (d: Record<string, unknown>) => {
              if (id === `${H}_unknown`) {
                mem.seed(`house-roles/${id}`, { tier: 'manager', via: 'addAdminAuthorization' });
              }
              return ref.create(d);
            },
          };
        },
      };
    },
  };

  const report = await backfillHouseRoles(racing, authClient, { apply: true });

  expect(mem.get(`house-roles/${H}_unknown`)).toMatchObject({ tier: 'manager' });
  expect(report.toWrite.map((r) => r.uid)).not.toContain('unknown');
  expect(report.review.map((r) => r.uid)).not.toContain('unknown');
});

describe('owner, invitation and stale-record passes', () => {
  it('records the evidence-backed owner as the PRIMARY owner; another superAdmin is a co-owner', async () => {
    users.push({ uid: 'co', customClaims: { superAdmin: { [H]: true }, admin: { [H]: true } } });
    await backfillHouseRoles(memDb, authClient, { apply: true });
    users.pop();
    expect(mem.get(`house-roles/${H}_owner`)).toMatchObject({ tier: 'owner', primary: true });
    expect(mem.get(`house-roles/${H}_co`)).toMatchObject({ tier: 'owner' });
    expect(mem.get(`house-roles/${H}_co`)).not.toHaveProperty('primary');
  });

  it('marks every redeemed invitation completed, so an old token never regrants', async () => {
    mem.seed('invitations/OLD', { houseId: H, role: 'admin', redeemedAt: '2026-01-01T00:00:00Z' });
    mem.seed('invitations/OPEN', { houseId: H, role: 'guest' });
    const report = await backfillHouseRoles(memDb, authClient, { apply: true });
    expect(report.invitationsStamped).toBe(1);
    expect(mem.get('invitations/OLD')).toMatchObject({ grantCompletedAt: '2026-01-01T00:00:00Z' });
    expect(mem.get('invitations/OPEN')?.grantCompletedAt).toBeUndefined();
  });

  it('a re-run lowers or removes records whose claims are gone; the primary owner stays', async () => {
    mem.seed(`house-roles/${H}_gone`, { tier: 'manager' }); // account deleted
    mem.seed(`house-roles/${H}_resident`, { tier: 'manager' }); // admin claim removed; guest kept
    mem.seed(`house-roles/${H}_exco`, { tier: 'owner' }); // superAdmin removed, admin kept
    users.push({ uid: 'exco', customClaims: { admin: { [H]: true } } });
    const report = await backfillHouseRoles(memDb, authClient, { apply: true });
    users.pop();
    expect(mem.get(`house-roles/${H}_gone`)).toBeUndefined();
    expect(mem.get(`house-roles/${H}_resident`)).toMatchObject({ tier: 'resident' });
    expect(mem.get(`house-roles/${H}_exco`)).toMatchObject({ tier: 'manager' });
    expect(mem.get(`house-roles/${H}_owner`)).toMatchObject({ tier: 'owner', primary: true });
    expect(report.stale.map((r) => `${r.uid}:${r.tier}`).sort()).toEqual([
      'exco:manager',
      'gone:none',
      'resident:resident',
    ]);
  });
});

describe('round 5: one primary owner; races; review order', () => {
  it('a co-owner rewriting ownerId between run 1 and run 2 never makes a second primary (X2 / I1)', async () => {
    await backfillHouseRoles(memDb, authClient, { apply: true });
    mem.seed(`houses/${H}`, { id: H, ownerId: 'co', superAdminId: 'owner', adminIds: [] });
    const second = await backfillHouseRoles(memDb, authClient, { apply: true });
    const primaries = mem.paths('house-roles/').filter((p) => (mem.get(p) as any).primary === true);
    expect(primaries).toEqual([`house-roles/${H}_owner`]);
    expect(second.owners).toEqual([]);
    expect(second.ownerReview).toEqual([]); // the house already has its primary
  });

  it('fields, subscription and claim agreeing give a primary; a field mismatch or a missing field gives none and is listed (C1)', async () => {
    mem.seed(`houses/${H}`, { id: H, ownerId: 'co', superAdminId: 'owner' });
    mem.seed('houses/h2', { id: 'h2', ownerId: 'someone' });
    mem.seed('houses/h3', { id: 'h3', ownerId: 'o3', superAdminId: 'o3' });
    mem.seed('users/o3', { subscriptionMetadata: { status: 'active', houses: { h3: {} } } });
    users.push({ uid: 'o3', customClaims: { superAdmin: { h3: true } } });
    const report = await backfillHouseRoles(memDb, authClient, { apply: true });
    users.pop();
    expect(mem.paths(`house-roles/${H}_`).filter((p) => (mem.get(p) as any).primary)).toEqual([]);
    expect(mem.paths('house-roles/h2_')).toEqual([]);
    expect(mem.get('house-roles/h3_o3')).toMatchObject({
      houseId: 'h3',
      tier: 'owner',
      primary: true,
    });
    expect(report.ownerReview).toEqual([
      {
        houseId: H,
        reason: expect.stringMatching(/^superAdminId and ownerId differ; owner must choose/),
      },
      {
        houseId: 'h2',
        reason: expect.stringMatching(/^superAdminId or ownerId missing; owner must choose/),
      },
    ]);
  });

  it("the owner's --primary choice on a later run settles a listed house; a uid with no account is refused (C1)", async () => {
    mem.seed(`houses/${H}`, { id: H, ownerId: 'co', superAdminId: 'co' });
    await backfillHouseRoles(memDb, authClient, { apply: true });
    const bad = await backfillHouseRoles(memDb, authClient, {
      apply: true,
      primaryChoices: { [H]: 'x' },
    });
    expect(bad.owners).toEqual([]);
    await backfillHouseRoles(memDb, authClient, { apply: true, primaryChoices: { [H]: 'owner' } });
    expect(mem.get(`house-roles/${H}_owner`)).toMatchObject({ tier: 'owner', primary: true });
  });

  it('every record carries its houseId', async () => {
    mem.seed(`house-roles/${H}_old`, { tier: 'resident' });
    users.push({ uid: 'old', customClaims: { guest: { [H]: true } } });
    await backfillHouseRoles(memDb, authClient, { apply: true });
    users.pop();
    for (const p of mem.paths('house-roles/')) expect(mem.get(p)).toMatchObject({ houseId: H });
  });

  it('the stale pass leaves a record alone when the claims lookup fails, or it was granted after the run started (I2)', async () => {
    // Listed without claims, granted admin before the stale pass reads it.
    users.push({ uid: 'late', customClaims: {} });
    mem.seed(`house-roles/${H}_late`, {
      houseId: H,
      tier: 'manager',
      grantedAt: '2000-01-01T00:00:00Z',
    });
    const realGetUser = authClient.getUser.getMockImplementation()!;
    authClient.getUser.mockImplementation(async (uid: string) => {
      if (uid === 'late')
        throw Object.assign(new Error('unavailable'), { code: 'auth/internal-error' });
      return realGetUser(uid);
    });
    const report = await backfillHouseRoles(memDb, authClient, { apply: true });
    authClient.getUser.mockImplementation(realGetUser);
    users.pop();
    expect(mem.get(`house-roles/${H}_late`)).toMatchObject({ tier: 'manager' });
    // Reported in its own section (the script exits non-zero on these).
    expect(report.lookupFailed).toEqual([
      expect.objectContaining({ uid: 'late', reason: 'claims lookup failed' }),
    ]);
    // A record granted after the run started is not touched either.
    mem.seed(`house-roles/${H}_new`, {
      houseId: H,
      tier: 'manager',
      grantedAt: '2999-01-01T00:00:00Z',
    });
    await backfillHouseRoles(memDb, authClient, { apply: true });
    expect(mem.get(`house-roles/${H}_new`)).toMatchObject({ tier: 'manager' });
  });

  it('the real race: listed with no claim, granted before the stale pass reads it, the record survives', async () => {
    users.push({ uid: 'raced', customClaims: {} }); // what listUsers shows
    mem.seed(`house-roles/${H}_raced`, {
      houseId: H,
      tier: 'manager',
      grantedAt: '2000-01-01T00:00:00Z',
    });
    const realGetUser = authClient.getUser.getMockImplementation()!;
    authClient.getUser.mockImplementation(async (uid: string) =>
      uid === 'raced' ? { uid, customClaims: { admin: { [H]: true } } } : realGetUser(uid),
    );
    await backfillHouseRoles(memDb, authClient, { apply: true });
    authClient.getUser.mockImplementation(realGetUser);
    users.pop();
    expect(mem.get(`house-roles/${H}_raced`)).toMatchObject({ tier: 'manager' });
  });

  it('the dry run counts the records pass 0 would stamp with houseId (S3)', async () => {
    mem.seed(`house-roles/${H}_a`, { tier: 'resident' });
    mem.seed(`house-roles/${H}_b`, { houseId: H, tier: 'resident' });
    const report = await backfillHouseRoles(memDb, authClient, { apply: false });
    expect(report.houseIdsToStamp).toBe(1);
    expect(mem.get(`house-roles/${H}_a`)).not.toHaveProperty('houseId');
  });

  it('the review list starts with staff who are or were residents (S4)', async () => {
    const report = await backfillHouseRoles(memDb, authClient, { apply: false });
    expect(report.review.map((r) => r.reason)).toEqual([
      'has-guest-doc',
      'active-resident-isAdmin',
      'staff-not-resident',
    ]);
  });
});
