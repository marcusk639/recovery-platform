// linkIntakeRecord's refusals: a balance that isn't a number, and an account with no
// invitation in the house. Neither links, and the second says so for a manager.

jest.mock('firebase-functions/v2', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: require('../helpers/memFirestore').fieldValue,
}));
jest.mock('../../api/firestore', () => require('../helpers/memFirestore').apiFirestore);
jest.mock('../../util/notifications', () => ({ sendNotification: jest.fn() }));

import { mem } from '../helpers/memFirestore';
import { logger } from 'firebase-functions/v2';
import { guest, house, invitedAs } from '../helpers/rentFixtures';
import { linkIntakeRecord } from '../../rent/linkIntakeRecord';

const intake = (o: Record<string, unknown> = {}, id = 'gIntake') =>
  guest({ userId: '', email: 'Pat@Example.com ', rentOwed: 12500, ...o }, id);
const invite = (o: Record<string, unknown> = {}, invitedEmail = 'pat@example.com') => {
  invitedAs(typeof o.userId === 'string' ? o.userId : 'u1', invitedEmail);
  return guest({ userId: 'u1', email: 'pat@example.com', moveInDate: undefined, ...o }, 'gNew');
};
const doc = (id: string) => mem.get(`guests/${id}`) ?? {};

beforeEach(() => mem.reset());

it.each([
  ['the intake record', 'gIntake'],
  ['the invite record', 'gNew'],
])('a text balance on %s blocks the link, so neither balance is lost', async (_which, id) => {
  // num("350") is 0 and increment replaces a non-number, so linking would erase $350.
  house();
  intake({ createdBy: 'mgr' });
  invite();
  mem.seed(`guests/${id}`, { ...doc(id), rentOwed: '350' });
  // 'refused', not 'none': the two records still match, so neither caller charges the new one.
  await expect(linkIntakeRecord('gNew')).resolves.toBe('refused');
  expect(doc(id).rentOwed).toBe('350');
  expect(doc('gIntake').rentLinkedTo).toBeUndefined();
});

// Both records stay active and charged, so a manager has to be told.
it('says so when an account record has the intake email but no invitation, so a manager can link them', async () => {
  house();
  guest({ userId: 'u3', email: 'pat@example.com' }, 'gLegacy');
  (logger.warn as jest.Mock).mockClear();
  intake({ createdBy: 'mgr' });
  await expect(linkIntakeRecord('gIntake')).resolves.toBe('none');
  expect(logger.warn).toHaveBeenCalledWith(
    expect.stringContaining('no invitation'),
    expect.objectContaining({ guestId: 'gIntake', houseId: 'H' }),
  );
});

it('says so when a new account record has no invitation in the house', async () => {
  house();
  (logger.warn as jest.Mock).mockClear();
  guest({ userId: 'u3', email: 'pat@example.com', moveInDate: undefined }, 'gNew');
  await expect(linkIntakeRecord('gNew')).resolves.toBe('none');
  expect(logger.warn).toHaveBeenCalledWith(
    expect.stringContaining('no invitation'),
    expect.objectContaining({ guestId: 'gNew', houseId: 'H' }),
  );
});
