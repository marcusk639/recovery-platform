# Documentation Cleanup Design

**Date:** 2026-02-13
**Status:** Approved
**Approach:** Quick Cleanup (Approach 1)
**Estimated Time:** 30-45 minutes

---

## Overview

Complete the February 5th documentation reorganization by:
1. Consolidating 3 meta-documentation files into one concise guide
2. Creating an archive structure for historical/superseded docs
3. Moving 12 historical docs to organized archive
4. Updating navigation to reflect new structure
5. Committing all changes in single atomic commit

---

## Goals

- **Systematic organization:** Clear hierarchy of current vs. archived docs
- **Readable and understandable:** Single DOCUMENTATION.md replaces 3 verbose meta-docs
- **Detailed where necessary:** Archive README explains what supersedes what
- **Canonical information at top level:** All current docs stay in docs/, historical in docs/archive/

---

## Section 1: Meta-Documentation Consolidation

### Current State
Three separate meta-docs totaling 1,154 lines:
- `DOCUMENTATION-PROJECT-COMPLETE.md` (458 lines)
- `DOCUMENTATION-SUMMARY.md` (436 lines)
- `docs/DOCUMENTATION-IMPROVEMENTS.md` (260 lines)

### Proposed Solution
Single `DOCUMENTATION.md` at root level (~150-200 lines)

### Content Structure
```markdown
# RecoveryConnect Documentation Guide

## Quick Start
- New to project? Start with: [docs/00-DOCUMENTATION-INDEX.md]
- Setting up locally? Follow: [docs/DEVELOPMENT.md]
- Want to contribute? Read: [CONTRIBUTING.md]

## Documentation Structure
- Canonical docs (current source of truth)
- Supporting docs (specific topics)
- Archive (historical reference)

## Finding What You Need
[Table of common questions → where to look]

## Maintaining Documentation
- When to update docs
- How to keep in sync with code
- Documentation quality standards

## Recent Changes
- 2026-02-05: Documentation reorganization completed
- Added central navigation hub
- Created developer setup guide
- Archived superseded specifications
```

### Files to Delete
- `DOCUMENTATION-PROJECT-COMPLETE.md`
- `DOCUMENTATION-SUMMARY.md`
- `docs/DOCUMENTATION-IMPROVEMENTS.md`

### Files to Keep
- `docs/DOCUMENTATION-ANALYSIS.md` (detailed strategic analysis, different purpose)

### Rationale
- Single file easier to maintain than 3
- Focuses on actionable guidance, not project history
- Root-level placement makes it discoverable
- Git history preserves detailed completion info

---

## Section 2: Archive Structure Design

### Directory Structure
```
docs/archive/
├── README.md                          # What's in archive + what supersedes what
├── specifications/                     # Old specs
│   ├── spec.md                        # Original spec
│   ├── mvp-reqs.md                    # MVP requirements list
│   └── FEATURE_GAPS_ANALYSIS.md       # Feature gap analysis
├── priorities/                         # Old roadmap/priorities
│   ├── priorities.md                  # First priorities doc
│   ├── priorities2.md                 # Second priorities doc
│   └── groups.md                      # Group features brainstorm
├── analysis/                          # Historical analysis docs
│   ├── CHAT_FEATURES_ANALYSIS.md      # Chat analysis
│   ├── DIRECT_MESSAGING_REVIEW.md     # DM review
│   ├── PRERELEASE_ANALYSIS.md         # Pre-launch analysis
│   └── PRICING_MIGRATION_SUMMARY.md   # Pricing history
└── legacy/                            # Other historical docs
    ├── prerelease.md                  # Old prerelease notes
    ├── todo.md                        # Old todo list
    └── llm-context.md                 # LLM context (if not needed)
```

### Archive README Content
```markdown
# Archived Documentation

This folder contains historical documentation that has been superseded by current docs.

## Why These Are Archived
- Decisions have been finalized
- Content merged into canonical docs
- Kept for historical reference and decision context

## What Supersedes What
- spec.md, mvp-reqs.md → PRODUCT_REQUIREMENTS.md
- priorities.md, priorities2.md, groups.md → ROADMAP.md
- CHAT_FEATURES_ANALYSIS.md, DIRECT_MESSAGING_REVIEW.md → MESSAGING_ENGINEERING.md
- FEATURE_GAPS_ANALYSIS.md → PRODUCT_REQUIREMENTS.md + ROADMAP.md

## Using Archived Docs
Reference these to understand historical decisions, but always implement from current canonical docs.
```

### Rationale
- Categorization makes archive navigable
- README prevents confusion about what's current
- Preserves decision history without cluttering active docs
- Clear mapping to current docs

---

## Section 3: Files to Archive vs. Keep

### Files to ARCHIVE (12 files)

**Specifications folder:**
- `spec.md` - Original spec (superseded by PRODUCT_REQUIREMENTS.md)
- `mvp-reqs.md` - MVP list (superseded by PRODUCT_REQUIREMENTS.md)
- `FEATURE_GAPS_ANALYSIS.md` - Gap analysis (superseded)

**Priorities folder:**
- `priorities.md` - Old priorities (superseded by ROADMAP.md)
- `priorities2.md` - Second priorities (superseded by ROADMAP.md)
- `groups.md` - Group features brainstorm (superseded by ROADMAP.md)

**Analysis folder:**
- `CHAT_FEATURES_ANALYSIS.md` - Chat analysis (superseded by MESSAGING_ENGINEERING.md)
- `DIRECT_MESSAGING_REVIEW.md` - DM review (superseded by MESSAGING_ENGINEERING.md)
- `PRERELEASE_ANALYSIS.md` - Pre-launch analysis (historical)
- `PRICING_MIGRATION_SUMMARY.md` - Pricing history (historical)

**Legacy folder:**
- `prerelease.md` - Old prerelease notes (historical)
- `todo.md` - Old todo list (likely superseded by ROADMAP.md)

### Files to KEEP in docs/ (18+ files)

**Navigation & Guides:**
- ✅ `00-DOCUMENTATION-INDEX.md` - Central navigation hub
- ✅ `README.md` - Docs folder entry point
- ✅ `DEVELOPMENT.md` - Setup guide
- ✅ `QUICK-REFERENCE.md` - Quick lookup
- ✅ `DOCUMENTATION-ANALYSIS.md` - Strategic analysis

**Canonical Docs (Source of Truth):**
- ✅ `PRODUCT_REQUIREMENTS.md` - **CANONICAL** product spec
- ✅ `ROADMAP.md` - **CANONICAL** roadmap

**Technical Documentation:**
- ✅ `SECURITY_RULES_QUICKREF.md` - Deployment checklist
- ✅ `SECURITY_RULES.md` - Full security rules
- ✅ `MESSAGING_ENGINEERING.md` - Chat architecture
- ✅ `PRICING_MODEL.md` - Current pricing strategy
- ✅ `BILLING_AND_PAYMENTS.md` - Payment system
- ✅ `BRAINTREE_INTEGRATION.md` - Payment integration
- ✅ `deep-linking.md` - Deep linking implementation

**Analysis & Planning:**
- ✅ `MEETING_INSTANCE_ANALYSIS.md` - Data model analysis
- ✅ `STRATEGIC_ANALYSIS.md` - Market analysis
- ✅ `MEETING_ATTENDANCE_PLAN.md` - Feature plan
- ✅ `plans/` directory - All implementation plans

---

## Section 4: Updates to 00-DOCUMENTATION-INDEX.md

### Add Archive Section
```markdown
### Archived Documentation (Historical)
Located in `/docs/archive/` - superseded documents kept for historical context:

| Category | What's There | Current Version |
|----------|--------------|-----------------|
| Specifications | spec.md, mvp-reqs.md, FEATURE_GAPS_ANALYSIS.md | PRODUCT_REQUIREMENTS.md |
| Priorities | priorities.md, priorities2.md, groups.md | ROADMAP.md |
| Analysis | CHAT_FEATURES_ANALYSIS.md, DIRECT_MESSAGING_REVIEW.md | MESSAGING_ENGINEERING.md |
| Legacy | prerelease.md, todo.md, etc. | See archive README |

See [docs/archive/README.md](./archive/README.md) for full details.
```

### Remove Archived File References
- Remove mentions of spec.md, mvp-reqs.md from "superseded" notes
- Update "Analysis Documents (Historical)" section to point to archive
- Clean up outdated cross-references

### Add Reference to DOCUMENTATION.md
```markdown
## Documentation About Documentation
- [DOCUMENTATION.md](../DOCUMENTATION.md) - Quick guide to using these docs
- [DOCUMENTATION-ANALYSIS.md](./DOCUMENTATION-ANALYSIS.md) - Strategic analysis
- [archive/](./archive/) - Historical documentation
```

### Update Version History
```markdown
## Version History
- **Last updated:** 2026-02-13
- **Major changes:** Consolidated meta-docs, archived historical specs
- **Archive created:** 2026-02-13
```

### Rationale
- Clear signposting to archive
- Removes clutter from main index
- Maintains discoverability of historical context
- Updates reflect current state

---

## Section 5: Commit Strategy

### Commit Message
```
docs: reorganize documentation structure

- Consolidate 3 meta-docs into single DOCUMENTATION.md
- Create docs/archive/ for historical documentation
- Archive 12 superseded docs (specs, old priorities, analyses)
- Update 00-DOCUMENTATION-INDEX.md with archive references
- Maintain all current canonical docs in place

This completes the Feb 5th documentation reorganization effort.
Docs are now systematically organized with clear hierarchy.

Files archived:
- Specifications: spec.md, mvp-reqs.md, FEATURE_GAPS_ANALYSIS.md
- Priorities: priorities.md, priorities2.md, groups.md
- Analysis: CHAT_FEATURES_ANALYSIS.md, DIRECT_MESSAGING_REVIEW.md, etc.

Canonical docs retained:
- PRODUCT_REQUIREMENTS.md, ROADMAP.md (source of truth)
- All technical docs (security, messaging, pricing)
- All setup/development guides
```

### What Gets Committed
- ✅ New: `DOCUMENTATION.md` (root)
- ✅ New: `docs/archive/` directory with README and subdirs
- ✅ Modified: `docs/00-DOCUMENTATION-INDEX.md` (updated references)
- ✅ Modified: `docs/README.md` (if needed, update archive reference)
- ✅ Moved: 12 files from `docs/` to `docs/archive/*`
- ✅ Deleted: `DOCUMENTATION-PROJECT-COMPLETE.md`, `DOCUMENTATION-SUMMARY.md`, `docs/DOCUMENTATION-IMPROVEMENTS.md`
- ✅ All other new docs from Feb 5th: `CONTRIBUTING.md`, `DEVELOPMENT.md`, `QUICK-REFERENCE.md`, etc.

### Git Operations
```bash
# Create archive structure
mkdir -p docs/archive/{specifications,priorities,analysis,legacy}

# Move files to archive
git mv docs/spec.md docs/archive/specifications/
git mv docs/mvp-reqs.md docs/archive/specifications/
git mv docs/FEATURE_GAPS_ANALYSIS.md docs/archive/specifications/
git mv docs/priorities.md docs/archive/priorities/
git mv docs/priorities2.md docs/archive/priorities/
git mv docs/groups.md docs/archive/priorities/
git mv docs/CHAT_FEATURES_ANALYSIS.md docs/archive/analysis/
git mv docs/DIRECT_MESSAGING_REVIEW.md docs/archive/analysis/
git mv docs/PRERELEASE_ANALYSIS.md docs/archive/analysis/
git mv docs/PRICING_MIGRATION_SUMMARY.md docs/archive/analysis/
git mv docs/prerelease.md docs/archive/legacy/
git mv docs/todo.md docs/archive/legacy/

# Create archive README
# (content as specified in Section 2)

# Create DOCUMENTATION.md
# (content as specified in Section 1)

# Update 00-DOCUMENTATION-INDEX.md
# (changes as specified in Section 4)

# Stage new files
git add DOCUMENTATION.md
git add docs/archive/
git add CONTRIBUTING.md
git add docs/00-DOCUMENTATION-INDEX.md
git add docs/README.md
git add docs/DEVELOPMENT.md
git add docs/QUICK-REFERENCE.md
git add docs/DOCUMENTATION-ANALYSIS.md

# Remove old meta-docs
git rm DOCUMENTATION-PROJECT-COMPLETE.md
git rm DOCUMENTATION-SUMMARY.md
git rm docs/DOCUMENTATION-IMPROVEMENTS.md

# Commit everything
git commit -m "docs: reorganize documentation structure

- Consolidate 3 meta-docs into single DOCUMENTATION.md
- Create docs/archive/ for historical documentation
- Archive 12 superseded docs (specs, old priorities, analyses)
- Update 00-DOCUMENTATION-INDEX.md with archive references
- Maintain all current canonical docs in place

This completes the Feb 5th documentation reorganization effort.
Docs are now systematically organized with clear hierarchy.

Files archived:
- Specifications: spec.md, mvp-reqs.md, FEATURE_GAPS_ANALYSIS.md
- Priorities: priorities.md, priorities2.md, groups.md
- Analysis: CHAT_FEATURES_ANALYSIS.md, DIRECT_MESSAGING_REVIEW.md, etc.

Canonical docs retained:
- PRODUCT_REQUIREMENTS.md, ROADMAP.md (source of truth)
- All technical docs (security, messaging, pricing)
- All setup/development guides

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

### Rationale
- Single atomic commit is easy to review
- Clear commit message explains what and why
- `git mv` preserves git history of moved files
- Clean, professional result

---

## Implementation Checklist

- [ ] Create archive directory structure
- [ ] Write docs/archive/README.md
- [ ] Move 12 files to appropriate archive subdirectories
- [ ] Write DOCUMENTATION.md at root
- [ ] Update docs/00-DOCUMENTATION-INDEX.md
- [ ] Update docs/README.md (if needed)
- [ ] Delete 3 old meta-docs
- [ ] Review all changes
- [ ] Commit with detailed message
- [ ] Verify documentation is navigable

---

## Success Criteria

- ✅ Single DOCUMENTATION.md replaces 3 meta-docs
- ✅ All 12 historical docs moved to organized archive
- ✅ Archive has clear README explaining superseded docs
- ✅ 00-DOCUMENTATION-INDEX.md updated with archive references
- ✅ All current/canonical docs remain in docs/
- ✅ Single atomic commit with clear message
- ✅ Documentation structure is systematic and navigable

---

## Timeline

**Total estimated time:** 30-45 minutes

1. Create archive structure (5 min)
2. Write archive README (5 min)
3. Write DOCUMENTATION.md (10 min)
4. Move files and update index (10 min)
5. Review and commit (10 min)

---

## Next Steps

After approval, proceed to implementation using the writing-plans skill to create detailed step-by-step implementation plan.
