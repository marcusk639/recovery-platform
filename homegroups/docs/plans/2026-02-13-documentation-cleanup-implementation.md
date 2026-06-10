# Documentation Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate meta-documentation and archive historical docs for clean, systematic documentation structure.

**Architecture:** File reorganization using git operations to preserve history. Create archive structure, move superseded docs, consolidate 3 meta-docs into 1, update navigation.

**Tech Stack:** Git, Markdown

**Design Document:** `docs/plans/2026-02-13-documentation-cleanup-design.md`

---

## Task 1: Create Archive Directory Structure

**Files:**
- Create: `docs/archive/README.md`
- Create: `docs/archive/specifications/` (directory)
- Create: `docs/archive/priorities/` (directory)
- Create: `docs/archive/analysis/` (directory)
- Create: `docs/archive/legacy/` (directory)

**Step 1: Create archive directories**

```bash
mkdir -p docs/archive/specifications
mkdir -p docs/archive/priorities
mkdir -p docs/archive/analysis
mkdir -p docs/archive/legacy
```

**Step 2: Verify directory structure**

Run: `ls -la docs/archive/`
Expected: Should see specifications/, priorities/, analysis/, legacy/ directories

**Step 3: Create archive README**

Write to `docs/archive/README.md`:

```markdown
# Archived Documentation

This folder contains historical documentation that has been superseded by current docs.

## Why These Are Archived

- Decisions have been finalized
- Content merged into canonical docs
- Kept for historical reference and decision context

## What Supersedes What

**Specifications:**
- `spec.md` → Superseded by `../PRODUCT_REQUIREMENTS.md`
- `mvp-reqs.md` → Superseded by `../PRODUCT_REQUIREMENTS.md`
- `FEATURE_GAPS_ANALYSIS.md` → Superseded by `../PRODUCT_REQUIREMENTS.md` + `../ROADMAP.md`

**Priorities & Roadmap:**
- `priorities.md` → Superseded by `../ROADMAP.md`
- `priorities2.md` → Superseded by `../ROADMAP.md`
- `groups.md` → Superseded by `../ROADMAP.md`

**Analysis Documents:**
- `CHAT_FEATURES_ANALYSIS.md` → Superseded by `../MESSAGING_ENGINEERING.md`
- `DIRECT_MESSAGING_REVIEW.md` → Superseded by `../MESSAGING_ENGINEERING.md`
- `PRERELEASE_ANALYSIS.md` → Historical reference
- `PRICING_MIGRATION_SUMMARY.md` → Historical reference

**Legacy:**
- `prerelease.md` → Historical reference
- `todo.md` → Superseded by `../ROADMAP.md`
- `llm-context.md` → Historical reference

## Using Archived Docs

Reference these to understand historical decisions and rationale, but **always implement from current canonical docs**.

## Current Documentation

See `../00-DOCUMENTATION-INDEX.md` for complete navigation to current documentation.
```

**Step 4: Verify README created**

Run: `cat docs/archive/README.md | head -20`
Expected: Should see the README content

---

## Task 2: Move Files to Archive - Specifications

**Files:**
- Move: `docs/spec.md` → `docs/archive/specifications/spec.md`
- Move: `docs/mvp-reqs.md` → `docs/archive/specifications/mvp-reqs.md`
- Move: `docs/FEATURE_GAPS_ANALYSIS.md` → `docs/archive/specifications/FEATURE_GAPS_ANALYSIS.md`

**Step 1: Move specification files**

```bash
git mv docs/spec.md docs/archive/specifications/
git mv docs/mvp-reqs.md docs/archive/specifications/
git mv docs/FEATURE_GAPS_ANALYSIS.md docs/archive/specifications/
```

**Step 2: Verify moves**

Run: `ls docs/archive/specifications/`
Expected: Should see spec.md, mvp-reqs.md, FEATURE_GAPS_ANALYSIS.md

Run: `git status`
Expected: Should show "renamed: docs/spec.md -> docs/archive/specifications/spec.md" etc.

---

## Task 3: Move Files to Archive - Priorities

**Files:**
- Move: `docs/priorities.md` → `docs/archive/priorities/priorities.md`
- Move: `docs/priorities2.md` → `docs/archive/priorities/priorities2.md`
- Move: `docs/groups.md` → `docs/archive/priorities/groups.md`

**Step 1: Move priority files**

```bash
git mv docs/priorities.md docs/archive/priorities/
git mv docs/priorities2.md docs/archive/priorities/
git mv docs/groups.md docs/archive/priorities/
```

**Step 2: Verify moves**

Run: `ls docs/archive/priorities/`
Expected: Should see priorities.md, priorities2.md, groups.md

---

## Task 4: Move Files to Archive - Analysis

**Files:**
- Move: `docs/CHAT_FEATURES_ANALYSIS.md` → `docs/archive/analysis/CHAT_FEATURES_ANALYSIS.md`
- Move: `docs/DIRECT_MESSAGING_REVIEW.md` → `docs/archive/analysis/DIRECT_MESSAGING_REVIEW.md`
- Move: `docs/PRERELEASE_ANALYSIS.md` → `docs/archive/analysis/PRERELEASE_ANALYSIS.md`
- Move: `docs/PRICING_MIGRATION_SUMMARY.md` → `docs/archive/analysis/PRICING_MIGRATION_SUMMARY.md`

**Step 1: Move analysis files**

```bash
git mv docs/CHAT_FEATURES_ANALYSIS.md docs/archive/analysis/
git mv docs/DIRECT_MESSAGING_REVIEW.md docs/archive/analysis/
git mv docs/PRERELEASE_ANALYSIS.md docs/archive/analysis/
git mv docs/PRICING_MIGRATION_SUMMARY.md docs/archive/analysis/
```

**Step 2: Verify moves**

Run: `ls docs/archive/analysis/`
Expected: Should see CHAT_FEATURES_ANALYSIS.md, DIRECT_MESSAGING_REVIEW.md, PRERELEASE_ANALYSIS.md, PRICING_MIGRATION_SUMMARY.md

---

## Task 5: Move Files to Archive - Legacy

**Files:**
- Move: `docs/prerelease.md` → `docs/archive/legacy/prerelease.md`
- Move: `docs/todo.md` → `docs/archive/legacy/todo.md`
- Move: `docs/llm-context.md` → `docs/archive/legacy/llm-context.md` (if exists)

**Step 1: Check if llm-context.md exists**

Run: `test -f docs/llm-context.md && echo "EXISTS" || echo "NOT FOUND"`

**Step 2: Move legacy files**

```bash
git mv docs/prerelease.md docs/archive/legacy/
git mv docs/todo.md docs/archive/legacy/
# Only if llm-context.md exists:
git mv docs/llm-context.md docs/archive/legacy/
```

**Step 3: Verify moves**

Run: `ls docs/archive/legacy/`
Expected: Should see prerelease.md, todo.md, and possibly llm-context.md

**Step 4: Stage archive README**

```bash
git add docs/archive/README.md
```

---

## Task 6: Create Consolidated DOCUMENTATION.md

**Files:**
- Create: `DOCUMENTATION.md` (at root)
- Reference: `DOCUMENTATION-PROJECT-COMPLETE.md`, `DOCUMENTATION-SUMMARY.md`, `docs/DOCUMENTATION-IMPROVEMENTS.md` (will be deleted)

**Step 1: Create DOCUMENTATION.md**

Write to `DOCUMENTATION.md`:

```markdown
# Homegroups Documentation Guide

**Quick Links:**
- 🚀 **New to the project?** Start with [`docs/00-DOCUMENTATION-INDEX.md`](./docs/00-DOCUMENTATION-INDEX.md)
- 💻 **Setting up locally?** Follow [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md)
- 🤝 **Want to contribute?** Read [`CONTRIBUTING.md`](./CONTRIBUTING.md)

---

## Documentation Structure

Homegroups documentation is organized into three tiers:

### 1. Canonical Documentation (Source of Truth)
These are the current, authoritative documents:
- [`docs/PRODUCT_REQUIREMENTS.md`](./docs/PRODUCT_REQUIREMENTS.md) - MVP scope, goals, constraints
- [`docs/ROADMAP.md`](./docs/ROADMAP.md) - Version timeline and feature prioritization
- [`README.md`](./README.md) - Application architecture and features

### 2. Supporting Documentation (Specific Topics)
Technical details and guides:
- [`docs/SECURITY_RULES_QUICKREF.md`](./docs/SECURITY_RULES_QUICKREF.md) - Security deployment checklist
- [`docs/SECURITY_RULES.md`](./docs/SECURITY_RULES.md) - Complete Firestore security rules
- [`docs/MESSAGING_ENGINEERING.md`](./docs/MESSAGING_ENGINEERING.md) - Chat system architecture
- [`docs/PRICING_MODEL.md`](./docs/PRICING_MODEL.md) - Monetization strategy
- [`docs/BILLING_AND_PAYMENTS.md`](./docs/BILLING_AND_PAYMENTS.md) - Payment system design
- See [`docs/00-DOCUMENTATION-INDEX.md`](./docs/00-DOCUMENTATION-INDEX.md) for complete list

### 3. Archive (Historical Reference)
Superseded documents in [`docs/archive/`](./docs/archive/):
- Old specifications → now in PRODUCT_REQUIREMENTS.md
- Old priorities → now in ROADMAP.md
- Historical analyses → now in current technical docs
- See [`docs/archive/README.md`](./docs/archive/README.md) for details

---

## Finding What You Need

### Common Questions

| Question | Answer |
|----------|--------|
| How do I set up the project? | [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) |
| What are we building? | [`docs/PRODUCT_REQUIREMENTS.md`](./docs/PRODUCT_REQUIREMENTS.md) |
| What's the roadmap? | [`docs/ROADMAP.md`](./docs/ROADMAP.md) |
| How do I contribute? | [`CONTRIBUTING.md`](./CONTRIBUTING.md) |
| How does [feature] work? | [`README.md`](./README.md) or [`docs/00-DOCUMENTATION-INDEX.md`](./docs/00-DOCUMENTATION-INDEX.md) |
| Security rules? | [`docs/SECURITY_RULES_QUICKREF.md`](./docs/SECURITY_RULES_QUICKREF.md) |
| Can't find something? | [`docs/00-DOCUMENTATION-INDEX.md`](./docs/00-DOCUMENTATION-INDEX.md) |

### By Role

**Developer:**
1. Start: [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md)
2. Learn: [`README.md`](./README.md)
3. Understand goals: [`docs/PRODUCT_REQUIREMENTS.md`](./docs/PRODUCT_REQUIREMENTS.md)
4. Navigate: [`docs/00-DOCUMENTATION-INDEX.md`](./docs/00-DOCUMENTATION-INDEX.md)

**Product Manager:**
1. Start: [`docs/PRODUCT_REQUIREMENTS.md`](./docs/PRODUCT_REQUIREMENTS.md)
2. Priorities: [`docs/ROADMAP.md`](./docs/ROADMAP.md)
3. Features: [`README.md`](./README.md)

**DevOps:**
1. Quick ref: [`docs/SECURITY_RULES_QUICKREF.md`](./docs/SECURITY_RULES_QUICKREF.md)
2. Setup: [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md)
3. Deep dive: [`docs/SECURITY_RULES.md`](./docs/SECURITY_RULES.md)

---

## Maintaining Documentation

### When to Update Docs

- **Code changes that affect features:** Update [`README.md`](./README.md)
- **Product scope changes:** Update [`docs/PRODUCT_REQUIREMENTS.md`](./docs/PRODUCT_REQUIREMENTS.md)
- **Priority shifts:** Update [`docs/ROADMAP.md`](./docs/ROADMAP.md)
- **Security rule changes:** Update both security docs
- **New features:** Add to relevant doc + update index

### How to Keep Docs in Sync

1. Update related docs in the same PR as code changes
2. Check cross-references are still valid
3. Update version history in changed docs
4. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for details

### Documentation Quality Standards

- **Clear:** Use simple language, explain jargon
- **Accurate:** Match implemented functionality
- **Complete:** Cover all aspects of the topic
- **Navigable:** Link to related docs, use headers
- **Maintained:** Update when code changes

---

## Recent Changes

### 2026-02-13: Documentation Cleanup
- Consolidated 3 meta-docs into this single guide
- Created `docs/archive/` for historical documentation
- Archived 12 superseded documents
- Updated navigation and cross-references

### 2026-02-05: Documentation Reorganization
- Created central navigation hub ([`docs/00-DOCUMENTATION-INDEX.md`](./docs/00-DOCUMENTATION-INDEX.md))
- Created developer setup guide ([`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md))
- Created contribution guide ([`CONTRIBUTING.md`](./CONTRIBUTING.md))
- Established clear documentation hierarchy

---

## Questions or Issues?

- **Documentation unclear?** That's a bug! Create an issue or PR to fix it
- **Can't find something?** Check [`docs/00-DOCUMENTATION-INDEX.md`](./docs/00-DOCUMENTATION-INDEX.md)
- **Think something should be documented?** Create an issue or PR
- **Setup problems?** See troubleshooting in [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md)

---

**Version:** 2026-02-13
**Next Review:** 2026-03-13
```

**Step 2: Verify file created**

Run: `head -30 DOCUMENTATION.md`
Expected: Should see the documentation guide header

**Step 3: Stage DOCUMENTATION.md**

```bash
git add DOCUMENTATION.md
```

---

## Task 7: Update 00-DOCUMENTATION-INDEX.md

**Files:**
- Modify: `docs/00-DOCUMENTATION-INDEX.md`

**Step 1: Read current index**

Run: `cat docs/00-DOCUMENTATION-INDEX.md`
Purpose: Understand current structure before modifications

**Step 2: Add archive section after "Reference Material" section**

Find the "Reference Material" section and add this new section after it:

```markdown
### Archived Documentation (Historical)

Located in `/docs/archive/` - superseded documents kept for historical context:

| Category | What's There | Current Version |
|----------|--------------|-----------------|
| Specifications | spec.md, mvp-reqs.md, FEATURE_GAPS_ANALYSIS.md | PRODUCT_REQUIREMENTS.md |
| Priorities | priorities.md, priorities2.md, groups.md | ROADMAP.md |
| Analysis | CHAT_FEATURES_ANALYSIS.md, DIRECT_MESSAGING_REVIEW.md | MESSAGING_ENGINEERING.md |
| Legacy | prerelease.md, todo.md, llm-context.md | See archive README |

**See [`archive/README.md`](./archive/README.md) for complete details.**
```

**Step 3: Remove old references to archived files**

Remove these sections/references:
- "Analysis Documents (Historical)" section that mentions spec.md, mvp-reqs.md, etc.
- Any mentions of priorities.md, priorities2.md in the "Project Plans (Archived)" section
- Any superseded notes for the archived files

**Step 4: Add documentation meta-section**

Find or create a section near the end for "Documentation About Documentation":

```markdown
## Documentation About Documentation

- [`../DOCUMENTATION.md`](../DOCUMENTATION.md) - Quick guide to using these docs
- [`DOCUMENTATION-ANALYSIS.md`](./DOCUMENTATION-ANALYSIS.md) - Strategic documentation analysis
- [`archive/`](./archive/) - Historical/superseded documentation
```

**Step 5: Update version history section**

Find the "Version History" section and update:

```markdown
## Version History

This index created: 2026-02-05
Current app version: MVP (v0)
Last roadmap update: 2026-02-05
Last security rules update: 2026-02-05
**Last documentation update:** 2026-02-13
**Major changes:** Consolidated meta-docs, created archive structure, moved 12 historical docs
```

**Step 6: Stage the updated index**

```bash
git add docs/00-DOCUMENTATION-INDEX.md
```

---

## Task 8: Update docs/README.md

**Files:**
- Modify: `docs/README.md`

**Step 1: Add reference to DOCUMENTATION.md**

In the "Where to Start" section, add:

```markdown
**...quick guide to documentation**
→ Read [`../DOCUMENTATION.md`](../DOCUMENTATION.md) (2 min overview)
```

**Step 2: Update documentation by topic table**

In the "Reference & Analysis" row, add archive reference:

```markdown
| Type | Document | Purpose |
|------|----------|---------|
| ...existing rows... |
| Archive | [Archived Docs](./archive/README.md) | Historical documentation |
```

**Step 3: Update version history**

At the bottom, update:

```markdown
## Version History

- **Last updated:** 2026-02-13
- **App version:** MVP (v0)
- **Docs reviewed:** All core documentation current
- **Archive created:** 2026-02-13
- **Next review:** 2026-03-13
```

**Step 4: Stage the updated README**

```bash
git add docs/README.md
```

---

## Task 9: Delete Old Meta-Documentation Files

**Files:**
- Delete: `DOCUMENTATION-PROJECT-COMPLETE.md`
- Delete: `DOCUMENTATION-SUMMARY.md`
- Delete: `docs/DOCUMENTATION-IMPROVEMENTS.md`

**Step 1: Verify files exist**

Run: `ls -la DOCUMENTATION-*.md docs/DOCUMENTATION-IMPROVEMENTS.md`
Expected: Should see the 3 files

**Step 2: Remove with git**

```bash
git rm DOCUMENTATION-PROJECT-COMPLETE.md
git rm DOCUMENTATION-SUMMARY.md
git rm docs/DOCUMENTATION-IMPROVEMENTS.md
```

**Step 3: Verify removal**

Run: `git status`
Expected: Should show "deleted: DOCUMENTATION-PROJECT-COMPLETE.md" etc.

---

## Task 10: Review Changes and Commit

**Step 1: Review all staged changes**

Run: `git status`
Expected output:
```
Changes to be committed:
  new file:   DOCUMENTATION.md
  renamed:    docs/CHAT_FEATURES_ANALYSIS.md -> docs/archive/analysis/CHAT_FEATURES_ANALYSIS.md
  renamed:    docs/DIRECT_MESSAGING_REVIEW.md -> docs/archive/analysis/DIRECT_MESSAGING_REVIEW.md
  renamed:    docs/PRERELEASE_ANALYSIS.md -> docs/archive/analysis/PRERELEASE_ANALYSIS.md
  renamed:    docs/PRICING_MIGRATION_SUMMARY.md -> docs/archive/analysis/PRICING_MIGRATION_SUMMARY.md
  new file:   docs/archive/README.md
  renamed:    docs/prerelease.md -> docs/archive/legacy/prerelease.md
  renamed:    docs/todo.md -> docs/archive/legacy/todo.md
  renamed:    docs/priorities.md -> docs/archive/priorities/priorities.md
  renamed:    docs/priorities2.md -> docs/archive/priorities/priorities2.md
  renamed:    docs/groups.md -> docs/archive/priorities/groups.md
  renamed:    docs/spec.md -> docs/archive/specifications/spec.md
  renamed:    docs/mvp-reqs.md -> docs/archive/specifications/mvp-reqs.md
  renamed:    docs/FEATURE_GAPS_ANALYSIS.md -> docs/archive/specifications/FEATURE_GAPS_ANALYSIS.md
  modified:   docs/00-DOCUMENTATION-INDEX.md
  modified:   docs/README.md
  deleted:    DOCUMENTATION-PROJECT-COMPLETE.md
  deleted:    DOCUMENTATION-SUMMARY.md
  deleted:    docs/DOCUMENTATION-IMPROVEMENTS.md
```

**Step 2: Review diff of modified files**

Run: `git diff --staged docs/00-DOCUMENTATION-INDEX.md | head -50`
Purpose: Verify changes to index are correct

Run: `git diff --staged docs/README.md | head -30`
Purpose: Verify changes to README are correct

**Step 3: Verify new DOCUMENTATION.md**

Run: `cat DOCUMENTATION.md | head -50`
Purpose: Verify content looks good

**Step 4: Verify archive structure**

Run: `tree docs/archive/` or `find docs/archive/ -type f`
Expected: Should see organized structure with README and categorized files

**Step 5: Check if any files need to be added**

Run: `git add CONTRIBUTING.md docs/DEVELOPMENT.md docs/QUICK-REFERENCE.md docs/DOCUMENTATION-ANALYSIS.md`
Note: These may already be staged from previous work, that's ok

**Step 6: Commit all changes**

```bash
git commit -m "docs: reorganize documentation structure

- Consolidate 3 meta-docs into single DOCUMENTATION.md
- Create docs/archive/ for historical documentation
- Archive 12 superseded docs (specs, old priorities, analyses)
- Update 00-DOCUMENTATION-INDEX.md with archive references
- Update docs/README.md with archive links
- Maintain all current canonical docs in place

This completes the Feb 5th documentation reorganization effort.
Docs are now systematically organized with clear hierarchy.

Files archived:
- Specifications: spec.md, mvp-reqs.md, FEATURE_GAPS_ANALYSIS.md
- Priorities: priorities.md, priorities2.md, groups.md
- Analysis: CHAT_FEATURES_ANALYSIS.md, DIRECT_MESSAGING_REVIEW.md,
  PRERELEASE_ANALYSIS.md, PRICING_MIGRATION_SUMMARY.md
- Legacy: prerelease.md, todo.md, llm-context.md

Canonical docs retained:
- PRODUCT_REQUIREMENTS.md, ROADMAP.md (source of truth)
- All technical docs (security, messaging, pricing)
- All setup/development guides (DEVELOPMENT.md, CONTRIBUTING.md)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

**Step 7: Verify commit**

Run: `git log -1 --stat`
Expected: Should show commit with all the changed files

**Step 8: Final verification**

Run: `ls docs/`
Expected: Should NOT see spec.md, mvp-reqs.md, priorities.md, etc.

Run: `ls docs/archive/specifications/`
Expected: Should see spec.md, mvp-reqs.md, FEATURE_GAPS_ANALYSIS.md

Run: `cat DOCUMENTATION.md | grep "Quick Links"`
Expected: Should see the quick links section

---

## Task 11: Verify Documentation is Navigable

**Step 1: Test navigation from DOCUMENTATION.md**

Open `DOCUMENTATION.md` and verify:
- All links work (check a few key ones)
- Quick links section is clear
- Structure makes sense

**Step 2: Test navigation from 00-DOCUMENTATION-INDEX.md**

Open `docs/00-DOCUMENTATION-INDEX.md` and verify:
- Archive section is present
- References to archived files are removed
- Links to archive work
- No broken references to moved files

**Step 3: Test archive README**

Open `docs/archive/README.md` and verify:
- Clear explanation of what's archived
- "What Supersedes What" table is accurate
- All archived files are listed

**Step 4: Spot check a few archived files**

Run: `cat docs/archive/specifications/spec.md | head -20`
Expected: Should see the original spec content

**Step 5: Verify current docs are still in place**

Run: `ls docs/ | grep -E "(PRODUCT_REQUIREMENTS|ROADMAP|SECURITY|MESSAGING|DEVELOPMENT)"`
Expected: Should see all the current docs

**Step 6: Success verification**

✅ Single DOCUMENTATION.md replaces 3 meta-docs
✅ All 12 historical docs moved to organized archive
✅ Archive has clear README explaining superseded docs
✅ 00-DOCUMENTATION-INDEX.md updated with archive references
✅ All current/canonical docs remain in docs/
✅ Single atomic commit with clear message
✅ Documentation structure is systematic and navigable

---

## Success Criteria

- ✅ `DOCUMENTATION.md` exists at root and is comprehensive
- ✅ `docs/archive/` exists with organized subdirectories
- ✅ `docs/archive/README.md` clearly explains archive
- ✅ 12 files successfully moved to archive with git history preserved
- ✅ `docs/00-DOCUMENTATION-INDEX.md` updated with archive section
- ✅ `docs/README.md` references new DOCUMENTATION.md and archive
- ✅ Old meta-docs deleted (DOCUMENTATION-PROJECT-COMPLETE.md, etc.)
- ✅ All changes committed in single atomic commit
- ✅ Documentation is navigable and well-organized
- ✅ No broken links or references

---

## Estimated Time

**Total:** 30-45 minutes

- Task 1: 5 min (create archive structure)
- Task 2-5: 10 min (move files)
- Task 6: 10 min (create DOCUMENTATION.md)
- Task 7-8: 10 min (update index and README)
- Task 9-10: 5 min (delete and commit)
- Task 11: 5 min (verification)
