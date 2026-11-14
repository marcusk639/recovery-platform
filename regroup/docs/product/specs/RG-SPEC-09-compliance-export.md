# RG-SPEC-09 — Compliance / Drug-Court Report Export

**Status:** shipped — CSV + **PDF** export (drug tests + meeting attendance + profile) — issues [#31](https://github.com/marcusk639/recovery-platform/issues/31), [#33](https://github.com/marcusk639/recovery-platform/issues/33). Deferred: phase-change history, infractions (not in data model).
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

## Current state (shipped; the Phase 5 stub is gone)

- Callable `complianceExport`: `functions/src/callable/compliance.ts`.
- **Input:** `houseId`, optional `residentId` (omitted = every resident of the
  house), optional `startDate` / `endDate` (`YYYY-MM-DD`), optional `format`
  (`csv` | `pdf`, default `csv`).
- **Auth: the house owner only** (`house.superAdminId === caller`); anyone else,
  staff included, gets `permission-denied`.
- **Tier gate:** `tierAllows(houseType, tier, "complianceExport")` on the owner's
  subscription. It checks the plan's capability, deliberately not house
  entitlement, so a lapsed operator keeps export access.
  - tier lacks the capability → `{ status: "upgrade_required", requiredTier }`
  - tier includes it → the real export: per resident, the profile plus
    window-filtered drug tests and meeting attendance (with dispute status and
    dispute history). CSV returns `{ available: true, format: "csv", filename,
csv, counts }`; PDF returns `pdfBase64` in place of `csv`.
- Read-only: nothing is written. The log line records ids, format and counts,
  never record contents.
- Tests: `functions/src/__tests__/callable/compliance.test.ts`.

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
   - Auth: as built, the house owner only (`superAdminId`); "authorized staff"
     access was not built.
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
