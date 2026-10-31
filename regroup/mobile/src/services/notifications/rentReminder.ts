/**
 * rentReminder.ts
 *
 * Schedules (and cancels) a local push notification reminding a guest that
 * rent is due on the coming Monday. The notification fires on the nearest
 * upcoming Friday at 9am, giving the resident the weekend to arrange payment.
 *
 * The notification ID is deterministic per guest so re-scheduling is
 * idempotent and cancellation is precise. It is the same identifier the
 * pre-RN-0.88 library (react-native-push-notification) used, so a reminder
 * it left pending on iOS is replaced or cancelled by these calls.
 *
 * Both functions log failures (never the notification or guest fields) and
 * resolve, so fire-and-forget callers stay safe.
 */

import { Platform } from 'react-native';
import notifee, { AuthorizationStatus, TriggerType } from 'react-native-notify-kit';
import { Guest } from '../../entities/Guest';
import { logException } from '../../util/logging';
import { ensureNotificationChannels, REMINDER_CHANNEL_ID } from './channels';
import { IOS_FOREGROUND_PRESENTATION } from './remoteMessage';

/**
 * Returns a stable numeric notification ID derived from the guest ID string.
 * Uses a simple hash so it fits in a 32-bit integer and is always the same
 * for the same guest.
 */
function guestNotificationId(guestId: string): number {
  let hash = 0;
  for (let i = 0; i < guestId.length; i++) {
    hash = (hash << 5) - hash + guestId.charCodeAt(i);
    hash |= 0; // convert to 32-bit int
  }
  return Math.abs(hash) % 2_000_000_000; // stay well within 32-bit range
}

/**
 * Returns the Date for 9am on the Friday that is 3 days before the next
 * Monday rent due date.
 *
 * Algorithm:
 *   1. Find the next upcoming Monday (rent due day).
 *      (1 - day + 7) % 7 gives days until Monday, but Monday itself must
 *      map to 7 (not 0), handled by the `|| 7` guard.
 *   2. Subtract 3 days to get the preceding Friday.
 *   3. If that Friday is already in the past (or today at/after 9am), add
 *      7 days so we target the Friday before the *following* Monday.
 *
 * Day-by-day results:
 *   Sunday    → daysToMonday=7, Friday=+4 days (past → +7 → +5 days) = next Fri
 *   Monday    → daysToMonday=7, Friday=+4 days = this coming Friday
 *   Tuesday   → daysToMonday=6, Friday=+3 days = this coming Friday
 *   Wednesday → daysToMonday=5, Friday=+2 days = this coming Friday
 *   Thursday  → daysToMonday=4, Friday=+1 day  = tomorrow (Friday)
 *   Friday <9am→ daysToMonday=3, Friday=0 days = today at 9am
 *   Friday ≥9am→ daysToMonday=3, Friday=0 (past) → +7 = next Friday
 *   Saturday  → daysToMonday=2, Friday=-1 day (past) → +7 = next Friday
 */
export function nextFridayAt9am(): Date {
  const now = new Date();
  const day = now.getDay(); // 0=Sun … 6=Sat
  // Days until next Monday (|| 7 ensures Monday itself maps to 7, not 0)
  const daysToMonday = (1 - day + 7) % 7 || 7;
  const friday = new Date(now);
  // 3 days before next Monday = the preceding Friday
  friday.setDate(now.getDate() + daysToMonday - 3);
  friday.setHours(9, 0, 0, 0);
  // If that Friday is already past (or today post-9am), aim for the week after
  if (friday <= now) {
    friday.setDate(friday.getDate() + 7);
  }
  return friday;
}

const reminderId = (guest: Guest) => String(guestNotificationId(guest.id));

/** iOS: matches the old `checkPermissions(...).alert` gate (provisional counts). */
async function iosAlertsAllowed(): Promise<boolean> {
  const { authorizationStatus } = await notifee.getNotificationSettings();
  return authorizationStatus >= AuthorizationStatus.AUTHORIZED;
}

/**
 * Schedules a "Rent Reminder" notification for the guest.
 * Safe to call on every GuestHome mount: the OS replaces a pending
 * notification with the same ID.
 *
 * Only call when guest.rentOwed > 0.
 *
 * On iOS, checks notification permission first and skips if not granted.
 * On Android, schedules directly (POST_NOTIFICATIONS is requested at the OS
 * level). Without SCHEDULE_EXACT_ALARM (removed in the manifest) Android 12+
 * delivers it as an inexact allow-while-idle alarm.
 */
export async function scheduleRentReminder(guest: Guest): Promise<void> {
  try {
    if (Platform.OS === 'ios' && !(await iosAlertsAllowed())) {
      return;
    }
    await ensureNotificationChannels();
    await notifee.createTriggerNotification(
      {
        id: reminderId(guest),
        title: 'Rent Reminder',
        body: 'Your rent payment is due in 3 days. Tap to pay now.',
        data: { screen: 'residentPayment', guestId: guest.id },
        // pressAction opens the app on tap, as the old library did.
        android: { channelId: REMINDER_CHANNEL_ID, pressAction: { id: 'default' } },
        ios: { foregroundPresentationOptions: IOS_FOREGROUND_PRESENTATION },
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp: nextFridayAt9am().getTime(),
        alarmManager: { allowWhileIdle: true },
      },
    );
  } catch (error) {
    logException(error, 'rentReminder - failed to schedule the rent reminder');
  }
}

/**
 * Cancels the pending rent reminder for the guest (after a successful payment,
 * or when GuestHome sees no rent owed). On iOS this removes the pending
 * UNNotificationRequest with this identifier, including one the old library
 * scheduled.
 */
export async function cancelRentReminder(guest: Guest): Promise<void> {
  try {
    await notifee.cancelTriggerNotification(reminderId(guest));
  } catch (error) {
    logException(error, 'rentReminder - failed to cancel the rent reminder');
  }
}
