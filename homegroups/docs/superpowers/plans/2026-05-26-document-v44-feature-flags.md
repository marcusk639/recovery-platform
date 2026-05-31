# Document V4.4 Feature Flag Status (D-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit documentation to `docs/02-recoveryconnect-homegroups.md` and `docs/ROADMAP.md` clarifying that V4.1–V4.4 mobile features are implemented but hidden behind feature flags — preventing stakeholders from overestimating enterprise readiness when reading the feature list.

**Architecture:** Documentation-only task. No code changes. Two files updated with a callout section. The feature flags file itself (`mobile/src/config/featureFlags.ts`) already has good inline comments; this task only adds doc-level visibility.

**Tech Stack:** Markdown

---

## Context

`docs/02-recoveryconnect-homegroups.md` describes Homegroups as "feature-complete with a roadmap to V4.4" and lists V4.4 features (intergroup, white-label branding) as implemented. What it omits: every V4.1–V4.4 feature is hidden behind a feature flag in `mobile/src/config/featureFlags.ts` and is **not visible to end users**. The flags are:

```
SHOW_V4_GOVERNANCE_BYLAWS:          false
SHOW_V4_GOVERNANCE_ELECTIONS:       false
SHOW_V4_GOVERNANCE_GSR_REPORT:      false
SHOW_V4_CONTENT_DAILY_REFLECTION:   false
SHOW_V4_CONTENT_LITERATURE:         false
SHOW_V4_CONTENT_SOBRIETY_CALCULATOR: false
SHOW_V4_CONTENT_MEETING_TOPICS:     false
SHOW_V4_CONTENT_GROUP_RESOURCES:    false
SHOW_V4_ANALYTICS_GROUP_HEALTH:     false
SHOW_V4_ANALYTICS_TREASURY_TRENDS:  false
SHOW_V4_ANALYTICS_MY_RECOVERY_JOURNEY: false
SHOW_V4_ENTERPRISE_DATA_EXPORT:     false
SHOW_V4_ENTERPRISE_INTERGROUP:      false
```

`AppNavigator.tsx:153` also gates the entire `IntergroupNavigator` stack behind `SHOW_V4_ENTERPRISE_INTERGROUP`.

The callables and Firestore schema exist. The mobile UI does not reach users until flags are flipped.

---

## File Map

| File                                    | Action                                         |
| --------------------------------------- | ---------------------------------------------- |
| `docs/02-recoveryconnect-homegroups.md` | Add feature-flag callout near V4.4 mentions    |
| `docs/ROADMAP.md`                       | Add V4 flag status row to Feature Status table |

---

### Task 1: Update `docs/02-recoveryconnect-homegroups.md`

**Files:**

- Modify: `docs/02-recoveryconnect-homegroups.md`

- [ ] **Step 1.1: Find the V4.4 feature list section**

```bash
grep -n "V4\.\|feature.flag\|intergroup\|white.label" docs/02-recoveryconnect-homegroups.md | head -20
```

Locate the section that says the MVP is "feature-complete with a roadmap to V4.4" and lists V4.4 items.

- [ ] **Step 1.2: Add a feature-flag callout block**

Read the file first to find the exact line numbers, then add the following block immediately after the sentence that describes the 13 domain modules as implemented (around line 36 area). Insert it as a blockquote callout:

```markdown
> **V4.1–V4.4 Mobile UI Status:** The Cloud Functions backend and Firestore schema for V4.1 (Governance), V4.2 (Content), V4.3 (Analytics), and V4.4 (Enterprise/Intergroup) are implemented. However, all mobile UI entry points for these features are hidden behind boolean feature flags in `mobile/src/config/featureFlags.ts` — every flag is currently `false`. End users on the current release cannot access any V4.x feature. To enable a feature, set its flag to `true` in `featureFlags.ts` and ship a new build. The intergroup navigator stack (`AppNavigator.tsx:153`) is additionally gated by `SHOW_V4_ENTERPRISE_INTERGROUP`.
```

- [ ] **Step 1.3: Verify the edit reads correctly**

```bash
grep -A 5 "V4.1–V4.4 Mobile UI Status" docs/02-recoveryconnect-homegroups.md
```

Expected: the callout block appears in output.

- [ ] **Step 1.4: Commit**

```bash
git add docs/02-recoveryconnect-homegroups.md
git commit -m "docs: clarify V4.1-V4.4 mobile UI is feature-flagged off (D-1)

Adds explicit callout to 02-recoveryconnect-homegroups.md noting that
all V4.x mobile UI entry points are behind false feature flags in
mobile/src/config/featureFlags.ts. Backend callables and schema exist;
end users cannot access these features until flags are flipped and a
new build is shipped.

Closes D-1."
```

---

### Task 2: Update `docs/ROADMAP.md` Feature Status table

**Files:**

- Modify: `docs/ROADMAP.md`

- [ ] **Step 2.1: Locate the Feature Status table**

```bash
grep -n "V4\|Complete\|Status" docs/ROADMAP.md | head -15
```

The Feature Status table is near the top of the file. The row for `V4` reads:

```
| V4                             | Platform & scale             | ✅ Complete (commit 34c993d) |
```

- [ ] **Step 2.2: Add a V4 mobile flag row below the V4 row**

After the `| V4 | Platform & scale | ✅ Complete (commit 34c993d) |` row, add:

```markdown
| V4.1–V4.4 mobile UI | Feature flags (all `false`) | 🚩 Hidden — flip flags to enable |
```

- [ ] **Step 2.3: Verify**

```bash
grep -A 2 "V4.*Complete" docs/ROADMAP.md | head -6
```

Expected: the new row appears immediately after the V4 row.

- [ ] **Step 2.4: Commit**

```bash
git add docs/ROADMAP.md
git commit -m "docs(roadmap): add V4 mobile flag status row to feature table"
```

---

## When to Enable the Flags

Reference for the engineer who flips the flags:

| Flag group                                              | Prerequisite before flipping                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| V4.1 Governance (Bylaws, Elections, GSR Report)         | Manual QA of election flow in `ElectionDetailScreen` — see D-22 (non-atomic winner assignment) |
| V4.2 Content (Reflection, Literature, Sobriety Calc)    | No known blockers; low-risk flip                                                               |
| V4.3 Analytics (Group Health, Treasury Trends, Journey) | No known blockers; low-risk flip                                                               |
| V4.4 Enterprise (Data Export, Intergroup)               | Requires intergroup Stripe prices set in Dashboard; see `docs/LAUNCH_BLOCKERS.md` P1 section   |

Flipping all V4.1–V4.3 flags is a 5-minute PR and a build+submit. V4.4 needs the Stripe price ID prerequisites first.
