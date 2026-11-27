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

import {
  failNext,
  getOpLog,
  resetOpLog,
  seedCall,
  seedQuery,
} from '../../../__mocks__/firebase-modular/log';
import { asDollars } from '../../util/money';
import { listGuestCharges, previewRentCharges } from '../rentCharges';

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
    expect(out.skipped).toBe(0);
  });

  it('passes on how many residents the server could not price', async () => {
    seedCall('previewRentCharges', { residents: [], skipped: 2 });
    const out = await previewRentCharges({ houseId: 'h1', frequency: 'weekly', price: asDollars(175) });
    expect(out.skipped).toBe(2);
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

// A charge as chargeResident writes it (functions src/rent/chargeResident.ts).
const charge = (id: string, fields: Record<string, unknown> = {}) => ({
  id,
  guestId: 'g1',
  houseId: 'h1',
  guestUserId: 'u1',
  from: '2026-11-16',
  through: '2026-11-22',
  daysCovered: 7,
  daysInPeriod: 7,
  amountCents: 17500,
  rateCents: 17500,
  rateSource: 'house',
  frequency: 'weekly',
  createdAtMs: Date.parse('2026-11-16T06:05:00.000Z'),
  ...fields,
});

describe('listGuestCharges', () => {
  it("asks for the resident's own charges by house and account, as the rules require", async () => {
    seedQuery('rentCharges', [charge('g1_2026-11-16')]);
    await listGuestCharges({ houseId: 'h1', guestUserId: 'u1' });
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: 'rentCharges',
        constraints: [
          ['where', 'houseId', '==', 'h1'],
          ['where', 'guestUserId', '==', 'u1'],
        ],
      },
    ]);
  });

  it("asks staff's by house and guest record, which finds charges made before an account linked", async () => {
    seedQuery('rentCharges', [charge('g1_2026-11-16', { guestUserId: null })]);
    const out = await listGuestCharges({ houseId: 'h1', guestId: 'g1' });
    expect(getOpLog()[0].constraints).toEqual([
      ['where', 'houseId', '==', 'h1'],
      ['where', 'guestId', '==', 'g1'],
    ]);
    expect(out).toHaveLength(1);
  });

  it('maps each record in cents, with its period, newest first', async () => {
    seedQuery('rentCharges', [
      charge('g1_2026-11-16'),
      charge('g1_2026-11-11', {
        from: '2026-11-11',
        through: '2026-11-15',
        daysCovered: 5,
        amountCents: 12500,
      }),
    ]);
    const out = await listGuestCharges({ houseId: 'h1', guestUserId: 'u1' });
    expect(out).toEqual([
      {
        id: 'g1_2026-11-16',
        guestId: 'g1',
        houseId: 'h1',
        amountCents: 17500,
        daysCovered: 7,
        daysInPeriod: 7,
        firstDay: '2026-11-16',
        lastDay: '2026-11-22',
        rateSource: 'house',
      },
      {
        id: 'g1_2026-11-11',
        guestId: 'g1',
        houseId: 'h1',
        amountCents: 12500,
        daysCovered: 5,
        daysInPeriod: 7,
        firstDay: '2026-11-11',
        lastDay: '2026-11-15',
        rateSource: 'house',
      },
    ]);
  });

  it('skips a record whose amount is not whole cents rather than show a wrong figure', async () => {
    seedQuery('rentCharges', [charge('bad', { amountCents: 175.5 }), charge('g1_2026-11-16')]);
    const out = await listGuestCharges({ houseId: 'h1', guestUserId: 'u1' });
    expect(out.map((c) => c.id)).toEqual(['g1_2026-11-16']);
  });

  it('needs a house and either an account or a guest record', async () => {
    await expect(listGuestCharges({ houseId: '', guestUserId: 'u1' })).rejects.toThrow();
    await expect(listGuestCharges({ houseId: 'h1' })).rejects.toThrow();
  });
});
