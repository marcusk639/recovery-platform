import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import { db } from "../utils/firebase";
import * as admin from "firebase-admin";
import { requireAuth } from "../utils/callableWrapper";

interface ConfigureSSOData {
  intergroupId: string;
  emailDomains: string[];
  autoJoinGroupId: string;
  autoJoinRole?: "member";
  enabled: boolean;
}

interface ConfigureSSOResult {
  success: boolean;
  configuredDomains: string[];
}

const DOMAIN_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}$/;
const MAX_DOMAINS = 5;

export const configureSSO = onCall(
  { region: "us-central1" },
  async (
    request: CallableRequest<ConfigureSSOData>,
  ): Promise<ConfigureSSOResult> => {
    const uid = requireAuth(request);

    const { intergroupId, emailDomains, autoJoinGroupId, enabled } =
      request.data;
    if (!intergroupId || !autoJoinGroupId || !Array.isArray(emailDomains)) {
      throw new HttpsError(
        "invalid-argument",
        "intergroupId, emailDomains, and autoJoinGroupId are required",
      );
    }

    // Load intergroup
    const intergroupRef = db.collection("intergroups").doc(intergroupId);
    const intergroupSnap = await intergroupRef.get();
    if (!intergroupSnap.exists)
      throw new HttpsError("not-found", "Intergroup not found");
    const intergroupData = intergroupSnap.data()!;

    // Must be owner
    const ownerMemberSnap = await intergroupRef
      .collection("members")
      .doc(uid)
      .get();
    if (!ownerMemberSnap.exists || ownerMemberSnap.data()?.role !== "owner") {
      throw new HttpsError(
        "permission-denied",
        "Only the intergroup owner can configure SSO",
      );
    }

    // Must be active subscription
    if (intergroupData.subscriptionStatus !== "active") {
      throw new HttpsError(
        "failed-precondition",
        "Intergroup subscription must be active",
      );
    }

    // SSO is Tier B only
    if (intergroupData.tier !== "tier_b") {
      throw new HttpsError(
        "failed-precondition",
        "SSO is only available on the Unlimited (Tier B) plan",
      );
    }

    // Validate domain count
    if (emailDomains.length > MAX_DOMAINS) {
      throw new HttpsError(
        "invalid-argument",
        `Maximum ${MAX_DOMAINS} email domains allowed`,
      );
    }

    // Validate each domain format
    for (const domain of emailDomains) {
      if (!DOMAIN_REGEX.test(domain)) {
        throw new HttpsError(
          "invalid-argument",
          `Invalid domain format: ${domain}`,
        );
      }
    }

    // Validate autoJoinGroupId is in affiliatedGroupIds
    if (!intergroupData.affiliatedGroupIds?.includes(autoJoinGroupId)) {
      throw new HttpsError(
        "invalid-argument",
        "autoJoinGroupId must be one of the intergroup's affiliated groups",
      );
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const configuredDomains = emailDomains.map((d) => d.toLowerCase());

    // Get old domains to remove from index
    const oldDomains: string[] = intergroupData.emailDomains || [];
    const domainsToRemove = oldDomains.filter(
      (d) => !configuredDomains.includes(d),
    );

    // Remove old domain index entries
    for (const domain of domainsToRemove) {
      await db.collection("sso_domain_index").doc(domain).delete();
    }

    // Write/update domain index entries
    for (const domain of configuredDomains) {
      await db.collection("sso_domain_index").doc(domain).set({
        domain,
        intergroupId,
        autoJoinGroupId,
        intergroupName: intergroupData.name,
        enabled,
        configuredAt: now,
        configuredBy: uid,
      });
    }

    // Update intergroup document
    await intergroupRef.update({
      emailDomains: configuredDomains,
      ssoAutoJoinGroupId: autoJoinGroupId,
      ssoEnabled: enabled,
      updatedAt: now,
    });

    return { success: true, configuredDomains };
  },
);
