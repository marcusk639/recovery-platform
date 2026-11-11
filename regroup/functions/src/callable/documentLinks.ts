import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { z } from "zod";
import { parseInput } from "../validation";
import { holds, liveClaims } from "../util/houseRoleStore";

const GetDocumentLinkSchema = z.object({
  documentId: z.string().min(1).max(128),
});

/** How long a document link works. */
export const DOCUMENT_LINK_LIFETIME_MS = 15 * 60 * 1000;

/**
 * A short-lived read link to a house or resident document, for the house's
 * admins and super-admins only (owner decision 2026-11-09). Documents used to
 * store a permanent download link, which anyone holding it could open whatever
 * the rules said.
 *
 * Claims are read live, so a revoked admin can't use a token that still holds
 * the old claim. A missing document, a caller who isn't staff of its house,
 * and a stored path outside that house's folder all get the same not-found,
 * so ids can't be probed and one house's record can't point at another's file.
 */
export const getDocumentLink = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required");
  const { documentId } = parseInput(GetDocumentLinkSchema, request.data) as {
    documentId: string;
  };

  try {
    const snap = await admin.firestore().collection("documents").doc(documentId).get();
    const houseId = snap.get("houseId");
    const storagePath = snap.get("storagePath");
    const claims = await liveClaims(request.auth.uid);
    const isStaff =
      typeof houseId === "string" &&
      (holds(claims, "admin", houseId) || holds(claims, "superAdmin", houseId));
    const inItsHouse =
      typeof storagePath === "string" && storagePath.startsWith(`houses/${houseId}/`);
    if (!snap.exists || !isStaff || !inItsHouse) {
      throw new HttpsError("not-found", "Document not found");
    }

    const expires = Date.now() + DOCUMENT_LINK_LIFETIME_MS;
    const [url] = await admin
      .storage()
      .bucket()
      .file(storagePath)
      .getSignedUrl({ version: "v4", action: "read", expires });
    return { url, expiresAt: new Date(expires).toISOString() };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error("getDocumentLink failed", { documentId, error });
    throw new HttpsError("internal", "Couldn't get a link for this document");
  }
});
