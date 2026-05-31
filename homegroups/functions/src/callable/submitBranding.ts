import { onCall, CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { db } from "../utils/firebase";
import * as admin from "firebase-admin";

interface SubmitBrandingData {
  intergroupId: string;
  orgName: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor?: string;
  headerTextColor?: string;
  welcomeMessage?: string;
  logoUrl?: string;
}

interface SubmitBrandingResult {
  brandingId: string;
  status: 'pending';
}

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

export const submitBranding = onCall(
  { region: "us-central1" },
  async (request: CallableRequest<SubmitBrandingData>): Promise<SubmitBrandingResult> => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");

    const { intergroupId, orgName, primaryColor, accentColor, backgroundColor, headerTextColor, welcomeMessage, logoUrl } = request.data;
    if (!intergroupId || !orgName || !primaryColor || !accentColor) {
      throw new HttpsError("invalid-argument", "intergroupId, orgName, primaryColor, and accentColor are required");
    }

    // Validate hex colors
    if (!HEX_COLOR_REGEX.test(primaryColor)) {
      throw new HttpsError("invalid-argument", "primaryColor must be a valid hex color (e.g., #1A73E8)");
    }
    if (!HEX_COLOR_REGEX.test(accentColor)) {
      throw new HttpsError("invalid-argument", "accentColor must be a valid hex color");
    }
    if (backgroundColor && !HEX_COLOR_REGEX.test(backgroundColor)) {
      throw new HttpsError("invalid-argument", "backgroundColor must be a valid hex color");
    }
    if (headerTextColor && !HEX_COLOR_REGEX.test(headerTextColor)) {
      throw new HttpsError("invalid-argument", "headerTextColor must be a valid hex color");
    }
    if (welcomeMessage && welcomeMessage.length > 140) {
      throw new HttpsError("invalid-argument", "welcomeMessage must be 140 characters or fewer");
    }

    const uid = request.auth.uid;

    // Load intergroup — must be owner AND active subscription
    const intergroupRef = db.collection("intergroups").doc(intergroupId);
    const intergroupSnap = await intergroupRef.get();
    if (!intergroupSnap.exists) throw new HttpsError("not-found", "Intergroup not found");
    const intergroupData = intergroupSnap.data()!;

    // Check ownership
    const ownerMemberSnap = await intergroupRef.collection("members").doc(uid).get();
    if (!ownerMemberSnap.exists || ownerMemberSnap.data()?.role !== 'owner') {
      throw new HttpsError("permission-denied", "Only the intergroup owner can submit branding");
    }

    if (intergroupData.subscriptionStatus !== 'active') {
      throw new HttpsError("failed-precondition", "Intergroup subscription must be active to submit branding");
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    // Create branding document
    const brandingRef = db.collection("branding").doc();
    const brandingId = brandingRef.id;

    const brandingDoc: Record<string, any> = {
      id: brandingId,
      intergroupId,
      orgName,
      primaryColor,
      accentColor,
      status: 'pending',
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    if (backgroundColor) brandingDoc.backgroundColor = backgroundColor;
    if (headerTextColor) brandingDoc.headerTextColor = headerTextColor;
    if (welcomeMessage) brandingDoc.welcomeMessage = welcomeMessage;
    if (logoUrl) brandingDoc.logoUrl = logoUrl;

    await brandingRef.set(brandingDoc);

    // Update intergroup with brandingId
    await intergroupRef.update({
      brandingId,
      updatedAt: now,
    });

    // Notify platform super admins (write to admin_notifications collection)
    await db.collection("admin_notifications").add({
      type: 'branding_submission',
      brandingId,
      intergroupId,
      intergroupName: intergroupData.name,
      submittedBy: uid,
      createdAt: now,
      resolved: false,
    });

    return { brandingId, status: 'pending' };
  }
);
