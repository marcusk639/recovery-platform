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
 * Whether the caller is the resident a document belongs to: they hold a guest
 * claim for its house, its guestId is a guest record of that house linked to
 * their account, and its file is in that resident's own folder. The documents
 * read rule checks the same, except the folder (a list query can't constrain
 * storagePath), so a misfiled record lists but never opens.
 */
async function isOwnResidentDocument(
  uid: string,
  claims: Awaited<ReturnType<typeof liveClaims>>,
  houseId: string,
  guestId: unknown,
  storagePath: string,
): Promise<boolean> {
  if (typeof guestId !== "string" || guestId === "" || !holds(claims, "guest", houseId)) {
    return false;
  }
  if (!storagePath.startsWith(`houses/${houseId}/guests/${guestId}/`)) return false;
  const guest = await admin.firestore().collection("guests").doc(guestId).get();
  return guest.exists && guest.get("userId") === uid && guest.get("houseId") === houseId;
}

/**
 * A short-lived read link to a house or resident document, for the house's
 * admins and super-admins (owner decision 2026-11-09), and for the resident a
 * document belongs to (launch spec §4.1 item 2: residents keep read-only
 * access to their own documents, also while their house is blocked). Documents
 * used to store a permanent download link, which anyone holding it could open
 * whatever the rules said. Not gated by the paywall: reads aren't.
 *
 * Claims are read live, so a revoked admin or a resident who moved out can't
 * use a token that still holds the old claim. A missing document, a caller who
 * is neither staff of its house nor its resident, and a stored path outside
 * that house's (or that resident's) folder all get the same not-found, so ids
 * can't be probed and one record can't point at another's file.
 */
export const getDocumentLink = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required");
  const { documentId } = parseInput<{
    documentId: string;
  }>(GetDocumentLinkSchema, request.data);

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
    const allowed =
      snap.exists &&
      inItsHouse &&
      (isStaff ||
        (await isOwnResidentDocument(
          request.auth.uid,
          claims,
          houseId,
          snap.get("guestId"),
          storagePath,
        )));
    if (!allowed) {
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
