/**
 * logActivity stamps residentUid at create (round 6): the guest doc's
 * account, which the rules check; omitted when unknown (the server stamps
 * it), and retried without it if the guest's account changed meanwhile.
 */
const mockAdd = jest.fn();
const mockGuestGet = jest.fn();

jest.mock('../../../firebase-setup', () => ({
  firestore: {
    collection: jest.fn((name: string) =>
      name === 'guests' ? { doc: () => ({ get: mockGuestGet }) } : { add: mockAdd },
    ),
  },
}));
jest.mock('@react-native-firebase/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TIME__' },
}));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { logActivity } from '../activity';
import { ActivityDataFactory, ActivityType } from '../../entities/ActivityModel';

const log = () =>
  logActivity('g1', 'h1', ActivityType.CHORE, ActivityDataFactory.chore('daily', 'Kitchen'), 'u1');

beforeEach(() => {
  jest.clearAllMocks();
  mockAdd.mockResolvedValue({ id: 'a1' });
});

describe('logActivity residentUid', () => {
  it("stamps the guest doc's account", async () => {
    mockGuestGet.mockResolvedValue({ exists: true, data: () => ({ userId: 'res1' }) });
    await log();
    expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({ residentUid: 'res1' }));
  });

  it('omits it for a guest with no account, or when the guest doc cannot be read', async () => {
    mockGuestGet.mockResolvedValueOnce({ exists: true, data: () => ({}) });
    await log();
    expect(mockAdd.mock.calls[0][0]).not.toHaveProperty('residentUid');
    mockGuestGet.mockRejectedValueOnce(new Error('denied'));
    await log();
    expect(mockAdd.mock.calls[1][0]).not.toHaveProperty('residentUid');
  });

  it("retries without it if the rules refuse it (the guest's account changed)", async () => {
    mockGuestGet.mockResolvedValue({ exists: true, data: () => ({ userId: 'res1' }) });
    mockAdd.mockRejectedValueOnce(
      Object.assign(new Error('denied'), { code: 'firestore/permission-denied' }),
    );
    await expect(log()).resolves.toMatchObject({ id: 'a1' });
    expect(mockAdd).toHaveBeenCalledTimes(2);
    expect(mockAdd.mock.calls[1][0]).not.toHaveProperty('residentUid');
  });
});
