// Owner decision 2026-11-26: when a resident's record links to their app account,
// their existing rent charges get that account's guestUserId, so the resident's own
// history (the rentCharges read rule checks guestUserId) shows every charge,
// including those made while the record had no account. A set account never moves.

import { logger } from 'firebase-functions';
import { FakeFirestore, asFirestore } from '../activities/fakeFirestore';
import { stampGuestCharges } from '../../rent/chargeAccountStamp';

type Data = Record<string, unknown>;
let db: FakeFirestore;

const charge = (o: Data = {}) => ({
  guestId: 'g1',
  houseId: 'h1',
  from: '2026-11-16',
  through: '2026-11-22',
  amountCents: 17500,
  guestUserId: null,
  ...o,
});
const stamp = (before: Data | undefined, after: Data | undefined, pageSize = 2) =>
  stampGuestCharges(asFirestore(db), 'g1', before, after, { pageSize });

beforeEach(() => {
  db = new FakeFirestore();
  db.seed('guests', 'g1', { houseId: 'h1', userId: 'u1', firstName: 'Pat' });
  db.seed('rentCharges', 'g1_2026-11-09', charge({ from: '2026-11-09' }));
  db.seed('rentCharges', 'g1_2026-11-16', charge());
  db.seed('rentCharges', 'g1_2026-11-23', charge({ from: '2026-11-23', guestUserId: 'other' }));
  db.seed('rentCharges', 'g2_2026-11-16', charge({ guestId: 'g2' }));
  for (const level of ['info', 'warn', 'error'] as const) {
    jest.spyOn(logger, level).mockImplementation(() => undefined);
  }
});
afterEach(() => jest.restoreAllMocks());

describe('stampGuestCharges', () => {
  it("fills guestUserId on the record's charges when it links to an account (none -> u1)", async () => {
    const r = await stamp({ houseId: 'h1' }, { houseId: 'h1', userId: 'u1' });
    expect(r).toEqual({ scanned: 3, stamped: 2 });
    expect(db.read('rentCharges', 'g1_2026-11-09')!.guestUserId).toBe('u1');
    expect(db.read('rentCharges', 'g1_2026-11-16')!.guestUserId).toBe('u1');
  });

  it("never moves a set account, and never touches another resident's charges", async () => {
    await stamp({ houseId: 'h1' }, { houseId: 'h1', userId: 'u1' });
    expect(db.read('rentCharges', 'g1_2026-11-23')!.guestUserId).toBe('other');
    expect(db.read('rentCharges', 'g2_2026-11-16')!.guestUserId).toBeNull();
  });

  it("stamps from the record's CURRENT account, so a late event converges", async () => {
    db.seed('guests', 'g1', { houseId: 'h1', userId: 'u2' });
    await stamp({ houseId: 'h1' }, { houseId: 'h1', userId: 'u1' });
    expect(db.read('rentCharges', 'g1_2026-11-16')!.guestUserId).toBe('u2');
  });

  it('does nothing when the account did not change or was cleared, and is idempotent', async () => {
    expect(await stamp({ userId: 'u1', firstName: 'A' }, { userId: 'u1', firstName: 'B' })).toEqual(
      {
        scanned: 0,
        stamped: 0,
      },
    );
    expect(await stamp({ userId: 'u1' }, { houseId: 'h1' })).toEqual({ scanned: 0, stamped: 0 });
    await stamp({}, { userId: 'u1' });
    expect((await stamp({}, { userId: 'u1' })).stamped).toBe(0);
  });

  it('stamps nothing when the record now has no account', async () => {
    db.seed('guests', 'g1', { houseId: 'h1', userId: '' });
    expect((await stamp({}, { userId: 'u1' })).stamped).toBe(0);
    expect(db.read('rentCharges', 'g1_2026-11-16')!.guestUserId).toBeNull();
  });

  it('logs ids and counts only, never names or amounts', async () => {
    const info = jest.spyOn(logger, 'info');
    await stamp({}, { userId: 'u1' });
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).toContain('rent_charge_stamp.done');
    expect(logged).not.toContain('Pat');
    expect(logged).not.toContain('17500');
  });
});
