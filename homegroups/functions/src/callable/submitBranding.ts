import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import { db } from "../utils/firebase";
import * as admin from "firebase-admin";
import { z } from "zod";
import { requireAuth, validateData } from "../utils/callableWrapper";

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
  status: "pending";
}

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

const submitBrandingSchema = z.object({
  intergroupId: z.string().min(1),
  orgName: z.string().min(1),
  primaryColor: z.string().regex(HEX_COLOR_REGEX, "Must be a valid hex color"),
  accentColor: z.string().regex(HEX_COLOR_REGEX, "Must be a valid hex color"),
  backgroundColor: z
    .string()
    .regex(HEX_COLOR_REGEX, "Must be a valid hex color")
    .optional(),
  headerTextColor: z
    .string()
    .regex(HEX_COLOR_REGEX, "Must be a valid hex color")
    .optional(),
  welcomeMessage: z.string().max(140).optional(),
  logoUrl: z.string().url().optional(),
});

export const submitBranding = onCall(
  { region: "us-central1" },
  async (
    request: CallableRequest<SubmitBrandingData>,
  ): Promise<SubmitBrandingResult> => {
    const uid = requireAuth(request);

    // intergroupId/orgName/primaryColor/accentColor presence, hex-color
    // format, and welcomeMessage length are now enforced by
    // submitBrandingSchema; the manual regex/length checks they replaced are
    // gone.
    const {
      intergroupId,
      orgName,
      primaryColor,
      accentColor,
      backgroundColor,
      headerTextColor,
      welcomeMessage,
      logoUrl,
    } = validateData(submitBrandingSchema, request.data);

    // Load intergroup — must be owner AND active subscription
    const intergroupRef = db.collection("intergroups").doc(intergroupId);
    const intergroupSnap = await intergroupRef.get();
    if (!intergroupSnap.exists)
      throw new HttpsError("not-found", "Intergroup not found");
    const intergroupData = intergroupSnap.data()!;

    // Check ownership
    const ownerMemberSnap = await intergroupRef
      .collection("members")
      .doc(uid)
      .get();
    if (!ownerMemberSnap.exists || ownerMemberSnap.data()?.role !== "owner") {
      throw new HttpsError(
        "permission-denied",
        "Only the intergroup owner can submit branding",
      );
    }

    if (intergroupData.subscriptionStatus !== "active") {
      throw new HttpsError(
        "failed-precondition",
        "Intergroup subscription must be active to submit branding",
      );
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
      status: "pending",
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
      type: "branding_submission",
      brandingId,
      intergroupId,
      intergroupName: intergroupData.name,
      submittedBy: uid,
      createdAt: now,
      resolved: false,
    });

    return { brandingId, status: "pending" };
  },
);
