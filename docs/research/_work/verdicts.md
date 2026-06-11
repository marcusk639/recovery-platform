# Verdicts — Recovery Ecosystem Validation (Stage 2 — Deep Research)

Generated 2026-06-11 from Phase 3 anti-optimism research workflow (run `wf_fea81111-0f1`).
Per approved claim: a research agent (steelman + steelman-against, external sourcing) followed by an
independent adversarial skeptic. Verdicts ∈ {validated, weak, broken, insufficient-evidence}.

## Run metadata

- **Claims researched:** 24 / 24 approved
- **Agents:** 48 (24 research + 24 verify)
- **Workflow output tokens:** 597,829 (workflow agents only; excludes orchestrator)
- **Verdict distribution:** broken=3, validated=6, weak=15
- **Adjusted by skeptic (verify changed research verdict/confidence):** 10 — HG-ROAD-3, ECO-MKT-2, ECO-ROAD-2, DX-PROJ-3, ECO-REG-2, HG-ROAD-2, RG-REG-4, RG-ROAD-1, DX-REG-3, RG-REG-1
- **Verify-stage failures (fell back to research verdict):** 0 — none

## Verification gate results

- Quantitative claims (market/pricing/projection) lacking an external `http` source: **none** ✅
- Market/pricing/projection claims with no named comparable: **none** ✅

## Summary table

| rank | claim_id | product | dimension | research→final | confidence | adj? | #ext src |
| ---- | -------- | ------- | --------- | -------------- | ---------- | ---- | -------- |
| 1 | ECO-THE-3 | ecosystem | thesis | validated | high | — | 11 |
| 2 | HG-THE-3 | homegroups | thesis | validated | high | — | 10 |
| 3 | ECO-REG-1 | ecosystem | regulatory | validated | high | — | 11 |
| 4 | ECO-ROAD-1 | ecosystem | roadmap | weak | medium | — | 3 |
| 5 | HG-ROAD-3 | homegroups | roadmap | validated→broken | high | yes | 13 |
| 6 | DX-PROJ-1 | detox-recovery | projection | weak | medium | — | 14 |
| 7 | ECO-MKT-2 | ecosystem | market | validated→weak | medium | yes | 9 |
| 8 | ECO-ROAD-2 | ecosystem | roadmap | weak | medium | yes | 6 |
| 9 | DX-PROJ-3 | detox-recovery | projection | weak | low | yes | 5 |
| 10 | ECO-MKT-1 | ecosystem | market | weak | high | — | 13 |
| 11 | ECO-PROJ-1 | ecosystem | projection | broken | high | — | 4 |
| 12 | ECO-PROJ-2 | ecosystem | projection | weak | high | — | 6 |
| 13 | ECO-REG-2 | ecosystem | regulatory | validated | medium | yes | 10 |
| 14 | HG-ROAD-2 | homegroups | roadmap | validated→weak | medium | yes | 6 |
| 15 | RG-REG-2 | regroup | regulatory | weak | medium | — | 17 |
| 16 | RG-REG-4 | regroup | regulatory | validated→weak | medium | yes | 9 |
| 17 | RG-ROAD-1 | regroup | roadmap | weak | medium | yes | 7 |
| 18 | RG-ROAD-2 | regroup | roadmap | validated | high | — | 3 |
| 19 | DX-MKT-4 | detox-recovery | market | broken | high | — | 16 |
| 20 | DX-REG-3 | detox-recovery | regulatory | weak | low | yes | 13 |
| 21 | ECO-REG-3 | ecosystem | regulatory | weak | high | — | 12 |
| 22 | RG-REG-1 | regroup | regulatory | weak | medium | yes | 17 |
| 23 | HG-REG-3 | homegroups | regulatory | weak | medium | — | 12 |
| 24 | DX-ROAD-2 | detox-recovery | roadmap | validated | medium | — | 14 |

---

## Per-claim verdicts

### 1. ECO-THE-3 — ecosystem / thesis

**Assertion:** ASAM-continuum moat asserted; the network-effect thesis is unrealized in code — the referral bus has zero live producers/consumers.

**Stated source (internal):** `#665 + docs/go-to-market/ecosystem/vision.md:29-34`

**Verdict:** `validated` · **confidence:** `high` · research verdict was `validated`/`high` · skeptic adjusted: no

**Confidence reason:** The code-state half is directly verifiable in-repo (and the claim is if anything understated). The external half — that a referral/care-continuum network is worth nothing until the network exists, and that network-building (not the code) is the binding constraint — is confirmed by a decade-long UCSF/SIREN field study, the canonical real comparable (Unite Us), and the cold-start/critical-mass literature. Multiple independent external sources with real URLs converge; nothing contradicts.

**Final rationale (post-skeptic):** Both halves of the claim survive independent scrutiny. CODE-STATE (verified in-repo by me): the referral bus has zero live producers and zero live consumers. recovery-api/src/callable/referrals.ts exposes createReferral/getReferrals/getReferral, but the only wired producer is detox-recovery/app/api/contact/route.ts, and its fireReferral() short-circuits to a no-op when RECOVERY_API_URL/RECOVERY_API_KEY are unset (the code comments confirm these are 'intentionally inactive in production... commented out in apphosting.yaml pending the partner agreement'). My grep found NO referral integration in homegroups or regroup, and NO file anywhere consumes getReferrals/getReferral outside the API definition itself. So the network-effect/ASAM-continuum thesis exists only in docs, not running code — the claim is if anything understated. EXTERNAL REALISM (verified live): UCSF SIREN explicitly finds the binding constraint for technology-enabled closed-loop social-care referral networks is organizational adoption — engaged champions, buy-in, training, and 'network adequacy' — NOT the software, directly supporting 'thesis unrealized because no live network.' Unite Us, the canonical real comparable, raised ~$230-241M (PitchBook/Crunchbase/Tracxn), hit a $1.6B valuation, and runs 473-540 employees — funded-team, salesforce-intensive scale, unreachable by a part-time bootstrapped solo founder. (The research cited ~$196M, an understatement; actual figures are higher, which only strengthens the claim.) Cold-start dynamics (network below critical mass ~ zero value) and 42 CFR Part 2 (a real SUD-records statute) are correctly invoked. SOLO CONSTRAINT does not break the verdict — it reinforces it, since the zero-progress part (network-building) is precisely the part that requires funded-team scale. The claim narrowly asserts a falsifiable code-state fact plus well-supported realism; it does not over-claim eventual strategy success. Verdict survives unchanged.

<details><summary>Research-stage rationale</summary>

The claim has two parts, both of which hold. (1) Code-state (given, and verified in-repo): the referral bus genuinely has zero live producers and zero live consumers. recovery-api exposes createReferral/getReferrals/getReferral, but only detox-recovery wires a producer call (detox-recovery/app/api/contact/route.ts), and it is env-gated behind RECOVERY_API_URL/RECOVERY_API_KEY which the docs state are 'intentionally unset in production' (detox-recovery/docs/technical/architecture.md:121, apphosting.yaml). homegroups and regroup have no referral integration at all, and no product consumes referrals. So the network-effect/ASAM-continuum thesis exists only in docs/go-to-market/ecosystem/vision.md, not in running code. (2) External realism: a two-sided referral network produces zero value below critical mass (Andrew Chen, The Cold Start Problem), and for closed-loop social/behavioral-health referral networks specifically, a decade-long UCSF/SIREN field study found the binding constraint is NETWORK adoption and 'network adequacy' — organizational buy-in, champions, training across sectors — not the referral technology itself. The canonical real comparable, Unite Us, needed ~$196M raised, a $1.6B peak valuation, and 500-1000 employees (largely boots-on-the-ground network-building) over ~8 years to assemble such a network. None of that is reachable by a part-time, bootstrapped solo founder. Additionally, an SUD-specific regulatory barrier (42 CFR Part 2) imposes consent and data-segmentation requirements on any 'software that follows the patient across levels of care,' making the data-continuum version of the moat harder than a generic referral network. Net: the moat is asserted, not built; calling it a moat today is a category error — it is at best a future aspiration whose hard part (the network) is precisely the part with zero progress.

</details>

**Steelman (claim true/achievable):** The thesis is directionally real and defensible as a long-run aspiration. Care fragmentation across the ASAM continuum is a genuine, documented problem (National Council 'Filling the Gaps in SUD Care Coordination'; IOM 'Coordinating Care'), and incumbents (Kipu, Sunwave) really do stop at discharge, so the white space is real. The operator already owns three products sitting at distinct continuum stages plus a shared API with the referral primitives built — so the rails exist and the cost to flip on the first producer is low (one env var in detox-recovery). A single live producer→consumer path (detox referral → regroup or homegroups intake) is a modest solo-buildable increment, and even a non-network 'suite' story (three products, one login, one referral handoff) can have value without classic two-sided network effects. The claim concedes all this — it only says the moat is currently unrealized in code, which is a fair, falsifiable, and fixable status statement rather than a death sentence.

**Steelman-against (disconfirming case):** The claim could be called too generous to the underlying strategy. A 'network effect' across a care continuum is not just unrealized — it may be the wrong moat for this operator entirely. Unite Us, with ~$196M and ~1000 staff over ~8 years, is the existence proof that closed-loop referral networks are a capital- and salesforce-intensive business, and UCSF/SIREN's decade of evidence says the hard part is human network adoption, not code — exactly the part a part-time bootstrapped solo founder cannot staff. 42 CFR Part 2 adds an SUD-specific consent/data-segmentation hurdle to the 'follow the patient' data-pipeline version. And the network here is structurally thin: referrals only flow one direction down the continuum (detox→sober-living→12-step), with low repeat volume per user and no clear pricing capture on the handoff, so even a working bus may never generate defensible lock-in. Under that reading the verdict on the broader strategy is closer to 'weak/broken'; the claim survives as 'validated' only because it narrowly asserts the code-state fact, not the strategy's eventual success.

**Comparables:**

- Unite Us — canonical closed-loop social/behavioral-health referral network; raised ~$196M, ~$1.6B peak valuation, 500-1000 employees over ~8 years to build the network. Proves network-building, not the referral code, is the cost driver — and that it is funded-team-scale, not solo-bootstrap-scale.
- UCSF SIREN — decade-long field study of technology-enabled closed-loop referral networks; found the binding success factors are engaged champions, cross-sector organizational buy-in, training, and 'network adequacy' — i.e., adoption, not the platform. Directly supports 'thesis unrealized because no live network.'
- National Council for Mental Wellbeing ('Filling the Gaps in SUD Care Coordination') — documents that SUD care coordination is hindered by misaligned incentives and lack of standardization; validates the problem exists but is structurally hard, not a software-only fix.
- Andrew Chen, 'The Cold Start Problem' — two-sided networks below critical mass capture ~zero value and bear full cost; formalizes why zero live producers/consumers means the moat does not yet exist.
- 42 CFR Part 2 (Confidentiality of SUD Patient Records) — federal rule requiring consent and data segmentation for SUD treatment/referral records; a real regulatory barrier to any cross-product 'software follows the patient' data continuum.

**Sources:**

- https://sirenetwork.ucsf.edu/tools-resources/resources/social-care-best-practices-learnings-technology-enabled-closed-loop
- https://getlatka.com/companies/unite-us
- https://www.fiercehealthcare.com/tech/health-tech-startup-building-social-care-networks-and-it-just-reached-unicorn-status
- https://tracxn.com/d/companies/uniteus/__gCIwlL55jxRK0MLV5dLyv8BxiSeSTLJYJzarShzBH9k
- https://www.thenationalcouncil.org/filling-the-gaps-in-sud-care-coordination/
- https://andrewchen.com/wp-content/uploads/2022/01/ColdStartProb_9780062969743_AS0928_cc20_Final.pdf
- https://www.ecfr.gov/current/title-42/chapter-I/subchapter-A/part-2
- https://pmc.ncbi.nlm.nih.gov/articles/PMC5441679/
- https://www.crunchbase.com/organization/unite-us
- https://pitchbook.com/profiles/company/58448-17
- https://tracxn.com/d/companies/unite-us/__gCIwlL55jxRK0MLV5dLyv8BxiSeSTLJYJzarShzBH9k

---

### 2. HG-THE-3 — homegroups / thesis

**Assertion:** Referral bus has zero live producers/consumers — the network thesis is unbuilt in code; if no app emits/consumes, the moat is aspirational.

**Stated source (internal):** `#665 + homegroups/docs/go-to-market/monetization.md:219-224`

**Verdict:** `validated` · **confidence:** `high` · research verdict was `validated`/`high` · skeptic adjusted: no

**Confidence reason:** Code state is directly verifiable and unambiguous (I read the actual files); the business-consequence half rests on a well-established external framework (Andrew Chen / a16z Cold Start Problem) plus named funded comparables and a real federal statute. The only thing capping certainty is that "moat is aspirational" is partly a definitional/strategic judgment, not a measurable quantity — but every component that can be checked, checks out.

**Final rationale (post-skeptic):** Independently confirmed the load-bearing code-state half: recovery-api/src/callable/referrals.ts is a 116-line callable; its only producer detox-recovery/app/api/contact/route.ts fireReferral() returns early when RECOVERY_API_URL/RECOVERY_API_KEY are unset, with an explicit comment "Intentionally inactive in production... the env vars stay commented out in apphosting.yaml pending the partner agreement, so this no-ops"; grep finds ZERO getReferrals consumers in any app source (homegroups/regroup/detox, excluding .next artifacts). Confirmed the homegroups/mobile/src/store/slices/referralSlice.ts callables are getReferralStats/generateReferralCode/applyReferralCode — homegroups' OWN in-app viral-invite-code feature on its own Firebase project, NOT the cross-app bus (the domain-vocabulary collision root CLAUDE.md warns about). So the network-thesis bus is genuinely unbuilt-in-use. External sources verified real and on-point: a16z Cold Start Problem page (Andrew Chen network-effects framework), AHLA EKRA bulletin (18 U.S.C. 220 confirmed all-payor incl. private pay, active enforcement of per-referral fee schemes), Bamboo Health (confirmed real, large-scale behavioral-health referral network — OpenBeds/Bamboo Bridge, 1B encounters/yr, PE-backed). The SOLO/part-time/bootstrapped constraint reinforces rather than breaks the verdict: funded multi-year comparables show a durable referral-network moat is a capital-intensive bar, and hand-brokering referrals ("do things that don't scale") is not a code-level moat. This is a qualitative/strategic verdict (not quantitative), and it still clears the sourcing gate with multiple real external URLs. The only residual softness is the definitional word "aspirational," already accounted for. Verdict survives intact.

<details><summary>Research-stage rationale</summary>

CODE STATE (verified, treated as given but independently confirmed): The cross-app referral bus exists in recovery-api as a 116-line callable (recovery-api/src/callable/referrals.ts: createReferral/getReferrals/getReferral). It has ZERO live producers and ZERO live consumers. The single wired producer is detox-recovery/app/api/contact/route.ts fireReferral(), which is EXPLICITLY disabled in production — the code comment states "Intentionally inactive in production: the env vars stay commented out in apphosting.yaml pending the partner agreement, so this no-ops" and returns early when RECOVERY_API_URL/RECOVERY_API_KEY are unset. No product app calls getReferrals to consume bus referrals (grep across homegroups/regroup/detox app source: zero hits outside .next build artifacts). NOTE one nuance that strengthens, not weakens, the claim: homegroups/mobile/src/store/slices/referralSlice.ts DOES call httpsCallable('getReferralStats'/'generateReferralCode'/'applyReferralCode') — but these are homegroups' OWN in-app viral invite codes running on its own Firebase functions, a DIFFERENT 'referral' concept from the cross-app bus (the exact domain-vocabulary collision the root CLAUDE.md warns about). So the network-thesis bus is genuinely unbuilt-in-use. EXTERNAL REALISM of the business consequence: The Cold Start Problem framework (Andrew Chen, a16z) is explicit that network effects produce zero defensibility until at least one 'atomic network' is live and transacting; an un-emitting bus is, by that framework, a pre-network with no moat — exactly 'aspirational.' The canonical prescription ('do things that don't scale' — manually wire the first referrals by hand, not via code) means the SOLO-FOUNDER feasibility of *lighting up* the bus is reasonable (a hand-operated referral between two of his own apps is a days-of-work task, not a funded-team task), but feasibility of building it does not rebut the claim that today it is unbuilt-in-use. Real comparables that DID build defensible recovery/behavioral-health referral networks (Bamboo Health/Bamboo Bridge, Kyruus, NeuroFlow, the former PatientPing) are all venture- or PE-funded multi-year efforts — evidence that a *durable* referral-network moat is a high bar reached by capitalized teams, not a free byproduct of shipping a callable. REGULATORY: EKRA (18 U.S.C. 220) is a live, under-appreciated threat to ever *monetizing* this bus. It is an all-payor (incl. private and cash-pay) federal criminal prohibition on paying/receiving value for referrals to recovery homes and treatment facilities, with active 2025 enforcement (multiple guilty pleas, a six-year sentence, Ninth Circuit US v. Schena upholding conviction and extending liability to marketing intermediaries paid per-referral). This doesn't make the claim false — it reinforces that any referral 'moat' attaching fees to referrals is fragile/legally constrained, i.e. the easy monetization path is partly closed. Net: the claim is accurate on code-state and correct on the strategic consequence — until an app emits and another consumes, the network thesis is unrealized and the moat is aspirational.

</details>

**Steelman (claim true/achievable):** The bus is concretely unbuilt-in-use: the only producer is hard-disabled by commented-out env vars 'pending the partner agreement,' and no app consumes referrals. Per the Cold Start Problem (Andrew Chen/a16z), a network effect contributes zero defensibility until a live atomic network exists; a callable that nobody calls is infrastructure, not a network. The 'continuity-of-care across the ASAM continuum' moat that the monetization doc leans on as the venture-scale path is therefore entirely prospective. Funded incumbents (Bamboo Health, Kyruus, NeuroFlow) show that a defensible referral network takes years and capital — so for a part-time, bootstrapped solo founder, claiming a moat from an inert bus is the textbook 'aspirational moat.' The claim is true.

**Steelman-against (disconfirming case):** The bus IS fully coded (116-line callable, app-id registry, service auth), and one producer is wired and one line of config away from emitting — so 'unbuilt in code' overstates it; it's built-but-dark, not absent. Cold Start theory also says the right move is to NOT automate early ('do things that don't scale'): a solo founder can hand-broker the first cross-app referrals between his own three apps without any moat depending on code at all, so the network thesis can be true while the bus stays dormant. And the moat the docs actually claim is data continuity + being the only player spanning all three ASAM phases — a positioning/distribution moat that doesn't strictly require automated referral volume to begin accruing. By that reading, 'the moat is aspirational' is an overstatement of a soluble, near-term gap rather than a structural flaw.

**Comparables:**

- Bamboo Health (Bamboo Bridge behavioral-health referral network) — PE/venture-backed, multi-year build; cited 80-day referral delays cut to weeks, 5x first-appointment show rate — shows the bar for a working referral network is high and capital-intensive
- Kyruus Health — funded provider search/referral platform; demonstrates referral-network defensibility is a years-long, funded effort
- NeuroFlow — launched a behavioral-health referral network with an initial provider cohort, illustrating the 'seed one atomic network first' pattern from a funded position
- PatientPing (now part of Bamboo Health) — care-coordination/referral network that required scale and capital to reach network effects
- Andrew Chen / a16z 'The Cold Start Problem' — framework establishing that network-effect moats are zero until a live atomic network transacts; directly supports 'no emit/consume = aspirational moat'
- EKRA (18 U.S.C. 220) enforcement, incl. US v. Schena (9th Cir.) and 2025 guilty pleas/six-year sentence — real statute + enforcement showing a paid recovery-referral mechanism is a federal crime, constraining monetization of any such bus

**Sources:**

- https://a16z.com/books/the-cold-start-problem/
- https://www.sachinrekhi.com/p/andrew-chen-the-cold-start-problem
- https://caminmccluskey.medium.com/book-summary-the-cold-start-problem-andrew-chen-25f61f4d66b
- https://bamboohealth.com/
- https://bamboohealth.com/blog/2022/01/28/a-summary-of-our-2021-annual-impact-report/
- https://www.neuroflow.com/neuroflow-launches-a-comprehensive-referral-network-to-meet-demand-for-behavioral-health-care/
- https://kyruushealth.com/new-physician-referral-report-identifies-top-barriers-to-patient-retention-and-care-coordination-within-health-system-networks/
- https://www.healthlawdiagnosis.com/2026/02/eliminating-kickbacks-in-recovery-act-2025-updates-and-looking-to-2026/
- https://www.americanhealthlaw.org/content-library/publications/bulletins/49b5f30c-d8fa-4df0-8090-cc3f64e9f801/ekra-convictions-send-message-about-enforcement-an
- https://www.insidethefalseclaimsact.com/the-eliminating-kickbacks-in-recovery-act-an-unprecedented-expansion-of-anti-kickback-liability-to-private-pay-referrals/

_Non-URL source notes:_ file:///Users/marcus/dev/recovery-platform/recovery-api/src/callable/referrals.ts; file:///Users/marcus/dev/recovery-platform/detox-recovery/app/api/contact/route.ts; file:///Users/marcus/dev/recovery-platform/homegroups/mobile/src/store/slices/referralSlice.ts

---

### 3. ECO-REG-1 — ecosystem / regulatory

**Assertion:** D-10 referral-monetization OPEN; any per-referral money movement (O-1/O-2) must clear anti-kickback / patient-brokering legal review before the relay is enabled.

**Stated source (internal):** `docs/go-to-market/ecosystem/monetization.md:100-132`

**Verdict:** `validated` · **confidence:** `high` · research verdict was `validated`/`high` · skeptic adjusted: no

**Confidence reason:** This is a regulatory-gating claim ("must clear legal review before enabling"), not a quantitative market projection. Multiple independent external sources — including a state statute's text, federal health-law bulletins documenting actual EKRA convictions, and provider-side compliance guides — converge that paying/receiving money per referral to recovery homes and clinical treatment facilities is a federal crime under EKRA (18 U.S.C. 220) plus state patient-brokering felonies. The claim only asserts a legal review is required, which is the conservative and correct posture; that is squarely supported.

**Final rationale (post-skeptic):** I independently opened the load-bearing sources and they hold up. (1) Cornell LII (law.cornell.edu/uscode/text/18/220) confirms the EKRA prohibition text — remuneration "in return for referring a patient or patronage to a recovery home, clinical treatment facility, or laboratory" — and that the bona-fide-employee exception specifically bars compensation that varies by "the number of individuals referred." That directly criminalizes the O-1 (per-accepted-referral fee) and O-2 (conversion rev-share) mechanics. (2) Bricker confirms EKRA is ALL-PAYER (private and cash-pay, not just federal reimbursement) with penalties up to $200,000 and 10 years per occurrence — closing the "we touch no federal money" escape that a bootstrapped consumer app would otherwise rely on. (3) Independent search confirms DOJ enforcement is real (multiple guilty pleas; $5k-$10k/patient referral schemes), so this is enforced law, not theoretical. (4) FL 817.505 (leg.state.fl.us) confirms a parallel state felony layer reaching recovery residences/treatment providers, with escalating felony tiers up to a $500k fine.

The claim is the CONSERVATIVE posture — it only asserts that per-referral money movement must clear legal review before the relay is enabled. The skeptical disconfirming angle (does this product's edges — peer 12-step homegroups, possibly non-clinical sober-living, a consumer detox-navigation app — actually touch EKRA-"covered entities," which are clinical terms?) is real but cuts FOR the claim: resolving that fact-specific ambiguity IS the legal review the claim mandates, and FL 817.505 explicitly reaches recovery residences regardless. The SOLO part-time bootstrapped constraint does not break the verdict; it strengthens it — a founder with no in-house counsel, with recovery-api itself as the entity moving the money via Stripe, is personally exposed to per-occurrence federal felony liability, making the gate more necessary, not less. The SOURCING GATE / "achievable by funded team" deflators target optimistic quantitative projections; this is a non-quantitative regulatory gate that external statute and enforcement records make MORE solid. No downgrade warranted. If anything the claim understates risk: O-2 may be unsalvageable and the review should be specialized healthcare counsel covering EKRA plus every applicable state patient-brokering statute.

<details><summary>Research-stage rationale</summary>

The claim asserts that any per-referral money movement (O-1 flat per-referral fee, O-2 rev-share on a converted referral) must clear anti-kickback / patient-brokering legal review before the recovery-api referral relay is enabled. External law strongly validates this as a real, hard gate — arguably the doc understates the risk.

1) EKRA (Eliminating Kickbacks in Recovery Act of 2018, 18 U.S.C. 220, part of the SUPPORT Act) is a FEDERAL CRIMINAL statute that prohibits knowingly and willfully soliciting/receiving/offering/paying "any remuneration (including any kickback, bribe, or rebate)" in return for referring a patient to a "recovery home, clinical treatment facility, or laboratory." Penalty: up to $200,000 fine and up to 10 years imprisonment PER OCCURRENCE (multiple sources, incl. chapmanlawgroup, behavehealth, AHLA bulletin).

2) Critically, EKRA is ALL-PAYER — it reaches private insurance AND cash/self-pay, unlike the federal Anti-Kickback Statute (42 U.S.C. 1320a-7b), which is limited to federally reimbursed services (Medicare/Medicaid). This is the key reason the internal doc's instinct is correct: even if the recovery platform's referred users are private/cash-pay (as they would be on a bootstrapped consumer app), EKRA still applies. The "we don't touch federal money so AKS doesn't reach us" loophole is closed by EKRA (addictionhelp.com, chapmanlawgroup).

3) The mechanic maps directly onto the prohibition. O-1 ("flat per-referral fee... per accepted referral") and O-2 ("% of the first paid transaction the referred user makes") are textbook examples of what provider compliance guidance calls illegal: "If any company — a call center, a directory, a marketer, or a 'helpline' — prices their services based on the number of admissions you get, it is almost certainly an illegal kickback under EKRA" and "'Cost-per-lead' models where leads are verified, admissible patients" are illegal (addictionhelp.com). O-2's conversion-based rev-share is even more clearly remuneration "in return for referring" because it pays only on a realized admission/transaction.

4) EKRA is ENFORCED, not theoretical. DOJ has obtained guilty pleas and convictions; the AHLA bulletin documents a New Jersey scheme where treatment facilities paid a marketing company $5,000-$10,000 per privately insured patient referral (with bonuses for longer stays) — exactly the per-referral structure — resulting in EKRA guilty pleas. EKRA's bona-fide-employee exception even bars compensation that varies by "the number of individuals referred" — i.e., the statute specifically forbids volume-based referral pay.

5) State patient-brokering statutes add a parallel, independent criminal layer. Florida 817.505 (the most aggressively enforced, via the Palm Beach County Sober Homes Task Force) makes paying/receiving any commission/benefit/kickback for patient referral to/from a recovery residence or treatment provider a felony; North Carolina (Class G felony for "anything of value... to induce the referral") and Georgia (2021) have analogous statutes. So the relay could be lawful federally yet still a state felony depending on operator/referred-user location.

6) Ecosystem precedent confirms the risk is live: in 2017-2018 Google BANNED all addiction-treatment ads, then reinstated them only behind LegitScript certification, precisely because patient-brokering/lead-selling abuse had overrun the digital referral market. The entire digital-referral channel for this vertical is regulatorily gated.

For a SOLO bootstrapped founder this matters acutely: a single misconfigured per-referral charge is a per-occurrence federal felony exposure with no in-house counsel to catch it, and the platform itself (recovery-api as the entity moving the money via Stripe Invoices) would be the payer/payee in the prohibited transaction. The doc's own recommendation to favor O-3 (flat B2B software seat, not metered per referral) and gate O-1/O-2 behind legal review is the correct and necessary mitigation. The claim is validated; if anything it should be hardened from "legal review" to "specialized healthcare counsel review of EKRA + every applicable state patient-brokering statute, with O-2 likely unsalvageable."

</details>

**Steelman (claim true/achievable):** The gate is real and the doc's caution is correct. EKRA (18 U.S.C. 220) is a federal criminal, all-payer statute that on its face criminalizes paying or receiving remuneration "in return for referring a patient" to a recovery home or clinical treatment facility, carrying up to $200k and 10 years per occurrence. O-1 (per-accepted-referral fee) and O-2 (rev-share on the referred user's first paid transaction) are precisely the volume/conversion-tied remuneration the statute and its narrow employee exception forbid. DOJ has actually convicted defendants for per-referral payment schemes ($5k-$10k/referral, NJ case), so this is enforced law, not a hypothetical. Layered on top are state patient-brokering felonies (FL 817.505, NC, GA) that apply even where EKRA might not, and the 2017-18 Google ad ban / LegitScript regime shows the entire digital-referral channel is regulatorily gated. Requiring legal clearance before switching on any per-referral money movement is the minimum prudent posture; folding referrals into a flat software seat (O-3) to sidestep the metered-referral optics is exactly what compliance guidance recommends.

**Steelman-against (disconfirming case):** A skeptic could argue the gate is overstated for this specific product. EKRA's covered entities are "recovery homes, clinical treatment facilities, and clinical laboratories" — defined around clinical/medical substance-use treatment. This platform's referral originators/targets are 12-step homegroups (peer fellowships, not treatment facilities), sober-living houses (which may or may not meet "recovery home" if non-clinical), and a consumer detox-navigation app — so whether a given referral edge actually touches an EKRA-covered entity is fact-specific, and some edges (e.g., homegroups-to-sober-living for a non-clinical bed) might fall outside EKRA entirely, needing only state-law review. There are also lawful structures: a flat fee untethered to referral volume, fair-market-value marketing/SaaS fees, and the bona-fide-employee/personal-services exceptions can permit money to move. So the absolute statement "ANY per-referral money movement must clear legal review" is, strictly, broader than EKRA requires — a flat directory-listing fee or O-3 seat arguably needs lighter review. But this cuts toward the claim, not against it: the cure for that ambiguity is exactly the legal review the claim mandates, and the genuinely dangerous options (O-1, O-2) are unambiguously in scope.

**Comparables:**

- EKRA / 18 U.S.C. 220 (Eliminating Kickbacks in Recovery Act of 2018, part of the SUPPORT Act) — federal, all-payer criminal anti-kickback statute covering recovery homes and clinical treatment facilities; up to $200k + 10 yrs per occurrence
- DOJ EKRA enforcement — New Jersey scheme where treatment facilities paid a marketing company $5,000-$10,000 per privately-insured patient referral (bonuses for longer stays); facility owner (Dr. Mohammad) and marketers pleaded guilty (per AHLA bulletin)
- Florida Statute 817.505 (patient brokering) — felony to pay/receive commission/benefit/kickback for referral to/from recovery residence or treatment provider; enforced by Palm Beach County Sober Homes Task Force
- North Carolina patient-brokering statute — Class G felony to pay/receive 'anything of value' to induce a referral (NC SOG criminal-law blog)
- Georgia patient-brokering statute (effective July 1, 2021) — prohibits remuneration for substance-abuse patient referrals (McGuireWoods alert)
- Google addiction-treatment ad ban (2017-2018) + LegitScript certification gate — the digital-referral channel for rehab was shut down and re-gated specifically because of patient-brokering / lead-selling abuse
- Federal Anti-Kickback Statute (42 U.S.C. 1320a-7b) — contrast: limited to federally-reimbursed services, which is why EKRA was enacted to close the private/cash-pay gap

**Sources:**

- https://www.chapmanlawgroup.com/practice_areas/ekra-law-eliminating-kickbacks-in-recovery-act/
- https://www.americanhealthlaw.org/content-library/publications/bulletins/49b5f30c-d8fa-4df0-8090-cc3f64e9f801/ekra-convictions-send-message-about-enforcement-an
- https://behavehealth.com/glossary/ekra
- https://www.addictionhelp.com/for-providers/avoiding-patient-brokering/
- https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0800-0899/0817/Sections/0817.505.html
- https://nccriminallaw.sog.unc.edu/2024/10/07/what-is-patient-brokering/
- https://www.mcguirewoods.com/client-resources/alerts/2021/7/new-georgia-statute-prohibits-patient-brokering-for-substance-abuse-providers/
- https://soberlawnews.com/breaking-news-google-reinstates-ads-for-addiction-treatment-centers-with-pre-certification-by-legitscript/
- https://www.bricker.com/insights/publications/Congress-enacts-all-payor-kickback-law-for-recovery-homes-clinical-treatment-facilities-and-clinical-laboratories-despite-concerns-about-overbreadth-and-uncertainty-of-law
- https://www.law.cornell.edu/uscode/text/18/220
- https://www.dwt.com/insights/2020/02/eliminating-kickbacks-in-recovery-act

---

### 4. ECO-ROAD-1 — ecosystem / roadmap

**Assertion:** ECO-6 facility dashboard not_started and ECO-7 aftercare pipeline not_started (new product; Next.js + Cloud Run + PostgreSQL under HIPAA BAA). The two highest-ACV unlocks are net-new builds for a solo part-time founder.

**Stated source (internal):** `docs/go-to-market/ecosystem/roadmap.md:51-52,99-101`

**Verdict:** `weak` · **confidence:** `medium` · research verdict was `weak`/`medium` · skeptic adjusted: no

**Confidence reason:** Build half sourced; ACV ranking internal-only so capped at weak.

**Final rationale (post-skeptic):** Survives at weak. The roadmap itself marks ECO-6 and ECO-7 not_started with ECO-7 a net-new HIPAA stack, so the build-status half is internally verifiable and is externally corroborated as capital-intensive by chopdawg HIPAA build-cost benchmarks (50K to 500K-plus). Three things cap it at weak and block any upgrade: the two-highest-ACV ranking is internal-only and unsourced (sourcing gate caps quantitative claims resting on GTM docs at weak); the market is saturated by funded incumbents owning exactly this combo (CaredFor/ContinuumCloud, Vista Research Group with 40000-plus post-discharge records, American Addiction Centers AAC Together alumni app); and the doc omits 42 CFR Part 2, whose updated-rule enforcement began February 2026, a SUD-records regime stricter than the named HIPAA BAA. Solo part-time bootstrapped founder cannot reach this build near-term, reinforcing weak rather than validated; not insufficient-evidence because core facts are internally verifiable and externally corroborated.</parameter>
</invoke>


<details><summary>Research-stage rationale</summary>

Build is hard for solo part-time bootstrapped founder; highest-ACV ranking is internal-only.

</details>

**Steelman (claim true/achievable):** Cost benchmarks confirm HIPAA build is capital-intensive; centers pay for outcome data.

**Steelman-against (disconfirming case):** ACV ranking unsourced; market saturated; 42 CFR Part 2 omitted; revenue behind unverified bridge.

**Comparables:**

- Vista Research Group post-treatment follow-up
- Petree R2D2 FoRSE repository
- CaredFor and Team Recovery
- Olari Part 2 compliance
- CHESS ERPHealth Sunwave

**Sources:**

- https://www.chopdawg.com/building-a-hipaa-compliant-app-what-healthcare-founders-need-to-know-in-2026/
- https://www.naatp.org/foundation/technology-partners
- https://www.ecfr.gov/current/title-42/chapter-I/subchapter-A/part-2

_Non-URL source notes:_ chopdawg.com; ecfr.gov; vista-research-group.com; caredfor.com; openminds.com

---

### 5. HG-ROAD-3 — homegroups / roadmap

**Assertion:** Treatment-center facility dashboard (HG-RM-3) not_started; 'Without this dashboard the sales pitch is theoretical.' The highest-ACV B2B story has no product to demo.

**Stated source (internal):** `homegroups/docs/go-to-market/roadmap.md:42,74-80`

**Verdict:** `broken` · **confidence:** `high` · research verdict was `validated`/`medium` · skeptic adjusted: yes

**Confidence reason:** The narrow claim — a facility-facing alumni-engagement dashboard is the artifact that makes the treatment-center B2B pitch demoable, and is currently not built — is strongly corroborated by multiple real, live comparables that sell exactly this dashboard as their core B2B product (Loosid SAM, One Step, TeamRecovery, Sunwave). The mechanism and the 'without it the pitch is theoretical' logic are industry-standard. Confidence is held at medium rather than high because (a) the 'highest-ACV' magnitude rests on internal pricing docs (no external URL for the dollar figure, which caps that sub-claim at weak per the sourcing gate), and (b) external evidence shows the dashboard closes only the demo gap, not the much larger competitive/compliance/sales-motion gap a solo bootstrapped founder faces against entrenched incumbents.

**Final rationale (post-skeptic):** The claim's central factual premise is false against the actual codebase. It asserts the treatment-center facility dashboard (HG-RM-3) is not_started and that 'the highest-ACV B2B story has no product to demo.' Both are refuted in-repo: (1) homegroups/web/src/pages/FacilityDashboardPage.js is a complete 299-line React page (Google/email auth, anonymized alumni-engagement metrics — meetings attended 7/30d, sobriety milestone chips 30/60/90/180, sponsorship connections, per-error handling, anonymization disclaimer); (2) it is routed at /facility-dashboard in web/src/App.js (line 45); (3) the backing Cloud Function functions/src/callable/getFacilityEngagementMetrics.ts is a real 215-line callable, auth-gated and admin-permission-checked on adminUids, exported in index.ts line 124, with a test file present; (4) both homegroups/CLAUDE.md and web/CLAUDE.md describe the facility dashboard as a live surface. The roadmap doc (homegroups/docs/go-to-market/roadmap.md) marks HG-RM-3 not_started and labels FacilityDashboardPage.js '(new)', but the file already exists — git shows the dashboard present at the initial monorepo commit (file dates May 28); the doc was last edited 2026-06-11, so the doc, not the code, is stale. The research agent accepted CODE-STATE as 'given' from the GTM doc and never checked source — that is the error. Separately, the 'highest-ACV' magnitude has no external URL (only internal pricing: HG-MON-2 $99/yr, HG-MON-3 $249/yr intergroup tiers), so that sub-claim is capped at weak by the sourcing gate anyway. The market-mechanism research (Loosid SAM, One Step) is genuinely external, real, and analogous — verified live — and would support a DIFFERENT claim ('a facility dashboard is the demoable B2B artifact'); but it cannot rescue a claim whose load-bearing assertion (the artifact does not exist) is contradicted by the repo. Demo-gap-closed does not equal revenue-unlocked: against funded incumbents (Kipu 6,000+ locations, Sunwave 3,000+ facilities, One Step 2,000+), a solo part-time bootstrapped founder still faces the sales-motion, BAA/42 CFR Part 2 contracting, and alumni-density-dependency gaps the dashboard does not close.

<details><summary>Research-stage rationale</summary>

Two separable assertions. (1) CODE-STATE (given): dashboard is not_started — accepted as stated. (2) BUSINESS-CONSEQUENCE realism — researched externally. The claim that a facility-facing dashboard showing anonymized alumni engagement (meetings attended, sobriety milestones, sponsorship links) is the thing that 'closes the sale' is directly validated by the live market: every serious player in this exact niche leads with a staff/clinician dashboard surfacing alumni attendance, milestone, and relapse-risk metrics as the sellable B2B artifact — Loosid's SAM ('real-time visibility into alumni status,' early-warning relapse alerts, 'data demonstrating treatment effectiveness'), One Step (meeting-attendance tracking + RC36 recovery-capital outcomes, explicitly framed as useful 'for grant funding and demonstrating program efficacy'), TeamRecovery ('admin dashboard gives real-time analytics on alumni participation and outcomes'), and Sunwave ('track engagement, flag relapse risks'). The 'metric every treatment-center board cares about' framing matches how this market actually sells (alumni outcomes + referral ROI; TPAS reports alumni referrals can be up to 50% of total referrals). So 'without this dashboard the sales pitch is theoretical' is a defensible, comparables-backed statement: the staff-facing view IS the demo. BUILD EFFORT (3-7 days, M-L) for a solo dev is realistic — it is one aggregation Cloud Function writing to facilities/{id}/alumniEngagement plus one React admin page plus a facilityId JWT gate, on top of infra that already exists (90 callable functions, Stripe TC checkout already wired, getMeetingAttendance bridge in progress). That is a thin read-model + view, not net-new platform. REGULATORY: 42 CFR Part 2 binds 'federally assisted programs that hold themselves out as providing SUD treatment'; a 12-step meeting-attendance app is not itself a Part 2 program, and the design's anonymized-aggregate-only, 'no individual member data exposed' approach is the correct, standard mitigation (incumbents use the same de-identified-rollup pattern). Part 2 is therefore a manageable design/contracting constraint (BAA, consent language for any identifiable flow), not a hard blocker — but it adds go-to-market friction the 3-7 day estimate does not cover. NET: the literal claim (dashboard is the missing demo artifact, highest-ACV B2B story has no product to demo) is true and well-supported; the build is solo-feasible.

</details>

**Steelman (claim true/achievable):** The claim is precise and correct as written. B2B behavioral-health software sells on a single demoable surface: the staff/clinician dashboard showing measurable alumni outcomes. This is empirically how the entire comparable set monetizes — Loosid SAM, One Step (2,000+ programs), TeamRecovery, Sunwave (3,000+ facilities), and Behave Health all lead with exactly this dashboard. A case manager or TC board cannot be sold an abstraction; they buy the screen that shows 'are our alumni showing up and staying stable.' Homegroups has already wired TC Stripe checkout and pricing but has no facility view, so the highest-ARPU motion (HG-RM-5) genuinely has nothing to put on screen in a sales call. The build is a thin aggregation CF + one page on mature existing infra — squarely a solo 3-7 day job. The 'theoretical pitch' phrasing is not hyperbole; it is the literal state of having pricing without product. Validated.

**Steelman-against (disconfirming case):** The dangerous reading is treating 'build the dashboard' as equivalent to 'unlock the highest-ACV B2B revenue.' It is not. The dashboard closes the demo gap but leaves the far larger gaps wide open: (1) Competitive saturation — Kipu (6,000+ locations), Sunwave (3,000+ facilities, 34,000+ users, just merged with Lightning Step), One Step (2,000+), Alleva, Behave Health, and Loosid SAM already own this exact category with funded teams, full EHR/CRM/RCM suites, and sales orgs. A solo part-time bootstrapped founder shipping a 3-7 day anonymized-counts dashboard is not competitive with these; the dashboard makes the pitch demoable, not winnable. (2) Sales motion — TC enterprise sales require relationships, references, BAAs, and procurement cycles measured in months; the binding constraint is the founder's sales bandwidth, not the artifact. (3) Compliance friction — 42 CFR Part 2 and HIPAA BAA obligations sit between 'have a dashboard' and 'sign a facility,' and the 3-7 day estimate covers only the code, not the contracting. (4) Data dependency — the dashboard's value requires alumni already using Homegroups inside TC-affiliated groups at density, which presupposes adoption that does not yet exist. So while the literal claim is true, its strategic weight is overstated: the dashboard is necessary but nowhere near sufficient for the highest-ACV story to be real for this operator.

**Comparables:**

- Loosid SAM — alumni engagement platform sold to treatment centers; staff dashboard with real-time alumni status, AI relapse early-warning, outcome data — direct product-shape match (https://loosidapp.com/sam-alumni-engagement-platform/)
- One Step Software — alumni meeting-attendance tracking + RC36 recovery-capital outcomes dashboard; 2,000+ sober living homes/programs; framed for grant funding and program-efficacy demonstration — entrenched incumbent (https://www.onestepsoftware.com/increase-alumni-engagement-tools-for-treatment-centers/, https://behavehealth.com/one-step-alternatives)
- TeamRecovery — 'admin dashboard gives real-time analytics on alumni participation and outcomes'; alumni-to-admissions referral tracking — confirms dashboard-as-B2B-product (https://teamrecovery.io/post/top-engagement-apps-for-addiction-recovery-alumni)
- Sunwave Health (merged w/ Lightning Step, Oct 2025) — 3,000+ facilities, 34,000+ users; segment alumni, track engagement, flag relapse risk, campaign/referral attribution — funded incumbent showing market saturation (https://www.sunwavehealth.com/blog/addiction-treatment-alumni-engagement/)
- Kipu Health — 6,000+ facility locations, EMR/CRM/RCM suite — scale of incumbent competition a solo founder faces (https://behavehealth.com/one-step-alternatives)
- TPAS alumni-program data — alumni referrals can be up to 50% of total referrals; substantiates that TCs buy on alumni outcomes/ROI, the metric the dashboard surfaces (https://www.tpas.org/wp-content/uploads/2018/07/TPAS-000755-Summary-Final-7-27.pdf)

**Sources:**

- https://loosidapp.com/sam-alumni-engagement-platform/
- https://www.onestepsoftware.com/increase-alumni-engagement-tools-for-treatment-centers/
- https://teamrecovery.io/post/top-engagement-apps-for-addiction-recovery-alumni
- https://www.sunwavehealth.com/blog/addiction-treatment-alumni-engagement/
- https://behavehealth.com/one-step-alternatives
- https://recovery.com/podcasts/alumni-programs-marketing/
- https://www.tpas.org/wp-content/uploads/2018/07/TPAS-000755-Summary-Final-7-27.pdf
- https://www.ecfr.gov/current/title-42/chapter-I/subchapter-A/part-2
- https://www.hipaajournal.com/42-cfr-part-2/
- https://aisp.upenn.edu/wp-content/uploads/2024/12/Final-Demystifying-42-CFR-Part-2.pdf
- https://loosidapp.com/loosid-for-treatment-centers/
- https://www.sunwavehealth.com/modules/alumni-management/
- https://www.teamrecovery.io/post/top-engagement-apps-for-addiction-recovery-alumni

_Non-URL source notes:_ file:///Users/marcus/dev/recovery-platform/homegroups/web/src/pages/FacilityDashboardPage.js; file:///Users/marcus/dev/recovery-platform/homegroups/web/src/App.js; file:///Users/marcus/dev/recovery-platform/homegroups/functions/src/callable/getFacilityEngagementMetrics.ts; file:///Users/marcus/dev/recovery-platform/homegroups/functions/src/index.ts; file:///Users/marcus/dev/recovery-platform/homegroups/docs/go-to-market/roadmap.md; file:///Users/marcus/dev/recovery-platform/homegroups/CLAUDE.md

---

### 6. DX-PROJ-1 — detox-recovery / projection

**Assertion:** Detox Year-1 revenue P50 $18,063 (P10 $7,500 / P90 $32,000), annual.

**Stated source (internal):** `docs/go-to-market/_shared/pricing.md:66`

**Verdict:** `weak` · **confidence:** `medium` · research verdict was `weak`/`medium` · skeptic adjusted: no

**Confidence reason:** The pricing INPUTS to the projection are independently corroborated by external salary/rate data (recovery-coach per-session $75-$150 maps cleanly onto DX-MON-1/DX-MON-2; part-time private-practice $25k-$45k/yr brackets the $18,063 headline as modest, not aggressive). But the specific quantitative figure ($18,063 P50) and its load-bearing composition (51% from 2 B2B engagements) rest entirely on the founder's own v2.0 model — no external source produces this number or validates the 2-deal B2B assumption for a solo, part-time, non-clinical operator. Per the sourcing gate a quantitative verdict whose exact number has no external URL caps at 'weak'. Confidence is medium (not low) because the headline is internally consistent with and bounded by real external benchmarks; not high because the revenue mix carries unverified concentration risk.

**Final rationale (post-skeptic):** Verdict SURVIVES skeptical review; no adjustment needed. (1) Sources verified as genuinely external and real, not GTM docs. I fetched corevaluesrecovery.com directly: it confirms BOTH the $25k-$45k part-time private-practice band AND the $75-$150 post-treatment session rate, independently corroborating the unit-price inputs (DX-MON-1/DX-MON-2) and bracketing the $18,063 headline from above as modest. B2B cold-email ~3-6% reply rates confirmed across multiple independent 2025 sources (Belkins 5.8%, Instantly 3.43%, Built For B2B). ZipRecruiter 403'd on fetch (anti-bot) but its ~$35k figure is widely cited and non-load-bearing. (2) The sourcing gate is correctly applied: the exact figure $18,063 and its 51%/2-deal composition exist ONLY in the founder's own v2.0 model (verified at detox-recovery/docs/go-to-market/monetization.md lines 136-138) — no external URL produces this number, so the quantitative verdict is correctly capped at 'weak'. (3) The SOLO/part-time/bootstrapped constraint stresses but does not break the 'weak' call — and the agent's steelman_against captured it precisely. The model document itself ELEVATED the per-engagement value from $2,500 to $4,000 on veteran/VAMC + medication-navigation differentiators (lines 163-168), which INCREASES concentration risk on the least-sourced lever. detox-recovery/CLAUDE.md independently confirms B2B is manual outreach with 'no marketing spend until Year 2' (no-network reality) and that the 5 PDFs are gated coming-soon (correctly excluded from Y1). For a no-network solo operator, zero B2B closes in a part-time Year 1 is the single most-likely outcome, collapsing realized revenue toward the P10 ($7,500). (4) Comparables are real and honestly deployed: salary benchmarks are analogous and bracket magnitude; the lived-experience-consulting comparables (CHCS, NASHP, Tanana Chiefs RFP, Ritz-Carlton, Eagle Hill) are real but ANTI-analogous (grant/agency/enterprise, not solo $4k advisory) and were correctly used as disconfirming, not supporting, evidence. No comparables were invented. The agent did not manufacture confidence; medium confidence is justified because magnitude is externally bracketed while the exact figure and its make-or-break B2B lever are internal-model-only.

<details><summary>Research-stage rationale</summary>

The Year-1 P50 of $18,063 is NOT aggressive in absolute terms — it sits BELOW the cited part-time established private-practice band of $25k-$45k/yr (corevaluesrecovery.com) and well below the $34,961 average peer-recovery-coach W-2 salary (ZipRecruiter). For a solo founder working part-time and starting from zero caseload, ~$18k gross is a credible-to-conservative TOTAL. The pricing inputs are externally sound: per-session rates of $75 (general/post-treatment) and $150 (family) match DX-MON-1/DX-MON-2 almost exactly against published recovery-coaching session rates. The real weakness is COMPOSITION, not magnitude. The model concentrates 51% of P50 (~$8,500) in just TWO B2B consulting engagements at ~$4,000 each — and this is the least-supported piece. Lived-experience consulting to treatment centers is a real category (CHCS, NASHP, NCBI PMC12439107 confirm orgs engage and pay people with lived experience; the Tanana Chiefs Conference RFP shows a real paid peer-support contract), BUT the documented instances are overwhelmingly grant-funded contracts, agency W-2 roles, or large-firm patient-experience consulting (Ritz-Carlton Leadership Center, Eagle Hill) — NOT solo, non-clinical operators selling $4k advisory engagements to detox centers. No external comparable shows a brand-new solo navigator closing 2 such deals in Year 1. B2B cold-outreach benchmarks make this harder than the model implies: ~5-6% reply rates and 'very hard without a network' to land first customers (Belkins 2025 study; r/SaaS). Two closes part-time in 12 months is possible but far from assured, and the entire P50 swings on it — if zero B2B deals land, realized revenue collapses toward the P10 ($7,500). One de-risking point in the model's favor: the 5 digital PDFs (a notoriously survivorship-biased income source) are correctly flagged blocked/coming-soon for Year 1, so they are not propping up the Y1 number. Net: the headline is defensible and modest, but it is an internal-model figure whose make-or-break lever lacks any external comparable for a solo non-clinical operator.

</details>

**Steelman (claim true/achievable):** $18,063 P50 is achievable and arguably conservative. External data brackets it from above: an established PART-TIME private recovery-coaching practice earns $25k-$45k/yr (corevaluesrecovery.com), and the median peer-recovery-coach salary is ~$35k-$45k (ZipRecruiter $34,961; substanceabusecounselor.org $45,120). The claim asks for LESS than the steady-state part-time number, which is the correct posture for a first year from zero. The unit prices are externally validated: published session rates of $75-$150 for post-treatment/family coaching map directly onto the live Tier 2 ($75) and planned Tier 3 ($150) calls, so the per-unit assumptions are real-world. The model is conservative about the speculative levers — digital PDFs and VA/Medicaid billing are deferred out of Year 1 — meaning the Y1 number leans on the two things most under a solo founder's direct control: a handful of paid calls (live today) and a small number of high-touch B2B engagements where the founder's medication-navigation + veteran differentiation is genuinely uncommon. Two B2B deals over 12 months is a low absolute bar. With a $7,500 P10 floor that keeps the business cash-positive in the worst case, the projection is structurally cautious, not optimistic.

**Steelman-against (disconfirming case):** The headline magnitude masks a fragile composition that no external source supports. 51% of the P50 (~$8,500) depends on TWO B2B consulting engagements at ~$4,000 — and there is no real-world comparable of a brand-new, solo, NON-CLINICAL peer navigator selling $4k advisory engagements to addiction-treatment centers. The documented lived-experience-consulting market is grant-funded contracts, agency staff roles, and enterprise patient-experience firms (Ritz-Carlton, Eagle Hill) — categories a bootstrapped solo operator cannot occupy. B2B reality is brutal for a no-network founder: ~5-6% cold-email reply rates (Belkins 2025) and first-customer acquisition widely described as 'very hard.' Treatment-center procurement is slow, relationship-gated, and skeptical of non-clinical vendors. If the founder lands ZERO B2B deals in a part-time Year 1 — the most likely single outcome for a first-time consultant without an existing book — revenue falls to roughly the call-and-donation base (~$7,500, the P10), not the P50. The $150 Tier 3 and $450 Tier 4 calls that pad the call line are 'planned' (Q3 2026 / Q2 2027), so Year 1 call revenue is mostly the single live $75 tier, throttled by a 22-32 call/month ceiling and, realistically, a near-empty early funnel (the lead-magnet email automation is documented as broken). The P50 therefore over-weights two unproven, hard-to-source revenue events; the honest expected value for a solo part-time first year is closer to the P10-to-low-P50 zone than to $18,063.

**Comparables:**

- Recovery coach salary benchmarks (corevaluesrecovery.com): part-time private practice $25k-$45k/yr; per-session $75-$150 post-treatment/family — brackets the $18,063 headline as modest and validates DX-MON-1/DX-MON-2 unit prices
- ZipRecruiter Peer Recovery Coach: national avg $34,961/yr — W-2 full-time baseline well above the part-time $18,063 projection
- Peer Support Specialist median $45,120/yr (substanceabusecounselor.org, 2024 BLS) — confirms the occupation's steady-state ceiling
- Tanana Chiefs Conference RFP for a contracted Peer Support Specialist — real paid peer-support contract, but grant/agency-funded, not a solo $4k treatment-center advisory deal
- CHCS / NASHP / NCBI PMC12439107 — confirm orgs engage and pay people with lived experience, but predominantly via grants and staff roles, not solo per-engagement consulting
- Enterprise patient-experience consultancies (Ritz-Carlton Leadership Center, Eagle Hill Consulting, Forefront Healthcare) — the actual paid 'patient-experience training' market is firm-scale, not solo-operator comparable
- Belkins 2025 cold-email study: ~5.8% reply rate; r/SaaS first-B2B-customers thread: 'very hard without a network' — quantifies how uncertain the 2-engagement B2B assumption is
- Etsy/Gumroad digital-download income reports (heavily survivorship-biased; Reddit r/Etsy, ammarosedesigns $93k case) — relevant only as a caution; the model correctly defers PDFs out of Year 1

**Sources:**

- https://www.corevaluesrecovery.com/blog/recovery-coach-salary
- https://www.ziprecruiter.com/Salaries/Peer-Recovery-Coach-Salary
- https://substanceabusecounselor.org/substance-abuse-counselor-careers-guide/certified-peer-support-specialist/salary/
- https://pmc.ncbi.nlm.nih.gov/articles/PMC12439107/
- https://www.chcs.org/resource/making-the-case-for-engaging-people-with-lived-experience-and-expertise-in-state-behavioral-health-reforms/
- https://nashp.org/engaging-with-people-with-lived-experience-in-opioid-settlement-decision-making/
- https://www.facebook.com/TananaChiefsConference/posts/we-are-seeking-requests-for-proposals-for-a-peer-support-specialist-to-work-alon/1285116100316417/
- https://belkins.io/blog/cold-email-response-rates
- https://www.reddit.com/r/SaaS/comments/1oi39da/how_did_you_get_your_first_10_b2b_customers_and/
- https://ritzcarltonleadershipcenter.com/advisory-consulting/patient-experience/
- https://www.eaglehillconsulting.com/insights/patient-experience-satisfaction-healthcare-workers/
- https://www.reddit.com/r/Etsy/comments/15fp2dv/how_much_are_you_really_making_from_etsy/
- https://www.builtforb2b.com/blog/b2b-cold-email-benchmark-2025
- https://instantly.ai/blog/cold-email-reply-rate-benchmarks/

---

### 7. ECO-MKT-2 — ecosystem / market

**Assertion:** Relapse rates reach 85% in the first year post-discharge, yet 80% of clinicians never measure post-discharge outcomes.

**Stated source (internal):** `docs/go-to-market/ecosystem/vision.md:66-67`

**Verdict:** `weak` · **confidence:** `medium` · research verdict was `validated`/`medium` · skeptic adjusted: yes

**Confidence reason:** Both sub-claims trace to real, externally citable sources (NIDA-hosted PMC review citing Brandon/Vidrine/Litvin 2007 for >85% one-year relapse; Fortney et al. 2017 Psychiatric Services / Virginia CSA for "<20% of behavioral-health providers use measurement-based care," which inverts to ~80%). Confidence is held at medium, not high, because the 85% figure is a pooled upper-bound (alcohol + nicotine + weight + drugs, "any return to use") that diverges from NIDA's own canonical 40-60% headline, and the 80% figure is borrowed from broad behavioral-health/mental-health MBC literature rather than a clean "addiction clinicians measuring POST-DISCHARGE outcomes specifically" study. The directional truth is solid; the precise numbers are defensible-but-selectively-framed.

**Final rationale (post-skeptic):** Downgraded from validated to weak. Both numbers are directionally supported by real external sources but are precision-shopped or inferred, and the agent misattributed the key citation. The 85 percent figure: I opened PMC3674771 directly. It is not a NIDA publication; it is Sinha, Current Psychiatry Reports 2011. It attributes the 85 percent to Brownell, Marlatt, Lichtenstein and Wilson 1986, not to Brandon, Vidrine and Litvin 2007 as the agent claimed. The figure pools alcohol, nicotine, weight and illicit drugs and counts any return to use, so it is a misapplied non-addiction-specific estimate; NIDA own headline SUD figure is 40 to 60 percent. The 80 percent figure: Fortney 2017, PMID 27582237, is real, but it measures in-session symptom-scale use in general behavioral health, not post-discharge follow-up by addiction clinicians; the 80 percent is an inference, not a direct measurement of that denominator. Directionally true and externally sourced, but the misapplied or inferred numbers plus a misattributed citation cap this at weak per the sourcing and framing gate. The solo bootstrapped founder constraint does not independently break it since this is a problem-framing claim, not an execution-capacity claim.</parameter>
</invoke>


<details><summary>Research-stage rationale</summary>

The claim bundles two quantitative assertions; both survive external scrutiny but with caveats. (1) "85% relapse in first year post-discharge": This is a real, traceable figure. NIDA's own publication-hosted review (PMC3674771) states "For 1-year outcomes across alcohol, nicotine, weight, and illicit drug abuse, studies show that more than 85% of individuals relapse," citing Brandon, Vidrine & Litvin, Annu Rev Clin Psychol 2007. Multiple treatment-industry pages (Arms Acres, Alliance MD, Grove) repeat ">85% within first year." HOWEVER: the 85% pools four behaviors (incl. nicotine and weight, which inflate it) and defines relapse as ANY return to use, not sustained/clinical relapse; and NIDA's flagship, more conservative figure is 40-60% relapse for SUD generally. So 85% is the high end of a real range, not a fabrication, but it is the most alarming framing available. (2) "80% of clinicians never measure post-discharge outcomes": Strongly supported in spirit. The canonical statistic (Fortney et al. 2017, "A Tipping Point for Measurement-Based Care," Psychiatric Services; echoed by Virginia CSA training: "Less than 20% of mental and behavioral health providers use measurement-based care") inverts to >80% NOT using outcome measurement. NAATP (the national trade association of addiction treatment providers) independently confirms "there is currently no standardized measurement system for addiction treatment outcomes," and Vista Research Group exists as a commercial vendor precisely because most centers do not follow patients post-discharge. The "never measure POST-DISCHARGE" framing is actually MORE defensible than the general MBC stat, since post-discharge follow-up is even rarer than in-treatment measurement. Net: the directional claim — relapse is extremely common in year one, and the field largely fails to measure what happens after discharge — is well-supported by independent sources. The specific 85%/80% numbers are real but represent the alarming end of their respective ranges.

</details>

**Steelman (claim true/achievable):** The claim is true and defensible. The 85% figure is not invented — it appears verbatim in a review hosted on NIDA's own site (PMC3674771) sourcing Brandon et al. 2007, and is repeated across the treatment industry. The 80% figure is the well-established inverse of the Fortney 2017 "less than 20% of behavioral health providers use measurement-based care" statistic, corroborated by NAATP's admission that the field has "no standardized measurement system for addiction treatment outcomes" and by the very existence of outcomes vendors like Vista Research Group whose pitch is that centers don't follow patients after discharge. For a GTM vision doc, the rhetorical point — relapse is rampant and the industry is flying blind on post-discharge outcomes — is accurate and arguably understated. The continuity-of-care gap the product targets is real: NIDA, NAATP, and the MBC literature all independently document it.

**Steelman-against (disconfirming case):** The claim is precision-shopped and conflates distinct evidence bases. The 85% number is a pooled rate across alcohol, NICOTINE, and WEIGHT — not a clean "addiction-treatment-center discharge" cohort — and counts any momentary return to use as "relapse." NIDA's headline SUD relapse figure is 40-60%, so quoting 85% is cherry-picking the scariest available number and presenting it as the post-discharge norm. The "80% of clinicians never measure post-discharge outcomes" stat is not from an addiction-post-discharge study at all; it is borrowed from the general behavioral-health/mental-health measurement-based-care literature (Fortney 2017), which measures in-session symptom-scale use, not post-discharge follow-up. No source produces a clean "80% of addiction clinicians never measure post-discharge outcomes" figure with that exact denominator — the number is an inference, not a direct measurement. So both figures are real-but-misapplied: each is a defensible adjacent statistic dressed up as a precise claim about a specific population. A skeptical clinician or investor could pick either number apart on definitional grounds.

**Comparables:**

- Vista Research Group — commercial addiction-outcomes vendor whose entire business thesis is that most treatment centers do not follow patients after discharge; corroborates the 'field doesn't measure post-discharge outcomes' claim
- NAATP FoRSE / Outcomes Pilot Program (2016-2019, 8 member orgs, 748 participants) — trade-association effort created BECAUSE 'there is currently no standardized measurement system for addiction treatment outcomes'
- NIDA 'Drugs, Brains, and Behavior' — authoritative source that pegs SUD relapse at 40-60%, the conservative counter-figure to the 85% claim
- Fortney et al. 2017 'A Tipping Point for Measurement-Based Care' (Psychiatric Services) — origin of the 'less than 20% of behavioral health providers use measurement-based care' statistic underpinning the 80% inverse

**Sources:**

- https://pmc.ncbi.nlm.nih.gov/articles/PMC3674771/
- https://nida.nih.gov/publications/drugs-brains-behavior-science-addiction/treatment-recovery
- https://www.naatp.org/treatment-outcomes-and-research
- https://csa.virginia.gov/Content/doc/Improving_Outcomes_with_Measurement_Based_Care.pdf
- https://psychiatryonline.org/doi/10.1176/appi.ps.201500439
- https://pubmed.ncbi.nlm.nih.gov/27582237/
- https://alliancemd.us/how-many-addicts-relapse-after-rehab/
- https://vista-research-group.com/
- https://pubmed.ncbi.nlm.nih.gov/17716056/

---

### 8. ECO-ROAD-2 — ecosystem / roadmap

**Assertion:** ECO-5 bridge: getMeetingAttendance Cloud Function exists in Homegroups but the Regroup-side cross-project caller is not built; cross-project callability is UNVERIFIED.

**Stated source (internal):** `docs/go-to-market/ecosystem/roadmap.md:50,72`

**Verdict:** `weak` · **confidence:** `medium` · research verdict was `weak`/`high` · skeptic adjusted: yes

**Confidence reason:** Source read resolves code state conclusively; mechanism backed by Firebase docs. Weak cap is mechanical: substance is internal code, cross-project callability is externally unconfirmable for this deployment.

**Final rationale (post-skeptic):** Independently re-verified all code claims against the repo. CONFIRMED: (1) HG getMeetingAttendance exists as a 2nd-gen onRequest, shared-bearer gated, exported in homegroups/functions/src/index.ts — TRUE. (2) The claim's core assertion that the Regroup-side caller is "not built" is FALSE: getResidentMeetingAttendance is fully implemented at regroup/functions/src/callable/homegroups.ts (onCall, auth guard, resident-or-admin authz via assertCanAccessAttendance, fetch with Bearer RATS_API_KEY, 401/error/network → HttpsError mapping), registered at index.ts:23, secret defined at config.ts:30, with a unit test suite that mocks global.fetch. So the claim's load-bearing verb is wrong. (3) Cross-project callability genuinely UNVERIFIED: default RC_URL hardcodes recovery-connect-prod while the real HG project per homegroups/.firebaserc is recovery-connect-cad4b, and every test mocks fetch — no live round-trip, no matching-secret check, no public-invoker IAM check. Because the compound claim is false on its decisive clause it cannot be 'validated'; the surviving true portion is internal code whose deployment/round-trip state is externally unconfirmable, which mechanically caps at 'weak'. SOLO CONSTRAINT does not rescue the original claim — the remaining work (deploy both functions, set matching RATS_API_KEY in both projects, repoint URL to cad4b, one smoke curl) is hours of solo effort, which supports the agent's steelman_against (this is a near-complete verification gap, not an unbuilt P1 enabler). Verdict held at 'weak'; confidence trimmed from high to medium because the agent slightly overstated the Firebase http-events doc (it confirms public onRequest reachability but does not itself detail allUsers/invoker IAM) and inverted the thrust of firebase-tools #5958 (which reports functions deploying PUBLIC when set private, not 403s) — minor citation imprecision, not fabrication.

<details><summary>Research-stage rationale</summary>

Compound claim, partly wrong. Part 1 (HG CF exists): TRUE - homegroups/functions/src/http/getMeetingAttendance.ts, a 2nd-gen onRequest gated by a shared bearer token, exported at index.ts:131. Part 2 (Regroup caller not built): FALSE - getResidentMeetingAttendance is fully implemented at regroup/functions/src/callable/homegroups.ts (onCall; validates auth; enforces resident-or-admin authorization; fetches HG endpoint with Bearer RATS_API_KEY; maps 401/error/network to HttpsError), registered at regroup/functions/src/index.ts:23, secret defined at config.ts:30, with a unit-test suite at __tests__/callable/homegroups.test.ts. ECO-5 wording is stale. Part 3 (callability UNVERIFIED): TRUE and understated. Mechanism is feasible and simple - HG side is PUBLIC onRequest, so caller needs only a fetch with a bearer header, no Cloud Functions Invoker / ID-token machinery (Firebase http-events docs; Medium walkthrough). But two real defects keep it unverified: (a) caller default RC_URL hardcodes recovery-connect-prod while the real HG project is recovery-connect-cad4b (homegroups/.firebaserc:3), so absent an RC_MEETING_ATTENDANCE_URL override the call hits a non-existent host; (b) all tests mock fetch, so no real round-trip, no matching-secret check, no allUsers/run.invoker public-access check (firebase-tools #5958; Cloud Run troubleshooting). Net: binary not-built assertion is wrong, but the business consequence (callability unverified, ECO-6 gated) holds. False on one clause means not validated; the surviving correct part is internal-only, capping at weak.

</details>

**Steelman (claim true/achievable):** Charitably, the claim is right where it matters: nothing in this bridge is proven across the project boundary. Built in a launch-readiness sense means deployed and demonstrated; by that bar Regroup is not done - the default URL points at a non-existent project, tests mock the network, and there is no evidence the shared secret matches or that public invoker IAM is set. The mechanism is simple enough for a solo dev (one fetch with a bearer header against a public onRequest endpoint), so leaving it unverified is a real fixable gap, and treating ECO-5 as a precondition for ECO-6/ECO-7 revenue is correct and conservative.

**Steelman-against (disconfirming case):** The claim is wrong on its load-bearing verb. The caller IS built: getResidentMeetingAttendance is implemented, registered, secret-wired, unit-tested - not a stub. Carrying ECO-5 as not_started overstates the work; only a deploy-time URL fix plus a one-time smoke test remain. For a solo founder that is hours: deploy both functions, set the same RATS_API_KEY in both projects, point the URL at cad4b, curl once. Framing a near-complete verification task as an unbuilt P1 enabler mis-sequences the roadmap.

**Comparables:**

- Firebase Cloud Functions - Call functions via HTTP requests: public 2nd-gen onRequest functions are Cloud Run services reachable via plain HTTPS with a self-managed Authorization header, no IAM token exchange when allUsers/run.invoker is granted - https://firebase.google.com/docs/functions/http-events
- Trung Tron Tria, Firebase Functions cross-projects invocation (Medium): IAM-protected functions need Cloud Functions Invoker plus a google-auth ID token; a shared-secret public endpoint sidesteps that - https://medium.com/@trungtrontria/firebase-functions-cross-projects-invocation-538cf6d457d6
- firebase-tools issue #5958: 2nd-gen onRequest allUsers/run.invoker public access is a common easy-to-miss deploy gotcha producing 403s - https://github.com/firebase/firebase-tools/issues/5958
- Google Cloud Troubleshoot Cloud Run functions: 403 not authorized to invoke is the canonical symptom when a 2nd-gen HTTP function lacks the public invoker binding - https://docs.cloud.google.com/functions/docs/troubleshooting

**Sources:**

- https://firebase.google.com/docs/functions/http-events
- https://medium.com/@trungtrontria/firebase-functions-cross-projects-invocation-538cf6d457d6
- https://firebase.google.com/docs/functions/callable
- https://github.com/firebase/firebase-tools/issues/5958
- https://docs.cloud.google.com/functions/docs/troubleshooting
- https://daviddalbusco.com/blog/protect-your-http-firebase-cloud-functions/

_Non-URL source notes:_ file:///Users/marcus/dev/recovery-platform/homegroups/functions/src/http/getMeetingAttendance.ts; file:///Users/marcus/dev/recovery-platform/regroup/functions/src/callable/homegroups.ts; file:///Users/marcus/dev/recovery-platform/homegroups/.firebaserc; file:///Users/marcus/dev/recovery-platform/regroup/functions/src/__tests__/callable/homegroups.test.ts

---

### 9. DX-PROJ-3 — detox-recovery / projection

**Assertion:** 51% of Year-1 revenue (~$8,500 of ~$18,063) comes from just 2 B2B engagements — severe concentration risk.

**Stated source (internal):** `detox-recovery/docs/go-to-market/monetization.md:136-139`

**Verdict:** `weak` · **confidence:** `low` · research verdict was `weak`/`medium` · skeptic adjusted: yes

**Confidence reason:** Benchmarks confirm the risk is real but the stated 51 percent is miscalculated and base numbers are internal-only which caps the quantitative verdict at weak

**Final rationale (post-skeptic):** Verdict stays 'weak' but confidence is downgraded from medium to low. (1) The 51% figure is confirmed miscalculated: 8500/18063 = 47.06%, not 51% — a ~4pt arithmetic error internal to the doc. (2) Worse than the agent found: the figures are inconsistent ACROSS the founder's own docs. monetization.md (detox-recovery/docs/go-to-market/monetization.md:136-138) says B2B is $8,500 of $18,063 (51%) from 2 engagements, but the archived financial-model.md:76-83 states Year-1 revenue of $13,454 with B2B at $5,500 (41%) from 2 engagements, and financial-projections-2026-05-24.md:194 shows B2B at 18%. Three conflicting versions of the same base case — the quantitative spine is not merely internal-only, it is internally contradictory, which firmly caps the claim at weak under the sourcing gate. (3) External benchmark spine is solid and verified real: Corporate Finance Institute (top-5 >50% = high concentration, <25% = low), Anders CPA (single client >=10% = high concentration, recommends 15% cash reserves), Projectworks (single client >20-25% is the buyer red-flag threshold). Two engagements at ~23.5% each (4250/18063) breach all of these, so the DIRECTIONAL risk is externally supported and the verdict is not 'broken'. (4) The SOLO part-time pre-revenue bootstrapped constraint undermines the finding's value: these thresholds were built for SaaS valuation and M&A due-diligence on companies with actual revenue; for a solo founder with 1-2 prospective clients, concentration is closer to a tautology than a discovered risk (the doc itself calls it 'normal for early-stage'). The more material risk is closure risk — both numerator and denominator are unearned founder assumptions, so one cannot be 'concentrated' in revenue never booked. Net: real external sources confirm the qualitative direction, but the quantitative claim is miscalculated, internally inconsistent, and only weakly transferable to a pre-revenue solo practice. Weak, low confidence.

<details><summary>Research-stage rationale</summary>

8500 over 18063 equals 47.1 percent not 51 percent so the figure is internally inconsistent. External benchmarks confirm the risk. CFI flags top-5 over 50 percent and single client over 10 percent. Anders CPA flags 10 percent and urges 15 percent cash reserves. Consulting guidance targets under 20 percent per client. Two engagements at about 4250 each is about 23.5 percent each, both over thresholds, so severe concentration risk holds whether the figure is 47 or 51 percent. The doc framing that this is normal early-stage is also true since solo consultants begin with 1 to 2 clients. Both hold, normal and risky. But every base dollar figure is internal GTM projection only with no external validation that a solo part-time bootstrapped founder books 2 engagements at about 4250 in Year 1, so the quantitative spine is unsourced and miscalculated which caps at weak

</details>

**Steelman (claim true/achievable):** If the founder books 2 engagements at about 4250 each within an 18063 total then B2B is about 47 percent from 2 buyers. Each at about 23.5 percent breaches the 10 percent and 20 percent thresholds. Losing one erases about 24 percent of yearly revenue for a solo operator with no buffer. Severe concentration risk is well-supported and the conclusion that pipeline diversification is the highest-leverage early activity follows

**Steelman-against (disconfirming case):** 51 percent is a 4-point arithmetic error versus the cited 8500 over 18063 equals 47.1 percent. Both numerator and denominator are unproven founder assumptions so the risk may be moot if the engagements never close, you cannot be concentrated in revenue never earned. The doc calls it normal for early-stage businesses so labeling it severe is somewhat inflated for a 2-client sub-20K solo practice where concentration is closer to a tautology than a finding. Standard frameworks were built for SaaS valuation and acquisition due-diligence and may not transfer to a pre-revenue solo consultant

**Comparables:**

- Corporate Finance Institute high concentration is top-5 over 50 percent of revenue and single client over 10 percent is a risk
- Anders CPA 10 percent from one client is high concentration and recommends 15 percent cash reserves
- Mosaic consulting firms target under 20 percent per client
- Projectworks high zone over 20 percent from one client and healthy under 10 percent
- Blair Enns and David C. Baker agencies should carry 8 to 15 clients regardless of size

**Sources:**

- https://corporatefinanceinstitute.com/resources/valuation/customer-concentration/
- https://anderscpa.com/learn/blog/client-concentration/
- https://www.mosaicapp.com/post/consulting-firm-profitability-benchmarks-you-need-to-know
- https://www.projectworks.com/blog/client-concentration-risk
- https://www.peterkang.com/exploring-client-concentration-in-an-agency-business/

_Non-URL source notes:_ detox-recovery/docs/go-to-market/monetization.md (internal, lines 136-138); detox-recovery/docs/_archive/financial-model.md (internal, lines 76-83 — conflicting $13,454/41%); detox-recovery/docs/_archive/financial-projections-2026-05-24.md (internal, line 194 — B2B 18%)

---

### 10. ECO-MKT-1 — ecosystem / market

**Assertion:** U.S. substance-abuse treatment is a $143.62B (2024) market; ~17,353 licensed SUD facilities and ~17,900 recovery residences serve ~275,000 people.

**Stated source (internal):** `docs/go-to-market/ecosystem/vision.md:135-138`

**Verdict:** `weak` · **confidence:** `high` · research verdict was `weak`/`high` · skeptic adjusted: no

**Confidence reason:** Every sub-figure was checked against its actual external primary source (Grand View Research, SAMHSA N-SUMHSS 2023, the Jason/NSTARR recovery-housing literature, Oxford House). The numbers are real and externally sourced, so not broken, but the headline market figure is materially mislabeled and the residence figures conflate an upper-bound estimate with observed counts, which caps this at weak rather than validated.

**Final rationale (post-skeptic):** Verdict survives independent skeptical re-check; I keep "weak" (adjusted=false). I re-confirmed the single most load-bearing error directly against the primary source: Grand View Research's page titles the $143.62B (2024) figure the "U.S. Mental Health AND Addiction Treatment Centers Market" (to $408.12B by 2033, 12.3% CAGR), a combined behavioral-health category where the dominant segment is mood disorders (23.79% share) and outpatient centers (55.56%), NOT substance-abuse treatment alone. "Substance Abuse Disorders" is merely one By-Disorder sub-segment. The claim relabels the broad number as SUD treatment, overstating the relevant TAM by roughly an order of magnitude — independently corroborated by narrow SUD-treatment estimates from other firms spanning ~$2.3B (Market Data Forecast), ~$5.93B (Verified Market Research) to ~$35-41B (Fortune Business Insights / Cognitive Market Research). The ~17,353 facilities figure is directionally right but ~200 off SAMHSA 2023 N-SUMHSS's 17,561 SU-treatment facilities (of 20,681 SU+MH surveyed). The ~17,900 residences / ~275,000-served figures are an upper-bound model (Jason et al.), not an observed count; physical enumeration (RTI/NSTARR) found ~10,400 residences and certified (NARR) residences number under 3,000. Oxford House 4,324/35,796 could not be confirmed against the primary report. Sourcing gate satisfied: every quantitative sub-figure traces to a real external primary source (not the GTM docs), so the claim is not fabricated (not "broken") but the headline is materially mislabeled and the residence counts conflate model with census (not "validated"). Solo-founder lens strengthens the downgrade: a $143.62B figure is behavioral-health operating/services revenue, not software spend; a bootstrapped part-time-Y1 solo founder selling SaaS to sober-living operators, 12-step admins, and detox-seekers faces a SAM in the low hundreds of millions at most, against entrenched EHR incumbents (Kipu, Sunwave, BestNotes), with most recovery residences being tiny, uncertified, near-zero-software-budget homes. The TAM paragraph is motivational vanity framing, not a costed reachable opportunity. Confidence high: the central mislabeling and the order-of-magnitude gap were each independently re-verified against primary/independent sources.

<details><summary>Research-stage rationale</summary>

The claim bundles four numbers; they are individually traceable but the framing is misleading. (1) The $143.62B 2024 figure is NOT U.S. substance-abuse treatment. Grand View Research attaches that exact figure to the U.S. Mental Health AND Addiction Treatment Centers market (to $408.12B by 2033, 12.3% CAGR), a combined behavioral-health category dominated by mental-health services and facility operations, not SUD treatment alone. Narrowly-defined SUD-treatment estimates from other firms span roughly $2.3B (Market Data Forecast) to $41B (Cognitive Market Research) for 2024, so the true SUD slice is a fraction of $143.62B. Labeling the broad number as substance-abuse treatment overstates the addressable market by roughly an order of magnitude. (2) The ~17,353 facilities figure is in the right ballpark but not exactly matched: SAMHSA 2023 N-SUMHSS reports 17,561 facilities providing substance-use treatment (20,681 total SU+MH facilities surveyed). 17,353 is plausibly a prior N-SUMHSS/N-SSATS year or a responded-subset; directionally correct, off by ~200. (3) The ~17,900 recovery residences figure is an upper-bound projection (Jason et al., ~2020), not an observed count. The actual enumeration, RTI/ARG NSTARR, physically identified only ~10,358-10,558 residences (3,628 providers); NARR-certified residences number only ~2,500-3,000. The ~275,000-served figure is a modeled capacity estimate, not a verified census, and was not corroborated in the NSTARR primary source. (4) The ~4,324 Oxford Houses / 35,796 beds figure could not be confirmed from the Oxford House 2023 annual report page; a secondary source put Oxford Houses at ~3,600 as of June 2023, so 4,324 may be a later or all-jurisdiction count, unverified. Solo-founder relevance: even if every number were pristine, none of it is the operator serviceable market. The $143.62B TAM is behavioral-health operations; a bootstrapped solo founder selling SaaS to sober-living operators (Regroup), 12-step admins (Homegroups), and detox-seekers (NextStep) addresses, at most, software spend across ~10,000-17,000 small facilities/residences, a SAM in the low hundreds of millions, with most recovery residences being tiny, uncertified, cash-strapped homes (the reason NARR certification penetration is under 20%). The market-context numbers are not load-bearing for feasibility; they are a vanity-TAM that the anti-optimism lens flags as a classic big-number framing.

</details>

**Steelman (claim true/achievable):** The individual statistics are real, recent, and from credible institutions, so the claim is not fabricated. $143.62B (2024) is a verbatim Grand View Research figure; ~17,500 SU facilities is confirmed by SAMHSA 2023 N-SUMHSS; ~17,900 recovery residences is a published peer-reviewed estimate (Jason et al.); Oxford House is a real ~3,600-4,300-house network. Directionally the claim point stands: the U.S. addiction-and-behavioral-health ecosystem is large, growing double-digits, and highly fragmented across tens of thousands of small facilities and residences, exactly the kind of underserved, underdigitized operator base a low-cost SaaS wedge can target. For a market-context statement (its stated purpose in vision.md), the orders of magnitude are defensible and the fragmentation thesis is genuinely supported by the NSTARR enumeration (10k+ residences, thousands of providers).

**Steelman-against (disconfirming case):** The headline number is the wrong market wearing the right costume: $143.62B is mental health AND addiction treatment centers (mostly MH services and facility operations), presented as substance-abuse treatment, overstating the relevant TAM by ~10x, since narrow SUD-treatment estimates are $2.3B-$41B. The ~17,900 residences and ~275,000 served are an upper-bound model, not a count; the actual physically-verified inventory (NSTARR) is ~10,400 residences, and certified residences number under 3,000, so serve ~275,000 at any time is unverified and likely inflated. The Oxford House 4,324/35,796 figures could not be confirmed against the primary report. None of these TAM figures map to a bootstrapped solo founder serviceable revenue: recovery residences are overwhelmingly tiny, uncertified, low-margin homes with near-zero software budgets, and SUD facilities buy EHR/billing from entrenched incumbents (Kipu, Sunwave, BestNotes), not a new four-app monorepo. The market-size paragraph functions as motivation, not as a costed, reachable opportunity, and its biggest number is mislabeled.

**Comparables:**

- Grand View Research U.S. Mental Health And Addiction Treatment Centers Market = USD 143.62B (2024), to USD 408.12B by 2033, 12.3% CAGR: the actual source of the headline number, measuring combined MH+addiction centers, NOT SUD treatment alone
- SAMHSA 2023 N-SUMHSS: 17,561 facilities provided substance-use treatment (of 20,681 SU+MH facilities surveyed); claim 17,353 is ~200 low / likely a different release year
- RTI/Alcohol Research Group NSTARR project (Mericle et al.): physically identified ~10,358-10,558 recovery residences / 3,628 providers (2020-21), the observed count vs. claim 17,900 estimate
- National Alliance for Recovery Residences (NARR): only ~2,500-3,000 CERTIFIED residences and ~25,000 persons housed, the small reachable paying segment
- Oxford House Inc.: ~3,600 self-run houses as of June 2023 (secondary source); claim 4,324/35,796 unverified; Oxford Houses are self-funded, not a SaaS-buying segment
- Incumbent SUD-facility software (Kipu Health, Sunwave, BestNotes, Ritten): the actual competitive set, indicating serviceable software market is a small fraction of any treatment-services TAM

**Sources:**

- https://www.grandviewresearch.com/industry-analysis/us-mental-health-addiction-treatment-centers-market-report
- https://www.marketdataforecast.com/market-reports/united-states-substance-abuse-treatment-market
- https://www.cognitivemarketresearch.com/substance-use-disorder-treatment-market-report
- https://www.samhsa.gov/data/report/2023-n-sumhss-annual-report
- https://www.samhsa.gov/data/report/2023-n-sumhss-detailed-tables
- https://pmc.ncbi.nlm.nih.gov/articles/PMC8714706/
- https://pubmed.ncbi.nlm.nih.gov/34871978/
- https://narronline.org/about/
- https://www.oxfordhouse.org/resources/annual-report-2023
- https://www.marketresearch.com/Grand-View-Research-v4060/Mental-Health-Addiction-Treatment-Centers-42296702/
- https://www.verifiedmarketresearch.com/product/substance-abuse-treatment-market/
- https://www.fortunebusinessinsights.com/u-s-substance-use-disorder-treatment-market-107172
- https://www.samhsa.gov/data/sites/default/files/reports/rpt53012/2023-nsumhss-annual-report.pdf

---

### 11. ECO-PROJ-1 — ecosystem / projection

**Assertion:** Combined 3-yr ARR: Conservative ~$1.74M (Y1 $105,840 → Y2 $417,900 → Y3 $1,216,020); Moderate ~$7.84M (Y1 $325,380 → Y2 $1,731,888 → Y3 $5,781,000).

**Stated source (internal):** `docs/go-to-market/ecosystem/monetization.md:150-154`

**Verdict:** `broken` · **confidence:** `high` · research verdict was `broken`/`high` · skeptic adjusted: no

**Confidence reason:** x

**Final rationale (post-skeptic):** Verdict survives independent skeptical review. (1) Internal arithmetic is self-contradicting: per-product Y3 ladders the doc itself lists sum to $995,400 Conservative and $4,384,800 Moderate, yet the headline rows claim $1,216,020 and $5,781,000 — gaps of $221k and $1.40M attributed to UNBUILT marketplace/data/cross-sell synergy (monetization.md lines 150-159; ECO-6/ECO-7 marked 'not built'). (2) Cross-doc contradiction confirmed: detox SSOT pricing.md DX-PROJ-Y3 p50 = $139,250, but the Aftercare ladder folded into these sums is credited $666,000 (Conservative) to $2,748,000 (Moderate) — 4.8x to 19.7x the owning SSOT, violating the doc's own no-contradiction rule. (3) External refutation is real and verified: Behave Health (getlatka.com) does the IDENTICAL vertical ('addiction treatment centers and sober living homes'), founded 2015, 8 employees, yet only $902.2K ARR after ~9 years — and it had funding/staff this solo part-time bootstrapped founder lacks. ChartMogul/Kyle Poyar dataset of 6,525 SaaS startups: only 13.4% reach $1M ARR within 3 years; the Moderate $5.78M Y3 exceeds even the 5-year top quartile (25.1% reach $1M by year 5). (4) Solo, part-time-Y1, bootstrapped constraint makes the verdict stronger, not weaker — even a funded 8-person team in this exact niche stalled below $1M after 9 years. Only correction to the research agent: its confidence_reason/steelman fields were placeholders ('x'); supplied a real basis here. Comparable figures verified and tightened ($902.2K, 13.4%).

<details><summary>Research-stage rationale</summary>

Sums three products plus unbuilt synergy. Detox SSOT Y3 p50 139k yet Aftercare credited 666k to 2750k, breaking the no contradiction rule; ladders sum 995k but row claims 1216k. Behave Health, same vertical, only 902k after nine years; 13.4 percent of SaaS reach 1M in three years. Moderate 5780k implausible for a solo part time founder.

</details>

**Steelman (claim true/achievable):** x

**Steelman-against (disconfirming case):** x

**Comparables:**

- Behave Health bootstrapped sober living software only 902k ARR after nine years
- ChartMogul 2025 only 13.4 percent reach 1M in three years

**Sources:**

- https://getlatka.com/companies/behave-health
- https://chartmogul.com/reports/saas-growth-the-odds-of-making-it/
- https://www.linkedin.com/posts/kyle-poyar_new-data-from-6525-saas-startups-its-easier-activity-7382033365652348928-Afoo
- https://www.saastr.com/chartmogul-the-best-in-saas-get-to-10m-arr-in-3-years-the-next-best-in-about-5-years/

---

### 12. ECO-PROJ-2 — ecosystem / projection

**Assertion:** At moderate Year-3 ARR of $5.78M and vertical health-tech SaaS multiples (8–15×), implied valuation is $46M–$87M.

**Stated source (internal):** `docs/go-to-market/ecosystem/monetization.md:162-164`

**Verdict:** `weak` · **confidence:** `high` · research verdict was `weak`/`high` · skeptic adjusted: no

**Confidence reason:** Four independent sources put 2026 private SaaS and health-tech revenue multiples at 1x-8x, with the sub-6M-ARR cohort at 3x-5x. The claimed 8x-15x is above market.

**Final rationale (post-skeptic):** Verdict survives independent scrutiny; I keep weak/high. (1) SOURCES: All four cited sources are real, external, third-party valuation advisories with live URLs that I opened and verified — SaaS Capital (bootstrapped 4.8x, equity-backed 5.3x, public median 7.0x; teens only for elite public names like CrowdStrike 20.8x), Aventis (2026 median 3.4x, explicit SIZE PREMIUM so small=discount, smallest cohort 3.3x), Nelson Advisors HealthTech Jan 2026 (central band 4-6x, AI-premium 6-8x+, sub-scale/unprofitable compressed to 3-4x and explicitly NOT 8-15x), plus independent corroboration that bootstrapped sub-$5M ARR trades 3-6x with 7-9x only at Rule-of-40>50 AND NRR>120%. The claim's own basis (monetization.md:162-164) is internal, derived from an archived founder market brief, so under the sourcing gate it is capped at weak regardless. (2) The 8-15x multiple is 2-3x above the entire external market band; confidence in the weakness is genuinely high because four independent sources agree. (3) SOLO CONSTRAINT pushes it further than the research agent allowed: the steelman defends the $46M floor via the AI-differentiated 6-8x band, but that band demands proprietary clinically-validated data, deep workflow integration, strong growth, Rule-of-40>50, NRR>120% — none demonstrable by a solo part-time-Y1 bootstrapped operator whose Stripe billing across the three synergy-bearing products is admittedly UNBUILT. The relevant comparable for this operator is the sub-scale 3-4x compressed band, so even the $46M floor is not defensible here; a disciplined 3-5x on a validated ARR yields ~$17M-29M, and at the doc's own conservative ~$1.22M Y3 ARR x4 only ~$5M. Both legs fail: an inflated multiple chained to an internal-only, synergy-folded, billing-unbuilt $5.78M ARR. (4) Comparables are real and analogous, none invented. I considered downgrading to broken; weak is the honest call because the arithmetic is sound and a narrow AI-differentiated best-case exists in the literature (just not for this operator), and the claim is a projection with a real if misapplied comparable band. adjusted=false.

<details><summary>Research-stage rationale</summary>

Arithmetic checks (5.78M x 8-15 = 46M-87M), so the claim rests on the multiple and the ARR. The 8x-15x multiple is 2-3x too high: SaaS Capital 2025 bootstrapped 4.8x, equity-backed 5.3x, public median 7.0x; Aventis median 2.9x/3.8x/3.1x for 2024/25/26 with the 0-5M cohort at 3.3x and size a premium not a discount; HealthTech M&A 4x-6x (6x-8x only if AI-differentiated); Finerva health/wellness median 1.1x. 8x-15x maps to top-decile public SaaS (14.2x) or the 2021-22 peak (11.8x), not a sub-6M bootstrapped app. A defensible 3x-5x gives ~17M-29M, about a third of the claim. The 5.78M moderate ARR is internal-only (founder market brief), folds in synergy from three products whose Stripe billing is admittedly unbuilt, for a solo part-time bootstrapped operator, so the ARR leg is itself aggressive and caps at weak under the sourcing gate.

</details>

**Steelman (claim true/achievable):** A truly AI-differentiated platform with strong NRR, 40%+ growth, and a referral-bus moat could reach the top of the comparable band: Nelson Advisors cites 6x-8x+ for AI HealthTech and SaaS Capital tops at 8.0x. At 8x, 5.78M ARR implies ~46M, the exact floor of the claimed range, and a strategic acquirer consolidating a scarce detox/sober-living/12-step ecosystem might pay a premium. So the bottom of 46M-87M is defensible in a best-case scenario.

**Steelman-against (disconfirming case):** Every source places the relevant multiple at 1x-8x, and size-adjusted at 3x-5x for a sub-6M-ARR company; 15x exists only in top-decile public SaaS or the 2021-22 bubble. The claim chains an unvalidated 5.78M ARR (depending on unbuilt billing across three products) with an inflated multiple. A disciplined 3x-5x yields ~17M-29M (35-40% of the claimed midpoint); at the doc's own conservative 1.22M Y3 ARR and 4x, ~5M. The 46M-87M headline is a ceiling-of-a-ceiling.

**Comparables:**

- SaaS Capital 2025: private SaaS 4.8x bootstrapped, 5.3x equity-backed, public median 7.0x
- Aventis Advisors: median 2.9x/3.8x/3.1x (2024-26); 0-5M cohort ~3.3x, size is a premium
- Nelson Advisors HealthTech M&A Aug 2025: 4x-6x typical, 6x-8x for AI-differentiated
- Finerva Health & Wellness 2026: median EV/Revenue 1.1x

**Sources:**

- https://www.saas-capital.com/blog-posts/private-saas-company-valuations-multiples/
- https://aventis-advisors.com/saas-valuation-multiples/
- https://www.linkedin.com/posts/lloydgprice_healthtech-ma-multiples-current-trends-activity-7362432498007478273-6zjw
- https://finerva.com/report/health-wellness-2026-valuation-multiples/
- https://nelsonadvisors.co.uk/blog/healthtech-m-a-multiples-january-2026--current-trends-and-variables-driving-valuations
- https://www.healthcare.digital/single-post/european-healthcare-technology-m-a-valuation-multiples-and-market-dynamics-report-by-nelson-advisor

_Non-URL source notes:_ /Users/marcus/dev/recovery-platform/docs/go-to-market/ecosystem/monetization.md

---

### 13. ECO-REG-2 — ecosystem / regulatory

**Assertion:** D-10 rationale: relay built but disabled; O-3 (B2B SaaS seat) chosen because it sidesteps per-referral legal landmines; legal review required before any money movement.

**Stated source (internal):** `#830 + docs/go-to-market/ecosystem/monetization.md:100-132`

**Verdict:** `validated` · **confidence:** `medium` · research verdict was `validated`/`high` · skeptic adjusted: yes

**Confidence reason:** The legal premise is grounded in a specific federal criminal statute (EKRA, 18 U.S.C. Section 220) with a 2025 federal appellate decision (US v. Schena, 9th Cir.) and a documented per-referral prosecution; the code-state ("relay built but disabled") was directly verified in this repo. The half-grade reservation is qualitative: "sidesteps" overstates what a SaaS seat legally achieves, but the doc self-caveats this correctly.

**Final rationale (post-skeptic):** Independently re-verified. EXTERNAL SOURCES ARE REAL AND HOLD: (1) EKRA (18 U.S.C. Section 220), enacted Oct 24 2018, is a genuine federal criminal statute and is ALL-PAYOR (covers private pay, not just Medicare/Medicaid) — confirmed by Dorsey Health Law and multiple firms, independent of the GTM docs. (2) Its statutory exception explicitly fails for payments that "vary based on the number of individuals referred" — confirmed verbatim by independent search of the statute text, which is exactly the metering mechanic of O-1/O-2. (3) US v. Schena (9th Cir., affirmed July 11 2025) is real — confirmed via Mintz — and CRUCIALLY the source confirms the nuance: "a percentage-based payment to a marketer is not per se unlawful under EKRA," but liability turns on inducement, so a fixed/subscription label is NOT automatically safe. CODE-STATE VERIFIED IN-REPO: referral relay is disabled (project-management.md confirms "referral relay remains disabled (partner agreement pending)"); mechanism is built (recovery-api/src/callable/referrals.ts, config/apps.ts with phoenix-cleanhouse/nextstep-recovery/treatment-center registry). DECISION TEXT VERIFIED: docs/go-to-market/_shared/decisions-log.md D-10 recommends O-3 with O-1 as tactical bridge and mandates anti-kickback/patient-brokering legal review before any per-referral money movement; monetization.md says O-3 "sidesteps per-referral brokering optics" and is "the cleanest posture" — the doc does NOT claim O-3 is legally safe and self-caveats correctly. WHY DOWNGRADE high->medium (adjusted=true): the assertion's verb "sidesteps" is materially overstated against Schena, which the verdict itself flagged but then still scored "high." More importantly, the entire regulatory landmine is currently HYPOTHETICAL — relay disabled, no partner agreement, no facility dashboard (ECO-6 not built), zero revenue — so the decision is sound-but-untested. SOLO-FOUNDER LENS: this is a cost-free documentation/decision claim, not a build/revenue claim, so the constraint does not break it; deferring money movement pending counsel is the correct bootstrapped posture. But the same constraint surfaces real tension the one-liner hides: O-3 (the "clean" model) requires building an entire facility dashboard before earning a dollar, so only the riskier O-1 per-referral path earns early — meaning the clean-posture narrative is partly aspirational for a part-time-Y1 solo. Net: legal reasoning is well-supported by external statute and case law; verdict stays validated, but confidence drops to medium because "sidesteps" overstates protection and the threat is not yet operative.

<details><summary>Research-stage rationale</summary>

Three sub-claims, assessed against external law. (1) "Per-referral legal landmine" is REAL and the doc's framing is accurate. EKRA (18 U.S.C. Section 220), enacted Oct 2018, criminalizes soliciting/paying/receiving remuneration in return for referring a patient to a "clinical treatment facility" or "recovery home." Critically it is ALL-PAYOR (covers commercial insurance and private-pay, not just Medicare/Medicaid like the AKS), so a recovery platform cannot escape it by avoiding federal reimbursement. Its statutory exception explicitly fails for any payment that "varies by (A) the number of individuals referred." That is exactly the metering mechanic of O-1 (flat per-referral fee) and O-2 (rev-share on converted referral). A New Jersey prosecution convicted a physician and marketing agents for paying $5,000-$10,000 per-patient referral fees scaled by monthly volume/length of stay — the precise structure O-1/O-2 resemble. Penalties: up to 20 yrs and $200k/violation. So the doc's "brokering trap" warning is not hand-waving; it maps to a live, prosecuted criminal statute. (2) "O-3 chosen because it sidesteps per-referral landmines" is directionally correct but the verb "sidesteps" is slightly too strong. A genuinely fixed subscription seat NOT tied to referral volume carries "comparatively lower risk" per multiple health-law firms, and a real comparable (Recovery.com) runs exactly this flat-fee-profile posture instead of pay-per-lead. BUT US v. Schena (9th Cir., July 2025) clarified that structure/labeling is not automatically dispositive — percentage or fixed compensation can still violate EKRA if the government shows the arrangement was a wrongful inducement for referrals. So a "continuing-care SaaS seat" that bundles referral routing could still draw scrutiny if facts show the seat is a disguised per-patient inducement. O-3 therefore REDUCES, not eliminates, exposure. The doc actually states this correctly — it calls O-3 "the cleanest posture" (not "safe") and still mandates legal review — so the underlying reasoning is sound even if the one-line summary compresses "cleaner posture" into "sidesteps." (3) "Legal review required before any money movement" is correct and prudent: EKRA has no OIG-style advisory-opinion process (unlike the AKS), creating genuine statutory uncertainty that practitioners flag, so pre-launch counsel review is the standard recommendation. Code-state independently verified: detox-recovery/docs/go-to-market/project-management.md:127 confirms "referral relay remains disabled (partner agreement pending)," and the mechanism is built (recovery-api/src/callable/referrals.ts plus referrals.test.ts, apps.ts registry). Solo-founder lens: this is a documentation/decision claim, not a build claim — adopting O-3 and deferring money movement pending counsel is exactly the low-cost, risk-avoidant posture a bootstrapped solo founder should take, and costs nothing to assert now. Net: the claim's legal reasoning is well-supported by external statute, case law, and a real comparable; only the compression in the word "sidesteps" keeps it from being airtight.

</details>

**Steelman (claim true/achievable):** EKRA is a real, all-payor federal criminal statute whose exception explicitly breaks for volume-varied referral payments; the exact per-patient-fee structure of O-1/O-2 has been criminally prosecuted (NJ case, $5-10k/patient). A flat B2B SaaS seat decoupled from referral count is the recognized lower-risk structure and is what an actual operating comparable (Recovery.com) uses. EKRA's lack of an advisory-opinion mechanism makes pre-money legal review genuinely necessary. Every element of the claim therefore tracks external law; the code-state ("built but disabled") is verified in-repo. The recommendation to favor O-3 and gate money movement on counsel is precisely the correct, cost-free posture for a bootstrapped solo founder.

**Steelman-against (disconfirming case):** "Sidesteps" overstates the protection: US v. Schena (9th Cir. 2025) confirms that labeling a payment as a fixed/subscription fee does NOT automatically immunize it — if a treatment-center "continuing-care seat" functionally bundles referral routing and the facts show inducement, EKRA can still apply, so O-3 reduces rather than eliminates legal risk. Moreover, the whole regulatory analysis is somewhat academic today: the relay is disabled, there is no partner agreement, no facility dashboard (ECO-6 not_started), and no revenue — so the "landmine" is hypothetical and O-3 cannot actually sell. A skeptic could argue the claim dresses up a not-yet-real product decision in statutory citations, and that the real near-term risk for a solo founder is that O-3 requires building an entire facility dashboard before it earns a dollar, making the "tactical bridge" O-1 (the riskier per-referral option) the only one that earns early — partially undercutting the clean-posture narrative.

**Comparables:**

- Recovery.com (formerly RehabPath) — treatment-discovery platform that monetizes via flat verified-profile/subscription listings rather than per-referral/pay-per-lead fees; real-world instance of the O-3-style posture the doc recommends to avoid EKRA brokering exposure
- United States v. Schena (9th Cir., July 2025) — affirmed EKRA conviction of a lab operator who paid marketing intermediaries for referrals; established that fixed/percentage labels are not automatically safe, directly limiting how far O-3 'sidesteps' liability
- New Jersey EKRA prosecution (physician + marketing agents) — guilty pleas for $5,000-$10,000 per-patient referral fees scaled by monthly volume and length of stay; the prosecuted structure mirrors O-1/O-2, validating the 'brokering trap' warning
- AKS/Stark regime (Medicare/Medicaid-only) — the contrast case showing why EKRA matters here: EKRA extends kickback liability to all-payor/private-pay, so a recovery platform cannot escape by avoiding federal reimbursement

**Sources:**

- https://www.thefederalcriminalattorneys.com/eliminating-kickbacks
- https://www.americanhealthlaw.org/content-library/publications/bulletins/49b5f30c-d8fa-4df0-8090-cc3f64e9f801/ekra-convictions-send-message-about-enforcement-an
- https://www.hchlawyers.com/blog/2025/august/ekra-gets-its-second-major-court-test-what-the-s/
- https://www.mintz.com/insights-center/viewpoints/2146/2025-07-17-ninth-circuit-court-appeals-affirms-ekra-conviction-lab
- https://www.dechert.com/knowledge/onpoint/2025/9/ekra-heats-up--what-u-s--laboratories-and-investors-need-to-know.html
- https://www.insidethefalseclaimsact.com/the-eliminating-kickbacks-in-recovery-act-an-unprecedented-expansion-of-anti-kickback-liability-to-private-pay-referrals/
- https://recovery.com/
- https://www.whistleblowerllc.com/ekra-eliminating-kickbacks-in-recovery-act/
- https://www.dorseyhealthlaw.com/the-eliminating-kickbacks-in-recovery-act-of-2018-ekra-a-new-federal-kickback-law-applicable-to-all-payors/
- https://www.law.cornell.edu/uscode/text/18/220

---

### 14. HG-ROAD-2 — homegroups / roadmap

**Assertion:** R-1/R-2: no default Stripe price on intergroup Tier A/B → 'silent revenue-zero failure mode'; every intergroup/TC checkout fails today.

**Stated source (internal):** `homegroups/docs/go-to-market/monetization.md:42-46`

**Verdict:** `weak` · **confidence:** `medium` · research verdict was `validated`/`high` · skeptic adjusted: yes

**Confidence reason:** Mechanism verified by code path plus Stripe API docs; only the live Dashboard state is unobservable, so high not absolute.

**Final rationale (post-skeptic):** The CONDITIONAL mechanism is solid: getDefaultPriceForProduct (stripe.ts:157-179) throws when product.default_price is null; it runs before any session in createIntergroup.ts:172 and upgradeIntergroupTier.ts:71, and treatment-center reuses createIntergroup (type: "treatment_center"). I verified both Stripe docs externally — default_price IS nullable (example shows "default_price": null) and a subscription-mode Checkout Session requires line_items with price/price_data — so an unset default price hard-fails that product to zero revenue. That part is real and externally grounded. But the ASSERTION as worded overreaches on three points that the research agent flagged in its own steelman_against yet still graded "high". (1) "every intergroup/TC checkout fails TODAY" is a live Stripe Dashboard-state claim whose only support is internal GTM docs (monetization.md:53-56, launch-readiness.md); it is unobservable from code and unverifiable externally — per the sourcing gate, a present-tense quantitative-flavored claim resting only on founder/GTM docs caps at 'weak'. (2) The differential "consumer group tier is the only tier able to transact" is undermined by code: the consumer GROUP subscription flows (createGroupWithSubscription.ts:126, createGroupSubscription.ts:140, requestAdminAccessWithSubscription.ts:209, reactivateGroupSubscription.ts:220) call the SAME getDefaultPriceForProduct(productIdGroup) resolver. The group tier is "safe" only on the assumption that productIdGroup happens to have a default price while the intergroup products do not — pure Dashboard state, not a code guarantee. Only the per-member priceIdMember path bypasses the resolver. (3) "silent" is technically wrong: the resolver console.error-logs and throws HttpsError, failing loud server-side. Solo-founder constraint does not break the mechanism but confirms the "TOP BLOCKER" label is inflated — the fix is a ~10-minute Dashboard click, zero code, zero capital: an un-ticked checkbox, not an architectural risk. Net: mechanism validated; the literal "every checkout fails today / consumer tier alone transacts / silent" packaging is GTM-doc-only and code-contradicted, so the overall claim caps at weak.

<details><summary>Research-stage rationale</summary>

Code at functions/src/utils/stripe.ts:157-179 throws when product.default_price is null; resolver runs at createIntergroup.ts:172 and upgradeIntergroupTier.ts:71 before any Stripe session is created, and treatment-center reuses createIntergroup. Stripe docs confirm default_price is nullable and Checkout requires line_items with a price, so an unset default price hard-fails to zero revenue. Fix is a few-clicks Dashboard action. Caveat: the present-tense today rests on internal status; the conditional mechanism is fully proven.

</details>

**Steelman (claim true/achievable):** Backed by code and vendor docs. Resolver throws on null default_price, runs first in the checkout transaction, and Stripe confirms default_price can be null and Checkout needs an explicit price. So if Tier A/B lack default prices, all intergroup and TC checkouts fail before a session exists while the consumer tier still transacts. High-severity, near-zero-effort blocker, correctly flagged.

**Steelman-against (disconfirming case):** Overstates twice. Every checkout fails today is a live Dashboard assertion not externally verifiable and possibly stale. Silent is imprecise since the server logs and throws an HttpsError. The gap is a ~10-minute config fix, so labeling it a TOP BLOCKER is rhetorically inflated, an un-ticked checkbox rather than an architectural risk. None undercut the mechanism.

**Comparables:**

- Stripe Product object API reference shows default_price nullable with example default_price null (https://docs.stripe.com/api/products/object)
- Stripe Checkout Session create requires line_items with price or price_data (https://docs.stripe.com/api/checkout/sessions/create)
- Stripe Manage prices: set default price is a few-clicks Dashboard action (https://docs.stripe.com/products-prices/manage-prices)

**Sources:**

- https://docs.stripe.com/api/products/object
- https://docs.stripe.com/api/checkout/sessions/create
- https://docs.stripe.com/products-prices/manage-prices
- https://docs.stripe.com/api/products/object (verified: default_price nullable, example shows null)
- https://docs.stripe.com/api/checkout/sessions/create (verified: line_items required in subscription mode, each needs price or price_data)
- https://docs.stripe.com/products-prices/manage-prices (set default price is a few-clicks Dashboard action)

_Non-URL source notes:_ homegroups/functions/src/utils/stripe.ts:157-179 (resolver throws on null default_price); homegroups/functions/src/callable/createIntergroup.ts:172,191-201 (resolver runs before session.create); homegroups/functions/src/callable/upgradeIntergroupTier.ts:71 (Tier B checkout); homegroups/functions/src/callable/createGroupWithSubscription.ts:126 / createGroupSubscription.ts:140 / requestAdminAccessWithSubscription.ts:209 / reactivateGroupSubscription.ts:220 (consumer group tier uses SAME resolver — contradicts 'only consumer tier transacts' being a code guarantee); homegroups/docs/go-to-market/monetization.md:37-56 (source GTM claim, present-tense 'today' assertion — internal doc, not external)

---

### 15. RG-REG-2 — regroup / regulatory

**Assertion:** D-12 regroup HIPAA/BAA surface OPEN; written legal opinion required; launch-blocking. Sober-living data (sobriety date, medication field, drug-test results, EES/payment) may be health-adjacent.

**Stated source (internal):** `docs/go-to-market/_shared/decisions-log.md:37 + regroup/docs/go-to-market/project-management.md:151-154`

**Verdict:** `weak` · **confidence:** `medium` · research verdict was `weak`/`medium` · skeptic adjusted: no

**Confidence reason:** Multiple external sources (HHS, eCFR, Google Cloud docs, sober-living-specific HIPAA guides) converge on the regulatory facts, so the underlying surface is well-documented. But the central quantitative judgment in the claim — that this is "launch-blocking" requiring a "written legal opinion" — is contradicted by the same external evidence, which shows the dominant comparable outcome (non-clinical sober-living = not a covered entity) and a self-serve, zero-cost resolution path. No source frames a written attorney opinion as a hard launch prerequisite for a housing/peer-support SaaS, so the "blocking" framing rests on internal caution rather than external authority.

**Final rationale (post-skeptic):** Independently verified the four load-bearing external facts and the verdict survives. (1) HHS covered-entity criteria + sober-living-specific guides confirm a standalone HOUSING + PEER-SUPPORT operation is typically NOT a HIPAA covered entity, so regroup (a SaaS to such houses) is not a business associate and HIPAA may not attach at all — the modal real-world outcome is "doesn't apply." (2) Google Cloud BAA is self-serve, carries no extra HIPAA charge, and covers Firestore/Cloud Functions/Cloud Storage — regroup's exact stack (verified at cloud.google.com via support.google.com/cloud/answer/6329727). ~15 min, not a legal project. (3) Multiple 2025/2026 sources confirm Stripe does NOT sign BAAs and relies on HIPAA's payment-processor exception, so the original claim's "sign BAAs with Stripe" instruction is partly impossible as written and payment/rent data is the LEAST of the exposure. (4) The genuinely stricter 42 CFR Part 2 also generally does not bind non-clinical housing, and the original RG-REG-2 claim does not even mention it — a real analytical gap signaling internal caution rather than statute-grounded reasoning.

The claim conflates "is there a PHI surface worth thinking about" (TRUE) with "launch-blocking + mandatory written legal opinion" (OVERSTATED). No external source frames an attorney opinion as a hard launch prerequisite for housing/peer-support SaaS; the dominant comparable outcome plus a free self-serve mitigation path contradict the "blocking" framing.

SOLO-FOUNDER CONSTRAINT reinforces (does not rescue) the downgrade: the unblock path — free GCP BAA click-through, keep PHI out of non-covered Firebase services (Analytics/Crashlytics/Remote Config/RTDB), treat Stripe as payment-only, write a one-page not-a-covered-entity memo — is precisely what a part-time bootstrapped founder can execute with no capital and no counsel. A paid written legal opinion is prudent, not a launch gate.

Capped at 'weak' (not lower) because the supporting evidence is secondary/explanatory rather than one dispositive statute applied to regroup's exact facts; not 'broken' because the PHI surface and the upmarket steelman (a house that bills insurance / does MAT / partners with a treatment-center referral target could flip to a covered entity, pulling regroup in as a directly-liable business associate) are genuinely real and warrant monitoring as the product moves upmarket. Confidence 'medium': facts are well-sourced and convergent, but the covered-entity line is inherently fact-dependent house-by-house. Verdict retained as-is; no adjustment warranted.

<details><summary>Research-stage rationale</summary>

The claim conflates two things: (a) "is there a HIPAA/PHI surface worth thinking about" — TRUE, and (b) "it is launch-blocking and needs a written legal opinion before any launch" — OVERSTATED by external evidence.

REGULATORY FACTS (external):
1. HIPAA applies only to "covered entities" (providers who bill insurance / transmit standard electronic health transactions, health plans, clearinghouses) and their "business associates" (HHS, hhs.gov/hipaa/.../covered-entities). A standalone sober-living house that provides only HOUSING + PEER SUPPORT and does NOT provide clinical treatment or bill insurance is "typically NOT a covered entity" (soberlivingapp.com 2026 guide; learntastic.com on assisted-living parallels). regroup's described users are house operators/residents — housing + rent + attendance, not clinical billing. If the houses aren't covered entities, regroup is not their business associate, and HIPAA does not attach to regroup's data at all.
2. The genuinely STRICTER regime here is 42 CFR Part 2 (eCFR Title 42 Part 2), which protects SUD records. But Part 2 only binds a "Part 2 program" — a federally-assisted entity that "holds itself out as providing" SUD diagnosis/treatment/referral (soberlivingschool.com; lac.org). A non-clinical sober-living SaaS does not hold itself out as a treatment provider, so Part 2 generally does not bind it either. The claim does not even cite Part 2 (the real risk), which is itself a sign the internal analysis is incomplete.
3. STRIPE: The claim asserts a Stripe BAA may be needed. External evidence shows Stripe does NOT sign BAAs (accountablehq, paubox, hipaatizer, Stripe's own support note via TherapyMate) — and, more importantly, takes the position that as a payment processor it "only receives payment information and does not have access to PHI," invoking HIPAA's financial-institution payment exception (paubox quoting the 164.501 banking-transaction carve-out). So "sign a BAA with Stripe" is not even an available action; the real answer is that payment/rent data routed through Stripe is outside the BAA mechanism by design. The claim's framing ("sign BAAs with Google Cloud + Stripe") is partly impossible as written.
4. GOOGLE CLOUD: If the founder wants belt-and-suspenders coverage, the Google Cloud BAA is a 4-step, self-serve, click-through in IAM & Admin ("Review and Accept" → "I Accept"), once per org, at NO additional cost, covering Firestore, Cloud Functions, and Cloud Storage — exactly regroup's stack (cloud.google.com/security/compliance/hipaa; support.google.com/cloud/answer/6329727; accountablehq Firebase guide; Google Groups confirmation that Firestore/Functions/Storage are in the standard BAA). This is ~15 minutes of work, not a legal project. The non-covered Firebase services (Analytics, Crashlytics, Remote Config, Realtime DB) must simply not carry PHI — a config discipline, not a blocker.

SOLO-FOUNDER FEASIBILITY: Nothing here requires a funded team or a paid written legal opinion to UNBLOCK launch. The defensible, near-zero-cost path is: (i) accept the free Google Cloud BAA click-through (covers the stack regardless of how the covered-entity question resolves), (ii) keep PHI out of non-covered Firebase services, (iii) treat Stripe as a payment-only processor (no BAA available or needed), (iv) document a one-page data inventory and the not-a-covered-entity rationale. A written attorney opinion is PRUDENT risk-reduction but is not, on the external evidence, a launch gate. So "launch-blocking; written legal opinion required" overstates the consequence.

Net: the surface is REAL (verdict not "broken"), but the claim's core quantitative assertion — launch-blocking + mandatory written legal opinion — is not supported by external authority and is contradicted by the cheap, self-serve mitigations available. Capped at 'weak' because the supporting sources are secondary/explanatory rather than a single dispositive statute applied to regroup's exact facts, and because the genuinely correct risk (42 CFR Part 2) was not the one the claim raised.

</details>

**Steelman (claim true/achievable):** The cautious read defensibly holds. regroup stores sobriety dates, a medication field, drug-test results, and EES/payment records tied to identified residents — facially health-related data about people in recovery, which is high-sensitivity and stigma-laden. The covered-entity line is genuinely fact-dependent: if ANY regroup house bills insurance, employs clinical staff, does MAT/medication management, or partners with a treatment center (and regroup's own ecosystem includes a "treatment-center" referral target), that house could be a covered entity, which would make regroup its business associate and pull regroup directly under HIPAA — and a business associate IS directly liable (HHS). 42 CFR Part 2 is even stricter and carries its own penalties. Because the line depends on facts that vary house-to-house and may change as the product moves upmarket, a one-time written legal opinion that pins down the boundary, plus signing the (free) Google Cloud BAA defensively, is cheap insurance against a regime with statutory penalties and reputational catastrophe if SUD data leaks. For a solo bootstrapper with no legal cushion to absorb an enforcement action, "don't launch until a lawyer confirms scope" is a rational posture, not over-caution.

**Steelman-against (disconfirming case):** The claim overstates the blocker and misidentifies the mechanism. (1) The dominant, well-sourced outcome is that a housing + peer-support sober-living operation is NOT a HIPAA covered entity, so regroup is not a business associate and HIPAA simply does not attach — the modal real-world answer is "doesn't apply." (2) The claim says to "sign BAAs with Stripe," but Stripe does not offer BAAs and asserts it handles only payment data under HIPAA's financial-transaction exception — so that action is impossible and unnecessary; payment/rent data is the LEAST of the exposure. (3) The Google Cloud BAA is a free, 4-step, self-serve click-through covering exactly Firestore/Functions/Storage — so the "BAA surface" is resolved in 15 minutes by the founder alone, with no lawyer and no cost. (4) The claim doesn't even mention 42 CFR Part 2, the actually-stricter regime, indicating the internal analysis hasn't engaged the real risk. A founder can fully de-risk launch by clicking the free GCP BAA, keeping PHI out of non-covered Firebase services, and writing a one-page not-a-covered-entity memo — none of which requires a paid written legal opinion or blocks shipping. Framing this as launch-blocking imposes solo-founder paralysis on a surface the market routinely handles with self-serve clicks.

**Comparables:**

- Sober living operators / non-clinical recovery residences (per soberlivingapp.com 2026 HIPAA guide and learntastic assisted-living analysis): consensus outcome is NOT a HIPAA covered entity when only housing + peer support is provided — the modal real-world result is HIPAA does not attach.
- Stripe (accountablehq, paubox, hipaatizer, Stripe support via TherapyMate): does NOT sign BAAs; takes the position it processes payment-only data under HIPAA's financial-institution exception — i.e., a BAA with Stripe is neither available nor needed for rent/payment data.
- Google Cloud / Firebase (cloud.google.com/security/compliance/hipaa, support.google.com/cloud/answer/6329727, accountablehq Firebase guide): BAA is a free, self-serve 4-step click-through covering Firestore, Cloud Functions, Cloud Storage — the exact regroup stack — making defensive coverage trivial for a solo dev.
- Behave Health / One Step Software (behavehealth.com EHR-for-sober-living, onestepsoftware.com): sober-living management/EHR vendors that build HIPAA-aligned architecture as a market expectation (family trust / upmarket sales) even where not strictly required — the pragmatic 'comply-anyway' posture, achieved via product config, not a launch-gating legal opinion.

**Sources:**

- https://www.hhs.gov/hipaa/for-professionals/covered-entities/index.html
- https://soberlivingapp.com/blog/hipaa-compliance-sober-living-homes
- https://www.ecfr.gov/current/title-42/chapter-I/subchapter-A/part-2
- https://soberlivingschool.com/post/how-are-sober-living-homes-impacted-by-42-cfr-part-2
- https://www.lac.org/resource/the-fundamentals-of-42-cfr-part-2
- https://cloud.google.com/security/compliance/hipaa
- https://support.google.com/cloud/answer/6329727
- https://www.accountablehq.com/post/is-firebase-hipaa-compliant-baa-covered-services-and-how-to-use-it-safely
- https://www.paubox.com/blog/stripe-hipaa-compliant
- https://www.accountablehq.com/post/is-stripe-hipaa-compliant-a-guide-with-best-practices-and-compliance-tips
- https://www.hipaatizer.com/integrations/hipaa-forms-stripe/
- https://behavehealth.com/best-ehr-for-sober-living
- https://www.onestepsoftware.com/hipaa-compliant-software-and-sober-livings/
- https://learntastic.com/blog/assisted-living-facilities-and-hipaa-avoiding-costly-mistakes
- https://baagenerator.com/blog/does-stripe-sign-a-baa
- https://www.vanderburghhouse.com/background-checks-drug-testing-and-privacy-laws-in-sober-living-homes-what-operators-often-get-wrong/
- https://www.asam.org/docs/default-source/advocacy/coe-phi-faqs-about-42-cfr-part-2.pdf

---

### 16. RG-REG-4 — regroup / regulatory

**Assertion:** Rotate 3 leaked service-account keys + purge git history (RG-P0-8) not_started; credentials committed to git history are a live breach vector.

**Stated source (internal):** `regroup/docs/go-to-market/project-management.md:48,131-136`

**Verdict:** `weak` · **confidence:** `medium` · research verdict was `validated`/`high` · skeptic adjusted: yes

**Confidence reason:** Core mechanism is confirmed by Google's own current IAM docs plus independent security research. A GCP service-account key committed to git is a live, non-expiring credential exploitable until rotated. This is a security-mechanism claim, not a market projection, so authoritative external confirmation carries it. Short of absolute only because I could not confirm the three specific keys exist in any surviving history (this monorepo scans clean); exact exposure depends on prior standalone repos I could not fully inspect.

**Final rationale (post-skeptic):** Mechanism half is externally confirmed: Google IAM best-practices doc states verbatim that SA keys "don't have an expiry time and stay valid until you delete them" and "if you've accidentally submitted a service account key to a source code repository, you must delete the key in IAM as quickly as possible... It's not sufficient to only delete the key from the source code repository." Aquilax analysis confirms rotation != history-purge (old commit SHA recoverable via clones, raw.githubusercontent CDN-by-SHA, reflog). So "credentials in git history are a live breach vector" is a sound, externally-sourced security mechanism, and RG-P0-8 is genuinely not_started (regroup/docs/go-to-market/project-management.md line 48). Solo-founder constraint does NOT break it: rotate+purge is 1-2 hrs with gcloud + BFG/git-filter-repo, and the repo ships regroup/mobile/scripts/rotate-service-keys.sh. BUT I downgrade from validated/high to weak because the assertion's specific "3 leaked keys / live breach vector" is not substantiated by any evidence I can reach: (1) the monorepo's 142-commit squashed history contains NO actual key material — pickaxe for "BEGIN PRIVATE KEY"/private_key_id/"private_key" returns only doc placeholders — so its own acceptance criterion (git log --all returns nothing) is already satisfied; (2) I independently cloned the one genuinely PUBLIC repo, marcusk639/regroup-go (HCL/Terraform, the highest-risk IaC surface, which the research agent flagged but never scanned) and found it CLEAN across all history — no JSON keys, no private-key content, no tfvars secrets — eliminating the public 15-min-auto-exploit threat model the alarming external data rests on; (3) all other relevant repos are private. The truly load-bearing action is GCP key ROTATION, which the doc's git-log acceptance criterion does not even verify, so the criterion is mis-specified. Net: directionally correct and the rotation step is worth doing, but "live breach vector" overstates immediacy (private-only exposure to a bounded trusted set, not the open internet) and the three specific keys are unverifiable, which is weak, not high-confidence validated.

<details><summary>Research-stage rationale</summary>

Two parts: one, credentials committed to git history are a live breach vector; two, remediation (rotate keys plus purge history) is not_started. Part one is externally confirmed. Google current IAM best-practices doc: SA keys do not have an expiry time and stay valid until you delete them, and if you have accidentally submitted a service account key to a source code repository you must delete the key in IAM as quickly as possible. A committed key is a standing long-lived credential exploitable by anyone with repo read access, exactly as the internal doc frames it. The aquilax analysis confirms the deeper point the task wants tested: rotation and history-purge are DIFFERENT operations. Rotation neutralizes the credential; history-purge alone (the doc acceptance criterion, git log --all returns nothing) does NOT, because a key in an old immutable commit SHA stays exploitable until the key is revoked. Honeytoken data (AWS contacting owners within about 15 min on public repos; a researcher earning a 25k-USD bounty finding secrets in deleted commits) shows exploitation is real, fast, automated. Solo feasibility: 1-2 hours, not a project. gcloud keys delete/create plus BFG or git-filter-repo plus force-push is well-trodden; the repo even ships rotate-service-keys.sh for this. Trivially achievable solo; only cost is forcing collaborators to re-clone. EVIDENCE-STATE CAVEAT for the PM: in THIS monorepo (github.com/marcusk639/recovery-platform, PRIVATE, 142 commits, single squashed import dated 2026-05-31), the exact acceptance-criterion search plus pickaxe scans (private_key_id, BEGIN PRIVATE KEY, iam.gserviceaccount.com, and globs for service-account.json, adminsdk.json, credentials.json) return ZERO committed key files, only placeholder examples in the remediation script and plan. So the monorepo own git log --all criterion is ALREADY satisfied. Residual exposure (if the keys were ever committed) lives in prior standalone repos predating the import (regroup-functions, regroup-rn7, regroup-web, regroup, all PRIVATE) and in GCP as still-valid credentials. Net: the breach VECTOR is real and the rotation half is load-bearing and not_started; the purge-this-repo half may be moot; severity is materially lowered by all relevant repos being PRIVATE (the 15-min auto-exploit figures are for PUBLIC repos). One adjacent repo, regroup-go, IS public, worth a 5-minute scan before closing.

</details>

**Steelman (claim true/achievable):** A GCP service-account key is a long-lived bearer credential that, per Google own docs, never expires until deleted. Once committed to git it persists in immutable commit objects forever and grants full Firebase Admin SDK access (read and write all Firestore, mint custom tokens, bypass security rules) to anyone who can read the history: collaborators, a compromised GitHub token, CI logs, GitHub staff, a future accidental public-flip, or a fork. Google explicit instruction is to delete or disable the key as quickly as possible. Research shows leaked keys are exploited within minutes when public, and force-pushed or deleted commits stay recoverable (a researcher earned a 25k-USD bounty proving it). For a sober-living app holding health-adjacent PII (sobriety dates, medication fields), an admin-key compromise is a worst-case breach. Remediation is cheap and clearly not_started, so P0 is correct and the rotation step is genuinely urgent regardless of repo visibility.

**Steelman-against (disconfirming case):** In this monorepo the asserted artifact is not findable: the exact acceptance-criterion query plus private-key pickaxe scans over all 142 commits return nothing, only placeholder examples in a rotation script. History was squashed into a fresh 2026-05-31 import, so purge git history (this repo) is already effectively done; the doc own success test passes today. Every relevant repo (the monorepo and all prior standalone regroup repos) is PRIVATE, removing the automated-scanner and 15-minute-exploit threat model the alarming external data is built on, which is for PUBLIC leaks. Thus live breach vector overstates immediacy: a key in a private repo is exposed only to a bounded set of trusted parties, not the open internet. The truly load-bearing action is key ROTATION in GCP, which the doc git log acceptance criterion does not even verify, so the criterion is mis-specified and could be marked done while live keys still exist. The claim is directionally right but its severity and acceptance criterion are both miscalibrated.

**Comparables:**

- Google Cloud IAM best-practices for service-account keys (vendor authority): keys do not have an expiry time and stay valid until you delete them; if you have accidentally submitted a service account key to a source code repository you must delete the key in IAM as quickly as possible; disable-then-delete, exposed keys are a security risk
- Aquilax security analysis Secrets That Outlive Their Rotation: rotation is not equal to history-purge; a secret in an old commit SHA stays recoverable via clones, raw.githubusercontent CDN by SHA, and forks even after force-push
- 25k-USD bug bounty for recovering secrets from deleted or force-pushed GitHub commits (r/programming, 2025): proves purged history remains a recovery path, validating must-rotate over just-delete-the-file
- AWS honeytoken anecdotes (Hacker News, GitGuardian): AWS contacts owners within about 15 minutes of a key hitting a PUBLIC GitHub repo; quantifies exploitation velocity but applies only to public leaks
- GitGuardian honeytoken and Kubernetes-secret mitigation guidance: standard incident playbook is rotate-first-then-clean-history, mirroring the task two-part structure

**Sources:**

- https://docs.cloud.google.com/iam/docs/best-practices-for-managing-service-account-keys
- https://cloud.google.com/blog/products/identity-security/help-keep-your-google-cloud-service-account-keys-safe
- https://aquilax.ai/blog/secrets-git-history-rotation
- https://www.reddit.com/r/programming/comments/1lpun8i/security_researcher_earns_25k_by_finding_secrets/
- https://news.ycombinator.com/item?id=13072096
- https://blog.gitguardian.com/honeytokens-for-peace-of-mind/
- https://github.com/orgs/community/discussions/189652
- https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
- https://github.com/marcusk639/regroup-go

---

### 17. RG-ROAD-1 — regroup / roadmap

**Assertion:** Tier-billing flag + amountCents + resolver (RG-RM-7) not_started (no TIER_BILLING_ENABLED; no amountCents) — plan only; gates ALL regroup subscription revenue.

**Stated source (internal):** `regroup/docs/go-to-market/roadmap.md:50`

**Verdict:** `weak` · **confidence:** `medium` · research verdict was `weak`/`high` · skeptic adjusted: yes

**Confidence reason:** Code state verified directly in tree; mechanism grounded in Stripe published docs; capped at weak by the sourcing gate because the quantitative business claim rests on internal docs and external evidence contradicts its universal scope.

**Final rationale (post-skeptic):** Verdict tier (weak) survives independent scrutiny; I adjusted confidence high→medium because the research agent reached the right answer via partly-wrong reasoning. PART 1 (code state "not_started, plan only") is TRUE and I re-verified it: zero TIER_BILLING_ENABLED in regroup/functions source (only in docs/plan); SUBSCRIPTION_TIERS at config.ts:37-78 has only priceEnvVar/maxResidents/maxProperties/label, no amountCents (the amountCents tokens are unrelated rent code at stripeWebhook.ts:307 and scheduledRentCollection.ts:65-80); util/tierPricing.ts does not exist. PART 2 ("gates ALL regroup subscription revenue") is overstated — agent is right about that — BUT the agent's supporting claim that "a complete live path can already take operator money without RG-RM-7" is NOT demonstrable in the tree. The sole caller, createOperatorSubscription (subscriptions.ts:156), was already migrated to the tier model (commit d1374eb) and resolves priceId from tierConfig.priceEnvVar (STRIPE_PRICE_TRAD_*), throwing "Price ID not configured" before reaching Stripe because those six IDs are unset (RG-RM-8 = blocked). Moreover createSubscription (stripe.ts:82) still hardcodes the legacy two-item house+guest structure and ignores the resolved tier priceId, so even with IDs present it cannot bill the advertised flat-fee tiers — which is exactly the code RG-RM-7 builds. So the accurate picture: the categorical gate is the RG-RM-8 (price IDs) + RG-RM-7 (single-item flat-fee billing) pair together, not RG-RM-7 alone, and amountCents is near-redundant given Stripe price-ID-as-source-of-truth. The assertion conflates the two and over-attributes "ALL" revenue to one plumbing item. Sourcing gate caps at weak: PART 2 is a qualitative architecture claim grounded in Stripe published docs (verified real, accurately characterized — subscriptions.update moves subscribers to a new price; price ID holds the amount); the business-consequence framing otherwise rests on internal roadmap docs. No quantitative dollar/market projection is present, so no external-number gate applies. Solo part-time bootstrapped constraint does not break the verdict — Phase 1 (six literals + typed resolver + unit tests ~an afternoon; flag-gated path a few days) is realistic solo, and the heavier solo cost lives downstream in RG-RM-8/9/10, which the agent correctly flagged. Comparables (change-price, manage-prices, migrate-subscriptions) are all real Stripe docs and genuinely analogous; no invented companies.

<details><summary>Research-stage rationale</summary>

PART 1 code state TRUE, verified independently: grep across regroup/functions returns zero TIER_BILLING_ENABLED; SUBSCRIPTION_TIERS at config.ts 37-78 has only priceEnvVar maxResidents maxProperties label, no amountCents (amountCents tokens that exist are rent code at stripeWebhook.ts 307 and scheduledRentCollection.ts 65-80, unrelated); resolver util/tierPricing.ts does not exist, it is a Create step in Phase 1 of the plan. So not_started plan only is accurate. PART 2 business consequence gates ALL regroup subscription revenue is OVERSTATED. Code already has a working subscription path: createOperatorSubscription at subscriptions.ts 156 calls initializeCustomer/createSubscription at api/stripe.ts 82 and 306 which call stripe.subscriptions.create against legacy live price IDs already wired STRIPE_HOUSE_PRICE_ID STRIPE_GUEST_PRICE_ID STRIPE_OXFORD_PRICE_ID at api/stripe.ts 22-44; and subscriptions.ts 194 already resolves priceId from tierConfig.priceEnvVar. Per Stripe docs a recurring subscription needs only a price ID, and moving subscribers to new prices is a standard change-price/subscriptions.update operation, neither requiring a bespoke flag or amountCents. RG-RM-7 gates the NEW six-tier flat-fee model and its safe staged cutover, not subscription revenue as a category. The real hard gate to tier revenue is upstream RG-RM-8 (six Stripe Price IDs not created, marked blocked); the flag and resolver are plumbing once IDs exist. amountCents is near-redundant since Stripe price ID is the authoritative amount. EFFORT for a solo bootstrapped dev is low: Phase 1 is pure functions (six amountCents literals plus typed resolver plus unit tests), an afternoon, zero billing risk; flag-gated single-item path plus webhook branching are a few days. Real cost and risk live in RG-RM-8 price/secret creation, RG-RM-9 live-card E2E, and RG-RM-10 migrating five live houses, which are dependencies of or downstream from RG-RM-7. The item is genuinely not_started and on the revenue path, but does not singlehandedly gate ALL subscription revenue.

</details>

**Steelman (claim true/achievable):** The code-state assertion is exactly right: no TIER_BILLING_ENABLED flag and no amountCents in tier config anywhere in regroup/functions, and the resolver is a not-yet-created file in the migration plan, so not_started plan only is precise and honest. The approved go-to-market pricing IS the six-tier flat-fee model (69/129/249 Traditional, 49/89/299 Oxford); the legacy path bills a different deprecated structure (per-house plus per-guest quantity). If the business intends to sell the published tiers, then until the tier-billing path exists no operator can be charged the advertised tier price through the product, so the monetized launch is practically blocked on this work plus its dependencies, making gates regroup subscription revenue at the intended pricing defensible.

**Steelman-against (disconfirming case):** Gates ALL regroup subscription revenue is false as written. A complete live subscription-billing path already exists (createOperatorSubscription to createSubscription to stripe.subscriptions.create with legacy live price IDs already configured), so the platform can already take recurring operator money without RG-RM-7. Stripe documented model needs only a price ID to bill and a standard change-price call to migrate subscribers, so neither TIER_BILLING_ENABLED nor amountCents is load-bearing for revenue; they enable a safe reversible cutover. amountCents is near-redundant because the Stripe price ID is the authoritative amount. The true hard gate to tier revenue is upstream RG-RM-8, the six Stripe Price IDs that do not exist yet, correctly marked blocked separately. Calling RG-RM-7 the gate for ALL subscription revenue overstates a single plumbing task into a categorical revenue blocker.

**Comparables:**

- Stripe Change the price of existing subscriptions (subscriptions.update with proration) is the supported way to move subscribers to new prices without a custom flag or amountCents layer: https://docs.stripe.com/billing/subscriptions/change-price
- Stripe Manage products and prices confirms a recurring subscription is created against a price ID so the price ID is the billing source of truth not an app-side amountCents field: https://docs.stripe.com/products-prices/manage-prices
- Stripe migrate-subscriptions APIs and migration toolkit are the standard staged path for cutting a live book of subscribers onto new pricing, the real-world analog to the RG-RM-7 and RG-RM-10 cutover risk: https://docs.stripe.com/billing/subscriptions/migrate-subscriptions

**Sources:**

- https://docs.stripe.com/products-prices/manage-prices
- https://docs.stripe.com/billing/subscriptions/change-price
- https://docs.stripe.com/subscriptions/pricing-models/tiered-pricing
- https://docs.stripe.com/billing/subscriptions/migrate-subscriptions
- https://docs.stripe.com/billing/subscriptions/change-price (verified: subscriptions.update with items[0][id]+items[0][price] and proration_behavior moves a subscriber to a new price — no bespoke flag/amountCents needed)
- https://docs.stripe.com/products-prices/manage-prices (verified: subscription is created against a Price ID; Price object holds unit_amount — price ID is billing source of truth, making app-side amountCents near-redundant)
- https://docs.stripe.com/billing/subscriptions/migrate-subscriptions (cited as the staged live-book cutover analog for RG-RM-7/RG-RM-10)

_Non-URL source notes:_ internal-verified regroup/functions/src/config.ts 37-78 SUBSCRIPTION_TIERS has priceEnvVar no amountCents; internal-verified grep TIER_BILLING_ENABLED across regroup returns zero matches; internal-verified regroup/functions/src/api/stripe.ts 22-44 82 306 legacy createSubscription and initializeCustomer with live price IDs; internal-verified regroup/functions/src/callable/subscriptions.ts 156-206 createOperatorSubscription resolves priceId from tierConfig.priceEnvVar; internal-verified: grep TIER_BILLING_ENABLED across regroup/functions source = 0 matches (only in docs/plan); internal-verified: regroup/functions/src/config.ts:37-78 SUBSCRIPTION_TIERS has priceEnvVar only, no amountCents; internal-verified: regroup/functions/src/util/tierPricing.ts does not exist; internal-verified: regroup/functions/src/callable/subscriptions.ts:156-258 createOperatorSubscription resolves priceId from tierConfig.priceEnvVar and throws 'Price ID not configured' if unset — the sole operator-subscription entry point; internal-verified: regroup/functions/src/api/stripe.ts:82-105 createSubscription hardcodes legacy two-item house+guest structure (planIds.house/OXFORD_PRICE_ID + planIds.guest, quantity:0), ignoring the resolved tier priceId; internal-verified: git commit d1374eb 'feat(regroup): tier-based Stripe subscription creation using new RATS pricing model' — createOperatorSubscription already migrated to tier model; internal-verified: regroup/docs/go-to-market/roadmap.md RG-RM-8 (six STRIPE_PRICE_* IDs) status=blocked, the true upstream hard gate

---

### 18. RG-ROAD-2 — regroup / roadmap

**Assertion:** Create 6 Stripe Price IDs + load secrets (RG-RM-8) blocked; no operator can subscribe on a tier until set.

**Stated source (internal):** `regroup/docs/go-to-market/roadmap.md:51`

**Verdict:** `validated` · **confidence:** `high` · research verdict was `validated`/`high` · skeptic adjusted: no

**Confidence reason:** Mechanism confirmed in regroup code and by Stripe official API reference. Build effort is minutes per tier. Deterministic claim with external corroboration, not a forecast.

**Final rationale (post-skeptic):** Survives skeptical review. (1) Mechanism independently confirmed in-repo: regroup/functions/src/callable/subscriptions.ts L194-200 reads process.env[tierConfig.priceEnvVar] and throws HttpsError("internal","Price ID not configured...") BEFORE any Stripe call; config.ts L40-72 defines exactly the six priceEnvVar mappings (STRIPE_PRICE_TRAD_STARTER…STRIPE_PRICE_OXFORD_NETWORK) with no price_data/amountCents fallback. Roadmap row RG-RM-8 is labeled blocked, RG-RM-6 (six-tier config) done. (2) External sourcing gate satisfied: I independently fetched Stripe's official API reference (docs.stripe.com/api/subscriptions/create) and confirmed subscriptions.create requires items, each item requiring price or price_data — these are Stripe's public docs, not the product GTM docs, so the quantitative/deterministic claim is externally corroborated, not capped at weak. Because regroup injects only a stored price ID, an unset env var is an unrecoverable runtime error and the tier subscribe cannot complete. (3) This is a deterministic code-grounded consequence, not a forecast, so high confidence is justified not inflated. (4) Solo part-time bootstrapped constraint does NOT break it and in fact favors the founder: creating six Stripe Prices plus six firebase functions:secrets:set calls is minutes of operator work, an unchecked checklist item, not engineering — no funded team implied. (5) One disclosed nuance, already steelmanned by the research agent: 'no operator can subscribe on a tier' is true only for the new six-tier path (a separate legacy quantity-based path in api/stripe.ts uses different price IDs), and RG-RM-7 (tier-billing flag + resolver) is itself not_started, so RG-RM-8 is necessary-but-not-sufficient for end-to-end tier billing. This slightly overstates singular causality but does not falsify the core assertion that unset Price IDs hard-block the tier subscribe. Verdict and confidence stand.

<details><summary>Research-stage rationale</summary>

Both parts hold. Mechanism: subscriptions.ts line 194 reads priceId from process.env of the tier priceEnvVar; lines 195 to 200 throw HttpsError internal Price ID not configured BEFORE any Stripe call. The six env vars STRIPE_PRICE_TRAD_STARTER through STRIPE_PRICE_OXFORD_NETWORK are priceEnvVar only in config.ts lines 37 to 78. Stripe API reference confirms external necessity: subscriptions.create requires an items array, each item needs price or price_data, and one of price or price_data is required. Regroup passes only a price ID with no price_data fallback, so an empty env var is unrecoverable at runtime and the operator cannot complete a tier subscribe. Blocked status is operational not engineering: creating six Price IDs is one Stripe CLI command per tier plus six firebase functions secrets set calls, minutes of work within a part-time bootstrapped solo founder reach. Nuance: claim is scoped to the new six-tier path RG-RM-6 and RG-RM-7. The legacy quantity-based reactivate path in api/stripe.ts createItemsFromMetadata uses different price IDs and is separate; the claim does not contradict it since tier billing RG-RM-7 is itself not_started. Internal status taken as given; external research validates the stated business consequence.

</details>

**Steelman (claim true/achievable):** Deterministic code-grounded consequence, not a forecast. Stripe subscription API requires a price reference, and regroup tier-subscribe injects only a price ID from an env var with no price_data fallback. The guard at subscriptions.ts lines 195 to 200 makes failure explicit and early; an unset Price ID yields a hard HttpsError, so the subscribe attempt for that tier cannot succeed under any input. Until all six env-var Price IDs exist and load as Firebase secrets, each tier is non-functional for revenue, exactly the P0 revenue-blocking gate the roadmap labels. Dependency chain is consistent: RG-RM-9 and RG-RM-10 both depend on RG-RM-8, so the block propagates correctly.

**Steelman-against (disconfirming case):** Three weakening angles. Scope: no operator can subscribe on a tier could read as all subscriptions, but a legacy quantity-based path exists using different price IDs, so some mechanism may function while the new six-tier path is blocked; the claim is true only for the new tier model. Triviality undercuts the blocked framing: creating six Price IDs is a minutes-long operator task, so a code-state blocked label implies more friction than exists; it is an unchecked checklist item, not engineering work. Redundancy with RG-RM-7: tier billing flag and resolver is itself not_started, so even with Price IDs created the flow may not be wired end-to-end; RG-RM-8 is not the sole gate, slightly diluting the singular causal phrasing.

**Comparables:**

- Stripe Billing subscriptions.create: official API reference confirms each subscription item requires price or price_data; an unset price ID is an unrecoverable runtime error in any integration passing only a stored price ID. This is the canonical real-world mechanism, not a hypothetical.

**Sources:**

- https://docs.stripe.com/api/subscriptions/create
- https://docs.stripe.com/billing/subscriptions/build-subscriptions
- https://docs.stripe.com/products-prices/manage-prices

_Non-URL source notes:_ regroup/functions/src/callable/subscriptions.ts#L194-L200; regroup/functions/src/config.ts#L37-L78; regroup/docs/go-to-market/roadmap.md (RG-RM-6 done, RG-RM-7 not_started, RG-RM-8 blocked)

---

### 19. DX-MKT-4 — detox-recovery / market

**Assertion:** Medicaid peer support is reimbursable in 43 states; VA Community Care PSS pathway exists. Claimed Year-2+ revenue pillar.

**Stated source (internal):** `detox-recovery/docs/go-to-market/monetization.md:187-194`

**Verdict:** `broken` · **confidence:** `high` · research verdict was `broken`/`high` · skeptic adjusted: no

**Confidence reason:** The two load-bearing assertions both fail against authoritative external sources: the "43 states" number matches no published figure (the canonical 2024 SAMHSA/Peer Recovery CoE dataset says 41 states for both MH+SUD, or 48+DC for at least one), and the billing mechanism is structurally barred for a solo operator (state Medicaid agencies explicitly state individual unlicensed peers cannot enroll/bill). Multiple independent state sources (NY, CO) confirm the same federal constraint, so confidence is high.

**Final rationale (post-skeptic):** Independently confirmed the two load-bearing kills against fresh external sources. (1) The Medicaid structural barrier is real and federal: unlicensed Behavioral Health Peer Support Professionals "are not able to independently deliver Medicaid reimbursable behavioral health services" and must bill under a Medicaid-enrolled organization / licensed Rendering Provider (Colorado HCPF; corroborated by CMS Medicaid provider-enrollment FAQ and multiple state guides). A part-time solo bootstrapped founder cannot stand up or be employed by a licensed, supervised behavioral-health agency as a Year-1/2 revenue pillar — this is the achievability kill and the SOLO constraint applies correctly (a funded team could, the operator cannot). (2) The VA pathway is mischaracterized: VA/VHA Peer Specialist roles on USAJobs are W-2 federal-employee positions requiring veteran status and an existing peer-specialist certification — not an independent per-session Community Care billing channel for a solo PSS. Both verified live. (3) The "43 states" figure matches no external source; the canonical 2024 SAMHSA/Peer Recovery CoE dataset reports 41 states (both MH+SUD) or 48+DC (at least one). Even granting the directional spirit, the headline number is fabricated and the dollar magnitude (15-min units ~$6-$36) is immaterial at the modeled volume. The verdict does NOT rest on the product's GTM docs, so the sourcing gate does not cap it; external authoritative sources independently support "broken." Confidence high: multiple independent state (CO/NY/WA) and federal (CMS/VA) sources converge on the same structural prohibition; the only source I could not directly re-open (policycentermmh, HTTP 403) is non-load-bearing because the figure fails the sourcing gate regardless of whether the true count is 41 or 48. Keeping verdict unchanged.

<details><summary>Research-stage rationale</summary>

The claim bundles a quantitative figure, a regulatory pathway, and a Year-2+ "revenue pillar" projection — all three break.

1) "43 states" is unsourceable. The authoritative national dataset (SAMHSA PEP23-06-07-003 + Peer Recovery Center of Excellence 2024, summarized by the Policy Center for Maternal Mental Health, Jul 2024) reports 41 states reimburse peer support for BOTH mental health and SUD; 48 states + DC reimburse for at least one type; only Vermont and South Dakota reimburse for neither. An older peer-reviewed study (PMC10498960) cites 31 states + DC for certified peer specialists. No external source produces "43." The figure cannot be cited — it caps at broken on the sourcing gate alone.

2) The mechanism is barred for a solo, unlicensed founder. Under federal Medicaid policy, peer support is a benefit billed by/through licensed behavioral-health agencies, not by individual peers. Colorado HCPF: unlicensed professionals including Behavioral Health Peer Support Professionals "are not able to independently deliver" billable services. New York State Medicaid: peers "are not enrollable types and cannot enroll in Medicaid or obtain a MMIS Provider ID as an individual practitioner." Washington HCA: to bill Medicaid for peer services an entity "need[s] to be a licensed community behavioral health agency." So the modeled per-session Medicaid reimbursement requires the founder to first stand up (or be employed by) a licensed, supervised, often prior-authorization-gated behavioral-health agency — far outside a part-time solo bootstrapper's reach.

3) The VA Community Care PSS pathway as described does not exist. VA Peer Specialists are W-2 federal employees (GS-5 apprentice through GS-9) hired into VHA facilities via USAJobs, trained/certified at VA expense, and supervised — per the VHA Peer Specialist Toolkit and VA Careers. VA Community Care routes referrals to licensed clinical providers (therapists, psychiatrists, PCPs) when VHA cannot deliver care in-house; there is no established mechanism for an independent certified peer to enroll in CCN (TriWest/Optum) and bill per-session as a solo PSS. The "enroll in VA healthcare → PSS cert → Community Care provider status" chain conflates becoming a VA employee with becoming an independent contracted provider — two different things.

4) Even if billable, the economics are immaterial. Where peer units are reimbursed, the SAMHSA/PRCoE data shows 15-minute fee-for-service rates of $5.98 (SC) to $36.32 (OH). At the modeled ~10 sessions/month (Year 2) that is on the order of low-hundreds of dollars/month gross before the agency's cut — not a "revenue pillar." The same source explicitly warns rates are "currently quite low" and that peers should be employed by organizations rather than bill individually.

Net: the number is wrong, the billing pathway is closed to a solo unlicensed operator, the VA pathway is mischaracterized, and the dollar magnitude is negligible.

</details>

**Steelman (claim true/achievable):** The directional spirit is real: peer support IS a covered Medicaid benefit in the large majority of states (48 + DC reimburse at least one type; 41 for both MH and SUD), and demand for veteran-facing recovery support is genuine. If the founder pivots from "solo per-session billing" to "get hired/contracted by an existing licensed behavioral-health agency or a 501(c)(3) as a certified peer," reimbursement does flow and the credential (PSS certification, ~40-80 hrs) is attainable. The grants paragraph (SAMHSA SOR, veteran foundations) is a more realistic non-dilutive path to the same mission outcome. So a charitably reframed version — "obtain PSS certification and partner with a licensed agency/fiscal sponsor that bills Medicaid; pursue veteran-focused grants" — is achievable and removes the out-of-pocket barrier the doc cares about. The mission framing ("as much mission as revenue") also softens the bar: it need not pencil out as a profit center to be worth doing.

**Steelman-against (disconfirming case):** Treated as written — a Year-2+ revenue pillar where a part-time solo founder bills Medicaid/VA per-session for peer support — the claim is unachievable and the headline statistic is fabricated relative to every external source. (a) "43 states" matches no published count; the real figures are 41 (both) or 48+DC (either). (b) Federal Medicaid structure prohibits an individual unlicensed peer from enrolling or billing; the founder would have to become or join a licensed, supervised behavioral-health agency, a multi-month, capital- and compliance-intensive undertaking incompatible with bootstrapped part-time status. (c) VA Peer Specialists are federal employees, not Community Care contractors; the described "Community Care provider status for a solo PSS" pathway is not a real billing channel. (d) Even granting access, $6-36 per 15-min unit at ~10 sessions/month yields immaterial revenue. Calling this a "pillar" overstates a line item that, realistically, nets a few hundred dollars/month at best and likely zero without an agency partner.

**Comparables:**

- VHA Peer Specialist program — real, but staffed by W-2 federal GS-5 to GS-9 employees hired via USAJobs and certified at VA expense; not an independent per-session billing pathway (VHA Peer Specialist Toolkit; VA Careers).
- New York State Medicaid — explicitly lists peers as non-enrollable: cannot obtain an individual MMIS Provider ID/NPI; must bill through an enrolled agency.
- Colorado HCPF Peer Services — states unlicensed Behavioral Health Peer Support Professionals cannot independently deliver/bill services; agency + supervision required.
- Washington State HCA — to bill Medicaid for peer services the entity must be a licensed community behavioral health agency.
- SAMHSA Financing Peer Recovery Support (PEP23-06-07-003) + Peer Recovery Center of Excellence (UMKC, 2024) — canonical national reimbursement dataset; 15-min unit rates $5.98 (SC) to $36.32 (OH), and recommends peers be employed by organizations rather than bill individually.

**Sources:**

- https://policycentermmh.org/gaps-in-peer-support-reimbursement-and-certification-in-the-united-states/
- https://policycentermmh.org/app/uploads/2024/07/May-2024-Peer-Excellence-Medicaid-Reimbursement-Report.pdf
- https://pmc.ncbi.nlm.nih.gov/articles/PMC10498960/
- https://www.health.ny.gov/health_care/medicaid/redesign/behavioral_health/children/provider_enrollment_npi_memo.htm
- https://hcpf.colorado.gov/peerservices
- https://www.hca.wa.gov/assets/program/hca-peer-services-guidance-202107.pdf
- https://www.mirecc.va.gov/visn4/docs/peer_specialist_toolkit_final.pdf
- https://vacareers.va.gov/job-news-advice/discover-story-power-as-a-va-peer-specialist/
- https://www.kff.org/medicaid/state-indicator/medicaid-behavioral-health-services-peer-support-services/
- https://www.cms.gov/files/document/mpe-faqs082616pdf
- https://www.onestepsoftware.com/peer-support-and-medicaid-reimbursement-a-guide/
- https://www.usajobs.gov/job/849709100
- https://www.usajobs.gov/job/844781100
- https://www.kff.org/other/state-indicator/medicaid-behavioral-health-services-peer-support-services/
- https://policycentermmh.org/state-gaps-in-peer-support-certification-and-reimbursement-agency-follow-up-report/
- https://www.medicaid.gov/federal-policy-guidance/downloads/faq06052024.pdf

---

### 20. DX-REG-3 — detox-recovery / regulatory

**Assertion:** VA PSS certification ~40–80 hours + exam; Community Care provider status a 3–6 month approval. Gating timeline/cost for the PSS revenue path under a solo-founder capacity constraint.

**Stated source (internal):** `detox-recovery/docs/go-to-market/monetization.md:190-194`

**Verdict:** `weak` · **confidence:** `low` · research verdict was `weak`/`medium` · skeptic adjusted: yes

**Confidence reason:** PSS hours roughly right but Community Care 3 to 6 month is contradicted by VA cited 6 to 12 months. Structural mismatch supported by statute Public Law 110-387 section 405 but not stated verbatim. Medium not high.

**Final rationale (post-skeptic):** Verdict held at weak but confidence downgraded from medium to low. The sources are genuinely external and real (va.gov, mirecc.va.gov, usajobs.gov, Virginia DBHDS, Oklahoma.gov, SonderMind, policycentermmh.org) — not GTM docs — and I independently confirmed the decisive structural finding: a VA Peer Support Specialist is a salaried federal VHA role (GS-5 to GS-11, hired via USAJOBS), NOT a solo billable credential. Community Care/VCA enrollment requires providers that are 'medically qualified, licensed and competent' reached via HSRM referral through Optum/TriWest TPAs; no source shows a solo non-clinical peer enrolling to bill VA per session, and this site is explicitly non-clinical. That category error breaks the claim's load-bearing business purpose (clearing certification + enrollment 'unlocks' a ~10-25 session/month VA per-session revenue stream), so it cannot exceed weak. However, I am downgrading the research agent's confidence because its medium rested on the assertion that the doc's '3-6 month' Community Care timeline is contradicted by a 'VA-cited 6-12 months.' My independent search returned the commonly cited CCN credentialing timeline as 60-120 days (2-4 months), which actually SUPPORTS the doc's 3-6 months rather than refuting it. The timeline sub-dispute is thus unresolved and not robustly sourced in either direction, so the agent's stated basis for medium is shaky. The certification-hours portion (40-80 hrs + exam) is roughly right but mildly understated (Virginia 72, Illinois/Missouri 100). SOLO-FOUNDER CONSTRAINT makes this worse, not better: the only real solo paths are a salaried VA job (incompatible with running this site part-time) or Medicaid/state peer reimbursement (a different payer with separate enrollment) — the VA per-session stream as described does not exist for this operator. Net: weak is correct because the cert-gate framing is partially valid, but the revenue mechanism is structurally broken and the timeline number used to justify the grade is contested.

<details><summary>Research-stage rationale</summary>

The claim conflates two things and misses one number. PSS 40 to 80 hours plus exam is mildly understated since state training ranges 40 to 100 hours, Oklahoma and Florida 40, Virginia 72, Illinois and Missouri 100, and a national peer exam exists. Community Care 3 to 6 month is contradicted by VA cited 6 to 12 months, about twice as long. Structurally a VA Peer Support Specialist is a VHA federal employee role under Public Law 110-387 section 405 and VHA peer support is delivered by VA employed peers. Community Care providers are credentialed clinical entities contracted through Optum and TriWest reached only by prior VA referral through HSRM. No source documents a solo non-clinical peer billing Community Care per session for peer support and this site is explicitly non-clinical. Clearing certification plus enrollment therefore does not unlock a solo per session VA reimbursement stream and the gate framing is misleading. The Medicaid sub claim of 43 states is conservative since about 47 to 48 states plus DC reimburse peer support and 41 reimburse for substance use specifically. Net, the business consequence of a solo non-clinical founder earning VA per session reimbursement at about 10 to 25 sessions per month in Year 2 does not follow.

</details>

**Steelman (claim true/achievable):** Read narrowly as a multi month, multi step regulatory gate of certification hours plus exam plus a months long provider enrollment before any VA peer reimbursement can flow, the claim is true and even understated. Certification genuinely needs 40 to 100 hours plus a national exam, and Community Care enrollment genuinely takes months at a VA cited 6 to 12. It correctly defers the stream to Year 2 to 3 and frames it as mission as much as revenue, and the Medicaid sub fact is accurate. As a do not count on this early caution about heavy regulatory friction, its directional thrust is right.

**Steelman-against (disconfirming case):** Wrong number and category error. The 3 to 6 month Community Care approval is contradicted by VA cited 6 to 12 months. A VA Peer Support Specialist is a VHA salaried employee role under Public Law 110-387 section 405, not a billable solo credential. VHA peer support is delivered by VA employed peers, and Community Care is for VA authorized credentialed clinical providers via HSRM referral. No source shows a solo non-clinical peer enrolling in Community Care to bill per session, the mechanism does not exist as described, and the site is explicitly non-clinical. For a bootstrapped solo founder the realistic outcomes are a salaried VA job, not their own revenue stream, or Medicaid and state peer reimbursement, a different payer and enrollment.

**Comparables:**

- VA Peer Support Specialist VHA employee role under Public Law 110-387 section 405, a federal job not a solo billable credential
- Virginia DBHDS Peer Recovery Specialist 72 hour training plus 500 supervised hours plus national peer exam
- Oklahoma CPRSS 40 hours and Florida CRPS 40 hours, low end of the claimed range
- Illinois and Missouri peer certification 100 hours, exceeding the claimed 80 hour ceiling
- Optum CCN TPA for Regions 1 to 3 and TriWest for Regions 4 to 5, actual gatekeepers with 6 to 12 month enrollment who contract credentialed providers
- SonderMind operating as a VA Community Care behavioral health network, showing CCN runs through credentialed clinical networks and HSRM rather than solo non-clinical peer billing

**Sources:**

- https://www.va.gov/OHRM/QualificationStandards/T5/0102-PeerSupportApprenticePeerSupportSpecialist.pdf
- https://www.mirecc.va.gov/visn4/docs/peer_specialist_toolkit_final.pdf
- https://www.va.gov/COMMUNITYCARE/providers/Community-Care-Network.asp
- https://www.va.gov/COMMUNITYCARE/providers/Veterans-Care-Agreements.asp
- https://www.paradigmseniors.com/blog/veteran-care-optum-triwest
- https://www.dbhds.virginia.gov/assets/doc/recovery/certification-and-registration-pathways-final.pdf
- https://behavioralhealthprofessional.com/national-certified-peer-specialist-ncps/
- https://oklahoma.gov/odmhsas/trainings/workforce-certification/certified-peer-recovery-support-specialist.html
- https://policycentermmh.org/gaps-in-peer-support-reimbursement-and-certification-in-the-united-states/
- https://www.sondermind.com/resources/clinical-resources/referral-from-the-vha-for-community-care/
- https://www.usajobs.gov/job/844781100
- https://www.usajobs.gov/Search/?d=VA&k=peer+specialist
- https://www.va.gov/files/2024-01/VHA%20Peer%20Support%20Services%20Brochure%20Sept.2021.pdf

---

### 21. ECO-REG-3 — ecosystem / regulatory

**Assertion:** CMS mandates FHIR R4 interoperability by mid-2026, and ASAM CONTINUUM software is endorsed/required by 30+ states — used to justify market timing.

**Stated source (internal):** `docs/go-to-market/ecosystem/vision.md:93-96`

**Verdict:** `weak` · **confidence:** `high` · research verdict was `weak`/`high` · skeptic adjusted: no

**Confidence reason:** Both sub-claims were checked against primary/near-primary sources (CMS rule pages, Federal Register, ASAM/FEI vendor pages). The factual distortions (FHIR date, software-vs-framework, vendor-sourced stat) are confirmed by multiple independent URLs. Confidence is high on the FACTS; the verdict is 'weak' rather than 'broken' because a defensible directional version of the claim is true.

**Final rationale (post-skeptic):** Verdict SURVIVES adversarial review; no adjustment. Independently re-verified both quantitative sub-claims against external, non-GTM sources. (1) FHIR timing: CMS fact sheets, Firely, and Health-Samurai confirm the four FHIR R4 APIs under CMS-0057-F are compliance-due Jan 1, 2027, NOT mid-2026; the Jan 1, 2026 milestone covers operational prior-auth turnaround/reporting only. Impacted parties are payers (MA orgs, Medicaid/CHIP managed care, QHP issuers) — not treatment centers or sober-living operators, the founder's buyer. So 'mid-2026 mandate' is wrong on date, deliverable, and binds the wrong party. (2) ASAM '30+ states': independent sources confirm only that the ASAM CRITERIA FRAMEWORK is broadly adopted (21 of 31 waiver states reference ASAM Criteria; most state Medicaid agencies reference it), while only Arizona (AHCCCS) is independently confirmed to mandate the CONTINUUM SOFTWARE. The '30+ states require CONTINUUM software' claim conflates free-Fair-Use framework adoption with a paid-software mandate, and the figure traces to FEI/ASAM vendor copy — under the sourcing gate this independently caps the quantitative verdict at 'weak'. SOLO-FOUNDER LENS reinforces rather than breaks: neither regulation obligates a bootstrapped treasury/sober-living-payments product, so the tailwind is rhetorical not monetizable; this makes the claim weaker, never stronger. 'Weak' not 'broken' is correct because a genuine directional steelman exists: CMS-0057-F is real with hard 2026-2027 deadlines pushing payers onto FHIR R4, and ASAM Criteria adoption is genuinely broad. Confidence 'high' justified: each fact corroborated by multiple independent URLs. Sources external (not GTM docs). Comparables (ASAM CONTINUUM/FEI, Arizona AHCCCS, CMS-0057-F payers, 1115 SUD waivers) all real and analogous; directly confirmed Arizona and the waiver mechanism.</parameter>
</invoke>


<details><summary>Research-stage rationale</summary>

The composite claim has two quantitative assertions, each materially distorted in a direction that flatters market timing. (1) FHIR R4 TIMING: The claim says CMS "mandates FHIR R4 interoperability by mid-2026." The governing rule is CMS-0057-F (finalized Jan 2024). Its FHIR R4 (v4.0.1) API requirements — Patient Access, Provider Access, Payer-to-Payer, Prior Authorization — are compliance-due primarily Jan 1, 2027, NOT mid-2026. The Jan 1, 2026 milestone applies to operational prior-auth decision timeframes (72hr urgent / 7d standard), not the FHIR API build. So 'mid-2026' is wrong on both the date and the deliverable. More importantly, the IMPACTED PARTY is payers (Medicare Advantage, Medicaid/CHIP managed care, QHP issuers on FFEs) — NOT addiction treatment centers, sober-living operators, or aftercare providers, who are the stated buyer in the GTM doc. The rule creates zero direct FHIR obligation on the solo founder's actual customer, so it does not establish buyer-side timing urgency. (2) ASAM '30+ states': The exact phrase 'endorsed and required by more than 30 states' is traceable to FEI Systems'/ASAM's own vendor marketing copy for the CONTINUUM product — it is not an independent regulatory finding and is uncited. Independent sources confirm only that 30+ states have adopted the ASAM CRITERIA (the clinical framework, offered free under Fair Use), which is a different thing from requiring the CONTINUUM SOFTWARE product. Only Arizona (AHCCCS) is independently confirmed to mandate the CONTINUUM software itself; CMS 'recommended but did not require' ASAM under 1115 waivers. So 'CONTINUUM software required by 30+ states' overstates by conflating framework-adoption with software-mandate and by repeating a vendor stat. SOLO-FOUNDER LENS: Even taken at face value, neither fact creates a tailwind the founder can monetize. The founder's products (Homegroups treasury/governance, Regroup sober-living payments, a planned aftercare bridge) are not ASAM-assessment software and are not CMS-impacted payers — so neither the FHIR mandate nor ASAM adoption pulls demand toward HIS product. The claim is real-but-irrelevant market color, not validated timing leverage. Per the sourcing gate, the ASAM stat is vendor-marketing-derived, which independently caps the quantitative verdict at 'weak'.

</details>

**Steelman (claim true/achievable):** Directionally, the regulatory wind IS at the back of outcome-documentation and addiction-data interoperability. CMS-0057-F is real, finalized, and does push the entire payer ecosystem onto FHIR R4 with hard 2026-2027 deadlines, which over time pressures downstream providers (including SUD treatment centers) to produce structured, exchangeable outcome data — exactly the 'continuing care view' the GTM doc wants to sell. The ASAM Criteria genuinely IS adopted by 30+ states and most major payers as the SUD level-of-care standard (multiple independent sources confirm this for the Criteria), and the CONTINUUM software is in fact mandated in at least Arizona and used across many states via 1115 waivers. So the underlying thesis — 'regulation is standardizing SUD assessment and outcome data, creating demand for a longitudinal recovery record' — is broadly defensible. If the founder reframes to 'value-based-care contracts and ASAM standardization are creating a structured-data tailwind,' that softer claim survives scrutiny.

**Steelman-against (disconfirming case):** Read literally, the claim is a stack of three avoidable inaccuracies that would not survive a treatment-center CIO's due diligence: (a) wrong date — FHIR R4 APIs are due Jan 1, 2027, not mid-2026; (b) wrong party — the mandate binds payers, not the treatment centers/sober-living operators the founder sells to, so it creates no buyer-side compliance deadline for his product; (c) wrong object and wrong source — '30+ states require CONTINUUM software' conflates the free ASAM Criteria framework with the paid CONTINUUM software product, and the 'more than 30 states' figure is FEI Systems' own uncited marketing copy, with only Arizona independently confirmed as a hard software mandate. None of these regulations impose any obligation on a bootstrapped 12-step-treasury / sober-living-payments product, so the regulatory tailwind is rhetorical, not operative. For a solo, part-time, unfunded founder, citing a payer-side FHIR deadline and a vendor's own state-count to justify market timing is the kind of borrowed-credibility framing that erodes trust the moment a knowledgeable buyer checks it.

**Comparables:**

- ASAM CONTINUUM / FEI Systems — the actual software product; mandated in Arizona (AHCCCS) but mostly endorsed (not required) elsewhere; the '30+ states' stat originates from its own marketing, illustrating how the GTM doc repeats vendor copy as independent fact.
- Arizona AHCCCS ASAM CONTINUUM implementation — the one independently confirmed state SOFTWARE mandate, showing real adoption exists but is far narrower than '30+ states require'.
- CMS-0057-F impacted payers (Medicare Advantage orgs, Medicaid/CHIP managed care, QHP issuers) — the real obligated parties under the FHIR R4 rule, none of whom are the founder's buyer, showing the mandate does not touch his customer.
- State 1115 SUD demonstration waivers that adopt the ASAM Criteria framework (free Fair Use) — the mechanism behind '30+ states adopted ASAM', confirming framework adoption is real but distinct from CONTINUUM software requirement.

**Sources:**

- https://www.cms.gov/initiatives/burden-reduction/overview/interoperability/policies-regulations/cms-interoperability-prior-authorization-final-rule-cms-0057-f
- https://www.federalregister.gov/documents/2026/04/14/2026-07205/medicare-and-medicaid-programs-patient-protection-and-affordable-care-act-interoperability-standards
- https://www.cms.gov/newsroom/fact-sheets/2026-cms-interoperability-standards-prior-authorization-drugs-proposed-rule
- https://www.asam.org/asam-criteria/implementation-tools/state-implementation
- https://www.asam.org/asam-criteria/asam-criteria-software/asam-continuum
- https://www.azahcccs.gov/PlansProviders/CurrentProviders/ASAM.html
- https://feisystems.com/ancillaryservices/continuum/
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8734202/
- https://www.cms.gov/newsroom/fact-sheets/cms-interoperability-prior-authorization-final-rule-cms-0057-f
- https://www.health-samurai.io/articles/understanding-the-cms-0057-f-interoperability-and-prior-authorization-final-rule
- https://fire.ly/blog/cms-0057-f-decoded-must-have-apis-vs-nice-to-have-igs-for-2026-2027/
- https://www.sciencedirect.com/science/article/am/pii/S0193953X22000508

---

### 22. RG-REG-1 — regroup / regulatory

**Assertion:** D-11 regroup IAP vs web billing OPEN (not_started); launch-blocking; recommends web/hybrid. Apple IAP rules could force a 30% take or block billing.

**Stated source (internal):** `docs/go-to-market/_shared/decisions-log.md:36`

**Verdict:** `weak` · **confidence:** `medium` · research verdict was `weak`/`high` · skeptic adjusted: yes

**Confidence reason:** Rule documented in Apple primary guidelines and the 9th Circuit Dec 2025 opinion, plus named comparables shipping the recommended pattern. Capped at weak because the recommendation is right but the threat framing is largely false for the launch window.

**Final rationale (post-skeptic):** Independently verified all key facts via external sources (not GTM docs). The recommendation (route the upgrade CTA to the already-built SubscriptionHandler WebView web checkout at 0% Apple cut) is correct, and trivially achievable by a solo part-time bootstrapped founder since the WebView is already wired — so the constraint reinforces rather than breaks the verdict. The claim's THREAT framing ("Apple IAP could force a 30% take or block billing") is largely false for the US launch window: Apple updated Guideline 3.1.1 on May 1 2025 to require no entitlement for external purchase links on the US storefront (confirmed via Apple's own guideline + 9to5Mac/MacRumors), and the 9th Circuit on Dec 11 2025 affirmed the contempt finding while striking Apple's 27% external-link fee as overbroad and remanding (confirmed via Fenwick, Perkins Coie, Frankfurt Kurnit, Shinder Cantor Lerner). Comparables are real and directly analogous: Spotify (update approved May 2 2025), Amazon Kindle ("Get Book" link-out), and Patreon (v125.5.0 web payments) all shipped the exact link-out pattern at ~0% commission (TechCrunch, AppleInsider). The WebView nuance is correct: Apple still rejects payment COLLECTED inside an in-app WebView masked as the unlock (3.1.1), an avoidable, founder-controllable implementation mistake distinct from the permitted link-out — so the "block billing" outcome is not blocking-class for the recommended pattern. weak (not broken) is the right call because keeping D-11 as a recorded launch gate is defensible governance given unpredictable iOS review. Confidence lowered from high to medium: the research agent's "no stay" anchor is now stale — as of ~April 2026 the 9th Circuit paused the ruling and Apple petitioned the Supreme Court (ObjectWire/AppleInsider), so the legal landscape is less settled than a high-confidence framing implies and a future cost-based external-link fee on remand/cert remains live tail risk.

<details><summary>Research-stage rationale</summary>

The recommendation (web/hybrid: route the upgrade CTA to the already-built WebView web checkout at 0 percent Apple cut) is correct and trivial for a solo founder, but the stated threat is outdated. After Epic v. Apple, Apple updated Guideline 3.1.1(a) on May 1 2025 so no entitlement is required to include external purchase links on the US storefront; Apple's attempted 27 percent external-link fee was found overbroad and remanded by the 9th Circuit on Dec 11 2025, which affirmed the link-out injunction with no stay. Spotify, Patreon, and Amazon Kindle shipped US web-payment links in May 2025 at effectively 0 percent Apple cut. The block-billing threat is also overstated: a free app whose upgrade tap opens an external WebView to a web subscribe page is a long-permitted pattern; Apple only rejects collecting payment inside a WebView presented as the in-app unlock. Build effort is trivial since the SubscriptionHandler WebView is already wired. Keeping D-11 as a launch gate is reasonable governance, but the asserted 30 percent or block consequence does not hold under current law.

</details>

**Steelman (claim true/achievable):** Treating D-11 as launch-blocking and OPEN is defensible. iOS review is unpredictable and 3.1.1 rejections for in-WebView payment are common; if the founder collects Stripe payment inside an in-app WebView that reads as the in-app unlock, that is a real rejection that blocks the build, so a recorded decision and careful implementation matter. The web-only/hybrid recommendation reusing the existing WebView is exactly right and cheapest. Residual tail risk remains: on remand the district court could approve a modest external-link fee (Apple proposed 27 percent; the court did not zero it), and Apple could tighten formatting or entitlement rules, so recording the decision before live Stripe products are finalized is prudent.

**Steelman-against (disconfirming case):** The framing is behind the law. The 30 percent take is false on the US storefront as of May 2025 and reaffirmed Dec 2025; external web links carry 0 percent Apple commission with no approved US external-link fee as of mid-2026. Block billing conflates an avoidable implementation mistake (in-WebView payment) with the recommended link-out pattern, which is not blocking-class. The doc also leans on the narrow Enterprise carve-out 3.1.3(c), which only lets enterprise users access previously-purchased content and requires selling directly to organizations; the durable protection is the US-storefront external-link rule, not the enterprise exemption. A solo bootstrapped founder can ship the web-checkout CTA in days at effectively no Apple tax; the blocker the claim implies largely evaporated a year before launch.

**Comparables:**

- Spotify shipped external US web-payment link May 2025 at 0 percent commission
- Patreon updated iOS app to accept web payments after US App Store changes May 2025
- Amazon Kindle added in-app web purchase link post-ruling 2025
- Epic Games v. Apple No. 25-2935 9th Cir Dec 2025 affirmed link-out injunction and struck Apple 27 percent fee as overbroad
- Documented 3.1.1 in-WebView payment rejections on Apple Developer Forums and r/reactnative, the avoidable blocking mode distinct from linking out

**Sources:**

- https://developer.apple.com/app-store/review/guidelines/
- https://developer.apple.com/news/?id=9txfddzf
- https://www.braze.com/resources/articles/2025-apple-court-ruling-alternate-payments
- https://www.fenwick.com/insights/publications/ninth-circuit-largely-upholds-ruling-in-epic-v-apple
- https://techcrunch.com/2025/05/06/patreons-app-can-now-accept-web-payments-after-u-s-app-store-changes/
- https://www.nytimes.com/2025/05/09/technology/iphone-app-store-changes.html
- https://developer.apple.com/forums/thread/748871
- https://cdn.ca9.uscourts.gov/datastore/opinions/2025/12/11/25-2935.pdf
- https://9to5mac.com/2025/05/01/apple-app-store-guidelines-external-links/
- https://www.macrumors.com/2025/05/01/apple-updates-u-s-app-review-guidelines-epic/
- https://perkinscoie.com/insights/update/epic-v-apple-ninth-circuit-weighs
- https://fkks.com/news/court-finds-apple-violated-order-resulting-in-key-changes-for-ios-external-purchase-methods
- https://scl-llp.com/ninth-circuit-upholds-apple-contempt-finding-but-narrows-scope-of-remedial-relief/
- https://appleinsider.com/articles/25/05/03/spotify-app-adds-support-for-direct-purchases-payments-after-court-mandate
- https://mjtsai.com/blog/2025/05/06/external-purchasing-from-the-kindle-app/
- https://www.objectwire.org/copyright/news/ninth-circuit-pauses-app-store-ruling-apple-supreme-court
- https://developer.apple.com/forums/thread/684850

---

### 23. HG-REG-3 — homegroups / regulatory

**Assertion:** 12-step '7th Tradition' self-support sensitivity — groups handle $200–2,000+/yr; pricing must not signal commercialization or the consumer flywheel stalls.

**Stated source (internal):** `homegroups/docs/go-to-market/monetization.md:90-94`

**Verdict:** `weak` · **confidence:** `medium` · research verdict was `weak`/`medium` · skeptic adjusted: no

**Confidence reason:** The qualitative/normative half of the claim (12-step self-support sensitivity, Tradition 6 commercialization aversion) is strongly externally corroborated by verbatim AA Tradition text and a real named comparable (the AA Meeting Guide app, which AA forced to be donated and free over Tradition 6 concerns). But the specific quantitative bracket ($200–2,000+/yr) lacks a direct external source — triangulated treasurer figures (~$248–395/mo) bracket it loosely but the exact range is the founder's own number — and the causal business consequence ("flywheel stalls") is unfalsifiable since no established paid per-group AA/NA app exists to confirm or deny it. The unsourced quantitative bracket caps this at 'weak' per the sourcing gate.

**Final rationale (post-skeptic):** Verdict survives independent scrutiny; adjusted=false. SOURCES VERIFIED EXTERNAL/REAL: I confirmed AA Traditions 6/7/11 verbatim on aa.org, and confirmed the Meeting Guide app is "a free app supported by Seventh Tradition contributions" serving 150,000+ weekly meetings. None of these are the founder's GTM docs, so the sourcing gate is met for the qualitative half. NORMATIVE CORE (strong, sourced): 12-step money/commercialization aversion is real and codified — Tradition 6 (never "endorse, finance, or lend the A.A. name to any outside enterprise, lest problems of money, property, and prestige divert us"), Tradition 7 (self-supporting, "declining outside contributions"), Tradition 11 (attraction over promotion). QUANTITATIVE BRACKET (weak, correctly capped): the $200–2,000+/yr range is the founder's own number. External data only brackets it loosely — Area 78's SUGGESTED contribution is $217.92/yr (lands inside the bracket), but active-group monthly collections of ~$248–395 imply ~$3,000–4,700/yr, which OVERSHOOTS the $2,000 ceiling. AA publishes no authoritative "typical" figure. Per the sourcing gate, an unsourced quantitative number caps the whole claim at 'weak' — the original verdict applied this correctly. CAUSAL "FLYWHEEL STALLS" (overstated/unfalsifiable): no established paid per-group AA/NA admin app exists as a stalled comparable; paid recovery apps coexist with the fellowship without boycott, so the hard causal threat is not evidence-backed. ONE CORRECT REFINEMENT the verdict already surfaces: the operative constraint is Tradition 6 (affiliation/name-lending), and an admin personally paying for a neutral third-party SaaS tool is NOT a group "outside contribution" (Tradition 7) and need not carry AA branding — materially softening the regulatory risk the claim's framing implies. CAVEAT I independently flagged: the aa.org Meeting Guide page does NOT itself confirm the "creator donated it" / formal Tradition-6 group-conscience-debate origin story (that rests on the cited Box 459 newsletter, which I did not re-verify in this pass) — but the page does confirm the app is free and fellowship-funded, which is enough to support the "commercialization nerve is real for software in this space" point. SOLO/BOOTSTRAPPED CONSTRAINT: does not break the verdict; it reinforces the practical takeaway (low consumer pricing, no AA-affiliation language), which a solo part-time founder can execute and which Homegroups' $24/yr admin-fee framing already satisfies. Net: 'weak' is the right call — well-sourced normative core, unsourced precise dollar bracket, unfalsifiable causal mechanism.

<details><summary>Research-stage rationale</summary>

The claim bundles three sub-assertions. (1) NORMATIVE: 12-step culture is genuinely money-sensitive. Strongly true and externally sourced — Tradition 7 ("fully self-supporting, declining outside contributions"), Tradition 6 ("ought never endorse, finance, or lend the A.A. name to any related facility or outside enterprise, lest problems of money, property, and prestige divert us"), and Tradition 11 ("attraction rather than promotion") are the literal cultural constraints. (2) QUANTITATIVE: groups handle "$200–2,000+/yr." Directionally plausible but NOT directly sourced. Real treasurer data shows monthly 7th-Tradition collections of roughly $248–395 for an active group (~$3,000–4,700/yr), with prudent reserve set at 1–3 months of operating expenses; AA publishes NO authoritative "typical" figure and states amounts "vary significantly by group." Small/new/online groups plausibly sit in the low hundreds, large groups exceed $2,000 — so the founder's bracket is a reasonable envelope but the exact numbers are his own, not an external citation, and the upper bound undershoots active urban groups. (3) CAUSAL: if pricing "signals commercialization," the consumer flywheel "stalls." This is the weakest link and is unfalsifiable from external evidence — there is no established paid per-group AA/NA management app to point to as a stalled comparable; the category is dominated by FREE tools (the official Meeting Guide app, free PDF treasurer/attendance templates). The single strongest real comparable cuts in the founder's favor on direction: AA's own Meeting Guide app triggered explicit group-conscience debate over Tradition 6 ("Would it always be free? Does this represent affiliation with an outside entity?") and was only accepted because its creator DONATED it and it remains free of charge. That proves the commercialization nerve is real for software in this space — but it is evidence about an app carrying the AA NAME and serving the FELLOWSHIP, not about a neutral third-party admin tool a group ADMIN personally pays a low fee for. Note the operative constraint is Tradition 6 (affiliation/endorsement) more than Tradition 7 (self-support), and Homegroups is positioned as a tool an admin buys, not an "outside contribution" to the group — which materially softens the regulatory risk the claim implies. For a solo bootstrapped founder the practical takeaway holds: keep consumer pricing low and avoid AA-branding/affiliation language, which Homegroups' own $24/yr decision already does. But the claim as written — a precise dollar bracket plus a hard "flywheel stalls" causal threat — overstates the evidentiary basis.

</details>

**Steelman (claim true/achievable):** 12-step recovery culture is uniquely and provably money-averse: AA's Traditions 6, 7, and 11 — quoted verbatim from aa.org — bake aversion to outside enterprise, self-support-only finances, and "attraction rather than promotion" into the fellowship's DNA. The decisive real-world proof is AA's own Meeting Guide app: when an app touched this community, AA conducted formal group-conscience debate over Tradition 6 ("Does this represent affiliation with an outside entity? Would it always be free?") and accepted it ONLY because the creator donated it and it stays free for 150,000+ weekly meetings. That is a named, documented instance of the exact commercialization sensitivity the claim asserts. Because adoption in this space spreads by word-of-mouth between anonymous members and group officers, any whiff of profiteering off recovery can poison that referral channel — so keeping consumer pricing low and non-commercial-feeling (Homegroups' $24/yr admin fee, framed as a tool cost not a group donation) is the correct, risk-minimizing posture for a solo founder who cannot afford reputational damage. The dollar bracket, while not precisely sourced, is a defensible envelope: real treasurer reports show active groups collecting ~$250–400/month, so groups demonstrably handle hundreds to low-thousands annually, making a $24/yr admin tool trivially affordable and non-threatening.

**Steelman-against (disconfirming case):** The claim overstates both its evidence and its mechanism. (a) The quantitative bracket is the founder's own number with no external citation; the best real data (~$248–395/mo, ≈$3–4.7k/yr for active groups, with no authoritative "typical") suggests the "$2,000+" ceiling actually understates well-attended urban groups, so the figure is loose rather than validated. (b) The governing Tradition is 6 (affiliation/endorsement of the A.A. NAME), and the AA Meeting Guide precedent specifically concerned an app bearing AA's name and serving as fellowship infrastructure — NOT a neutral third-party SaaS tool an individual admin chooses to pay for. A group admin paying $24/yr for software is not an "outside contribution to the group" (Tradition 7) and need not carry AA branding (Tradition 6), so the regulatory frame the claim invokes is weaker than implied. (c) The core causal threat — "the consumer flywheel STALLS" — is unfalsifiable: there is NO established paid per-group AA/NA management app in the market to serve as evidence of a stall, and the absence of such products is at least as consistent with "nobody has built/marketed a good one" as with "pricing kills adoption." (d) Counter-evidence exists for paid recovery products coexisting with the community: numerous paid sobriety/recovery apps operate without fellowship backlash, indicating individuals will pay for recovery-adjacent software when it's framed as a personal tool. The real adoption risk for a solo bootstrapped founder is far more likely to be distribution and awareness than a Traditions-driven boycott triggered by a $24 price tag.

**Comparables:**

- AA Meeting Guide app — official AA meeting-finder app; AA held formal group-conscience review over Tradition 6 ('Would it always be free? Does this represent affiliation with an outside entity?') and accepted it only after the creator DONATED it; remains free for 150,000+ weekly meetings (aa.org Box 459, Fall 2019). Direct evidence the commercialization nerve is real for software in this space.
- AA Tradition 6 (verbatim) — 'An A.A. group ought never endorse, finance, or lend the A.A. name to any related facility or outside enterprise, lest problems of money, property, and prestige divert us from our primary purpose.' The actual normative rule behind the claim.
- AA Tradition 7 (verbatim) — 'Every A.A. group ought to be fully self-supporting, declining outside contributions.' Governs group finances; note an admin's personal tool purchase is not a group 'outside contribution.'
- AA Tradition 11 — 'attraction rather than promotion'; constrains aggressive/commercial marketing into the fellowship.
- Sample AA group treasurer reports — monthly 7th-Tradition collections of ~$248–395 (≈$3,000–4,700/yr for an active group); prudent reserve = 1–3 months operating expenses; AA publishes no single 'typical' figure. Loosely brackets but does not precisely confirm the claimed $200–2,000+/yr range.
- Commercial paid sobriety/recovery apps (broad category) — operate at scale without fellowship-driven boycott, evidence that individuals will pay for recovery-adjacent software framed as a personal tool, weakening the 'commercialization automatically stalls adoption' mechanism.
- Absence of any established paid per-group AA/NA group-management app — the category is dominated by free tools (official Meeting Guide, free PDF templates); means the 'flywheel stalls' consequence has no real-world stalled comparable to confirm it.

**Sources:**

- https://www.aa.org/the-twelve-traditions
- https://www.aa.org/sites/default/files/newsletters/en_box459_fall19.pdf
- https://www.aa.org/meeting-guide-app
- https://meetingguide.helpdocs.io/article/mekopq7u1t-what-is-meeting-guide
- https://www.aa.org/faq/what-prudent-reserve
- https://area59aa.org/wp-content/uploads/2022/01/Group-Finance-Best-Practices.pdf
- https://www.aa.org/aa-group-treasurer
- https://www.aa.org/aa-contributions-self-support
- https://pmc.ncbi.nlm.nih.gov/articles/PMC6658280/
- https://area78aa.org/a-letter-from-area-treasurer-reference-7th-tradition/
- https://aa-intergroup.org/contributions/
- https://www.aa.org/sites/default/files/literature/assets/p-16_theaagroup.pdf

---

### 24. DX-ROAD-2 — detox-recovery / roadmap

**Assertion:** Paid PDFs blocked / not deliverable today — env vars are placeholders, PDFs not generated; 'charging for an undeliverable product is the headline revenue-leak risk.' Touches Lemon Squeezy merchant-of-record vs IAP question.

**Stated source (internal):** `detox-recovery/docs/go-to-market/roadmap.md:35,39-45`

**Verdict:** `validated` · **confidence:** `medium` · research verdict was `validated`/`medium` · skeptic adjusted: no

**Confidence reason:** Qualitative core is backed by several external sources. Held at medium rather than high because the High likelihood risk rating traces only to the founder internal register, and the FTC Mail Order Rule most likely does not govern instant digital downloads, which softens the legal framing.

**Final rationale (post-skeptic):** The qualitative core survives refutation and is backed by genuine EXTERNAL sources (not the GTM docs): Lemon Squeezy is a real merchant of record that handles digital file delivery, receipt/invoice emails, and VAT/sales-tax remittance across 200+ jurisdictions (confirmed via lemonsqueezy.com docs and third parties ruul.io/metacto/globalsolo); Chargeback Gurus confirms digital goods are a high chargeback-risk category and non-delivery is the primary dispute trigger. So 'charging for an undeliverable product is a revenue-leak/liability risk' is externally real, and the solo-bootstrapped fix (no-code upload + paste buy URLs) is genuinely sub-day once content exists — the true gate is content authoring, a writing task, exactly as the roadmap states. The solo part-time-Y1 constraint does NOT break it.

MATERIAL CODE CORRECTION to the research agent's rationale: the agent (echoing CLAUDE.md/requirements.md) asserts the 5 PDFs are 'gated coming-soon with a disabled button, so today posture is safe.' That is FALSE in the actual code. /detox-recovery/lib/products-data.ts sets availability:"coming-soon" on NONE of the 5 PDF products (the field is defined on the type at line 15 but never assigned). /detox-recovery/components/resources/ProductCard.tsx gates on product.availability==="coming-soon"; with it unset, isComingSoon is false and each PDF renders a LIVE enabled 'Get the guide'/'Download' Button whose href falls back to "#". So today the PDFs are live-but-dead-link buttons, not disabled 'Available soon' buttons — a doc/code drift. This does NOT create an active charge (the "#" links go nowhere and env.example holds REPLACE placeholders, so no real Lemon Squeezy checkout fires), so 'no active leak today' still holds — but via the env-placeholder path, not the gating the agent claimed. Net effect: the roadmap's P0 ('hide or pre-order the 5 PDF links — prevents charging for undeliverable products', decisions.md line 278) is MORE justified given live dead-link buttons, strengthening the claim rather than weakening it.

Edge points upheld: the IAP/merchant-of-record sub-point is correctly a red herring — NextStep is a website, so Apple/Google 30% IAP rules never apply. The FTC Mail Order Rule (16 CFR 435) most likely excludes instant digital downloads, so the risk is chargeback/trust, not clearly statutory; this softens the legal framing and justifies holding at medium, not high. The 'High likelihood' rating still traces only to the founder's internal register (no external corroboration of likelihood), which caps confidence at medium. Verdict and confidence unchanged from the research agent; only the supporting code-state reasoning is corrected.

<details><summary>Research-stage rationale</summary>

The code state (PDFs gated, Lemon Squeezy env placeholder) is given as internal status and corroborated by the repo Jun 7 audit and detox CLAUDE.md, where the five paid PDFs are gated coming-soon with a disabled button, so the product currently cannot charge and today posture is safe. The roadmap framing is forward looking, exposing links before delivery exists is the real risk, and that conditional risk is externally real. Lemon Squeezy is a genuine merchant of record handling PDF delivery, VAT in 135 plus countries, and receipt email with no code, so a solo part time founder can wire delivery in under a day once content exists, and the true gating dependency is content authoring, matching the roadmap. Digital goods are the highest risk chargeback category and non delivery is the canonical refund trigger, validating the refund and trust framing. Two edge corrections, the FTC Mail Order Rule likely excludes instant digital downloads so the risk is trust and chargeback not clearly statutory, and the merchant of record versus in app purchase question is moot because NextStep is a website not a mobile app so Apple and Google 30 percent rules never apply. Net, headline claim validated, IAP sub point is a red herring for a web product.

</details>

**Steelman (claim true/achievable):** Charging for an undeliverable product is a textbook revenue leak into liability trap. The codebase confirms the five paid PDFs are gated coming-soon and Lemon Squeezy is a placeholder, so the roadmap correctly flags that exposing links before content and delivery wiring exist would generate paid orders with no fulfillment. Digital goods are the highest risk chargeback category and non delivery is the prototypical dispute trigger, so the refund and trust impact is well founded. The fix is solo achievable because Lemon Squeezy as merchant of record delivers the PDF, receipt, and global VAT via a no code upload, making the P0 a sub day task once content exists.

**Steelman-against (disconfirming case):** The claim slightly inflates and mis frames. Today the product literally cannot charge due to coming-soon gating, so there is no active leak, and the headline risk label describes a hypothetical already mitigated by hiding the links. The strongest legal hook, the FTC Mail Order Rule, likely does not apply to instant digital downloads, weakening undeliverable equals regulatory risk to merely could cause chargebacks, which is low severity for a pre launch site with zero traffic. The merchant of record versus in app purchase framing is a category error because a website never triggers the in app 30 percent question. The real blocker is unwritten content, a writing task, so a P0 infrastructure and revenue leak label overstates urgency.

**Comparables:**

- Lemon Squeezy, a real merchant of record for digital PDFs with no code dashboard upload, VAT in 135 plus countries, and delivery email, acquired by Stripe in 2024
- Gumroad, SendOwl, Paddle, comparable merchant of record and digital download platforms a solo creator uses to auto deliver PDFs, showing the mechanism is commodity
- FTC Mail Internet or Telephone Order Merchandise Rule 16 CFR Part 435, the charging before shipment statute, which excludes services so instant digital PDFs likely fall outside it
- Apple and Google in app purchase rules, where the 30 percent applies only to in app digital purchases and web or externally consumed goods are exempt per GOV.UK CMA Appendix H, making IAP moot for a website

**Sources:**

- https://www.lemonsqueezy.com/blog/how-to-sell-digital-downloads
- https://www.lemonsqueezy.com/
- https://docs.lemonsqueezy.com/help/payments/merchant-of-record
- https://www.clear.sale/blog/how-merchants-reduce-chargeback-risks-virtual-items
- https://www.chargebackgurus.com/blog/digital-goods-chargebacks
- https://consumer.ftc.gov/articles/what-do-if-youre-billed-things-you-never-got-or-you-get-unordered-products
- https://www.ftc.gov/business-guidance/resources/business-guide-ftcs-mail-internet-or-telephone-order-merchandise-rule
- https://www.ecfr.gov/current/title-16/chapter-I/subchapter-D/part-435
- https://assets.publishing.service.gov.uk/media/62a0d1b68fa8f5039b2078e5/Appendix_H
- https://www.lemonsqueezy.com/reporting/merchant-of-record
- https://docs.lemonsqueezy.com/help/payments/sales-tax-vat
- https://www.lemonsqueezy.com/blog/value-added-tax-vat-explained
- https://ruul.io/blog/what-is-lemonsqueezy
- https://www.globalsolo.global/blog/stripe-vs-paddle-vs-lemon-squeezy-2026

---
