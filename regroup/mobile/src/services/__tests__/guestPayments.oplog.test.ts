/**
 * getGuestPayments against the Firebase operation log.
 *
 * Staff see a resident's payments by guest record. When a manager's intake
 * record is linked to the record the resident's invite created, the intake
 * record's payments keep their guestId and gain linkedTo (functions'
 * linkIntakeRecord). Staff viewing the invite record must still see them.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('@react-native-firebase/auth', () => require('../../../__mocks__/firebase-modular/auth'));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { resetOpLog, seedDoc } from '../../../__mocks__/firebase-modular/log';
import { getGuestPayments } from '../payments';

const payment = (guestId: string, createdAt: string, extra: Record<string, unknown> = {}) => ({
  guestId,
  houseId: 'h1',
  amount: 5000,
  status: 'succeeded',
  createdAt,
  ...extra,
});

beforeEach(() => {
  resetOpLog();
});

describe('getGuestPayments', () => {
  it("includes payments from an intake record linked to this one, newest first", async () => {
    seedDoc('payments/own', payment('gNew', '2026-11-20T00:00:00.000Z'));
    seedDoc('payments/fromIntake', payment('gIntake', '2026-11-10T00:00:00.000Z', { linkedTo: 'gNew' }));
    seedDoc('payments/other', payment('gOther', '2026-11-15T00:00:00.000Z'));

    const result = await getGuestPayments({ houseId: 'h1', guestId: 'gNew' });

    expect(result.map((p) => p.id)).toEqual(['own', 'fromIntake']);
  });

  it("does not include another house's payments linked to the same id", async () => {
    seedDoc('payments/elsewhere', {
      ...payment('gIntake', '2026-11-10T00:00:00.000Z', { linkedTo: 'gNew' }),
      houseId: 'h2',
    });

    expect(await getGuestPayments({ houseId: 'h1', guestId: 'gNew' })).toEqual([]);
  });
});
