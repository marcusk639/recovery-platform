/**
 * getAdminsForHouse (#183 item 4): Contacts' ADMIN section read
 * state.admin.houseAdmins, which nothing writes, so it was always empty. The
 * rules refuse a list query over admins (they can't prove the per-house
 * check), so the house's admins are read one by one from house.adminIds.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { failNext, getOpLog, resetOpLog, seedDoc } from '../../../__mocks__/firebase-modular/log';
import { getAdminsForHouse } from '../admin';
import { House } from '../../entities/House';
import { logException } from '../../util/logging';

const house = (adminIds: string[]) => ({ id: 'h1', adminIds }) as unknown as House;

beforeEach(() => {
  resetOpLog();
  jest.clearAllMocks();
});

describe('getAdminsForHouse', () => {
  it("reads each of the house's adminIds by id and keys them by id", async () => {
    seedDoc('admins/a1', { firstName: 'Max', houseIds: ['h1'] });
    seedDoc('admins/a2', { firstName: 'Olga', houseIds: ['h1', 'h2'] });

    const admins = await getAdminsForHouse(house(['a1', 'a2']));

    expect(Object.keys(admins)).toEqual(['a1', 'a2']);
    expect(admins.a1).toEqual(expect.objectContaining({ id: 'a1', firstName: 'Max' }));
    expect(getOpLog()).toEqual([
      { op: 'get', path: 'admins/a1' },
      { op: 'get', path: 'admins/a2' },
    ]);
  });

  it('never sends a list query, which the rules refuse', async () => {
    seedDoc('admins/a1', { firstName: 'Max', houseIds: ['h1'] });

    await getAdminsForHouse(house(['a1']));

    expect(getOpLog().some((entry) => entry.op === 'getDocs')).toBe(false);
  });

  it('skips a missing or unreadable admin and keeps the others', async () => {
    seedDoc('admins/a1', { firstName: 'Max', houseIds: ['h1'] });
    const denied = new Error('permission-denied');
    failNext('get', denied, 'admins/a2');

    const admins = await getAdminsForHouse(house(['a1', 'a2', 'gone']));

    expect(Object.keys(admins)).toEqual(['a1']);
    expect(logException).toHaveBeenCalledWith(denied, expect.any(String));
  });

  it('returns no admins for a house with no adminIds', async () => {
    expect(await getAdminsForHouse({ id: 'h1' } as unknown as House)).toEqual({});
    expect(getOpLog()).toEqual([]);
  });
});
