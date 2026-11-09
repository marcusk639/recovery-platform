# Regroup Operator Portal: Roadmap of Plans

> **For agentic workers:** this file sequences the sub-plans and is not executed itself. Execute one sub-plan at a time with superpowers:subagent-driven-development or superpowers:executing-plans. Each sub-plan has its own header and tasks.

**Goal:** A web portal where operators and admins do their core desk work across all their houses, reusing the phone app's screens and data code.

**Why a roadmap:** P1 is a go/no-go check whose result decides how the rest is built, so later plans can't be written accurately yet. The launch roadmap uses the same approach: each plan is written just before its phase, against the code as it is then.

**Spec:** `docs/superpowers/specs/2026-11-08-regroup-operator-portal-design.md`

## Sub-plans

| #   | Plan                                                                                                           | Spec         | Status                                  |
| --- | -------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------------- |
| P1  | Foundation and go/no-go on React Native 0.88: `2026-11-08-regroup-portal-p1-foundation.md`                     | §4, §7, §8.1 | Written                                 |
| P2  | Sign-in, permissions, subscription gate, idle sign-out, desktop shell: `2026-11-09-regroup-portal-p2-shell.md` | §6, §7, §8.2 | Written; P1 go given 2026-11-09         |
| P3  | All houses, one house, resident list and record: `2026-11-09-regroup-portal-p3-houses-residents.md`            | §5, §8.3     | Done                              |
| P4  | Resident actions, applications with intake, staff notes, activities                                            | §5, §8.4     | Next                                    |
| P5  | Payments, with the independent money review                                                                    | §7, §8.5     | After P4                                |
| P6  | Disputes, against the rules tests                                                                              | §7, §8.6     | After P5                                |
| P7  | Production release of the core, after launch day                                                               | §6, §8.9     | When P6 is done and launch has finished |
| P8  | Beds, drug tests, documents, issues, complaints, reports                                                       | §5, §8.7     | Before or after P7                      |
| P9  | Desktop polish on the reused screens that need it most                                                         | §8.8         | Before or after P7                      |

P7 sits before P8 and P9 so the owner's "ship the core first if running late" decision needs no replanning. If the work is on time, run P8 and P9 first and release everything together.

## Gates

- **P1 → P2:** the owner reads the go/no-go report and says go.
- **Any production deploy:** launch has finished (launch roadmap P10), and the owner says yes.
- **Launch work wins.** Pause this roadmap whenever launch needs the owner's attention.

## Writing the next sub-plan

- Re-verify every file and line the spec cites. They will have moved.
- Carry forward P1's replacement list and any findings from its report.
- Keep each plan's Global Constraints identical to P1's, plus anything P1 added.
- **P2 must remove the harness,** including `window.__portalTest`, and make `check-bundle` refuse it in any non-emulator build. P1's `firebase-setup` has no production config, and P7 adds one.
- **P5 starts from P1's answer on manual payments and the dashboard,** which may need a server or phone decision first.
- P4 moves discharge and phase advancement from GuestHome to the record's header, adds Staff notes once #196 lets them load, maps Documents and StaffNotes to URLs if their params allow it, and revisits losing a form on a tab click. P5 decides what a direct /payments URL does for a peer leader, and checks a real invited manager against listHousePayments, whose assertHouseAdmin reads the house doc's adminIds rather than house-roles, so it may refuse them.
- P9: the reused ComplianceBreakdown on the resident record keeps phone-sized type.
