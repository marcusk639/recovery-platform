import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import { db } from "../utils/firebase";

interface SponsorResult {
  userId: string;
  displayName: string;
  sobrietyDate?: string | null;
  bio?: string;
  requirements?: string[];
  isAvailable: boolean;
  groupId: string;
  groupName: string;
  photoUrl?: string | null;
}

interface GetCrossGroupSponsorsResult {
  sponsors: SponsorResult[];
}

/**
 * getCrossGroupSponsors — Callable Cloud Function
 *
 * Returns all available sponsors from every group the authenticated caller belongs to.
 * - Deduplicates by userId: if the same person appears in multiple groups, only the
 *   first occurrence is returned (earliest group encountered).
 * - Returns an empty array (not an error) if the caller is in no groups.
 */
export const getCrossGroupSponsors = onCall(
  async (
    request: CallableRequest<Record<string, never>>,
  ): Promise<GetCrossGroupSponsorsResult> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const callerId = request.auth.uid;

    // 1. Find all groups the caller is a member of
    const memberDocsSnapshot = await db
      .collection("members")
      .where("userId", "==", callerId)
      .get();

    if (memberDocsSnapshot.empty) {
      return { sponsors: [] };
    }

    // Extract groupIds from the member document IDs (format: {groupId}_{userId})
    const groupIds: string[] = memberDocsSnapshot.docs
      .map((doc) => {
        const data = doc.data();
        return data.groupId as string;
      })
      .filter(Boolean);

    if (groupIds.length === 0) {
      return { sponsors: [] };
    }

    // 2. For each group, fetch the group name and its members who are sponsors
    const seenUserIds = new Set<string>();
    const sponsors: SponsorResult[] = [];

    // Process groups in parallel
    await Promise.all(
      groupIds.map(async (groupId) => {
        // Fetch group name
        const groupDoc = await db.collection("groups").doc(groupId).get();
        if (!groupDoc.exists) return;
        const groupName = groupDoc.data()?.name || "Unknown Group";

        // Fetch all members of this group who have isAvailable = true in sponsorSettings
        // Members are in top-level 'members' collection with groupId field
        const groupMembersSnapshot = await db
          .collection("members")
          .where("groupId", "==", groupId)
          .get();

        for (const memberDoc of groupMembersSnapshot.docs) {
          const memberData = memberDoc.data();
          const userId: string = memberData.userId;

          // Skip self
          if (userId === callerId) continue;

          // Skip if we've already added this person from another group
          if (seenUserIds.has(userId)) continue;

          // Check if available as sponsor
          const sponsorSettings = memberData.sponsorSettings;
          if (!sponsorSettings?.isAvailable) continue;

          seenUserIds.add(userId);

          // Respect the member's sobriety-date privacy setting.
          // showSobrietyDate defaults to false when undefined (opt-in model).
          const sobrietyDateVisible = memberData.showSobrietyDate === true;
          const sobrietyDate =
            sobrietyDateVisible && memberData.sobrietyDate
              ? typeof memberData.sobrietyDate.toDate === "function"
                ? memberData.sobrietyDate.toDate().toISOString()
                : memberData.sobrietyDate
              : null;

          sponsors.push({
            userId,
            displayName: memberData.displayName || memberData.name || "Unknown",
            sobrietyDate,
            bio: sponsorSettings.bio || "",
            requirements: sponsorSettings.requirements || [],
            isAvailable: true,
            groupId,
            groupName,
            photoUrl: memberData.photoUrl || memberData.photoURL || null,
          });
        }
      }),
    );

    return { sponsors };
  },
);
