import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import { assertGroupActive } from "../utils/subscriptionGuard";
import * as admin from "firebase-admin";

// Characters for code generation (excludes confusing chars: I, O, 0, 1, L)
const CODE_CHARACTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MAX_CODE_GENERATION_ATTEMPTS = 10;

/**
 * Generates a random 6-char alphanumeric code
 */
function generateRandomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARACTERS.charAt(
      Math.floor(Math.random() * CODE_CHARACTERS.length),
    );
  }
  return code;
}

/**
 * Derives a vanity code from first name + year, e.g. "JOHN2024"
 * Falls back to random if the result would be over 10 chars or collision found.
 */
function deriveVanityCode(firstName: string, year: number): string {
  const sanitized = firstName
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 6);
  return `${sanitized}${year}`;
}

interface GenerateReferralCodeData {
  groupId: string;
}

export const generateReferralCode = onCall(
  async (request: CallableRequest<GenerateReferralCodeData>) => {
    const { groupId } = request.data;
    const userId = request.auth?.uid;

    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }
    if (!groupId) {
      throw new HttpsError("invalid-argument", "Group ID is required.");
    }

    try {
      // Verify caller is admin of the group
      const [groupSnap, userSnap] = await Promise.all([
        db.collection("groups").doc(groupId).get(),
        db.collection("users").doc(userId).get(),
      ]);

      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "Group not found.");
      }

      const groupData = groupSnap.data()!;
      const admins: string[] = groupData.admins || [];

      if (!admins.includes(userId)) {
        throw new HttpsError(
          "permission-denied",
          "Only group admins can generate referral codes.",
        );
      }
      assertGroupActive(groupData);

      // Check if user already has an active referral code
      const existingCodeSnap = await db
        .collection("referral_codes")
        .where("creatorId", "==", userId)
        .where("isActive", "==", true)
        .limit(1)
        .get();

      if (!existingCodeSnap.empty) {
        const existingCode = existingCodeSnap.docs[0].data().code as string;
        logger.info(
          `User ${userId} already has referral code ${existingCode}, returning existing`,
        );
        return { code: existingCode };
      }

      // Attempt vanity code first
      const userData = userSnap.exists ? userSnap.data() : null;
      const displayName: string = userData?.displayName || "";
      const firstName = displayName.split(" ")[0] || "";
      const year = new Date().getFullYear();

      let code = "";
      let codeIsUnique = false;
      let attempts = 0;

      // Try vanity code first (if firstName is available)
      if (firstName.length >= 2) {
        const vanityCode = deriveVanityCode(firstName, year);
        const vanitySnap = await db
          .collection("referral_codes")
          .doc(vanityCode)
          .get();
        if (!vanitySnap.exists) {
          code = vanityCode;
          codeIsUnique = true;
        }
      }

      // Fall back to random code if vanity not available
      while (!codeIsUnique && attempts < MAX_CODE_GENERATION_ATTEMPTS) {
        const candidate = generateRandomCode();
        const existingSnap = await db
          .collection("referral_codes")
          .doc(candidate)
          .get();
        if (!existingSnap.exists) {
          code = candidate;
          codeIsUnique = true;
        }
        attempts++;
      }

      if (!codeIsUnique) {
        throw new HttpsError(
          "internal",
          "Unable to generate a unique referral code. Please try again.",
        );
      }

      // Write the referral code document (using code as document ID for fast lookup)
      await db.collection("referral_codes").doc(code).set({
        code,
        creatorId: userId,
        creatorGroupId: groupId,
        uses: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        isActive: true,
      });

      // Also store the code reference on the user document for fast retrieval
      await db.collection("users").doc(userId).update({
        referralCode: code,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info(`Generated referral code ${code} for user ${userId}`);
      return { code };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error("Error in generateReferralCode:", error);
      throw new HttpsError("internal", "Failed to generate referral code.");
    }
  },
);
