/**
 * getApplication (P5 Task 16) against the Firebase operation log: the
 * applicant's status screen and the intake pre-fill read one application by
 * its path, which the applications read rule allows.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/auth', () => require('../../../__mocks__/firebase-modular/auth'));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { failNext, getOpLog, resetOpLog, seedDoc } from '../../../__mocks__/firebase-modular/log';
import { getApplication } from '../applications';

beforeEach(() => {
  resetOpLog();
});

describe('getApplication', () => {
  it('reads the one application by its path', async () => {
    seedDoc('houses/h1/applications/a1', { id: 'a1', houseId: 'h1', applicantName: 'Pat Lee' });

    expect(await getApplication('h1', 'a1')).toEqual({
      id: 'a1',
      houseId: 'h1',
      applicantName: 'Pat Lee',
    });
    expect(getOpLog()).toEqual([{ op: 'get', path: 'houses/h1/applications/a1' }]);
  });

  it('returns null when the application does not exist', async () => {
    expect(await getApplication('h1', 'missing')).toBeNull();
  });

  it('replaces a read failure with a generic message', async () => {
    failNext('get', new Error('denied'), 'houses/h1/applications/a1');

    await expect(getApplication('h1', 'a1')).rejects.toThrow('Failed to load the application.');
  });
});
