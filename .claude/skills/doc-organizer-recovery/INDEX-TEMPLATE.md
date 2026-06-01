# INDEX-TEMPLATE.md

Template used by `/doc-organizer-recovery` to generate `docs/INDEX.md`.

Placeholders resolved at generation time:

- `{DATE}` → today's date (YYYY-MM-DD)
- `{HEALTH_DATE}` → date of last --check run (or "never")
- `{STATUS}` → "✓ current" or "⚠ stale — run /doc-organizer-recovery --check"
- `{HC_*}` → health check counts from last --check run

---

```markdown
# Recovery Platform — Documentation Index

> Last reorganized: {DATE} | Health check: {HEALTH_DATE} | Status: {STATUS}

This index is optimized for AI agents. Find the section matching your task and
follow links in priority order.

---

## I'm implementing a feature or fixing a bug

Start here for any feature work or bug fix.

| What you need to know             | Read                                                                                                                                                                                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which product this touches        | [docs/ecosystem/product-map.md](ecosystem/product-map.md)                                                                                                                                                                                                                           |
| Product requirements & priorities | [homegroups/docs/product/requirements.md](../homegroups/docs/product/requirements.md) · [regroup/docs/product/requirements.md](../regroup/docs/product/requirements.md) · [detox-recovery/docs/product/requirements.md](../detox-recovery/docs/product/requirements.md)             |
| Current roadmap                   | [homegroups/docs/product/roadmap.md](../homegroups/docs/product/roadmap.md) · [regroup/docs/product/roadmap.md](../regroup/docs/product/roadmap.md) · [detox-recovery/docs/product/roadmap.md](../detox-recovery/docs/product/roadmap.md)                                           |
| Technical architecture            | [homegroups/docs/technical/architecture.md](../homegroups/docs/technical/architecture.md) · [regroup/docs/technical/architecture.md](../regroup/docs/technical/architecture.md) · [detox-recovery/docs/technical/architecture.md](../detox-recovery/docs/technical/architecture.md) |
| Dev setup & conventions           | [homegroups/docs/technical/development.md](../homegroups/docs/technical/development.md) · [regroup/docs/technical/development.md](../regroup/docs/technical/development.md) · [detox-recovery/docs/technical/development.md](../detox-recovery/docs/technical/development.md)       |
| Active implementation plans       | [homegroups/docs/plans/](../homegroups/docs/plans/) · [regroup/docs/plans/](../regroup/docs/plans/) · [detox-recovery/docs/plans/](../detox-recovery/docs/plans/)                                                                                                                   |
| Key past decisions                | [homegroups/docs/product/decisions.md](../homegroups/docs/product/decisions.md) · [regroup/docs/product/decisions.md](../regroup/docs/product/decisions.md)                                                                                                                         |

---

## I'm working on monetization or pricing

| What you need to know           | Read                                                                                                                                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-platform revenue strategy | [docs/strategy/monetization.md](strategy/monetization.md)                                                                                                                                             |
| Market opportunity & TAM        | [docs/strategy/market-opportunity.md](strategy/market-opportunity.md)                                                                                                                                 |
| homegroups billing & pricing    | [homegroups/docs/monetization/model.md](../homegroups/docs/monetization/model.md)                                                                                                                     |
| regroup pricing model           | [regroup/docs/monetization/model.md](../regroup/docs/monetization/model.md)                                                                                                                           |
| detox-recovery monetization     | [detox-recovery/docs/monetization/model.md](../detox-recovery/docs/monetization/model.md)                                                                                                             |
| Financial projections           | [homegroups/docs/monetization/projections.md](../homegroups/docs/monetization/projections.md) · [detox-recovery/docs/monetization/projections.md](../detox-recovery/docs/monetization/projections.md) |

---

## I'm planning the roadmap or next priorities

| What you need to know   | Read                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ecosystem-level roadmap | [docs/strategy/roadmap.md](strategy/roadmap.md)                                                                                                             |
| homegroups roadmap      | [homegroups/docs/product/roadmap.md](../homegroups/docs/product/roadmap.md)                                                                                 |
| regroup (RATS) roadmap  | [regroup/docs/product/roadmap.md](../regroup/docs/product/roadmap.md)                                                                                       |
| detox-recovery roadmap  | [detox-recovery/docs/product/roadmap.md](../detox-recovery/docs/product/roadmap.md)                                                                         |
| Key product decisions   | [homegroups/docs/product/decisions.md](../homegroups/docs/product/decisions.md) · [regroup/docs/product/decisions.md](../regroup/docs/product/decisions.md) |

---

## I need to understand the ecosystem / cross-product context

| What you need to know                       | Read                                                      |
| ------------------------------------------- | --------------------------------------------------------- |
| Platform vision & mission                   | [docs/ecosystem/vision.md](ecosystem/vision.md)           |
| All products, who they serve, connections   | [docs/ecosystem/product-map.md](ecosystem/product-map.md) |
| Cross-product integration (referrals, API)  | [docs/ecosystem/integration.md](ecosystem/integration.md) |
| Shared vocabulary (meeting, member, guest…) | [docs/ecosystem/vocabulary.md](ecosystem/vocabulary.md)   |

---

## I'm deploying or running a manual operation

| What you need to know     | Read                                                                                                                                                                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| homegroups deployment     | [homegroups/docs/operations/deployment.md](../homegroups/docs/operations/deployment.md)                                                                                                                                                                                       |
| regroup deployment        | [regroup/docs/operations/deployment.md](../regroup/docs/operations/deployment.md)                                                                                                                                                                                             |
| detox-recovery deployment | [detox-recovery/docs/operations/deployment.md](../detox-recovery/docs/operations/deployment.md)                                                                                                                                                                               |
| Manual task checklists    | [homegroups/docs/operations/manual-tasks/](../homegroups/docs/operations/manual-tasks/) · [regroup/docs/operations/manual-tasks/](../regroup/docs/operations/manual-tasks/) · [detox-recovery/docs/operations/manual-tasks/](../detox-recovery/docs/operations/manual-tasks/) |

---

## Product Quick Links

| Product                            | Docs root                                                         | Serves                                      |
| ---------------------------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| RecoveryConnect (homegroups)       | [homegroups/docs/README.md](../homegroups/docs/README.md)         | 12-step group admins and members            |
| RATS / Regroup                     | [regroup/docs/README.md](../regroup/docs/README.md)               | Sober living house operators and residents  |
| NextStep Recovery (detox-recovery) | [detox-recovery/docs/README.md](../detox-recovery/docs/README.md) | Individuals/families seeking detox guidance |
| recovery-api                       | [recovery-api/docs/README.md](../recovery-api/docs/README.md)     | Cross-app integration layer                 |

---

## Health Check Status

_Updated by `/doc-organizer-recovery --check`_

| Check                 | Status            | Details                  |
| --------------------- | ----------------- | ------------------------ |
| Unclassified docs     | {HC_UNCLASSIFIED} | {HC_UNCLASSIFIED_DETAIL} |
| Stale plans (90d+)    | {HC_STALE}        | {HC_STALE_DETAIL}        |
| Missing required docs | {HC_MISSING}      | {HC_MISSING_DETAIL}      |
| CLAUDE.md ref drift   | {HC_DRIFT}        | {HC_DRIFT_DETAIL}        |
```
