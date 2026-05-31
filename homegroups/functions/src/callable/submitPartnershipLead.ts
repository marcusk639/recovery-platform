import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db } from "../utils/firebase";

interface SubmitPartnershipLeadData {
  kind: "treatment_center" | "intergroup";
  organizationName: string;
  contactName: string;
  email: string;
  phone?: string;
  tier?: string;
  notes?: string;
  website?: string; // honeypot — must be empty/undefined
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TEXT_LEN = 2000;
const MAX_SHORT_LEN = 200;

function trunc(s: string | undefined, max: number): string | undefined {
  if (!s) return s;
  return s.length > max ? s.slice(0, max) : s;
}

/** Firestore rejects `undefined` field values — strip before writes. */
function omitUndefinedFields(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

async function handler(
  request: CallableRequest<SubmitPartnershipLeadData>,
): Promise<{ success: true; id: string }> {
  const data = request.data || ({} as SubmitPartnershipLeadData);

  // Honeypot: real users never fill this in.
  if (data.website && data.website.trim() !== "") {
    throw new HttpsError("invalid-argument", "Invalid submission.");
  }

  if (data.kind !== "treatment_center" && data.kind !== "intergroup") {
    throw new HttpsError("invalid-argument", "Invalid partnership kind.");
  }

  const orgName = (data.organizationName || "").trim();
  const contactName = (data.contactName || "").trim();
  const email = (data.email || "").trim();

  if (!orgName) {
    throw new HttpsError("invalid-argument", "Organization name is required.");
  }
  if (!contactName) {
    throw new HttpsError("invalid-argument", "Contact name is required.");
  }
  if (!EMAIL_RE.test(email)) {
    throw new HttpsError("invalid-argument", "Valid email is required.");
  }

  const userAgent: string | undefined = request.rawRequest?.headers?.[
    "user-agent"
  ] as string | undefined;

  const doc: Record<string, unknown> = {
    kind: data.kind,
    organizationName: trunc(orgName, MAX_SHORT_LEN),
    contactName: trunc(contactName, MAX_SHORT_LEN),
    email: trunc(email, MAX_SHORT_LEN),
    phone: trunc(data.phone?.trim(), MAX_SHORT_LEN),
    tier: trunc(data.tier?.trim(), MAX_SHORT_LEN),
    notes: trunc(data.notes?.trim(), MAX_TEXT_LEN),
    userAgent: trunc(userAgent, MAX_SHORT_LEN),
    status: "new",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  try {
    const ref = await db
      .collection("partnershipLeads")
      .add(omitUndefinedFields(doc));
    return { success: true as const, id: ref.id };
  } catch (err: unknown) {
    if (err instanceof HttpsError) throw err;
    logger.error("submitPartnershipLead write failed", err);
    throw new HttpsError(
      "internal",
      "Unable to submit lead. Please try again.",
    );
  }
}

export const submitPartnershipLead = onCall(handler);
