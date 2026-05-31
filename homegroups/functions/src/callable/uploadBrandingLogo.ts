import { onCall, CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { db } from "../utils/firebase";
import * as admin from "firebase-admin";

interface UploadBrandingLogoData {
  intergroupId: string;
  fileExtension: 'png' | 'jpg';
}

interface UploadBrandingLogoResult {
  uploadUrl: string;
  logoUrl: string;
}

export const uploadBrandingLogo = onCall(
  { region: "us-central1" },
  async (request: CallableRequest<UploadBrandingLogoData>): Promise<UploadBrandingLogoResult> => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");

    const { intergroupId, fileExtension } = request.data;
    if (!intergroupId || !fileExtension) {
      throw new HttpsError("invalid-argument", "intergroupId and fileExtension are required");
    }
    if (!['png', 'jpg'].includes(fileExtension)) {
      throw new HttpsError("invalid-argument", "fileExtension must be png or jpg");
    }

    const uid = request.auth.uid;

    // Must be owner of the intergroup
    const intergroupRef = db.collection("intergroups").doc(intergroupId);
    const ownerMemberSnap = await intergroupRef.collection("members").doc(uid).get();
    if (!ownerMemberSnap.exists || ownerMemberSnap.data()?.role !== 'owner') {
      throw new HttpsError("permission-denied", "Only the intergroup owner can upload a branding logo");
    }

    const bucket = admin.storage().bucket();
    const filePath = `branding-logos/${intergroupId}/logo.${fileExtension}`;
    const file = bucket.file(filePath);

    // Signed upload URL valid for 5 minutes
    const expires = new Date(Date.now() + 5 * 60 * 1000);
    const [uploadUrl] = await file.getSignedUrl({
      action: 'write',
      expires,
      contentType: fileExtension === 'png' ? 'image/png' : 'image/jpeg',
    });

    // Generate a signed URL valid for 1 year (logo needs to persist long-term)
    const [logoUrl] = await bucket.file(filePath).getSignedUrl({
      action: 'read',
      expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
    });

    return { uploadUrl, logoUrl };
  }
);
