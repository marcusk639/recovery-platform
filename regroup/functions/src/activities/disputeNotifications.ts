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
 * (guests.userId), minus whoever raised the dispute (disputerOf: the
 * disputer field this write set, which the rules tie to the caller). The
 * house comes from the
 * guest doc, never from the activity.
 *
 * Writes /notifications/{id} in the existing shape (userId, houseId, guestId,
 * subject, message, type 'dispute', level 'alert', date, read). The existing
 * `notify` trigger sends the push for each new doc. Doc ids are derived from
 * the event id and recipient and written with create(), so a redelivered event
 * cannot notify twice.
 *
 * A REOPEN (an admin undoing a decision: resolved, or an old build's
 * "delete", back to `disputed`) notifies the same people, minus the admin who
 * reopened it, that the decision was undone and the dispute is open again.
 *
 * Logs ids and counts only; the reason text goes only into the notifications.
 */
import { logger } from 'firebase-functions';
import { trustedGuestFrom } from './activityTrust';
import { isReopen } from './disputeDecisions';

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

/**
 * Who raised the dispute, for a write that enters `disputed`: disputedBy if
 * present, else disputeResolvedBy (app builds before disputedBy wrote the
 * disputer there). The rules require that write to change one of the two to
 * request.auth.uid, a changed disputeResolvedBy to be the caller, and a
 * present disputedBy to be the caller — so this is always the caller of the
 * entering write. Empty for any other write, or when neither is set (e.g. an
 * Admin SDK write).
 */
export function disputerOf(before: Data | undefined, after: Data | undefined): string {
  if (!after || !isNewDispute(before, after)) return '';
  for (const field of ['disputedBy', 'disputeResolvedBy']) {
    const v = after[field];
    if (typeof v === 'string' && v !== '') return v;
  }
  return '';
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : [];

export const REOPENED_MESSAGE = 'A dispute decision was undone; the dispute is open again.';

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

  const reopened = isReopen(before, after);
  // Whoever acted: the reopening admin, or the disputer.
  const actor = reopened
    ? typeof after.reopenedBy === 'string'
      ? after.reopenedBy
      : ''
    : disputerOf(before, after);
  // Owner rule: nobody disputes their own activity; the rules refuse it for
  // every client write. Only an Admin SDK path could get here — log it.
  if (!reopened && actor && (actor === guest.residentUid || actor === after.loggedBy)) {
    logger.warn('dispute_notify.self_dispute', { activityId, guestId });
  }
  const recipients = new Map<string, boolean>(); // uid -> forAdmin
  for (const uid of admins) recipients.set(uid, true);
  if (guest.residentUid && !recipients.has(guest.residentUid))
    recipients.set(guest.residentUid, false);
  recipients.delete(actor);

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
        subject: reopened ? 'Dispute Reopened' : 'Activity Disputed',
        message: reopened ? REOPENED_MESSAGE : disputeMessage(after, forAdmin),
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
    kind: reopened ? 'reopened' : 'disputed',
    houseId: guest.houseId,
    recipients: sent.length,
    redelivered: recipients.size - sent.length,
  });
  return { recipients: sent };
}
