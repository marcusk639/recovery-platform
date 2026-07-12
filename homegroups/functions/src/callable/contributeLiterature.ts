import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { z } from "zod";
import { db } from "../utils/firebase";
import { requireAuth, validateData } from "../utils/callableWrapper";

interface ContributeLiteratureInput {
  title: string;
  author?: string;
  type:
    | "article"
    | "guide"
    | "pamphlet"
    | "meditation"
    | "prayer"
    | "external_link";
  summary: string; // max 500 chars
  externalUrl?: string; // required if type === 'external_link'
  tags?: string[];
  program?: string;
}

interface ContributeLiteratureOutput {
  itemId: string;
}

// .trim() runs before the length/url checks so whitespace-only titles and
// summaries are rejected (matching the previous `data.title.trim()` /
// `data.summary.trim().length > 500` checks) and validated.* comes back
// pre-trimmed for direct use in the Firestore write.
const contributeLiteratureSchema = z.object({
  title: z.string().trim().min(1),
  author: z.string().trim().optional(),
  type: z.enum([
    "article",
    "guide",
    "pamphlet",
    "meditation",
    "prayer",
    "external_link",
  ]),
  summary: z.string().trim().min(1).max(500),
  externalUrl: z.string().trim().url().optional(),
  tags: z.array(z.string()).optional(),
  program: z.string().optional(),
});

/**
 * contributeLiterature — Any authenticated user can contribute
 * Item is created with isApproved: false until admin review
 */
export const contributeLiterature = onCall(
  async (
    request: CallableRequest<ContributeLiteratureInput>,
  ): Promise<ContributeLiteratureOutput> => {
    const callerId = requireAuth(request);
    const validated = validateData(contributeLiteratureSchema, request.data);

    // Cross-field validation — Zod's per-field schema can't express "required
    // only when type === external_link", so this stays as its own check.
    if (validated.type === "external_link" && !validated.externalUrl) {
      throw new HttpsError(
        "invalid-argument",
        "externalUrl is required for external_link type.",
      );
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const itemRef = db.collection("literature_index").doc();

    const itemData: Record<string, any> = {
      id: itemRef.id,
      title: validated.title,
      type: validated.type,
      source: "contributed",
      summary: validated.summary,
      tags: validated.tags || [],
      contributedBy: callerId,
      isApproved: false,
      saveCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    if (validated.author) itemData.author = validated.author;
    if (validated.externalUrl) itemData.externalUrl = validated.externalUrl;
    if (validated.program) itemData.program = validated.program;

    await itemRef.set(itemData);

    logger.info(`Literature contributed: itemId=${itemRef.id} by=${callerId}`);

    return { itemId: itemRef.id };
  },
);
