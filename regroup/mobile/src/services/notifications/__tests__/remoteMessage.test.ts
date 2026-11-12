/**
 * remoteMessage.test.ts
 *
 * displayRemoteMessage shows a foreground FCM message whose data carries a
 * Notifee-shaped `notifee` JSON payload (the server contract in
 * regroup/functions/src/util/notifications.ts), after the Android channels
 * exist, with the same iOS foreground presentation the AppDelegate used.
 */
jest.mock('react-native-notify-kit', () => require('react-native-notify-kit/jest-mock'));
jest.mock('../channels', () => ({ ensureNotificationChannels: jest.fn() }));
jest.mock('../../../util/logging', () => ({ logException: jest.fn() }));

import notifee from 'react-native-notify-kit';
import { ensureNotificationChannels } from '../channels';
import { logException } from '../../../util/logging';
import { displayRemoteMessage } from '../remoteMessage';
import type { RemoteMessage } from '../../../../firebase-setup';

const display = notifee.displayNotification as jest.Mock;
const ensureChannels = ensureNotificationChannels as jest.Mock;
const log = logException as jest.Mock;

const PAYLOAD = {
  title: 'Chore due',
  body: 'Kitchen, by 6pm',
  data: { screen: 'chores' },
  android: { channelId: 'default' },
};

const message = (data: RemoteMessage['data']) => ({ data }) as RemoteMessage;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.clearAllMocks();
  ensureChannels.mockResolvedValue(undefined);
  display.mockResolvedValue('notification-id');
});

describe('displayRemoteMessage', () => {
  it('displays the parsed payload with banner, sound, badge and list in the iOS foreground', async () => {
    await displayRemoteMessage(message({ notifee: JSON.stringify(PAYLOAD) }));

    expect(display).toHaveBeenCalledTimes(1);
    expect(display).toHaveBeenCalledWith({
      ...PAYLOAD,
      ios: {
        foregroundPresentationOptions: { banner: true, sound: true, badge: true, list: true },
      },
    });
    expect(log).not.toHaveBeenCalled();
  });

  it('waits for the Android channels before displaying', async () => {
    let channelsReady: () => void = () => {};
    ensureChannels.mockReturnValue(
      new Promise<void>((resolve) => {
        channelsReady = resolve;
      }),
    );

    const pending = displayRemoteMessage(message({ notifee: JSON.stringify(PAYLOAD) }));
    await flush();
    expect(display).not.toHaveBeenCalled();

    channelsReady();
    await pending;
    expect(display).toHaveBeenCalledTimes(1);
  });

  it('logs malformed JSON with a static context, displays nothing and resolves', async () => {
    const malformed = '{"title": "Rent for Jane Doe" ';

    await expect(displayRemoteMessage(message({ notifee: malformed }))).resolves.toBeUndefined();

    expect(display).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.any(Error), expect.any(String));
    expect(JSON.stringify(log.mock.calls[0])).not.toContain('Jane');
    expect(String(log.mock.calls[0][0].message)).not.toContain('Jane');
  });

  it('logs a payload that is not an object and displays nothing', async () => {
    await displayRemoteMessage(message({ notifee: JSON.stringify('just a string') }));

    expect(display).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('ignores a message without a notifee payload', async () => {
    await displayRemoteMessage(message({}));
    await displayRemoteMessage({} as RemoteMessage);

    expect(display).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('logs a native display rejection without the payload and resolves', async () => {
    display.mockRejectedValueOnce(new Error('native failure'));

    await expect(
      displayRemoteMessage(message({ notifee: JSON.stringify(PAYLOAD) })),
    ).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(log.mock.calls[0]);
    expect(logged).not.toContain('Chore due');
    expect(logged).not.toContain('Kitchen');
  });
});
