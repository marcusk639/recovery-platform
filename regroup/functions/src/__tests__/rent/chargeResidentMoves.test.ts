// chargeResident after a move between houses: a move keeps chargedThrough from the old
// house, so only chargedHouseId says whether this house ever charged the resident.

jest.mock('firebase-functions/v2', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: require('../helpers/memFirestore').fieldValue,
}));
jest.mock('../../api/firestore', () => require('../helpers/memFirestore').apiFirestore);
jest.mock('../../util/notifications', () => ({ sendNotification: jest.fn() }));

import { mem } from '../helpers/memFirestore';
import { account, at, charges, guest, house, MAX } from '../helpers/rentFixtures';
import { chargeResident } from '../../rent/chargeResident';
import { sendNotification } from '../../util/notifications';

const notify = sendNotification as jest.Mock;

beforeEach(() => {
  mem.reset();
  notify.mockReset();
  notify.mockResolvedValue(undefined);
});

describe('moves between houses', () => {
  // A move keeps chargedThrough from the old house, so only chargedHouseId says who charged it.
  it('charged at A through Nov 30, moved to B Nov 10, B turns on Dec 5: B starts Jan 1, not $696.77', async () => {
    house({ rentFrequency: 'monthly', rentChargesStartDate: '2026-12-05', rentChargesStartedAtMs: MAX }, 'B');
    guest({ houseId: 'B', moveInDate: '2026-11-10' });
    account({ houseId: 'B', joinedOn: '2026-11-10', anchoredTo: '2026-10-01', chargeFrom: '2026-10-01', chargedThrough: '2026-11-30', chargedHouseId: 'A' });
    await expect(chargeResident('g1', at('2026-12-05'))).resolves.toMatchObject({ reason: 'not-due' });
    expect(mem.get('rentAccounts/g1')?.chargeFrom).toBe('2027-01-01');
    expect(charges()).toEqual([]);
  });

  it('weekly: charged at A Nov 9-15, moved to B Nov 12, B turns on Wed Nov 18: B starts Mon Nov 23', async () => {
    house({ rentChargesStartDate: '2026-11-18', rentChargesStartedAtMs: MAX }, 'B');
    guest({ houseId: 'B', moveInDate: '2026-11-12' });
    account({ houseId: 'B', joinedOn: '2026-11-12', anchoredTo: '2026-11-01', chargeFrom: '2026-11-09', chargedThrough: '2026-11-15', chargedHouseId: 'A' });
    await expect(chargeResident('g1', at('2026-11-18'))).resolves.toMatchObject({ reason: 'not-due' });
    expect(mem.get('rentAccounts/g1')?.chargeFrom).toBe('2026-11-23');
  });

  it('a charge records the house that made it', async () => {
    house();
    guest();
    await chargeResident('g1', at('2026-11-18'));
    expect(mem.get('rentAccounts/g1')?.chargedHouseId).toBe('H');
  });

});
