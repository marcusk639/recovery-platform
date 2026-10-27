// Owner-run manager promotion (scripts/promoteManager). In-memory Firestore
// and a fake Auth; scriptBootstrap is stubbed so importing is inert.
jest.mock('../../scripts/scriptBootstrap', () => ({}));
jest.mock('firebase-admin', () => ({ firestore: jest.fn(), auth: jest.fn() }));

import { mem, memDb } from '../helpers/memFirestore';
import { parseArgs, promoteManager } from '../../scripts/promoteManager';

const H = 'h';
const claims: Record<string, Record<string, unknown>> = {
  pl: { admin: { [H]: true } },
  res: { guest: { [H]: true } },
  own: { admin: { [H]: true }, superAdmin: { [H]: true } },
};
const authClient = { getUser: async (uid: string) => ({ customClaims: claims[uid] ?? {} }) };

beforeEach(() => mem.reset());

it('parses --house, --uid and --apply', () => {
  expect(parseArgs(['--house', H, '--uid', 'pl'])).toEqual({ houseId: H, uid: 'pl', apply: false });
  expect(parseArgs(['--uid', 'pl', '--apply', '--house', H]).apply).toBe(true);
});

it('dry run reports and writes nothing; apply raises a peerLeader record to manager', async () => {
  mem.seed(`house-roles/${H}_pl`, { tier: 'peerLeader', via: 'backfill' });
  await expect(
    promoteManager(memDb, authClient, { houseId: H, uid: 'pl', apply: false }),
  ).resolves.toMatchObject({
    outcome: 'would-write',
    from: 'peerLeader',
  });
  expect(mem.get(`house-roles/${H}_pl`)).toMatchObject({ tier: 'peerLeader' });
  await promoteManager(memDb, authClient, { houseId: H, uid: 'pl', apply: true });
  expect(mem.get(`house-roles/${H}_pl`)).toMatchObject({ tier: 'manager', via: 'promoteScript' });
});

it('refuses an account without the admin claim, and never lowers an owner', async () => {
  await expect(
    promoteManager(memDb, authClient, { houseId: H, uid: 'res', apply: true }),
  ).resolves.toMatchObject({
    outcome: 'refused',
  });
  expect(mem.get(`house-roles/${H}_res`)).toBeUndefined();
  mem.seed(`house-roles/${H}_own`, { tier: 'owner', primary: true });
  await expect(
    promoteManager(memDb, authClient, { houseId: H, uid: 'own', apply: true }),
  ).resolves.toMatchObject({
    outcome: 'already',
  });
  expect(mem.get(`house-roles/${H}_own`)).toMatchObject({ tier: 'owner', primary: true });
});
