/**
 * remoteMessage.ts
 *
 * Shows a foreground FCM message whose data carries a Notifee-shaped
 * `notifee` JSON string: the server contract of `sendNotification` in
 * regroup/functions/src/util/notifications.ts. Messages without it (those
 * with a `notification` block) are presented by RNFirebase itself, per the
 * `messaging_ios_foreground_presentation_options` in firebase.json.
 *
 * Payload contents (title, body, data) are never logged.
 */

import notifee, {
  type IOSForegroundPresentationOptions,
  type Notification,
} from 'react-native-notify-kit';
import type { RemoteMessage } from '../../../firebase-setup';
import { logException } from '../../util/logging';
import { ensureNotificationChannels } from './channels';

/** What the AppDelegate's willPresentNotification returned before RN 0.88. */
export const IOS_FOREGROUND_PRESENTATION: IOSForegroundPresentationOptions = {
  banner: true,
  sound: true,
  badge: true,
  list: true,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parsePayload(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    // The SyntaxError message can quote the payload, so it is not logged.
    return null;
  }
}

export async function displayRemoteMessage(message: RemoteMessage): Promise<void> {
  const raw = message?.data?.notifee;
  if (raw === undefined) {
    return;
  }
  const payload = typeof raw === 'string' ? parsePayload(raw) : null;
  if (!payload) {
    logException(
      new Error('Malformed notifee payload in a foreground message'),
      'notifications - foreground message payload is not a JSON object',
    );
    return;
  }
  try {
    await ensureNotificationChannels();
    const ios = isRecord(payload.ios) ? payload.ios : {};
    await notifee.displayNotification({
      ...payload,
      ios: { ...ios, foregroundPresentationOptions: IOS_FOREGROUND_PRESENTATION },
    } as Notification);
  } catch (error) {
    logException(error, 'notifications - failed to display a foreground message');
  }
}
