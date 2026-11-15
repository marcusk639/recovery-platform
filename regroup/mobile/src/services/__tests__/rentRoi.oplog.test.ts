/** getRentRoiMetrics calls the rentRoiMetrics callable (#32). */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('@react-native-firebase/auth', () => require('../../../__mocks__/firebase-modular/auth'));

import { getOpLog, resetOpLog, seedCall } from '../../../__mocks__/firebase-modular/log';
import { getRentRoiMetrics } from '../rentRoi';

beforeEach(() => resetOpLog());

describe('getRentRoiMetrics', () => {
  it('asks rentRoiMetrics for the house from the start date', async () => {
    seedCall('rentRoiMetrics', { available: true, hoursSavedEstimate: 1.5 });

    const result = await getRentRoiMetrics('h1', '2026-11-01');

    expect(getOpLog()).toEqual([
      { op: 'call', path: 'rentRoiMetrics', data: { houseId: 'h1', startDate: '2026-11-01' } },
    ]);
    expect(result).toEqual({ available: true, hoursSavedEstimate: 1.5 });
  });

  it('sends no dates for all time, which the callable reads as no bound', async () => {
    await getRentRoiMetrics('h1');

    expect(getOpLog()[0].data).toEqual({ houseId: 'h1' });
  });
});
