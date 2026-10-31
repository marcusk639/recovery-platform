/**
 * notifications.tsx against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10d): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains or snapshot shapes.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);

import {
  failNext,
  getOpLog,
  readDoc,
  resetOpLog,
  seedDoc,
} from '../../../__mocks__/firebase-modular/log';
import {
  createNotification,
  deleteNotification,
  getNotification,
  getNotifications,
  getUserNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  registerDeviceToken,
  updateNotification,
} from '../notifications';
import { Notification } from '../../entities/Notification';

const NOW = '2026-10-07T17:00:00.000Z';
const note = (fields: Record<string, unknown>) => fields as unknown as Notification;

beforeEach(() => {
  resetOpLog();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('reads', () => {
  it('getNotification reads notifications/{id}', async () => {
    seedDoc('notifications/n1', { id: 'n1', title: 't' });

    expect(await getNotification('n1')).toEqual({ id: 'n1', title: 't' });
    expect(getOpLog()).toEqual([{ op: 'get', path: 'notifications/n1' }]);
  });

  it('getNotifications queries by attribute and keys by the stored id field', async () => {
    seedDoc('notifications/n1', { id: 'n1', houseId: 'h1' });
    seedDoc('notifications/n2', { id: 'n2', houseId: 'h2' });

    expect(await getNotifications('houseId', 'h1')).toEqual({ n1: { id: 'n1', houseId: 'h1' } });
    expect(getOpLog()).toEqual([
      { op: 'getDocs', path: 'notifications', constraints: [['where', 'houseId', '==', 'h1']] },
    ]);
  });

  it('getUserNotifications queries by userId', async () => {
    seedDoc('notifications/n1', { id: 'n1', userId: 'u1' });

    expect(await getUserNotifications('u1')).toEqual([{ id: 'n1', userId: 'u1' }]);
    expect(getOpLog()).toEqual([
      { op: 'getDocs', path: 'notifications', constraints: [['where', 'userId', '==', 'u1']] },
    ]);
  });
});

describe('writes', () => {
  it('createNotification sets notifications/{auto id}', async () => {
    expect(await createNotification(note({ title: 't' }))).toEqual({ title: 't', id: 'auto-1' });
    expect(getOpLog()).toEqual([
      { op: 'set', path: 'notifications/auto-1', data: { title: 't', id: 'auto-1' } },
    ]);
  });

  it('updateNotification adds the id to the values and updates', async () => {
    seedDoc('notifications/n1', { id: 'n1' });

    await updateNotification('n1', { read: true } as Partial<Notification>);

    expect(getOpLog()).toEqual([
      { op: 'update', path: 'notifications/n1', data: { read: true, id: 'n1' } },
    ]);
  });

  it('updateNotification writes to the id already in the values', async () => {
    seedDoc('notifications/n2', { id: 'n2' });

    await updateNotification('n1', { id: 'n2', read: true } as Partial<Notification>);

    expect(getOpLog()).toEqual([
      { op: 'update', path: 'notifications/n2', data: { id: 'n2', read: true } },
    ]);
  });

  it('markNotificationAsRead updates read: true', async () => {
    seedDoc('notifications/n1', { id: 'n1' });

    await markNotificationAsRead('n1');

    expect(readDoc('notifications/n1')).toEqual({ id: 'n1', read: true });
  });

  it('deleteNotification by object deletes notifications/{id}', async () => {
    seedDoc('notifications/n1', { id: 'n1' });

    await deleteNotification(note({ id: 'n1' }));

    expect(getOpLog()).toEqual([{ op: 'delete', path: 'notifications/n1' }]);
    expect(readDoc('notifications/n1')).toBeUndefined();
  });

  it('deleteNotification by id reads the doc first, then deletes it', async () => {
    seedDoc('notifications/n1', { id: 'n1' });

    await deleteNotification('n1');

    expect(getOpLog()).toEqual([
      { op: 'get', path: 'notifications/n1' },
      { op: 'delete', path: 'notifications/n1' },
    ]);
  });

  it('deleteNotification by id throws after the read when the doc is missing', async () => {
    await expect(deleteNotification('gone')).rejects.toThrow();
    expect(getOpLog()).toEqual([{ op: 'get', path: 'notifications/gone' }]);
  });

  it('registerDeviceToken merges the token into userDeviceTokens/{uid}', async () => {
    jest.useFakeTimers({ now: new Date(NOW) });
    seedDoc('userDeviceTokens/u1', { tokens: ['old'] });

    await registerDeviceToken('u1', 'tok');

    expect(getOpLog()).toEqual([
      {
        op: 'set',
        path: 'userDeviceTokens/u1',
        data: { tokens: { __fv: 'arrayUnion', items: ['tok'] }, updatedAt: NOW },
        options: { merge: true },
      },
    ]);
    expect(readDoc('userDeviceTokens/u1')).toEqual({ tokens: ['old', 'tok'], updatedAt: NOW });
  });

  it('registerDeviceToken rejects when the write fails', async () => {
    failNext('set', new Error('permission-denied'), 'userDeviceTokens/u1');
    await expect(registerDeviceToken('u1', 'tok')).rejects.toThrow('permission-denied');
  });
});

describe('markAllNotificationsAsRead', () => {
  it('queries the user’s notifications and updates only the unread ones', async () => {
    seedDoc('notifications/n1', { id: 'n1', userId: 'u1', read: false });
    seedDoc('notifications/n2', { id: 'n2', userId: 'u1', read: true });
    seedDoc('notifications/n3', { id: 'n3', userId: 'u1' });

    await markAllNotificationsAsRead('u1');

    expect(getOpLog()).toEqual([
      { op: 'getDocs', path: 'notifications', constraints: [['where', 'userId', '==', 'u1']] },
      { op: 'update', path: 'notifications/n1', data: { read: true, id: 'n1' } },
      { op: 'update', path: 'notifications/n3', data: { read: true, id: 'n3' } },
    ]);
  });

  it('rejects when one update fails', async () => {
    seedDoc('notifications/n1', { id: 'n1', userId: 'u1' });
    failNext('update', new Error('permission-denied'), 'notifications/n1');

    await expect(markAllNotificationsAsRead('u1')).rejects.toThrow('permission-denied');
  });
});
