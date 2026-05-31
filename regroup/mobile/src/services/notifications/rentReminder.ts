/**
 * rentReminder.ts
 *
 * Schedules (and cancels) a local push notification reminding a guest that
 * rent is due on the coming Monday. The notification fires on the nearest
 * upcoming Friday at 9am, giving the resident the weekend to arrange payment.
 *
 * The notification ID is deterministic per guest so re-scheduling is
 * idempotent and cancellation is precise.
 */

import { Platform } from 'react-native';
import PushNotification from 'react-native-push-notification';
import { Guest } from '../../entities/Guest';

const CHANNEL_ID = 'default-channel-id';

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

function doSchedule(guest: Guest): void {
  PushNotification.localNotificationSchedule({
    // String ID keeps schedule/cancel calls consistent across iOS and Android.
    id: String(guestNotificationId(guest.id)),
    channelId: CHANNEL_ID,
    title: 'Rent Reminder',
    message: 'Your rent payment is due in 3 days. Tap to pay now.',
    date: nextFridayAt9am(),
    userInfo: { screen: 'residentPayment', guestId: guest.id },
    allowWhileIdle: true,
  });
}

/**
 * Schedules a "Rent Reminder" notification for the guest.
 * Safe to call on every GuestHome mount — the OS deduplicates by ID.
 *
 * Only call when guest.rentOwed > 0.
 *
 * On iOS, checks alert permission first and skips if not granted.
 * On Android, schedules directly (permission model is handled at the OS level).
 */
export function scheduleRentReminder(guest: Guest): void {
  if (Platform.OS === 'ios') {
    PushNotification.checkPermissions(permissions => {
      if (!permissions.alert) {
        // iOS alert permission not granted — skip scheduling
        return;
      }
      doSchedule(guest);
    });
  } else {
    doSchedule(guest);
  }
}

/**
 * Cancels the rent reminder for the guest (call after successful payment).
 */
export function cancelRentReminder(guest: Guest): void {
  PushNotification.cancelLocalNotification(
    String(guestNotificationId(guest.id)),
  );
}
