/**
 * channels.test.ts
 *
 * ensureNotificationChannels creates the two Android channels the app posts to
 * ('default' for server pushes, 'default-channel-id' for rent reminders), once
 * per process, and does nothing on iOS. Each case loads a fresh copy of the
 * module (and of the notify-kit mock) so the per-process memo starts empty.
 */
jest.mock('react-native-notify-kit', () => require('react-native-notify-kit/jest-mock'));
jest.mock('../../../util/logging', () => ({ logException: jest.fn() }));

import { Platform } from 'react-native';

type Loaded = {
  ensureNotificationChannels: () => Promise<void>;
  createChannels: jest.Mock;
  logException: jest.Mock;
  HIGH: number;
};

const originalOS = Platform.OS;

function setOS(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

function load(): Loaded {
  let loaded: Loaded | undefined;
  jest.isolateModules(() => {
    const kit = require('react-native-notify-kit');
    loaded = {
      ensureNotificationChannels: require('../channels').ensureNotificationChannels,
      createChannels: kit.default.createChannels,
      logException: require('../../../util/logging').logException,
      HIGH: kit.AndroidImportance.HIGH,
    };
  });
  return loaded!;
}

afterEach(() => {
  setOS(originalOS as 'ios' | 'android');
});

describe('ensureNotificationChannels on Android', () => {
  beforeEach(() => setOS('android'));

  it('creates the server-push and reminder channels with HIGH importance', async () => {
    const m = load();

    await m.ensureNotificationChannels();

    expect(m.createChannels).toHaveBeenCalledTimes(1);
    expect(m.createChannels).toHaveBeenCalledWith([
      { id: 'default', name: 'General', importance: m.HIGH },
      { id: 'default-channel-id', name: 'Reminders', importance: m.HIGH },
    ]);
  });

  it('makes one native call per process however often it is awaited', async () => {
    const m = load();

    await Promise.all([m.ensureNotificationChannels(), m.ensureNotificationChannels()]);
    await m.ensureNotificationChannels();

    expect(m.createChannels).toHaveBeenCalledTimes(1);
  });

  it('logs a native rejection with a static context and resolves', async () => {
    const m = load();
    m.createChannels.mockRejectedValueOnce(new Error('native failure'));

    await expect(m.ensureNotificationChannels()).resolves.toBeUndefined();

    expect(m.logException).toHaveBeenCalledTimes(1);
    expect(m.logException).toHaveBeenCalledWith(expect.any(Error), expect.any(String));
  });

  it('retries on the next call after a failed attempt', async () => {
    const m = load();
    m.createChannels.mockRejectedValueOnce(new Error('native failure'));

    await m.ensureNotificationChannels();
    await m.ensureNotificationChannels();

    expect(m.createChannels).toHaveBeenCalledTimes(2);
  });
});

describe('ensureNotificationChannels on iOS', () => {
  beforeEach(() => setOS('ios'));

  it('does nothing: iOS has no channels', async () => {
    const m = load();

    await expect(m.ensureNotificationChannels()).resolves.toBeUndefined();

    expect(m.createChannels).not.toHaveBeenCalled();
  });
});
