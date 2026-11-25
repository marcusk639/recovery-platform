/**
 * rentCharges: the app side of rent charges (rent spec §4.5, §5). previewRentCharges
 * asks the server what saving a schedule and price would charge each resident; the
 * price goes over in DOLLARS (what the house stores) and every amount comes back in
 * CENTS.
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

import { failNext, getOpLog, resetOpLog, seedCall } from '../../../__mocks__/firebase-modular/log';
import { asDollars } from '../../util/money';
import { previewRentCharges } from '../rentCharges';

beforeEach(() => resetOpLog());

describe('previewRentCharges', () => {
  it('sends the price in dollars, exactly as the house will store it', async () => {
    await previewRentCharges({ houseId: 'h1', frequency: 'weekly', price: asDollars(175) });
    expect(getOpLog()).toEqual([
      {
        op: 'call',
        path: 'previewRentCharges',
        data: { houseId: 'h1', frequency: 'weekly', price: 175 },
      },
    ]);
  });

  it('returns the rows in cents, as the server sent them', async () => {
    const row = {
      guestId: 'g1',
      label: 'Pat Q',
      nowCents: 0,
      firstDay: '2026-11-23',
      amountCents: 17500,
      daysCovered: 7,
      daysInPeriod: 7,
      rateSource: 'house',
    };
    seedCall('previewRentCharges', {
      frequency: 'weekly',
      firstChargeable: '2026-11-18',
      residents: [row],
    });
    const out = await previewRentCharges({
      houseId: 'h1',
      frequency: 'weekly',
      price: asDollars(175),
    });
    expect(out.residents).toEqual([row]);
  });

  it('reads a reply with no residents as none', async () => {
    seedCall('previewRentCharges', {});
    const out = await previewRentCharges({
      houseId: 'h1',
      frequency: 'monthly',
      price: asDollars(800),
    });
    expect(out.residents).toEqual([]);
  });

  it('rejects when the server refuses, so the screen can say so', async () => {
    failNext('call', Object.assign(new Error('permission-denied'), { code: 'permission-denied' }));
    await expect(
      previewRentCharges({ houseId: 'h1', frequency: 'weekly', price: asDollars(175) }),
    ).rejects.toThrow('permission-denied');
  });
});
