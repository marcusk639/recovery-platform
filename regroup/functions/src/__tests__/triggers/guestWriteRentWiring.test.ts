// onGuestWrite hands every live, non-delete write to the rent step, and a rent
// failure makes the event redeliver after the EES step has run.

const mockRent = jest.fn();
jest.mock('../../rent/guestWriteRent', () => ({
  rentOnGuestWrite: (...args: unknown[]) => mockRent(...args),
}));
jest.mock('firebase-admin', () => ({
  firestore: () => require('../helpers/memFirestore').memDb,
  auth: () => ({
    getUser: async () => {
      throw Object.assign(new Error('There is no user record'), { code: 'auth/user-not-found' });
    },
    getUsers: async () => ({ users: [] }),
    setCustomUserClaims: jest.fn(),
  }),
}));
jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_opts: unknown, handler: unknown) => handler,
}));
jest.mock('../../api/firestore', () => require('../helpers/memFirestore').apiFirestore);

import { mem } from '../helpers/memFirestore';
import { onGuestWrite } from '../../triggers/firestore/guestWrite';

const run = onGuestWrite as unknown as (e: unknown) => Promise<void>;
const H = 'h';
const before = { houseId: H, status: 'active', points: 1 };
const after = { houseId: H, status: 'active', points: 2 };
const event = (time: string) => ({
  id: 'evt-g1',
  time,
  params: { guestId: 'g1' },
  data: {
    before: { exists: true, data: () => before },
    after: { exists: true, data: () => after, createTime: { toMillis: () => 1234 } },
  },
});

beforeEach(() => {
  mem.reset();
  mockRent.mockReset();
  mockRent.mockResolvedValue('none');
});

it('onGuestWrite calls rentOnGuestWrite with before, after, createTime and the event time', async () => {
  const time = new Date().toISOString();
  await run(event(time));
  expect(mockRent).toHaveBeenCalledWith({
    guestId: 'g1',
    before,
    after,
    afterCreateTimeMs: 1234,
    eventTime: time,
  });
});

it('onGuestWrite rethrows a rent failure after the EES step', async () => {
  mockRent.mockRejectedValue(new Error('rent boom'));
  mem.seed('ees-records/e1', { houseId: H, guestId: 'g1', paid: false, amount: 1 });
  await expect(run(event(new Date().toISOString()))).rejects.toThrow('rent boom');
});

it('a stale event does not call it', async () => {
  await run(event(new Date(Date.now() - 7 * 3600 * 1000).toISOString()));
  expect(mockRent).not.toHaveBeenCalled();
});
