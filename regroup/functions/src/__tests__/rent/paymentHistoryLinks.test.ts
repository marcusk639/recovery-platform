// A resident's Payment History lists payments by their account (guestUserId);
// staff list them by guest record. Cash a manager records for a resident with
// no account carries no guestUserId, so when an account is linked to that
// record, or an intake record is linked to the invite record, those payments
// must follow the person, as their rent charges already do.

jest.mock('firebase-functions/v2', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: require('../helpers/memFirestore').fieldValue,
}));
jest.mock('../../api/firestore', () => require('../helpers/memFirestore').apiFirestore);
jest.mock('../../util/notifications', () => ({ sendNotification: jest.fn() }));

import { mem } from '../helpers/memFirestore';
import { at, guest, H, house, invitedAs } from '../helpers/rentFixtures';
import { rentOnGuestWrite } from '../../rent/guestWriteRent';
import { linkIntakeRecord } from '../../rent/linkIntakeRecord';

const cash = (guestId: string, extra: Record<string, unknown> = {}) => ({
  guestId,
  houseId: H,
  amount: 5000,
  status: 'succeeded',
  description: 'Manual Payment — Cash',
  ...extra,
});

beforeEach(() => mem.reset());

describe('linking an account to a guest record', () => {
  const link = (userId: string) =>
    rentOnGuestWrite({
      guestId: 'g1',
      before: mem.get('guests/g1') ?? {},
      after: { ...(mem.get('guests/g1') ?? {}), userId },
      eventTime: at('2026-11-19').toISOString(),
    });

  it("lets the resident see the cash recorded before their account was linked", async () => {
    house();
    guest({ userId: '' });
    mem.seed('payments/m1', cash('g1'));

    await link('u9');

    expect(mem.get('payments/m1')?.guestUserId).toBe('u9');
  });

  it("leaves other residents' payments alone", async () => {
    house();
    guest({ userId: '' });
    mem.seed('payments/m2', cash('gOther'));

    await link('u9');

    expect(mem.get('payments/m2')?.guestUserId).toBeUndefined();
  });

  it('keeps an account already on a payment', async () => {
    house();
    guest({ userId: '' });
    mem.seed('payments/m3', cash('g1', { guestUserId: 'uEarlier' }));

    await link('u9');

    expect(mem.get('payments/m3')?.guestUserId).toBe('uEarlier');
  });
});

describe('linking an intake record to the invite record', () => {
  const setUp = () => {
    house();
    guest({ userId: '', email: 'pat@example.com', rentOwed: 0, createdBy: 'mgr' }, 'gIntake');
    invitedAs('u1', 'pat@example.com');
    guest({ userId: 'u1', email: 'pat@example.com', moveInDate: undefined }, 'gNew');
  };

  it("moves the intake record's payments to the resident and the record they now use", async () => {
    setUp();
    mem.seed('payments/m1', cash('gIntake'));

    await expect(linkIntakeRecord('gNew')).resolves.toBe('linked');

    expect(mem.get('payments/m1')).toMatchObject({
      guestId: 'gIntake',
      guestUserId: 'u1',
      linkedTo: 'gNew',
    });
  });

  it('leaves payments on other records alone', async () => {
    setUp();
    mem.seed('payments/m2', cash('gOther'));

    await linkIntakeRecord('gNew');

    expect(mem.get('payments/m2')?.linkedTo).toBeUndefined();
    expect(mem.get('payments/m2')?.guestUserId).toBeUndefined();
  });
});
