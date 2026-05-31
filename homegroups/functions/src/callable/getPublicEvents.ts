import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { db } from "../utils/firebase";

interface GetPublicEventsData {
  // Optional: if provided, we could filter by radius; omitted for simplified scope
  limitCount?: number;
}

interface PublicEventResult {
  instanceId: string;
  meetingId: string;
  groupId: string;
  groupName: string;
  name: string;
  scheduledAt: string; // ISO string
  location?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  locationName?: string | null;
  isOnline?: boolean;
  link?: string | null;
  type: string;
  format?: string | null;
}

interface GetPublicEventsResult {
  events: PublicEventResult[];
}

/**
 * getPublicEvents — Callable Cloud Function
 *
 * Returns upcoming public meeting instances (isPublic: true) within next 30 days.
 * - Auth required.
 * - Only returns instances with isPublic: true and scheduledAt > now.
 * - Attaches group name from the groups collection.
 * - Limited to 100 results to avoid large payloads.
 */
export const getPublicEvents = onCall(
  async (
    request: CallableRequest<GetPublicEventsData>,
  ): Promise<GetPublicEventsResult> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const now = admin.firestore.Timestamp.now();
    const thirtyDaysFromNow = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    );
    const limit = Math.min(request.data?.limitCount ?? 100, 100);

    // Query meetingInstances where isPublic === true and scheduledAt > now
    const snapshot = await db
      .collection("meetingInstances")
      .where("isPublic", "==", true)
      .where("scheduledAt", ">", now)
      .where("scheduledAt", "<=", thirtyDaysFromNow)
      .orderBy("scheduledAt", "asc")
      .limit(limit)
      .get();

    if (snapshot.empty) {
      return { events: [] };
    }

    // Collect unique groupIds to batch-fetch group names
    const groupIds = [
      ...new Set(snapshot.docs.map((doc) => doc.data().groupId as string)),
    ];
    const groupNameMap: Record<string, string> = {};

    await Promise.all(
      groupIds.map(async (groupId) => {
        const groupDoc = await db.collection("groups").doc(groupId).get();
        groupNameMap[groupId] = groupDoc.exists
          ? groupDoc.data()?.name || "Unknown Group"
          : "Unknown Group";
      }),
    );

    const events: PublicEventResult[] = snapshot.docs
      .filter((doc) => {
        const d = doc.data();
        // Double-check: only future, non-cancelled instances
        return !d.isCancelled;
      })
      .map((doc) => {
        const d = doc.data();
        const scheduledAt: admin.firestore.Timestamp = d.scheduledAt;
        return {
          instanceId: doc.id,
          meetingId: d.meetingId,
          groupId: d.groupId,
          groupName: groupNameMap[d.groupId] || "Unknown Group",
          name: d.name,
          scheduledAt: scheduledAt.toDate().toISOString(),
          location: d.location ?? null,
          address: d.address ?? null,
          city: d.city ?? null,
          state: d.state ?? null,
          zip: d.zip ?? null,
          locationName: d.locationName ?? null,
          isOnline: d.isOnline ?? false,
          link: d.link ?? null,
          type: d.type,
          format: d.format ?? null,
        };
      });

    return { events };
  },
);
