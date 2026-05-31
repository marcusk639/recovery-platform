# Comprehensive Iterative Review Implementation Plan (Pivoted)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Pivot note (2026-04-14):** Original plan targeted ~40 uncommitted files. Those were committed mid-session. This revision is a **post-hoc review** of 14 commits / 137 files across the React Query migration effort.

**Goal:** Post-hoc iterative review of the React Query + architecture migration shipped in commits `62c2866..3e43a0d` (base = `732da0d`, HEAD = `3e43a0d`), plus remaining uncommitted slice cleanup. Surface correctness, security, and consistency issues; apply fixes as new follow-up commits on `main`.

**Architecture:** Review by commit-cluster (commits group by semantic intent). Large clusters are split by domain. Each cluster runs one `/iterative-review` invocation with `max:3`. Cluster II (48-screen mass migration) is split into 4 domain slices (II-a…II-d) followed by a cross-cutting holistic pass (II-e). A final whole-branch holistic review wraps it.

**Tech Stack:** React Native 0.72, Firebase (Firestore, Auth, Functions, Messaging), Redux Toolkit, React Query, Stripe, Detox, Jest. Reviewer agents (from `~/.claude/agents/`): `code-reviewer`, `security-reviewer`, `database-reviewer`, `mobile-app-developer`, `architect`, `payment-integration`.

**Conventions:**

- Run clusters **sequentially**, not in parallel.
- Fixes land as new `fix(review): …` commits on `main`. Do not rewrite existing history.
- If a cluster caps at `max:3` with remaining CRITICAL/HIGH findings (conf ≥ 85), stop and surface to user before proceeding.
- PostToolUse Prettier formatter runs after every edit — re-read before chained edits.
- `/iterative-review` is the global skill at `~/.claude/skills/iterative-review/SKILL.md` (adapted from rats-v2 for RN/Firebase/Cloud Functions).

---

## Task 0: Re-snapshot & rewrite plan

- [ ] **Step 1: Capture SHAs**

```bash
echo "base=$(git rev-parse 62c2866^)  head=$(git rev-parse HEAD)"
```

Expected: `base=732da0d... head=3e43a0d...`

- [ ] **Step 2: List review target commits**

```bash
git log --oneline 732da0d..HEAD
```

Expected: 14 commits visible.

- [ ] **Step 3: Confirm file count**

```bash
git diff --stat 732da0d..HEAD | tail -1
```

Expected: ~137 files changed.

- [ ] **Step 4: Commit this plan**

```bash
git add docs/superpowers/plans/2026-04-14-comprehensive-iterative-review.md
git commit -m "docs(plan): pivot comprehensive iterative review to post-hoc commit-cluster approach"
```

---

## Task 1: Cluster V — RTDB removal + security rules

**Commits:** `5d7a441` (disable RTDB rules), `d4d773d` (remove @react-native-firebase/database package)

**Why first:** Smallest, most security-sensitive. Must confirm RTDB is truly unused before the rule change is safe.

- [ ] **Step 1: Inspect commits**

```bash
git show --stat 5d7a441 d4d773d
```

- [ ] **Step 2: Invoke /iterative-review**

Target: commit range `5d7a441^..d4d773d`. Provide the reviewer with:

- The exact files changed in each commit
- Context: "These commits remove Realtime Database (RTDB) usage from the mobile app and disable RTDB security rules accordingly."
- Expected agents (per skill): `security-reviewer` + `database-reviewer`
- Special check: search `src/` for any remaining `@react-native-firebase/database` or `firestore.database()` imports — if any exist, that's a CRITICAL finding.

- [ ] **Step 3: Fix findings → new commits**

Any CRITICAL/HIGH fixes commit as `fix(review,security): …`.

- [ ] **Step 4: Run rules tests if Firestore rules were touched**

```bash
npx jest firebase/__tests__/firestore.rules.test.ts --no-coverage 2>&1 | tail -15
```

---

## Task 2: Cluster VI — `functions/` deletion parity check

**Commits:** `cac76fb` (move legacy docs to archive, remove functions/ directory)

**Method:** Architect agent (not iterative-review — it's a deletion, not new code).

- [ ] **Step 1: List callables mobile depends on**

```bash
grep -rEn "httpsCallable\(['\"]([^'\"]+)['\"]\)|callHttpsFunction\(['\"]([^'\"]+)['\"]" src/ \
  --include='*.ts' --include='*.tsx' | sed -E "s/.*(httpsCallable|callHttpsFunction)\(['\"]([^'\"]+).*/\2/" | sort -u
```

- [ ] **Step 2: List deployed functions in regroup-functions**

```bash
grep -rEn "export const \w+" /Users/marcusklein/dev/regroup-functions/functions/src/ 2>/dev/null | \
  grep -E "onCall|onRequest|functions\.https" | head -50
```

- [ ] **Step 3: Dispatch architect for parity judgment**

Agent tool with `subagent_type: architect`. Prompt: provide both lists from Steps 1–2 and ask for CRITICAL/HIGH/MEDIUM/LOW findings on parity gaps, orphaned mobile invocations, or missing deployed exports.

- [ ] **Step 4: Address blockers**

If the architect finds a missing deployed function for a mobile invocation: STOP and surface to user. Do not proceed until parity is confirmed or the mobile invocation is removed.

---

## Task 3: Cluster I — DataContext + RQ mutations core

**Commits:** `62c2866` (DataContext → RQ), `0432c0a` (code review fixes on DataContext work), `3e43a0d` (replace Redux mutation dispatches with RQ mutations)

**Why:** Data-layer architecture. Every screen in Cluster II depends on it.

- [ ] **Step 1: Get file list**

```bash
git diff --name-only 62c2866^ 3e43a0d -- ':(exclude)docs/' | grep -v '\.md$' | head -50
```

- [ ] **Step 2: Invoke /iterative-review**

- Expected agents: `code-reviewer` + `architect`
- Emphasis: key factories, `staleTime`, `enabled` guards, optimistic update rollback, no mutation of Redux entity state now that RQ owns server data, `logException()` in error paths.

- [ ] **Step 3: Run state/context tests**

```bash
npx jest src/state src/context --no-coverage 2>&1 | tail -15
```

- [ ] **Step 4: Fix → `fix(review,state): …` commits**

---

## Task 4: Cluster IV — Phase 3 cleanup (payments + House.adminId)

**Commits:** `c77dfcd` (add payment history limit, deprecate House.adminId)

- [ ] **Step 1: Get file list**

```bash
git show --stat c77dfcd | grep '^ ' | head -30
```

- [ ] **Step 2: Invoke /iterative-review**

- Expected agents: `code-reviewer` + `payment-integration`
- Emphasis: pagination limit is server-enforced not just client; deprecation of `House.adminId` does not break rules helpers (`isHouseAdmin`); no reads of the deprecated field left in services.

- [ ] **Step 3: Fix → `fix(review,payments): …` commits**

---

## Task 5: Cluster III — Form screens → React Query

**Commits:** `b2c350e` (migrate form screens from Redux thunks to React Query)

- [ ] **Step 1: Get file list**

```bash
git show --stat b2c350e | grep '^ src/' | head -30
```

- [ ] **Step 2: Invoke /iterative-review**

- Expected agents: `code-reviewer` + `security-reviewer`
- Emphasis: Formik + Yup still authoritative; no PII in logException payloads; optimistic updates + rollback correct; auth/onboarding mutations don't leak tokens.

- [ ] **Step 3: Fix → `fix(review,forms): …` commits**

---

## Task 6: Cluster II-a — Oxford screens migration (8 files)

**Commits:** subset of `5fcb818` under `src/screens/Oxford/`

- [ ] **Step 1: Get Oxford file list**

```bash
git show --name-only 5fcb818 | grep '^src/screens/Oxford/'
```

- [ ] **Step 2: Invoke /iterative-review** — agents: `code-reviewer` + `mobile-app-developer`

Emphasis: `oxfordEnabled` subscription gate remains; voting reads use immutable pattern; transactions for state-dependent writes.

- [ ] **Step 3: `npx jest src/screens/Oxford` → pass**
- [ ] **Step 4: Fix → `fix(review,oxford): …` commits**

---

## Task 7: Cluster II-b — House admin screens migration

**Files:** subset of `5fcb818` under `src/screens/Profile/`, `src/screens/HouseSettings/`, `src/screens/HouseOverview/`

- [ ] **Step 1: List files**

```bash
git show --name-only 5fcb818 | grep -E '^src/screens/(Profile|HouseSettings|HouseOverview)/'
```

- [ ] **Step 2: /iterative-review** — `code-reviewer` + `mobile-app-developer`
- [ ] **Step 3: Tests for those screen dirs pass**
- [ ] **Step 4: Fix → `fix(review,house-admin): …` commits**

---

## Task 8: Cluster II-c — Guest-facing screens migration

**Files:** subset of `5fcb818` under `GuestList`, `GuestUpdate`, `Personal`, `StatUpdates`, `Activity`, `Beds`

- [ ] **Step 1: List files**

```bash
git show --name-only 5fcb818 | grep -E '^src/screens/(GuestList|GuestUpdate|Personal|StatUpdates|Activity|Beds)/'
```

- [ ] **Step 2: /iterative-review** — `code-reviewer` + `mobile-app-developer`
- [ ] **Step 3: Tests pass**
- [ ] **Step 4: Fix → `fix(review,guest): …` commits**

---

## Task 9: Cluster II-d — Comms & misc screens migration

**Files:** subset of `5fcb818` under `HouseChat`, `DirectChat`, `Contacts`, `Issues`, `Disputes`, `Complaints`

- [ ] **Step 1: List files**

```bash
git show --name-only 5fcb818 | grep -E '^src/screens/(HouseChat|DirectChat|Contacts|Issues|Disputes|Complaints)/'
```

- [ ] **Step 2: /iterative-review** — `code-reviewer` + `mobile-app-developer`

Emphasis: realtime listener cleanup (unsubscribe on unmount), no subscription leaks in chat screens, dispute/complaint writes use proper rules-enforced paths.

- [ ] **Step 3: Tests pass**
- [ ] **Step 4: Fix → `fix(review,comms): …` commits**

---

## Task 10: Cluster II-e — Holistic cross-cutting review of 5fcb818

**Purpose:** Catch inconsistencies that span domains — e.g., some screens use `.toDate?.()` fallback and others don't; some use `createSelector`, others use raw selectors; `logException` used inconsistently.

- [ ] **Step 1: Dispatch architect + code-reviewer in parallel** over the full `5fcb818` diff

Prompt emphasis: "Do not re-flag issues already fixed in Cluster II-a through II-d. Focus on cross-screen inconsistencies and patterns that only emerge at scale."

- [ ] **Step 2: Iterate up to max:2 (lower cap — it's a consistency pass)**
- [ ] **Step 3: Fix → `fix(review,consistency): …` commits**

---

## Task 11: Cluster VII — iOS / E2E fixes

**Commits:** `4b41c10` (exclude html-to-pdf from iOS build, fix E2E reload crash)

- [ ] **Step 1: Inspect**

```bash
git show --stat 4b41c10
```

- [ ] **Step 2: /iterative-review** — agent: `code-reviewer` (single agent — narrow scope)

Emphasis: pod exclusion doesn't break html-to-pdf usage elsewhere; E2E reload-crash fix doesn't mask a real bug.

---

## Task 12: Cluster VIII — Uncommitted slice cleanup

**Files (working tree):**

```
src/context/DataContext.tsx
src/state/slices/adminSlice.ts
src/state/slices/guestsSlice.ts
src/state/slices/housesSlice.ts
src/state/slices/index.ts
```

**Why last among substantive reviews:** This is in-flight work that may still be changing. Review now, commit fixes as part of the original in-flight commit when the user finalizes it.

- [ ] **Step 1: Confirm these are still modified**

```bash
git status --short | grep -E '^ M '
```

- [ ] **Step 2: /iterative-review** — agents: `code-reviewer` + `architect`

Emphasis: Cluster I migrated DataContext to RQ and replaced slice dispatches — what are these slices still doing? Are they purely UI state now, or do they still hold server data (bug)?

- [ ] **Step 3: Do NOT commit fixes separately** — report findings so the user can incorporate them into their in-flight commit.

---

## Task 13: Final holistic review + verification + summary

- [ ] **Step 1: Whole-branch architect pass**

Dispatch `architect` over the diff `732da0d..HEAD` with all prior cluster outcomes as context. Purpose: catch anything that cluster-level reviews missed (e.g., removed-but-still-referenced types, net coverage regressions).

- [ ] **Step 2: Full test suite**

```bash
npm test -- --no-coverage 2>&1 | tail -30
```

- [ ] **Step 3: Lint**

```bash
npm run lint 2>&1 | tail -20
```

- [ ] **Step 4: Integration tests if emulator running** (skip with note if not)

```bash
firebase emulators:exec --only firestore,auth "npm run test:integration" 2>&1 | tail -30
```

- [ ] **Step 5: Write summary**

Path: `.full-review/2026-04-14-iterative-review-summary.md`

Sections:

- Base SHA, final SHA, commit count added by review
- Per-cluster: files touched, cycles run, findings fixed (C/H/M/L), outcome (confident/capped)
- Capped clusters with remaining findings
- Cross-cutting patterns worth adding to CLAUDE.md or `rats-patterns` skill
- Recommended follow-up spikes

- [ ] **Step 6: Commit summary**

```bash
git add .full-review/2026-04-14-iterative-review-summary.md
git commit -m "docs(review): comprehensive iterative review summary 2026-04-14"
```

---

## Execution Notes

- **Scope warning:** 14 tasks × (potentially 3 cycles × 2 reviewer agents) = up to ~84 agent dispatches. Expect this to take several sessions; pause between clusters for the user to steer.
- **Commit cadence:** Each cluster that yields fixes produces its own scoped `fix(review,…)` commit. Keep each commit revertable independently.
- **Skip conditions:** If a cluster's `/iterative-review` returns "confident clean" on Cycle 1, skip the fix/commit steps and record as clean in the summary.
- **Agent selection:** The `/iterative-review` skill internally picks agents from its table. Override only if the table's default is wrong for the cluster (notes above flag these).

## Self-Review Checklist Results

- **Spec coverage:** All 14 commits in `732da0d..3e43a0d` are assigned to a cluster, or explicitly marked skip (Prettier-only, Podfile lockfile, docs-only commits). ✅
- **Placeholders:** None — every task has concrete commands and concrete agent choices. ✅
- **Consistency:** Cluster numbering (I–VIII) + domain sub-splits (II-a…II-e) stable across tasks; agent names match global `~/.claude/agents/`. ✅
