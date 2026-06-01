# Category Classification Rules

Used by Phase 2 agents to assign `inferredCategory` and `proposedCategory`.

## Category Definitions

| Category       | Contains                                                               | Examples                                                                            |
| -------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `product`      | PRDs, feature requirements, decisions, user stories                    | `requirements.md`, `decisions.md`, `PRODUCT_REQUIREMENTS.md`                        |
| `technical`    | Architecture, data models, dev setup, API docs, security, code reviews | `ARCHITECTURE.md`, `FIRESTORE_DATA_MODEL.md`, `development.md`, `SECURITY_AUDIT.md` |
| `monetization` | Pricing, billing, financial models, revenue analysis                   | `financial-model.md`, `BILLING_AND_PAYMENTS.md`, `PRICING_STRATEGY_OPTIONS.md`      |
| `roadmap`      | Future plans, sprint plans, prioritization, strategic assessments      | `ROADMAP.md`, `FEATURE_PRIORITY_ROADMAP.md`, `ECOSYSTEM_ROADMAP_2026.md`            |
| `operations`   | Deployment, manual tasks, checklists, launch blockers, app store       | `deployment.md`, `LAUNCH_BLOCKERS.md`, `manual-tasks/`, `PRE_LAUNCH_CHECKLIST.md`   |
| `plans`        | Implementation plans and specs (superpowers and other)                 | `superpowers/plans/`, `superpowers/specs/`                                          |
| `archive`      | Already in an `_archive/` directory                                    | Anything under `*/_archive/*` or `*/archive/*`                                      |
| `unknown`      | Cannot be confidently classified                                       | Flag for human review                                                               |

## Scope: ecosystem vs product-specific

**Flag `scope: ecosystem`** when ANY of these are true:

- Filename or path contains: `ecosystem`, `recovery-platform`, `recovery-ecosystem`
- Content references 2+ product names in the same analysis
- Doc describes cross-product integration, shared vocabulary, or platform-wide market/strategy
- Doc is a business case or market opportunity covering the whole platform

**Flag `scope: product-specific`** when:

- Doc references only one product's features, code, or data model
- Doc is a product-specific financial projection or roadmap

## Staleness Signal Rules

| Signal                       | Condition                                                                 |
| ---------------------------- | ------------------------------------------------------------------------- |
| `dated-plan-90d+`            | Filename begins with `YYYY-MM-DD-` and that date is >90 days before today |
| `superseded-by:path`         | A newer doc in same category covers identical topic (agent judgment call) |
| `references-deleted-feature` | Skip on first pass — requires codebase knowledge                          |

## Filename → Category Heuristics

| Filename pattern                                                                        | Category                                       |
| --------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `*ARCHITECTURE*`, `*architecture*`, `*FIRESTORE*`, `*DATA_MODEL*`                       | `technical`                                    |
| `*ROADMAP*`, `*roadmap*`, `*STRATEGIC*`, `*FEATURE_PRIORITY*`                           | `roadmap`                                      |
| `*PRICING*`, `*financial*`, `*monetization*`, `*BILLING*`, `*REVENUE*`, `*projections*` | `monetization`                                 |
| `*REQUIREMENTS*`, `*requirements*`, `*PRODUCT_*`, `*features*`, `*decisions*`           | `product`                                      |
| `*deployment*`, `*LAUNCH_BLOCKERS*`, `*CHECKLIST*`, `manual-tasks/*`, `*app-store*`     | `operations`                                   |
| `*SECURITY*`, `*security*`, `*deep-linking*`, `*api*`                                   | `technical`                                    |
| `superpowers/plans/*`, `superpowers/specs/*`                                            | `plans`                                        |
| `archive/*`, `_archive/*`                                                               | `archive`                                      |
| `e2e/*`, `*E2E*`                                                                        | `technical`                                    |
| `type-fixes/*`                                                                          | `archive` (batch summaries, historical record) |

## Required Files Per Product

Each product MUST have these files after reorganization (stub is acceptable):

```
{product}/docs/README.md                         # product overview + navigation
{product}/docs/product/requirements.md           # PRD / feature requirements
{product}/docs/product/roadmap.md                # product-specific roadmap
{product}/docs/technical/architecture.md         # system design, data model
{product}/docs/technical/development.md          # dev setup, local run, conventions
{product}/docs/_archive/README.md                # archive index with dates/reasons
```

Optional (create stub only if relevant content exists):

```
{product}/docs/monetization/model.md             # pricing, tiers, billing logic
{product}/docs/monetization/projections.md       # financial models and projections
{product}/docs/operations/deployment.md          # deploy process, environments
{product}/docs/technical/api.md                  # API surface documentation
{product}/docs/product/decisions.md              # key decisions and rationale
```

## Stub File Format

When creating a required file with no source content, use:

```markdown
# [Title]

> **Stub** — This file is a placeholder. Content needs to be written.
> Created by doc-organizer-recovery on YYYY-MM-DD.

## TODO

- [ ] Document [specific content needed here]
```
