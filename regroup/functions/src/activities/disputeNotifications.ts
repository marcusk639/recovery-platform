/**
 * Notify the house admins and the disputed resident when an activity is
 * disputed. Runs from the onActivityWritten trigger on a transition INTO
 * `disputed` (any other write is ignored).
 *
 * Server-side because the client could not do it: notifications may only be
 * created with the caller's own userId, so the app's own dispute batch was
 * denied for every recipient but the caller.
 *
 * Recipients: every admin of the guest's house (house.adminIds,
 * house.superAdminIds, house.superAdminId; the house roster that
 * notifyOperatorOnApplication already uses) plus the resident
 * (guests.userId), minus whoever raised the dispute. The house comes from the
 * guest doc, never from the activity.
 *
 * Writes /notifications/{id} in the existing shape (userId, houseId, guestId,
 * subject, message, type 'dispute', level 'alert', date, read). The existing
 * `notify` trigger sends the push for each new doc. Doc ids are derived from
 * the event id and recipient and written with create(), so a redelivered event
 * cannot notify twice.
 *
 * Logs ids and counts only; the reason text goes only into the notifications.
 */
import { logger } from 'firebase-functions';
import { trustedGuestFrom } from './activityTrust';

type Firestore = FirebaseFirestore.Firestore;
type Data = Record<string, unknown>;

const ALREADY_EXISTS = 6;

const TYPE_LABELS: Record<string, string> = {
  chore: 'chore completion',
  meeting: 'meeting attendance',
  work: 'work hours',
  medication: 'medication',
  primary_supporter: 'sponsor meeting',
};

export function isNewDispute(before: Data | undefined, after: Data | undefined): boolean {
  return after?.status === 'disputed' && before?.status !== 'disputed';
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : [];

export function disputeMessage(activity: Data, forAdmin: boolean): string {
  const label = TYPE_LABELS[String(activity.type)] ?? 'activity';
  const reason =
    typeof activity.disputeReason === 'string' && activity.disputeReason !== ''
      ? activity.disputeReason
      : 'No reason provided';
  const article = /^[aeiou]/.test(label) ? 'An' : 'A';
  return `${forAdmin ? article : 'Your'} ${label} has been disputed. Reason: ${reason}`;
}

export async function notifyDispute(
  db: Firestore,
  eventId: string,
  activityId: string,
  before: Data | undefined,
  after: Data | undefined,
): Promise<{ recipients: string[] }> {
  if (!after || !isNewDispute(before, after)) return { recipients: [] };

  const guestId = typeof after.guestId === 'string' ? after.guestId : '';
  const guestSnap = guestId ? await db.collection('guests').doc(guestId).get() : undefined;
  const guest = trustedGuestFrom(
    guestId,
    guestSnap?.exists ? (guestSnap.data() as Data) : undefined,
  );
  if (!guest) {
    logger.warn('dispute_notify.skipped_no_guest', { activityId, guestId });
    return { recipients: [] };
  }
  const house = (await db.collection('houses').doc(guest.houseId).get()).data() ?? {};
  const admins = new Set([
    ...strings(house.adminIds),
    ...strings(house.superAdminIds),
    ...strings([house.superAdminId]),
  ]);

  const disputer =
    (typeof after.disputedBy === 'string' && after.disputedBy) ||
    (typeof after.disputeResolvedBy === 'string' && after.disputeResolvedBy) ||
    '';
  const recipients = new Map<string, boolean>(); // uid -> forAdmin
  for (const uid of admins) recipients.set(uid, true);
  if (guest.residentUid && !recipients.has(guest.residentUid))
    recipients.set(guest.residentUid, false);
  recipients.delete(disputer);

  const date = new Date().toISOString();
  const sent: string[] = [];
  for (const [uid, forAdmin] of recipients) {
    const ref = db.collection('notifications').doc(`dispute_${eventId}_${uid}`);
    try {
      await ref.create({
        userId: uid,
        houseId: guest.houseId,
        guestId,
        activityId,
        subject: 'Activity Disputed',
        message: disputeMessage(after, forAdmin),
        type: 'dispute',
        level: 'alert',
        adminNotification: forAdmin,
        date,
        read: false,
      });
      sent.push(uid);
    } catch (err) {
      if ((err as { code?: unknown })?.code !== ALREADY_EXISTS) throw err;
    }
  }
  logger.info('dispute_notify.sent', {
    activityId,
    houseId: guest.houseId,
    recipients: sent.length,
    redelivered: recipients.size - sent.length,
  });
  return { recipients: sent };
}
