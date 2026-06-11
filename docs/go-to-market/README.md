---
title: Go-To-Market — Entry Point
scope: ecosystem
category: project-management
status: in_progress
last_verified: 2026-06-10
sources:
  - docs/superpowers/plans/2026-06-10-docs-consolidation-gtm.md
supersedes: []
---

# Recovery Platform — Go-To-Market

This tree is the **single source of truth (SSOT)** for the platform's
go-to-market doc set: **project-management**, **monetization**, and **roadmap**
for each of **regroup**, **homegroups**, **detox-recovery**, plus one combined
**ecosystem** view (with a platform **vision**). Per-product business docs under
`{product}/docs/**` are **sources** that are consolidated here once; after
Phase 6 they become one-line pointer stubs or are archived, so there is exactly
one home for each fact and zero redundancy.

These docs exist so an AI agent can drive automation and code-gen from them
reliably. Read this README first to self-orient, then follow the reading order
below.

---

## Reading order

1. **This README** — conventions, SSOT map, status vocabulary.
2. **[`_shared/pricing.md`](_shared/pricing.md)** — the one canonical price
   table. Every monetization number lives here; all other docs link to a row.
3. **[`ecosystem/vision.md`](ecosystem/vision.md)** — the platform thesis (why
   these three products form one recovery continuum).
4. **Per-product deliverables** — for the product you care about, read in this
   order: `monetization.md` → `roadmap.md` → `project-management.md`.
   - [regroup/](regroup/)
   - [homegroups/](homegroups/)
   - [detox-recovery/](detox-recovery/)
5. **[`ecosystem/monetization.md`](ecosystem/monetization.md)** and
   **[`ecosystem/roadmap.md`](ecosystem/roadmap.md)** — the cross-platform model
   and combined roadmap (these read per-product numbers from
   `_shared/pricing.md`; they never restate them).
6. **[`ecosystem/project-management.md`](ecosystem/project-management.md)** — the
   cross-product launch hub that sequences the three per-product launch plans.
7. **[`_shared/decisions-log.md`](_shared/decisions-log.md)** — every
   reconciliation decision (D-1, D-9, D-10, each resolved price).

---

## SSOT map (topic → owning file)

One topic, one owning file. If you need a fact, go to its owner — do not copy it
elsewhere.

| Topic                                                | Owning file                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| **All prices, SKUs, Stripe IDs, Connect fees**       | [`_shared/pricing.md`](_shared/pricing.md)                                     |
| Cross-app referral / SKU integration map             | [`_shared/integration.md`](_shared/integration.md) → ecosystem                 |
| Reconciliation decisions (D-1, D-9, D-10, prices)    | [`_shared/decisions-log.md`](_shared/decisions-log.md)                         |
| regroup monetization narrative & projections         | [`regroup/monetization.md`](regroup/monetization.md)                           |
| regroup roadmap                                      | [`regroup/roadmap.md`](regroup/roadmap.md)                                     |
| regroup launch-to-monetized plan                     | [`regroup/project-management.md`](regroup/project-management.md)               |
| homegroups monetization narrative & projections      | [`homegroups/monetization.md`](homegroups/monetization.md)                     |
| homegroups roadmap                                   | [`homegroups/roadmap.md`](homegroups/roadmap.md)                               |
| homegroups launch-to-monetized plan                  | [`homegroups/project-management.md`](homegroups/project-management.md)         |
| detox-recovery monetization narrative & projections  | [`detox-recovery/monetization.md`](detox-recovery/monetization.md)             |
| detox-recovery roadmap                               | [`detox-recovery/roadmap.md`](detox-recovery/roadmap.md)                       |
| detox-recovery launch-to-monetized plan              | [`detox-recovery/project-management.md`](detox-recovery/project-management.md) |
| Platform vision / thesis                             | [`ecosystem/vision.md`](ecosystem/vision.md)                                   |
| Cross-platform monetization & referral model         | [`ecosystem/monetization.md`](ecosystem/monetization.md)                       |
| Combined, market-feasible ecosystem roadmap          | [`ecosystem/roadmap.md`](ecosystem/roadmap.md)                                 |
| Cross-product launch hub (sequence + decision gates) | [`ecosystem/project-management.md`](ecosystem/project-management.md)           |

That is the **12 scope×category deliverables + 3 `_shared` files** this tree
owns.

---

## AI-optimization conventions

Apply to **every** deliverable in this tree. This is the core quality bar.

1. **YAML front-matter** on every file: `title`, `scope`, `category`, `status`,
   `last_verified` (date), `sources` (list of SSOT paths consumed), `supersedes`
   (paths now pointer-stubbed/archived).
2. **One fact, one home.** Numbers (prices, fees, projections) live only in
   [`_shared/pricing.md`](_shared/pricing.md); every other doc _links_ to the
   exact table row. No price string is written twice anywhere in the tree.
3. **Machine-readable tables over prose** for anything an agent acts on.
   Canonical column sets:
   - **Pricing:** `product | sku | price | billing_period | stripe_product_id | stripe_price_env_var | connect_fee | status | source`
   - **Roadmap:** `id | item | priority | status | code_anchor | depends_on | revenue_impact | source`
   - **Launch/PM:** `id | blocker | severity | owner | track | status | acceptance_check | source`
4. **Stable IDs** (`HG-P0-1`, `RG-MON-2`, `D-10`) so other docs and
   code/automation can reference a row unambiguously.
5. **Relative links only**, validated in Phase 7. Every quantitative claim ends
   with `(source: path#anchor)`.
6. **Status vocabulary** fixed to: `done | in_progress | blocked | planned | not_started`.
   No free-form status text.
7. **No PII**, no secret values; reference env-var _names_ only (platform
   privacy/secrets rules).
8. **`README.md` is the entry point**: reading order, an SSOT map (topic →
   owning file), and these conventions, so any agent can self-orient before
   generating code.

---

## The `project-management` category

For each scope, `project-management.md` is a **single actionable
launch-to-monetized plan** — the one place an agent or operator goes to know
what stands between "today" and "live + fully monetized". It captures:

- **Blockers** — what is preventing launch/monetization right now, each with a
  severity, an owner, and an acceptance check (how we know it is done).
- **Milestones** — the sequenced checkpoints from go-live to monetized (e.g.
  first paid transaction → pilot → B2B unlock).
- **Sequencing** — the order tracks must complete, including dependencies
  between blockers and across products (for ecosystem).
- **Owners** — who is accountable for each blocker/milestone.
- **Decision gates** — open decisions that must resolve before a track can
  proceed; each links to its row in
  [`_shared/decisions-log.md`](_shared/decisions-log.md).
- **Status** — using the fixed vocabulary above.

Use the **Launch/PM** column set from convention #3 for the blocker/milestone
tables.
