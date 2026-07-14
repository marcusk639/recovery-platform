import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import { requireAuth } from "../utils/callableWrapper";

interface ExportUserDataRequest {
  // No additional parameters needed - uses auth context
}

interface UserDataExport {
  exportedAt: string;
  user: {
    uid: string;
    email: string | undefined;
    displayName: string | null;
    createdAt: string | null;
    profile: Record<string, unknown> | null;
  };
  groups: Array<{
    groupId: string;
    groupName: string;
    role: string;
    joinedAt: string | null;
  }>;
  messages: {
    directMessageCount: number;
    groupChatMessageCount: number;
  };
  sponsorships: Array<{
    type: "sponsor" | "sponsee";
    status: string;
    createdAt: string | null;
  }>;
  meetings: {
    favoritedMeetingIds: string[];
  };
  treasury: {
    transactionCount: number;
  };
}

interface ExportUserDataResponse {
  success: boolean;
  message: string;
  data?: UserDataExport;
}

/**
 * Callable function to export all of a user's personal data.
 * This supports GDPR compliance and user data portability rights.
 *
 * Returns a JSON object containing:
 * - User profile information
 * - Group memberships
 * - Message counts (not content for privacy of other users)
 * - Sponsorship relationships (anonymized)
 * - Meeting favorites
 * - Treasury activity counts
 */
export const exportUserData = onCall(
  async (
    request: CallableRequest<ExportUserDataRequest>,
  ): Promise<ExportUserDataResponse> => {
    // Verify authentication
    const userId = requireAuth(request);
    const userEmail = request.auth?.token.email;

    try {
      // 1. Get user document
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.exists ? userDoc.data() : null;

      // 2. Get all member documents for this user
      const memberDocs = await db
        .collection("members")
        .where("userId", "==", userId)
        .get();

      const groups: UserDataExport["groups"] = [];
      for (const memberDoc of memberDocs.docs) {
        const memberData = memberDoc.data();
        let role = "member";
        if (memberData.isAdmin) role = "admin";
        if (memberData.isTreasurer) role = "treasurer";

        groups.push({
          groupId: memberData.groupId || "",
          groupName: memberData.groupName || "Unknown Group",
          role,
          joinedAt: memberData.joinedAt?.toDate?.()?.toISOString() || null,
        });
      }

      // 3. Count direct messages sent by user.
      // Collection is `direct_message_threads` (not `directMessages`) and the
      // field is `participants` (not `participantIds`) per schema.ts.
      const dmThreadsSnapshot = await db
        .collection("direct_message_threads")
        .where("participants", "array-contains", userId)
        .get();

      let directMessageCount = 0;
      for (const threadDoc of dmThreadsSnapshot.docs) {
        const messagesSnapshot = await db
          .collection("direct_message_threads")
          .doc(threadDoc.id)
          .collection("messages")
          .where("senderId", "==", userId)
          .count()
          .get();
        directMessageCount += messagesSnapshot.data().count;
      }

      // 4. Count group chat messages sent by user.
      // Group chats live at `group_chats/{groupId}/messages`, not
      // `groups/{groupId}/chat` (per COLLECTION_PATHS).
      let groupChatMessageCount = 0;
      for (const group of groups) {
        const chatMessagesSnapshot = await db
          .collection("group_chats")
          .doc(group.groupId)
          .collection("messages")
          .where("senderId", "==", userId)
          .count()
          .get();
        groupChatMessageCount += chatMessagesSnapshot.data().count;
      }

      // 5. Get sponsorship relationships (anonymized - no names)
      const sponsorshipsAsSponsor = await db
        .collection("sponsorships")
        .where("sponsorId", "==", userId)
        .get();

      const sponsorshipsAsSponsee = await db
        .collection("sponsorships")
        .where("sponseeId", "==", userId)
        .get();

      const sponsorships: UserDataExport["sponsorships"] = [
        ...sponsorshipsAsSponsor.docs.map((doc) => ({
          type: "sponsor" as const,
          status: doc.data().status || "unknown",
          createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
        })),
        ...sponsorshipsAsSponsee.docs.map((doc) => ({
          type: "sponsee" as const,
          status: doc.data().status || "unknown",
          createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
        })),
      ];

      // 6. Get favorited meetings from user document.
      // Schema field is `favoriteMeetings` (not `favoriteMeetingIds`).
      const favoritedMeetingIds: string[] = userData?.favoriteMeetings || [];

      // 7. Count treasury transactions created by user.
      // Transactions live at the top-level `transactions` collection with a
      // `groupId` field — not as a subcollection under each group. Querying
      // by `createdBy` (single-field auto-indexed) avoids needing a
      // composite (groupId, createdBy) index.
      const userTransactionsSnapshot = await db
        .collection("transactions")
        .where("createdBy", "==", userId)
        .count()
        .get();
      const transactionCount = userTransactionsSnapshot.data().count;

      // Build the export object
      const exportData: UserDataExport = {
        exportedAt: new Date().toISOString(),
        user: {
          uid: userId,
          email: userEmail,
          displayName: userData?.displayName || null,
          createdAt: userData?.createdAt?.toDate?.()?.toISOString() || null,
          profile: userData
            ? {
                sobrietyDate: userData.sobrietyDate || null,
                showSobrietyDate: userData.showSobrietyDate || false,
                allowDirectMessages: userData.allowDirectMessages ?? true,
                photoURL: userData.photoURL || null,
                notificationSettings: userData.notificationSettings || {},
                sponsorSettings: userData.sponsorSettings || {},
              }
            : null,
        },
        groups,
        messages: {
          directMessageCount,
          groupChatMessageCount,
        },
        sponsorships,
        meetings: {
          favoritedMeetingIds,
        },
        treasury: {
          transactionCount,
        },
      };

      return {
        success: true,
        message: "Your data has been exported successfully.",
        data: exportData,
      };
    } catch (error: unknown) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error("Error exporting user data:", error);
      throw new HttpsError(
        "internal",
        "An error occurred while exporting your data. Please try again.",
      );
    }
  },
);
