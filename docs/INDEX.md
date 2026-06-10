# Recovery Platform — Documentation Index

> Last reorganized: 2026-06-01 | Health check: never | Status: ✓ current

This index is optimized for AI agents. Find the section matching your task and
follow links in priority order.

---

## I'm planning go-to-market (launch, monetization, roadmap)

| What you need to know                                           | Read                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------- |
| Go-to-market entry point (SSOT for launch/monetization/roadmap) | [docs/go-to-market/README.md](go-to-market/README.md) |

---

## I'm implementing a feature or fixing a bug

| What you need to know             | Read                                                                                                                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which product this touches        | [docs/ecosystem/product-map.md](ecosystem/product-map.md)                                                                                                                              |
| Product requirements & priorities | [homegroups](../homegroups/docs/product/requirements.md) · [regroup](../regroup/docs/product/requirements.md) · [detox-recovery](../detox-recovery/docs/product/requirements.md)       |
| Current roadmap                   | [homegroups](../homegroups/docs/product/roadmap.md) · [regroup](../regroup/docs/product/roadmap.md) · [detox-recovery](../detox-recovery/docs/product/roadmap.md)                      |
| Technical architecture            | [homegroups](../homegroups/docs/technical/architecture.md) · [regroup](../regroup/docs/technical/architecture.md) · [detox-recovery](../detox-recovery/docs/technical/architecture.md) |
| Dev setup & conventions           | [homegroups](../homegroups/docs/technical/development.md) · [regroup](../regroup/docs/technical/development.md) · [detox-recovery](../detox-recovery/docs/technical/development.md)    |
| Active implementation plans       | [homegroups](../homegroups/docs/plans/) · [regroup](../regroup/docs/plans/) · [detox-recovery](../detox-recovery/docs/plans/)                                                          |
| Key past decisions                | [homegroups](../homegroups/docs/product/decisions.md) · [regroup](../regroup/docs/product/decisions.md) · [detox-recovery](../detox-recovery/docs/product/decisions.md)                |

---

## I'm working on monetization or pricing

| What you need to know           | Read                                                                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Cross-platform revenue strategy | [docs/strategy/monetization.md](strategy/monetization.md)                                                                           |
| Market opportunity & TAM        | [docs/strategy/market-opportunity.md](strategy/market-opportunity.md)                                                               |
| homegroups billing & pricing    | [homegroups/docs/monetization/model.md](../homegroups/docs/monetization/model.md)                                                   |
| regroup pricing model           | [regroup/docs/monetization/model.md](../regroup/docs/monetization/model.md)                                                         |
| detox-recovery monetization     | [detox-recovery/docs/monetization/model.md](../detox-recovery/docs/monetization/model.md)                                           |
| Financial projections           | [homegroups](../homegroups/docs/monetization/projections.md) · [detox-recovery](../detox-recovery/docs/monetization/projections.md) |

---

## I'm planning the roadmap or next priorities

| What you need to know     | Read                                                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ecosystem-level roadmap   | [docs/strategy/roadmap.md](strategy/roadmap.md)                                                                                                                         |
| homegroups roadmap        | [homegroups/docs/product/roadmap.md](../homegroups/docs/product/roadmap.md)                                                                                             |
| regroup (Regroup) roadmap | [regroup/docs/product/roadmap.md](../regroup/docs/product/roadmap.md)                                                                                                   |
| detox-recovery roadmap    | [detox-recovery/docs/product/roadmap.md](../detox-recovery/docs/product/roadmap.md)                                                                                     |
| Key product decisions     | [homegroups](../homegroups/docs/product/decisions.md) · [regroup](../regroup/docs/product/decisions.md) · [detox-recovery](../detox-recovery/docs/product/decisions.md) |

---

## I need to understand the ecosystem / cross-product context

| What you need to know                         | Read                                                      |
| --------------------------------------------- | --------------------------------------------------------- |
| Platform vision & mission                     | [docs/ecosystem/vision.md](ecosystem/vision.md)           |
| All products, who they serve, connections     | [docs/ecosystem/product-map.md](ecosystem/product-map.md) |
| Cross-product integration (referrals, API)    | [docs/ecosystem/integration.md](ecosystem/integration.md) |
| Shared vocabulary (meeting, member, guest...) | [docs/ecosystem/vocabulary.md](ecosystem/vocabulary.md)   |

---

## I'm deploying or running a manual operation

| What you need to know     | Read                                                                                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| homegroups deployment     | [homegroups/docs/operations/deployment.md](../homegroups/docs/operations/deployment.md)                                                                                             |
| regroup deployment        | [regroup/docs/operations/deployment.md](../regroup/docs/operations/deployment.md)                                                                                                   |
| detox-recovery deployment | [detox-recovery/docs/operations/deployment.md](../detox-recovery/docs/operations/deployment.md)                                                                                     |
| Manual task checklists    | [homegroups](../homegroups/docs/operations/manual-tasks/) · [regroup](../regroup/docs/operations/manual-tasks/) · [detox-recovery](../detox-recovery/docs/operations/manual-tasks/) |

---

## Product Quick Links

| Product                            | Docs root                                                         | Serves                                      |
| ---------------------------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| Homegroups (homegroups)            | [homegroups/docs/README.md](../homegroups/docs/README.md)         | 12-step group admins and members            |
| Regroup                            | [regroup/docs/README.md](../regroup/docs/README.md)               | Sober living house operators and residents  |
| NextStep Recovery (detox-recovery) | [detox-recovery/docs/README.md](../detox-recovery/docs/README.md) | Individuals/families seeking detox guidance |
| recovery-api                       | [recovery-api/docs/README.md](../recovery-api/docs/README.md)     | Cross-app integration layer                 |

---

## Health Check Status

_Updated by `/doc-organizer-recovery --check`_

| Check                 | Status  | Details                                      |
| --------------------- | ------- | -------------------------------------------- |
| Unclassified docs     | ✓ 0     | —                                            |
| Stale plans (90d+)    | ⚠ 60    | Run /doc-organizer-recovery --check for list |
| Missing required docs | ⚠ 0     | Stubs created 2026-06-01                     |
| CLAUDE.md ref drift   | pending | Run /doc-organizer-recovery --check          |
