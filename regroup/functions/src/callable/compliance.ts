import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { z } from "zod";
import { HouseType, TierKey } from "../config";
import { getHouse, getUser } from "../api/firestore";
import { tierAllows } from "../util/tierPricing";
import { parseInput } from "../validation";

const complianceExportSchema = z.object({
  houseId: z.string().min(1),
});

// Lowest sellable tier whose `features.complianceExport` is true, per house type
// (justification §6b value ladder). Used only to phrase the upgrade prompt — the
// authoritative gate is `tierAllows(..., "complianceExport")`.
const COMPLIANCE_EXPORT_MIN_TIER: Record<HouseType, string> = {
  traditional: "Professional",
  oxford: "Plus",
};

// ─────────────────────────────────────────────────────────────────────────────
// complianceExport (Phase 5 stub — RG-SPEC-09)
//
// Court/drug-court compliance export is the Professional+ differentiator. The
// full export (turning captured activity + drug-test data into a court-ready
// artifact) is specified in RG-SPEC-09
// (docs/product/specs/RG-SPEC-09-compliance-export.md) and not built yet. This callable stands
// up the tier gate now so the value ladder is real and the client can render the
// correct messaging:
//   • caller's tier lacks the capability → "upgrade_required" (which tier unlocks it)
//   • caller's tier includes it          → "coming_soon" (entitled; feature pending)
//
// It performs no data export and writes nothing. Replace the stub branch with the
// real export when RG-SPEC-09 lands; the auth + gate scaffolding stays.
// ─────────────────────────────────────────────────────────────────────────────
export const complianceExport = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required");

  const { houseId } = parseInput(
    complianceExportSchema,
    request.data,
  ) as z.infer<typeof complianceExportSchema>;

  const house = await getHouse(houseId);
  if (!house) throw new HttpsError("not-found", "House not found");

  if (house.superAdminId !== request.auth.uid) {
    throw new HttpsError(
      "permission-denied",
      "Only the house owner can export compliance data",
    );
  }

  const operator = await getUser(house.superAdminId);
  const sub = operator?.subscriptionMetadata;
  const tier = sub?.tier as TierKey | undefined;
  const houseType = (sub?.houseType ?? house.houseType) as HouseType;

  let entitled = false;
  if (tier) {
    try {
      entitled = tierAllows(houseType, tier, "complianceExport");
    } catch {
      // Unknown tier/houseType combo ⇒ treat as not entitled.
      entitled = false;
    }
  }

  if (!entitled) {
    const requiredTier =
      COMPLIANCE_EXPORT_MIN_TIER[houseType] ??
      COMPLIANCE_EXPORT_MIN_TIER.traditional;
    logger.info("complianceExport: upgrade required", {
      houseId,
      status: "upgrade_required",
    });
    return {
      available: false,
      status: "upgrade_required" as const,
      feature: "complianceExport",
      requiredTier,
      spec: "RG-SPEC-09",
      message: `Compliance export is available on the ${requiredTier} plan and higher. Upgrade to enable court-ready exports.`,
    };
  }

  logger.info("complianceExport: coming soon", {
    houseId,
    status: "coming_soon",
  });
  return {
    available: false,
    status: "coming_soon" as const,
    feature: "complianceExport",
    spec: "RG-SPEC-09",
    message:
      "Compliance export (RG-SPEC-09) is included in your plan and coming soon.",
  };
});
