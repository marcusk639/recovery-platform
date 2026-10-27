// Backfill of house-roles records for existing staff-claim holders
// (scripts/backfillHouseRoles). In-memory Firestore and a fake Auth;
// scriptBootstrap is stubbed so importing is inert.
jest.mock('../../scripts/scriptBootstrap', () => ({}));
jest.mock('firebase-admin', () => ({ firestore: jest.fn(), auth: jest.fn() }));

import { mem, memDb } from '../helpers/memFirestore';
import { backfillHouseRoles } from '../../scripts/backfillHouseRoles';

const H = 'h';
const A = { admin: { [H]: true } };
const users = [
  { uid: 'owner', customClaims: { admin: { [H]: true }, superAdmin: { [H]: true } } },
  { uid: 'listed', customClaims: { admin: [H] } }, // legacy array shape
  { uid: 'invited', customClaims: A },
  { uid: 'peer', customClaims: { ...A, guest: { [H]: true } } },
  { uid: 'exPeer', customClaims: A },
  { uid: 'unknown', customClaims: A },
  { uid: 'resident', customClaims: { guest: { [H]: true } } },
];
// Two pages, to cover paging.
const authClient = {
  listUsers: jest.fn(async (_max: number, token?: string) =>
    token ? { users: users.slice(4) } : { users: users.slice(0, 4), pageToken: 'p2' },
  ),
};

beforeEach(() => {
  mem.reset();
  mem.seed(`houses/${H}`, { id: H, ownerId: 'owner', adminIds: ['adm-listed'] });
  mem.seed('admins/adm-listed', { userId: 'listed', houseIds: [H] });
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
  // The house's ownerId account gets the primary owner record (pass 1).
  expect(report.owners).toEqual([{ uid: 'owner', houseId: H, tier: 'owner', reason: 'ownerId' }]);
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
  it('records ownerId as the PRIMARY owner, even if the owner holds no claims; a superAdmin is a co-owner', async () => {
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
