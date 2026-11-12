/**
 * channels.ts
 *
 * Creates the Android notification channels the app posts to. Android 8+
 * drops a notification whose channel does not exist, and before the RN 0.88
 * upgrade nothing created these, so neither server pushes nor rent reminders
 * showed on Android.
 *
 * - 'default': server pushes (the `notifee` payload from
 *   regroup/functions/src/util/notifications.ts names it).
 * - 'default-channel-id': rent reminders (rentReminder.ts).
 *
 * Startup (index.js) starts the work; every display and schedule path awaits
 * the same promise. One native call per process; a failed call is retried by
 * the next caller.
 */

import { Platform } from 'react-native';
import notifee, { AndroidImportance } from 'react-native-notify-kit';
import { logException } from '../../util/logging';

export const SERVER_PUSH_CHANNEL_ID = 'default';
export const REMINDER_CHANNEL_ID = 'default-channel-id';

let channelsReady: Promise<void> | null = null;

export function ensureNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') {
    return Promise.resolve();
  }
  if (!channelsReady) {
    channelsReady = notifee
      .createChannels([
        { id: SERVER_PUSH_CHANNEL_ID, name: 'General', importance: AndroidImportance.HIGH },
        { id: REMINDER_CHANNEL_ID, name: 'Reminders', importance: AndroidImportance.HIGH },
      ])
      .catch((error: unknown) => {
        channelsReady = null;
        logException(error, 'notifications - failed to create the Android channels');
      });
  }
  return channelsReady;
}
