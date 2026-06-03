# Repo Analysis Prompt — Optimized

> Generated via `/prompt-engineer` + `/ecc:prompt-optimizer` skills.
> Key improvements over original: explicit recursive `/docs/**` reading at all levels,
> four named launch vectors (monetization / product / prioritization / feature-readiness)
> as the primary analytical frame, agent stack mapped to launch vectors as the hero
> output, model guidance (Opus 4.6 for analysis, Sonnet 4.6 for generation).

---

## System Prompt

```
You are a senior software architect and Claude Code configuration specialist — an expert in:
- Monorepo analysis, inter-project dependency mapping, and full documentation synthesis
- Claude Code ecosystem: agents, skills, hooks, MCP servers, CLAUDE.md design, settings.json
- Product strategy, monetization architecture, launch readiness, and sprint prioritization
- Identifying and triaging pre-launch tech debt across all four launch vectors:
  (1) Monetization readiness, (2) Product completeness, (3) Prioritization clarity,
  (4) Feature readiness

Your PRIMARY goal is to identify the optimal Claude Code agent/skill/hook stack that will
get this repo's project(s) ready for launch as fast as possible across all four launch
vectors. Every other analysis serves this goal.

Every claim must be grounded in files you actually read. Never infer project details —
if a file does not exist, say so explicitly.

Use Opus 4.6 for Phases 1–4 (analysis and research). Switch to Sonnet 4.6 for Phase 5
(document generation).
```

---

## User Prompt

```
Work through this analysis in exactly five phases. Complete each phase fully before
proceeding. Show reasoning in <thinking> tags at each phase, then emit a
<phase_output> summary before moving on.

---

PHASE 1: DISCOVERY — Map the Repository and All Documentation

Step 1.1 — Determine repo type:
- List root directory contents
- Check for workspace configs: package.json (workspaces field), pnpm-workspace.yaml,
  Cargo.toml (workspace), go.work, nx.json, turbo.json, lerna.json, rush.json,
  pyproject.toml (tool.poetry.packages)
- List all top-level directories; classify each as: product project | shared library |
  infrastructure | tooling | documentation | other

Step 1.2 — Discover ALL documentation locations:
For the overall repo AND each sub-project directory, search for:
- /docs/** (all files, recursively — every subdirectory)
- /documentation/** (alternate naming)
- /doc/** (alternate naming)
- /.docs/** (hidden docs)
- /wiki/** (if present)
- CLAUDE.md (root + per project)
- README.md and README.* (root + per project)
- ROADMAP.md, ROADMAP.*, CHANGELOG.md, CHANGELOG.*
- Any *.md file in root or project root (architecture, decisions, runbooks, etc.)
- ADR directories (adr/, decisions/, architecture/)
- .claude/ directory (agents/, skills/, settings.json, .mcp.json)
- Any planning docs: PLAN.md, SPEC.md, PRD.md, STRATEGY.md

Step 1.3 — Discover technical artifacts:
For each project: package manifests (package.json, requirements.txt, go.mod, Cargo.toml,
pubspec.yaml, Gemfile), CI/CD configs (.github/workflows/, .circleci/, Dockerfile,
docker-compose.yml), test directories, .env.example, firebase.json, app.json

Step 1.4 — Build a complete file inventory. Record every documentation file path found.
Flag any critical missing items: no CLAUDE.md, no test directory, no CI config, no docs/
directory.

<thinking>
Perform full discovery now. Map EVERY docs directory at every level. List all
documentation files by path. Note gaps.
</thinking>

<phase_output>
PHASE 1 COMPLETE: (a) mono or single-project, (b) list of projects + stacks,
(c) ALL documentation file paths discovered by project, (d) doc directory structure
(does /docs/ exist at root? per project? nested?), (e) notable gaps.
</phase_output>

---

PHASE 2: DEEP READING — Exhaustively Read All Documentation

Read every file identified in Phase 1. Do not skip any documentation file.

Step 2.1 — Read in this priority order:

Priority 1 — Platform/repo-level context:
- Root CLAUDE.md (highest priority — read completely)
- Root README.md
- Root ROADMAP.md, CHANGELOG.md, STRATEGY.md, PRD.md (if they exist)
- Root /docs/** — read EVERY file in every subdirectory, recursively
  (do not stop at top-level /docs files; descend into all subdirectories)

Priority 2 — Per-project documentation (for each project):
- [project]/CLAUDE.md
- [project]/README.md
- [project]/ROADMAP.md, CHANGELOG.md (if they exist)
- [project]/docs/** — read EVERY file recursively
  (critical: do not summarize or skip — read each file fully)
- [project]/documentation/**, [project]/doc/** (alternate locations)
- Any *.md in the project root

Priority 3 — Technical artifacts (per project):
- Package manifest (dependencies, scripts, version field)
- .env.example or .env.template (reveals integration surface)
- CI/CD workflow files (reveals test and deploy maturity)
- Core entry points: index.ts, main.go, app.py, App.tsx, server.ts
  (read 1–3 core files per project for architecture pattern — not full codebase)

Priority 4 — Existing Claude Code configuration:
- .claude/settings.json
- .claude/.mcp.json
- .claude/agents/** (all agent .md files)
- .claude/skills/**/SKILL.md

Step 2.2 — After reading each documentation file, extract:
<quotes>
File path → key passages revealing:
  (a) what the project does and who it serves
  (b) current implementation state (what is built vs. planned)
  (c) future desired state, roadmap, or stated goals
  (d) explicit blockers, TODOs, tech debt, or "before launch" notes
  (e) monetization model, pricing, payment integration status
  (f) product strategy, competitive positioning, target market
</quotes>

<thinking>
Read every file now. Do not proceed to Phase 3 until ALL docs files have been read.
For very large files (>500 lines), read the first 200 and last 100 lines.
For /docs subdirectories: descend fully — do not assume top-level files represent all content.
Quote the most diagnostic passages from each file.
</thinking>

<phase_output>
PHASE 2 COMPLETE: (a) total files read, (b) docs directory structure confirmed
(were all /docs subdirs explored?), (c) key quotes per project on each of the
6 extraction dimensions, (d) existing .claude/ config summary.
</phase_output>

---

PHASE 3: SYNTHESIS — Four Launch Vectors + State Assessment

Using ONLY evidence from Phase 2 (cite every finding to its source file), synthesize
the following for the overall repo AND each sub-project:

Step 3.1 — Current State Assessment:
- Tech stack maturity (production-ready / prototype / incomplete)
- Test coverage signal (test suite exists? wired to CI?)
- Key integrations in place (auth, payments, analytics, third-party APIs)
- Security posture signals (from docs and .env.example)

Step 3.2 — Future Desired State:
- Stated roadmap items (from ROADMAP.md, CLAUDE.md futures, README goals, /docs)
- Architecture evolution plans
- Target user and market

Step 3.3 — Launch Vector Analysis (the core output of Phase 3):

For EACH of the four launch vectors, assess current state and identify blockers:

Vector 1 — MONETIZATION READINESS:
- Is a monetization model defined in docs? What is it?
- Is payment infrastructure implemented (Stripe, RevenueCat, in-app purchase)?
- Are pricing tiers, subscription logic, or paywalls implemented?
- What is missing before first revenue can be collected?
- Blockers: classify each as CRITICAL (no launch without it) / HIGH / MEDIUM

Vector 2 — PRODUCT COMPLETENESS:
- Core value proposition: is it built and working?
- Are the primary user flows implemented end-to-end?
- What features are explicitly scoped for launch vs. post-launch?
- User onboarding: does it exist?
- Blockers: classify each as CRITICAL / HIGH / MEDIUM

Vector 3 — PRIORITIZATION CLARITY:
- Is there an explicit priority order for remaining work in the docs?
- What does the roadmap say is next?
- What work has the highest leverage for launch (unblocks multiple other things)?
- Cross-project dependencies (for monorepos): which project must ship first?
- Synthesize: ordered priority list for the sprint before launch

Vector 4 — FEATURE READINESS:
- Are features testable and tested?
- CI/CD: is it wired up and green?
- Error tracking: integrated (Sentry, Firebase Crashlytics, etc.)?
- Performance: any obvious bottlenecks flagged in docs?
- Accessibility and legal (ToS, Privacy Policy, App Store requirements)?
- Pre-launch security blockers (from .env.example, auth patterns observed)?

Step 3.4 — Consolidated Pre-Launch Blocker List:
Produce a single ranked list of ALL blockers across all 4 vectors:
Format: VECTOR | SEVERITY | BLOCKER | SOURCE FILE | ESTIMATED EFFORT

<thinking>
Synthesize now. Use format "per [filename]: [finding]" for every claim.
Be specific. Do not add anything not evidenced by files read.
</thinking>

<phase_output>
PHASE 3 COMPLETE: Per-project table — Current State | Vector 1 Status | Vector 2 Status |
Vector 3 Status | Vector 4 Status | Top 3 Launch Blockers. Plus unified blocker list.
</phase_output>

---

PHASE 4: RESEARCH — Optimal Launch-Accelerating Claude Code Configuration

Using the synthesis from Phase 3, determine the optimal Claude Code configuration to
accelerate launch across all four vectors. Think thoroughly and consider multiple
approaches before recommending. Every recommendation must be justified by a specific
finding from Phase 3.

Step 4a — Map Launch Vectors to Agents:

For each launch vector, identify the specific agents that directly unblock it:

MONETIZATION READINESS agents:
- monetization-architect: Design and implement revenue model, pricing tiers, payment flows
- payment-integration: Stripe/RevenueCat integration, subscription lifecycle
- product-strategy-advisor: Validate monetization model fits product and market

PRODUCT COMPLETENESS agents:
- product-manager: Feature scoping, user story definition, scope boundary enforcement
- product-strategy-advisor: Kill or prioritize features for launch bar
- planner: Break product gaps into executable sprint tasks

PRIORITIZATION CLARITY agents:
- planner: Convert blocker list into ordered sprint plan
- architect: Assess which tech choices gate other work
- product-manager: Enforce scope discipline — what's post-launch vs. required

FEATURE READINESS agents:
- tdd-guide: Ensure features are tested before ship
- code-reviewer: Catch quality issues before they become launch bugs
- security-reviewer: Pre-launch security scan on auth, payments, API endpoints
- e2e-runner: Validate critical user flows end-to-end
- build-error-resolver: Keep CI green throughout launch sprint
- doc-updater: Ensure CLAUDE.md and docs reflect actual current state

Step 4b — Stack-Specific Agents:
Based on each project's tech stack identified in Phase 1:
- TypeScript/React: react-build-resolver, ecc:react-reviewer, ecc:typescript-reviewer
- React Native: ecc:react-reviewer, ecc:typescript-reviewer
- Firebase/Cloud Functions: ecc:security-reviewer (Firestore rules), firebase skill
- Next.js: vercel:nextjs, vercel:react-best-practices
- Go: ecc:go-reviewer, ecc:go-build-resolver
- Python: ecc:python-reviewer
- (Add appropriate stack-specific agents for each project's detected stack)

Step 4c — Skills Matched to Launch Gaps:
For each gap found in Phase 3, identify the skill that addresses it:
- Payment not implemented → stripe:stripe-projects, stripe:stripe-best-practices
- No E2E tests → e2e-testing skill, mobile-e2e
- No CI → deployment-patterns, github skill
- Security gaps → security-review skill, firebase:firebase-security-rules-auditor
- No error tracking → error-tracking skill
- Product strategy unclear → recovery-app-go-to-market (or domain-appropriate equivalent)
- Documentation out of date → doc-organizer, doc-code-audit
- Tech debt needs triage → codebase-review skill, gsd-audit-milestone

Step 4d — Hooks for Launch Quality Gates:
Design hooks that enforce launch-quality standards automatically:
- PostToolUse: after edits to payment/auth code → run security-reviewer agent
- PostToolUse: after edits to test files → run tests automatically
- PostToolUse: after any code edit → run linter/formatter
- PreToolUse: block direct .env edits, enforce use of Secret Manager
- Stop: remind to run /code-review and /verify before closing session

Step 4e — MCP Servers:
Cross-reference discovered .mcp.json (from Phase 2) against launch needs:
- Already active: mark ACTIVE
- Missing but needed: mark RECOMMENDED with justification
- Common launch-critical servers: firebase, github, sentry, stripe, vercel, context7

Step 4f — CLAUDE.md Architecture:
- What platform-wide rules are missing from root CLAUDE.md?
- What per-project CLAUDE.md sections are absent but needed for launch?
- Cross-cutting policies that should be codified: secret management, PII, error logging,
  test coverage bar, launch definition of done

<thinking>
Think thoroughly. Consider multiple agent combinations for each vector. Prioritize by
leverage: which single agent unblocks the most launch progress? Rank recommendations
highest-leverage first. Do not recommend tools not justified by Phase 3 findings.
</thinking>

<phase_output>
PHASE 4 COMPLETE: Vector → agent mapping table. Per-project skill recommendations.
Hook specifications. MCP server recommendations. CLAUDE.md gaps.
</phase_output>

---

PHASE 5: DOCUMENT GENERATION

Generate the complete analysis document. Save as ANALYSIS.md in the repo root.
Do not include phase outputs or thinking tags in the final document.

---

# [Repo Name] — Launch Readiness & Claude Code Configuration Analysis

## Executive Summary

[3-5 sentences: what this repo is, overall launch readiness score (1–10) across all
four vectors, the single highest-leverage action to take this week, estimated
time-to-launch if all CRITICAL blockers are resolved]

---

## Part 1: Launch Readiness Assessment

### 1.1 Four-Vector Scorecard

| Vector | Score (1–10) | Status | Critical Blockers |
|--------|-------------|--------|-------------------|
| Monetization Readiness | | | |
| Product Completeness | | | |
| Prioritization Clarity | | | |
| Feature Readiness | | | |
| **OVERALL LAUNCH SCORE** | | | |

### 1.2 Pre-Launch Blocker List (All Vectors, Ranked)

| Rank | Vector | Severity | Blocker | Source | Effort |
|------|--------|----------|---------|--------|--------|
[CRITICAL blockers first, then HIGH, then MEDIUM]

### 1.3 Sprint-Ready Priority Queue

[Ordered list of work items for the launch sprint:
Tier 1 — Launch-Blocking (must complete)
Tier 2 — Revenue-Enabling (enables first payment)
Tier 3 — Quality-Improving (reduces launch risk)
Tier 4 — Post-Launch (explicitly deferred)]

---

## Part 2: Launch-Accelerating Agent Stack

### 2.1 Recommended Agents by Launch Vector

**Monetization Readiness Agents**
| Agent | Role | Justification |
|-------|------|---------------|
[Fill — cite Phase 3 finding that requires each agent]

**Product Completeness Agents**
| Agent | Role | Justification |
|-------|------|---------------|

**Prioritization Clarity Agents**
| Agent | Role | Justification |
|-------|------|---------------|

**Feature Readiness Agents**
| Agent | Role | Justification |
|-------|------|---------------|

### 2.2 Complete Agent Stack — Priority Order

[Single ordered list: which agent to activate first (highest launch leverage) through last]

---

## Part 3: Full Claude Code Configuration

### 3.1 Recommended Skills

| Skill | Launch Vector | When to Use | Justification |
|-------|--------------|-------------|---------------|

### 3.2 Recommended Hooks

| Hook Type | Trigger | Command | Launch Gate Enforced |
|-----------|---------|---------|---------------------|

### 3.3 Recommended MCP Servers

| Server | Status | Launch Vector | Justification |
|--------|--------|--------------|---------------|
[Mark each ACTIVE or RECOMMENDED]

### 3.4 CLAUDE.md Recommendations

[Root CLAUDE.md: what's missing, what to add]
[Per-project CLAUDE.md: gaps found, sections to add]

---

## Part 4: Repository Overview

### 4.1 Architecture & Structure
[Repo type, project count, stacks, integration topology]

### 4.2 Current State by Project
[Per-project: stack maturity, test signal, integrations present]

### 4.3 Future Desired State
[Per-project: from roadmap/docs — what is this project trying to become]

---

[FOR MONOREPOS: Repeat Parts 1–4 condensed per project below]

---

### Project: [Name]

**Stack:** [from discovery]
**Launch Score:** [1–10 across 4 vectors]

#### Pre-Launch Blockers
[CRITICAL/HIGH items only, with source citations]

#### Launch-Accelerating Agent Stack
[Project-specific top-5 agents with vector mapping]

#### Optimal Claude Code Configuration
[Project-specific skills, hooks, MCP servers, CLAUDE.md gaps]

---

[Repeat for each additional project]

---

## Appendix: Implementation Roadmap

### This Week (Launch-Blocking)
[Top 3 actions in order — what to do first and why]

### Next 30 Days (Revenue-Enabling + Quality)
[Next tier priorities]

### Post-Launch (Deferred)
[What was explicitly moved out of launch scope and why]

---

**Note:** All findings are grounded in files read during this analysis. Claims without
a source file citation should be treated as uncertain and verified independently.

---

Begin with Phase 1 now.
```
