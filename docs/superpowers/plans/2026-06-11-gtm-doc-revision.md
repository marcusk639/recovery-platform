# Plan — GTM Doc Revision (from Ecosystem-Validation Section 3)

**Date:** 2026-06-11
**Source:** `docs/research/2026-06-11-recovery-ecosystem-validation.md` §Section 3 (self-contained revision prompt)
**Evidence:** `docs/research/_work/verdicts.md` (24 adversarially-verified verdicts, 257 external URLs)
**Status:** ready to execute — **but every `docs/go-to-market/**` edit is gated on explicit human approval (see Phase 0).\*\*

> **One-line goal:** Apply the 24 research-backed corrections/softenings/flags to the GTM docs so the
> doc set stops asserting broken numbers, stale-vs-code statuses, and overstated framing — **without**
> changing the underlying strategy, and without touching product code.

---

## Scope & ground truth

- **24 revision targets**, each keyed by `claim_id` + file line-anchor. Counts: **9 CORRECT**, **11 SOFTEN**, **4 FLAG-WITH-CAVEAT**.
- Full per-item research rationale lives in the source deliverable Section 3 (lines 186–307) and `verdicts.md`. This plan re-states the **edit intent** inline so it is self-contained; consult the deliverable only for the "why."
- **On-disk GTM paths:** `regroup/docs/go-to-market/`, `homegroups/docs/go-to-market/`, `detox-recovery/docs/go-to-market/`; shared at `docs/go-to-market/_shared/` and `docs/go-to-market/ecosystem/`.
- Phases are clustered **by document** so the executor opens each file once and applies all its edits together. Order is CORRECT-bearing clusters first.

---

## Phase 0 — Preconditions & ground rules (do this before any edit)

1. **Human-approval gate (HARD).** The validation effort's constraint forbids editing `docs/go-to-market/**` without explicit human approval. For each phase, **propose the concrete diffs first** (show before/after per item) and get a go/no-go before writing. Do not batch-write across phases without approval.
2. **No strategy rewrites.** Correct facts, numbers, statuses, and framing only. Do not add new strategy, delete sections wholesale, or re-pitch.
3. **No product-code edits.** This is a docs-only task. In-repo code paths are cited as _evidence_ for status flips, not as edit targets.
4. **Single-SSOT principle.** Several items require reconciling a number to one source of truth (detox base case; ecosystem ARR ladder). When two docs disagree, pick the SSOT named in the item and make the other point to it or be marked superseded — never leave two live conflicting figures.
5. **Preserve the warning, fix the number.** For SOFTEN items the underlying concern is usually valid — temper the framing, keep the point.

**Gate:** Phase 0 read + the human-approval protocol acknowledged before Phase 1.

---

## Phase 1 — `docs/go-to-market/ecosystem/` cluster (the broken-numbers core)

Files: `ecosystem/monetization.md`, `ecosystem/vision.md`, `ecosystem/roadmap.md`.

| #   | claim_id   | action  | anchor                              | edit intent                                                                                                                                                                                  |
| --- | ---------- | ------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2   | ECO-PROJ-1 | CORRECT | `ecosystem/monetization.md:150-154` | Replace $1.74M/$7.84M headline with the **sum of the actual per-product ladders only** ($995,400 / $4,384,800); remove unbuilt-synergy uplift; add external reality-check footnote.          |
| 19  | ECO-PROJ-3 | SOFTEN  | `ecosystem/monetization.md:156-160` | Mark the Aftercare line **unbuilt**; exclude from base-case sum (carry as labeled upside only); reconcile to detox SSOT (DX-PROJ-Y3 = $139,250).                                             |
| 3   | ECO-PROJ-2 | CORRECT | `ecosystem/monetization.md:162-164` | Replace 8–15× with a defensible **3–5×** band; recompute off the corrected conservative Y3 ARR (~$5M, not $46M+); state the multiple doesn't apply to a solo bootstrapped pre-scale op.      |
| 18  | ECO-REG-2  | SOFTEN  | `ecosystem/monetization.md:100-132` | "sidesteps per-referral landmines" → "**reduces (does not eliminate)**"; note O-3 still needs the unbuilt dashboard to earn (clean-posture narrative partly aspirational).                   |
| 21  | ECO-REG-1  | FLAG    | `ecosystem/monetization.md:100-132` | Keep + **strengthen** the gate: caveat that O-1/O-2 are likely unsalvageable and review must be **specialized healthcare counsel** (EKRA + each state patient-brokering statute).            |
| 6   | ECO-MKT-1  | CORRECT | `ecosystem/vision.md:135-138`       | Re-label $143.62B as **combined behavioral-health** (or swap to a sourced narrow-SUD figure $2.3B–$41B); mark residence/served counts as modeled upper bounds; add a SAM paragraph.          |
| 9   | ECO-MKT-2  | CORRECT | `ecosystem/vision.md:66-67`         | Qualify 85% ("pooled; NIDA SUD-specific 40–60%") or swap to SUD figure; reframe 80% without the false-precision denominator; fix the misattributed citation.                                 |
| 8   | ECO-REG-3  | CORRECT | `ecosystem/vision.md:93-96`         | Correct FHIR date to **Jan 1 2027** + clarify it binds payers; downgrade ASAM to "Criteria framework broadly adopted; CONTINUUM software mandated in AZ"; drop vendor "30+ states."          |
| 7   | ECO-ROAD-2 | CORRECT | `ecosystem/roadmap.md:50,72`        | "not built" → "**built but unverified across the project boundary**"; replace build task with a verify/deploy task (fix URL to cad4b, set matching key, one smoke curl).                     |
| 13  | ECO-ROAD-1 | SOFTEN  | `ecosystem/roadmap.md:51-52,99-101` | Keep ECO-6/ECO-7 but add **42 CFR Part 2** to scope; add "solo-infeasible near-term; deferred until revenue funds it"; soften "highest-ACV unlock" → "highest-_potential_-ACV, unvalidated." |

**Verification:** every anchor above edited; ECO-PROJ-1 headline now equals the per-product ladder sum; no "$1.74M/$7.84M" or "8–15×" or "$143.62B substance-abuse" strings remain unqualified; FHIR date reads 2027.

---

## Phase 2 — `homegroups/docs/go-to-market/` cluster

Files: `homegroups/.../roadmap.md`, `homegroups/.../monetization.md`.

| #   | claim_id  | action  | anchor                                 | edit intent                                                                                                                                                                                            |
| --- | --------- | ------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | HG-ROAD-3 | CORRECT | `homegroups/.../roadmap.md:42,74-80`   | Flip HG-RM-3 `not_started` → **`built` (unsold)**; remove "(new)" on `FacilityDashboardPage.js`; reframe the gap as sales motion / BAA contracting / alumni density.                                   |
| 10  | HG-ROAD-2 | SOFTEN  | `homegroups/.../monetization.md:42-46` | "silent" → "**hard-fails loudly server-side**"; qualify "today" as "if default prices unset in live Dashboard (verify)"; "TOP BLOCKER" → "cheap config gap"; drop consumer-only-transacts implication. |
| 17  | HG-REG-3  | SOFTEN  | `homegroups/.../monetization.md:90-94` | Mark the $200–2,000 bracket as an **estimate (uncited)**; "flywheel stalls" → "may dampen word-of-mouth adoption"; clarify constraint is Tradition 6 affiliation, mitigated by admin-pays-for-a-tool.  |

**Verification:** HG-RM-3 status reads built/unsold and matches `homegroups/web/src/pages/FacilityDashboardPage.js`; no "silent" or "every checkout fails today" unqualified.

---

## Phase 3 — `regroup/docs/go-to-market/` + `_shared/` cluster

Files: `regroup/.../roadmap.md`, `regroup/.../project-management.md`, `docs/go-to-market/_shared/decisions-log.md`.

| #   | claim_id  | action | anchor                                                                      | edit intent                                                                                                                                                                                                  |
| --- | --------- | ------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 22  | RG-ROAD-2 | FLAG   | `regroup/.../roadmap.md:51`                                                 | Keep RG-RM-8 `blocked`. Caveat: necessary-but-not-sufficient (RG-RM-7 also required); note it is **operator config (minutes)**, not engineering.                                                             |
| 11  | RG-ROAD-1 | SOFTEN | `regroup/.../roadmap.md:50`                                                 | "gates ALL subscription revenue" → "gates the new six-tier flat-fee billing path"; pair with RG-RM-8 as co-gate; note `amountCents` is near-redundant.                                                       |
| 14  | RG-REG-2  | SOFTEN | `_shared/decisions-log.md:37` + `regroup/.../project-management.md:151-154` | Downgrade "launch-blocking" → "monitor; cheap self-serve mitigations"; remove "sign BAA with Stripe"; add free GCP BAA + 42 CFR Part 2 note; legal opinion "prudent, not a gate."                            |
| 24  | RG-REG-2  | FLAG   | `regroup/.../project-management.md:151-154`                                 | Add the **upmarket trigger** caveat: if a house bills insurance / does MAT / employs clinical staff / partners with a TC, it may become a covered entity pulling regroup in as a BA.                         |
| 15  | RG-REG-4  | SOFTEN | `regroup/.../project-management.md:48,131-136`                              | "live breach vector" → "latent exposure (private repos; no key material in scanned history)"; re-specify acceptance criterion to verify **GCP key rotation**, not just git cleanliness; keep rotation as P1. |

**Verification:** RG-RM-7 no longer claims to gate ALL revenue; D-12 reads "monitor," not "launch-blocking"; no "sign BAA with Stripe" instruction; acceptance criterion for keys mentions rotation.

---

## Phase 4 — `detox-recovery/docs/go-to-market/` + `_shared/pricing.md` + archived reconciliation

Files: `detox-recovery/.../monetization.md`, `detox-recovery/.../roadmap.md`, `docs/go-to-market/_shared/pricing.md`, archived `detox-recovery/docs/_archive/*`.

| #   | claim_id  | action  | anchor                                                                                                       | edit intent                                                                                                                                                                                                                         |
| --- | --------- | ------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4   | DX-MKT-4  | CORRECT | `detox-recovery/.../monetization.md:187-194`                                                                 | Correct "43 states" to the sourced figure (SAMHSA: 41 both / 48+DC either); remove solo-billing premise; re-label as **agency/fiscal-sponsor-contingent, mission/grant-adjacent — not a solo billing line.**                        |
| 5   | DX-PROJ-3 | CORRECT | `detox-recovery/.../monetization.md:136-139`                                                                 | Fix 51% → **47%** (8,500/18,063); reconcile to ONE base-case SSOT; supersede conflicting archived figures; keep the concentration warning.                                                                                          |
| 16  | DX-REG-3  | SOFTEN  | `detox-recovery/.../monetization.md:190-194`                                                                 | Keep cert-gate caution; remove "unlocks a solo VA revenue stream" (category error); align with the DX-MKT-4 agency/grant correction.                                                                                                |
| 12  | DX-PROJ-1 | SOFTEN  | `docs/go-to-market/_shared/pricing.md:66`                                                                    | Keep P50 but foreground the **P10 ($7,500) as the planning number**; caveat the P50 depends on 1–2 B2B closes with no solo comparable.                                                                                              |
| 23  | DX-ROAD-2 | FLAG    | `detox-recovery/.../roadmap.md:35,39-45`                                                                     | Keep revenue-leak flag; **code-state caveat:** PDFs render live dead-link buy buttons (no `availability:"coming-soon"`) — "hide the links" is more urgent than implied; IAP/MoR sub-point is a red herring (NextStep is a website). |
| 20  | DX-PROJ-1 | SOFTEN  | archived `detox-recovery/docs/_archive/financial-model.md:76-83` & `financial-projections-2026-05-24.md:194` | Supersede/delete the conflicting archived Y1 base cases ($13,454/41%; 18%) so no reader can cite three; point all to one SSOT.                                                                                                      |

**Verification:** detox Y1 concentration reads 47% from one SSOT; no "43 states" solo-billing claim; archived conflicting base cases superseded; pricing.md foregrounds P10 for planning.

---

## Phase 5 — Cross-doc consistency & close-out

1. **SSOT sweep:** grep the GTM tree for the old broken strings to confirm none survive unqualified: `$1.74M`, `$7.84M`, `8–15×`/`8-15x`, `$46M`, `$87M`, `43 states`, `51%` (detox), `$143.62B` (as "substance-abuse"), `not_started` for HG-RM-3 / ECO-5 caller.
2. **One-number rule:** confirm detox Y1 base case and ecosystem ARR each resolve to a single figure across all docs that mention them.
3. **Link integrity:** run the existing link check; zero broken anchors introduced.
4. **Scope guard:** `git diff --stat` shows changes ONLY under `**/docs/go-to-market/**` (+ this plan); zero product-code files touched; zero `docs/research/**` edits.
5. **Coverage:** all 24 items from Section 3 addressed (9 corrected, 11 softened, 4 flagged) — check each claim_id off.

**Verification checklist:**

- [x] All 24 claim_ids edited per their action; none skipped without a stated reason.
- [x] No broken-number string survives the Phase 5 grep sweep.
- [x] Each reconciled number resolves to one SSOT across the doc set.
- [x] `git diff` touches only GTM docs (+ this plan + sanctioned item-20 archive banners); no code, no research files.
- [x] Human approval obtained per phase before writes.

---

## Anti-pattern guards

- **Do NOT** edit product code — status flips are doc-only; cited code paths are evidence.
- **Do NOT** invent replacement numbers — use the sourced figures from `verdicts.md` / Section 3; where a precise external number isn't available, qualify rather than fabricate.
- **Do NOT** soften a CORRECT item into vagueness — broken numbers get fixed to the right number or clearly re-labeled, not hand-waved.
- **Do NOT** delete the underlying concern on SOFTEN items — temper framing, keep the point.
- **Do NOT** write any `docs/go-to-market/**` edit without the per-phase human go-ahead (Phase 0 gate).

## Execution order summary

1. Phase 0 — preconditions + approval protocol
2. Phase 1 — ecosystem/ cluster (broken-numbers core: 10 items)
3. Phase 2 — homegroups/ cluster (3 items)
4. Phase 3 — regroup/ + \_shared/ cluster (5 items)
5. Phase 4 — detox-recovery/ + pricing + archived reconciliation (6 items)
6. Phase 5 — cross-doc SSOT sweep + close-out

Resume prompt: _"Read `docs/superpowers/plans/2026-06-11-gtm-doc-revision.md` and execute it. Propose diffs per phase and stop for my approval before writing any `docs/go-to-market/**` file."_
