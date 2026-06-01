# Phase Guide

Detailed agent prompts and merge instructions for Phase 2.

## Shared Agent Preamble

Each Phase 2 agent receives this context before its domain-specific prompt:

> You are a documentation classifier for the recovery-platform monorepo. Read the
> docs assigned to you and classify each one. Your output updates a JSON manifest.
> Be precise and conservative: if a doc's category is unclear, mark it `unknown`.
>
> Do NOT move or modify any files. Output classification JSON only.
>
> Definitions: `.claude/skills/doc-organizer-recovery/CATEGORIES.md`
> Target structure: `docs/superpowers/specs/2026-06-01-doc-organizer-recovery-design.md`

Output format per doc:

```json
{
  "path": "relative/path/from/monorepo/root.md",
  "proposedCategory": "technical",
  "proposedPath": "homegroups/docs/technical/architecture.md",
  "archiveReason": null
}
```

---

## Ecosystem Agent Prompt

Read each doc flagged `scope: ecosystem` in the manifest.

For each doc:

1. Determine: `docs/ecosystem/` (platform definition, vocabulary, integration) or
   `docs/strategy/` (monetization, market analysis, roadmap)
2. Map to the most specific target filename from the spec
3. Flag archive candidates: docs that duplicate a newer doc in the same slot

Ecosystem subdirectory assignments:

- `ecosystem/vision.md` — platform mission, why recovery platform exists
- `ecosystem/product-map.md` — all products, who they serve, how they connect
- `ecosystem/integration.md` — recovery-api integration bus, referral model
- `ecosystem/vocabulary.md` — shared domain terms (meeting, member, guest, etc.)
- `strategy/monetization.md` — cross-platform revenue model
- `strategy/market-opportunity.md` — market analysis, TAM, competitive landscape
- `strategy/roadmap.md` — ecosystem-level roadmap and phasing

---

## homegroups Agent Prompt

Read all non-archived docs in `homegroups/docs/` (skip `homegroups/docs/archive/`).

Special rules:

- `01-rats-sober-living.md`, `02-recoveryconnect-homegroups.md`,
  `03-integration-treatment-centers.md` → flag as `scope: ecosystem`
- `LAUNCH_BLOCKERS.md`, `PRE_LAUNCH_CHECKLIST.md` → `operations`
- `QUICK-REFERENCE.md` → keep as `docs/README.md` (product overview nav)
- `SECURITY_AUDIT.md`, `SECURITY_RULES.md`, `SECURITY_RULES_QUICKREF.md` → `technical`
- `BUSINESS_MODEL.md`, `BILLING_AND_PAYMENTS.md`, `REVENUE_OPPORTUNITIES.md` → `monetization`
- `MARKET_INTELLIGENCE.md` → `monetization` or flag ecosystem if cross-product scope
- `ROADMAP.md`, `AUDIT_WAVE_FOLLOWUPS.md` → `roadmap`
- `ARCHITECTURE.md`, `MESSAGING_ENGINEERING.md`, `DEVELOPMENT.md` → `technical`
- `PRODUCT_REQUIREMENTS.md` → `product`
- `deep-linking.md`, `push-notifications-treasury-features.md` → `technical`
- `financial-projections-2026-04-15.md` → `monetization`

Gap detection: note any required files missing per CATEGORIES.md required list.

---

## regroup Agent Prompt

Read all non-archived docs across:

- `regroup/mobile/docs/` (skip `regroup/mobile/docs/archive/`)
- `regroup/functions/docs/`
- `regroup/web/docs/`

Target: `regroup/docs/` unified namespace. Sub-package subfolders where needed:

- `technical/mobile/`, `technical/functions/`, `technical/web/`
- `product/`, `monetization/`, `operations/`, `plans/` are shared (no sub-package dir)

Key mappings:

- `ARCHITECTURE.md` → `technical/architecture.md`
- `FIRESTORE_DATA_MODEL.md` → `technical/mobile/firestore-data-model.md`
- `PRICING_STRATEGY_OPTIONS.md`, `PRICING_STRATEGY_OPTIONS-summary.md` → `monetization/model.md` (consolidate; archive older)
- `ECOSYSTEM_ROADMAP_2026.md` → flag `scope: ecosystem`
- `STRATEGIC_PLATFORM_ASSESSMENT_2026.md` → `product/decisions.md`
- `CORE_REQUIREMENTS.md`, `FULL_PLATFORM_REQUIREMENTS.md` → `product/requirements.md` (consolidate)
- `FEATURE_PRIORITY_ROADMAP.md`, `FULL_PLATFORM_REQUIREMENTS-summary.md` → `product/roadmap.md`
- `e2e/` subdir → `technical/mobile/e2e/` (keep subdir intact)
- `type-fixes/` subdir → `_archive/type-fixes/` (batch summaries, historical)
- `patterns/` → `technical/mobile/patterns/`
- `ux-improvements/` → `technical/mobile/ux-improvements/`
- `manual-tasks/` → `operations/manual-tasks/`
- `regroup/web/docs/iterative-review-2026-05-26.md` → `technical/web/iterative-review-2026-05-26.md`
- `regroup/functions/docs/plans/` → `plans/` (keep)

---

## detox-recovery Agent Prompt

Read all non-archived docs in `detox-recovery/docs/`.

Key mappings:

- `business-case-2026-05-24.md`, `market-opportunity-analysis-2026-05-24.md` →
  flag `scope: ecosystem`
- `financial-model-master-2026-05-24.md` → `monetization/projections.md` (most current)
- `financial-model.md`, `financial-projections-2026-05-24.md` →
  archive (older versions superseded by master)
- `monetization.md` → `monetization/model.md`
- `roadmap-2026-05-24.md` → `product/roadmap.md`
- `features.md` → `product/requirements.md`
- `architecture.md` → `technical/architecture.md`
- `api.md` → `technical/api.md`
- `deployment.md` → `operations/deployment.md`
- `environment.md` → `technical/development.md`
- `pdf-delivery.md` → `technical/pdf-delivery.md`
- `delivery-gaps.md` → `product/decisions.md`
- `discovery-strategy.md` → check content: if cross-platform → ecosystem, else `product/`
- `lead-magnets/` → `operations/lead-magnets/` (keep subdir intact)
- `products/` → `product/products/` (keep subdir intact)
- `manual-tasks/` → `operations/manual-tasks/` (keep subdir intact)

---

## recovery-api Agent Prompt

Read all docs in `recovery-api/docs/`. Minimal product.

- `docs/superpowers/specs/2026-05-31-recovery-platform-cloud-functions-design.md` →
  keep in `plans/superpowers/specs/` (already correctly placed)

Note any gaps in required files (architecture.md, development.md, etc.).

---

## Monetization Agent Prompt

First, invoke `recovery-app-go-to-market` skill with context:

> "Analyze monetization documentation across the recovery-platform monorepo.
> Docs to review: [list all paths with inferredCategory: monetization from manifest].
> Recommend: (1) which docs should consolidate to root docs/strategy/monetization.md,
> (2) which are product-specific and belong in {product}/docs/monetization/,
> (3) gaps in monetization documentation across products."

Use skill output to populate `proposedPath` and `archiveReason` for each monetization doc.

---

## Merge Step

After all agents complete:

1. Collect all per-doc JSON outputs into single array
2. Detect conflicts: same doc proposed to different paths by different agents →
   flag as `conflict` (human decision required)
3. Build proposal document at `docs/superpowers/specs/YYYY-MM-DD-doc-reorganization-proposal.md`:

```markdown
# Doc Reorganization Proposal — YYYY-MM-DD

## Move Table

| Current Path | Proposed Path | Category | Reason |
| ------------ | ------------- | -------- | ------ |
| ...          | ...           | ...      | ...    |

## Archive List

| Path | Archive Reason |
| ---- | -------------- |
| ...  | ...            |

## Stub Files to Create

Files required by target structure that have no source content yet:

- `recovery-api/docs/product/requirements.md` (stub)
- ...

## INDEX.md Draft

[full INDEX.md content from INDEX-TEMPLATE.md with real paths]

## Conflicts Requiring Human Decision

| Doc | Option A | Option B | Notes |
| --- | -------- | -------- | ----- |
| ... | ...      | ...      | ...   |
```
