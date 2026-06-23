# RG-SPEC-09 — Compliance / Drug-Court Report Export

**Status:** Tracking spec (stub shipped; full feature not built)
**Tier:** Professional / Plus and higher (value-ladder capability `complianceExport`)
**Source rationale:** [regroup-pricing-justification.md §6c](../../launch-readiness/regroup-pricing-justification.md) · [regroup-pricing-revision-plan.md Phase 5](../../launch-readiness/regroup-pricing-revision-plan.md)

---

## Problem

Court-referred residents and drug-court programs require periodic compliance
artifacts (attendance, drug-test results, infractions, phase progress) in a form
a referral source or court will accept. Operators today assemble these by hand
from data Regroup already captures. Owning this export is the One Step
differentiator and the strongest justification for Professional+ pricing — it
also opens the court-referral acquisition channel.

## Current state (Phase 5 stub)

- Callable `complianceExport` exists: `functions/src/callable/compliance.ts`.
- It enforces auth (house owner only) and the tier gate
  (`tierAllows(houseType, tier, "complianceExport")`), then returns a structured
  stub response — **no data is exported and nothing is written**:
  - tier lacks the capability → `{ status: "upgrade_required", requiredTier }`
  - tier includes the capability → `{ status: "coming_soon" }`
- Tests: `functions/src/__tests__/callable/compliance.test.ts`.

The gate scaffolding stays when the real export lands; only the terminal stub
branch is replaced.

## Data sources (already captured)

- **Meeting / curfew attendance** — resident attendance + house check-in logs.
- **Drug/alcohol tests (UA/BA)** — structured test results tied to each resident
  (see requirements.md "UA/BA and incident logging").
- **Infractions / incidents** — structured incident records.
- **Phase / privilege progression** — level changes over time.
- **Admit/discharge + legal status** — resident profile fields.

## Proposed export (to be designed)

1. **Inputs:** `houseId`, `residentId` (or all residents), `startDate`/`endDate`,
   `format` (`pdf` | `csv`).
2. **Output:** a court-acceptable artifact (PDF for filing, CSV for systems) of
   the resident's compliance record over the window.
3. **Constraints:**
   - PII / PHI handling — this is health-adjacent data; never log record contents
     (platform PII rule). Generate server-side; deliver via a short-lived signed
     URL or direct response, not a persisted public object.
   - Auth: house owner / authorized staff only (already enforced in the stub).
   - Audit: log who exported what (house + resident ids + window), not contents.

## Acceptance criteria (full build — out of scope for the pricing plan)

- [ ] Entitled operator can export a resident's compliance record as PDF + CSV.
- [ ] Export contains attendance, UA/BA results, infractions, and phase history
      for the requested window.
- [ ] Non-entitled tiers still receive the `upgrade_required` response.
- [ ] No record contents logged; export delivery is access-controlled.
- [ ] Export action is audit-logged.

## Open questions

- Exact court-acceptable layout — confirm with a drug-court contact / One Step
  comparison.
- Per-resident vs per-house batch export for a reporting period.
- Retention: do we persist generated artifacts, or generate on demand only?
