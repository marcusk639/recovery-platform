import firestore from '@react-native-firebase/firestore';
import {startOfDay, endOfDay} from 'date-fns';

/**
 * Minimal shape of a meeting instance as consumed by the QR check-in screen.
 * Mirrors the subset of `MeetingInstanceDocument` fields that callers currently read.
 */
export interface MeetingInstance {
  id: string;
  meetingId: string;
  groupId: string;
  scheduledAt: Date;
  attendeeCount: number;
  attendees?: string[];
}

/**
 * Meeting instance model — Firestore data access for the `meetingInstances`
 * collection. Screens must not call Firestore directly.
 */
export class MeetingInstanceModel {
  /**
   * Subscribe to today's meeting instance for a given meeting.
   *
   * @param groupId Group ID owning the meeting (reserved for future security rule
   *                filtering; not currently part of the query).
   * @param meetingId Meeting template ID to look up an instance for.
   * @param onData Called with the matching instance, or `null` if no instance
   *               exists for today yet.
   * @param onError Called when the underlying snapshot listener errors.
   * @returns Unsubscribe function — call it to detach the listener.
   */
  static subscribeTodayInstanceForMeeting(
    groupId: string,
    meetingId: string,
    onData: (instance: MeetingInstance | null) => void,
    onError: (err: Error) => void,
  ): () => void {
    const now = new Date();
    const dayStart = startOfDay(now);
    const dayEnd = endOfDay(now);

    return firestore()
      .collection('meetingInstances')
      .where('meetingId', '==', meetingId)
      .where('scheduledAt', '>=', dayStart)
      .where('scheduledAt', '<=', dayEnd)
      .limit(1)
      .onSnapshot(
        snapshot => {
          if (snapshot.empty) {
            onData(null);
            return;
          }
          const doc = snapshot.docs[0];
          const data = doc.data() as any;
          const scheduledAt =
            data.scheduledAt && typeof data.scheduledAt.toDate === 'function'
              ? data.scheduledAt.toDate()
              : new Date();
          onData({
            id: doc.id,
            meetingId: data.meetingId,
            groupId: data.groupId,
            scheduledAt,
            attendeeCount: data.attendeeCount ?? 0,
            attendees: data.attendees ?? [],
          });
        },
        err => {
          onError(err instanceof Error ? err : new Error(String(err)));
        },
      );
  }
}
