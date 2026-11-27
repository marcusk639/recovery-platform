// src/__tests__/triggers/applicationNotice.test.ts
//
// notifyOperatorOnApplication addresses its notifications to the house's
// staff by uid: the owner, manager and peer-leader role records plus the
// house's superAdminId. house.adminIds is NOT used — it holds admin-record ids
// (createAdminId), not uids, so a notification addressed to one reached nobody.

jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: jest.fn((path: unknown, handler: unknown) => ({ path, handler })),
}));
jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const batchSet = jest.fn();
const batchCommit = jest.fn(async () => undefined);
let houseDoc: Record<string, unknown> | undefined;
let notifIds = 0;

jest.mock('../../api/firestore', () => ({
  houseCollection: {
    doc: jest.fn(() => ({
      get: jest.fn(async () => ({ exists: houseDoc !== undefined, data: () => houseDoc })),
    })),
  },
  notificationCollection: { doc: jest.fn(() => ({ id: `n${++notifIds}` })) },
  ratsFirestore: { batch: jest.fn(() => ({ set: batchSet, commit: batchCommit })) },
}));
jest.mock('../../util/houseRoleStore', () => ({ staffUids: jest.fn() }));

import { notifyOperatorOnApplication } from '../../triggers/firestore/applicationNotice';
import { staffUids } from '../../util/houseRoleStore';
import { logger } from 'firebase-functions';

const trigger = notifyOperatorOnApplication as unknown as {
  path: string;
  handler: (event: unknown) => Promise<void>;
};
const event = (data: Record<string, unknown> | undefined) => ({
  params: { houseId: 'h1', appId: 'a1' },
  data: data === undefined ? undefined : { data: () => data },
});
const recipients = () => batchSet.mock.calls.map(([, doc]) => doc.userId).sort();

beforeEach(() => {
  jest.clearAllMocks();
  notifIds = 0;
  houseDoc = { superAdminId: 'owner-uid', adminIds: ['admin-record-id'] };
  (staffUids as jest.Mock).mockResolvedValue(['owner-uid', 'manager-uid']);
});

describe('notifyOperatorOnApplication', () => {
  it('listens on house applications', () => {
    expect(trigger.path).toBe('houses/{houseId}/applications/{appId}');
  });

  it('notifies each owner and manager uid once, plus the superAdminId, never adminIds entries', async () => {
    await trigger.handler(event({ applicantName: 'Sam' }));

    // Peer leaders may not read applications (owner decision 2026-11-27).
    expect(staffUids).toHaveBeenCalledWith('h1', { peerLeaders: false });
    expect(recipients()).toEqual(['manager-uid', 'owner-uid']);
    expect(recipients()).not.toContain('admin-record-id');
    expect(batchSet.mock.calls[0][1]).toMatchObject({
      houseId: 'h1',
      type: 'application-received',
      message: 'Sam applied to join your house.',
      read: false,
    });
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('still reaches the superAdminId when the house has no role records', async () => {
    (staffUids as jest.Mock).mockResolvedValue([]);
    await trigger.handler(event({}));
    expect(recipients()).toEqual(['owner-uid']);
    expect(batchSet.mock.calls[0][1].message).toBe('Someone applied to join your house.');
  });

  it('writes nothing when there is nobody to notify', async () => {
    houseDoc = {};
    (staffUids as jest.Mock).mockResolvedValue([]);
    await trigger.handler(event({}));
    expect(batchCommit).not.toHaveBeenCalled();
  });

  it('ignores a missing house or an empty event', async () => {
    houseDoc = undefined;
    await trigger.handler(event({}));
    await trigger.handler(event(undefined));
    expect(batchCommit).not.toHaveBeenCalled();
  });

  it('logs a failure without the applicant name, and rethrows it', async () => {
    (staffUids as jest.Mock).mockRejectedValue(new Error('unavailable'));
    await expect(trigger.handler(event({ applicantName: 'Sam' }))).rejects.toThrow('unavailable');
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify((logger.error as jest.Mock).mock.calls)).not.toContain('Sam');
  });
});
