# Recovery Ecosystem — Business-Validation Synthesis

**Run date:** 2026-06-11 · **Source of record:** `docs/research/_work/verdicts.md` (24 adversarially-verified claims, 48-agent anti-optimism workflow `wf_fea81111-0f1`) · **Supporting:** `docs/research/_work/deep-dive-list.md`, `docs/research/_work/claim-ledger.md`

> **Operator constraint carried through every verdict below:** SOLO founder, part-time Year 1 → full-time Year 2, bootstrapped, no external capital. Verdicts are NOT softened for narrative; `broken`/`weak` stay as-is.

## Executive Summary

**Verdict tally (24 claims):** 6 validated · 15 weak · 3 broken · 0 insufficient-evidence. The skeptic downgraded 10 of 24 — so the un-adversarial story was meaningfully rosier than the truth. Of the 6 "validated," **four are validated bad news** (the moat is unbuilt, the anti-kickback gate is real, the Stripe price IDs are missing, the PDFs are undeliverable) — only confirmations of problems, not of upside.

**Headline recommendation:** Bet first on **detox-recovery (NextStep) near-term real-money services + homegroups consumer/B2B billing fixes**, fund nothing on the ecosystem network thesis, and **defer the recovery-api referral moat to a "do-it-by-hand, monetize-never-until-counsel" posture.** The single venture-scale story (the ASAM-continuum network effect) is validated as a _real problem_ but _unrealized in code with zero live producers/consumers_, and the only real comparable (Unite Us) raised ~$230M+ and runs 470–540 staff to build exactly this network — categorically out of reach for a bootstrapped solo founder. The three highest-ACV products (facility dashboard at venture-scale ACV, aftercare pipeline, Medicaid/VA PSS billing) are either unbuilt, structurally barred, or both. Near-term cash is small, concentrated, and fragile but _deliverable_; the big numbers are mislabeled or arithmetic-broken.

**Section 3 flags:** 9 claims for **correction** (factually wrong / broken / stale-vs-code), 11 for **softening** (directionally true but overstated), and 4 for **flag-with-caveat** (keep but annotate). See Section 3 for the keyed, line-anchored edit prompt.

---

## Section 1 — Scored Validation Report

Per-claim verdicts grouped by dimension. Format: `claim_id` — assertion — **verdict** (confidence) — strongest external source(s).

> Note on coverage: the approved 24-claim set contains **no `pricing`-dimension claim** (pricing-dimension rows like RG-PRC-_, HG-PRC-_, DX-PRC-\* fell below the deep-dive cut). Pricing was therefore not independently re-verified; pricing risk is carried indirectly via the projection and roadmap verdicts that depend on those SKUs.

### Thesis (2 claims — both validated, both _validated bad news_)

| claim_id      | assertion                                                                                                        | verdict       | conf | strongest sources                                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------- | ------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ECO-THE-3** | ASAM-continuum moat asserted; network thesis unrealized in code — referral bus has zero live producers/consumers | **validated** | high | UCSF SIREN (binding constraint is network adoption, not code); Unite Us raised ~$230–241M, ~$1.6B peak, 473–540 staff over ~8 yrs; Andrew Chen _Cold Start Problem_ |
| **HG-THE-3**  | Referral bus has zero live producers/consumers — thesis unbuilt in code; moat aspirational                       | **validated** | high | a16z _Cold Start Problem_; Bamboo Health (PE-backed, 1B encounters/yr); EKRA 18 U.S.C. 220 enforcement constraining monetization                                    |

- ECO-THE-3 sources: <https://sirenetwork.ucsf.edu/tools-resources/resources/social-care-best-practices-learnings-technology-enabled-closed-loop> · <https://getlatka.com/companies/unite-us> · <https://andrewchen.com/wp-content/uploads/2022/01/ColdStartProb_9780062969743_AS0928_cc20_Final.pdf>
- HG-THE-3 sources: <https://a16z.com/books/the-cold-start-problem/> · <https://bamboohealth.com/> · <https://www.americanhealthlaw.org/content-library/publications/bulletins/49b5f30c-d8fa-4df0-8090-cc3f64e9f801/ekra-convictions-send-message-about-enforcement-an>

**Reading:** Both validated claims confirm the moat does not exist yet. The thesis is directionally real (care fragmentation is documented) but the hard part — the live two-sided network — is the part with _zero_ progress, and it is funded-team-scale work. Treat the network effect as an aspiration, never as a present asset in any valuation.

### Regulatory (6 claims)

| claim_id      | assertion                                                                                                      | verdict       | conf   | strongest sources                                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------- | ------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ECO-REG-1** | D-10: any per-referral money movement must clear anti-kickback / patient-brokering review before relay enabled | **validated** | high   | EKRA 18 U.S.C. 220 (all-payer, up to $200k + 10yr/occurrence); FL 817.505 patient-brokering felony; DOJ NJ $5–10k/referral convictions              |
| **ECO-REG-2** | O-3 (B2B SaaS seat) chosen to sidestep per-referral landmines; legal review required                           | **validated** | medium | EKRA text + _US v. Schena_ (9th Cir., aff'd Jul 2025 — fixed/% label not auto-safe); Recovery.com flat-fee comparable                               |
| **RG-REG-2**  | D-12 regroup HIPAA/BAA surface OPEN; written legal opinion required; launch-blocking                           | **weak**      | medium | HHS covered-entity criteria (non-clinical sober-living typically NOT a covered entity); free self-serve Google Cloud BAA; Stripe does not sign BAAs |
| **RG-REG-4**  | Rotate 3 leaked service-account keys + purge git history; live breach vector                                   | **weak**      | medium | Google IAM best-practices (SA keys never expire); Aquilax (rotation ≠ history-purge) — but monorepo + public `regroup-go` scanned CLEAN             |
| **ECO-REG-3** | CMS mandates FHIR R4 by mid-2026; ASAM CONTINUUM endorsed/required by 30+ states (timing tailwind)             | **weak**      | high   | CMS-0057-F (FHIR APIs due Jan 1 **2027**, binds _payers_ not the buyer); only Arizona AHCCCS confirmed to mandate CONTINUUM _software_              |
| **RG-REG-1**  | D-11 IAP vs web billing OPEN; Apple could force 30% take or block billing                                      | **weak**      | medium | Apple Guideline 3.1.1 (May 2025, US external links, 0% cut); _Epic v. Apple_ 9th Cir. Dec 2025; Spotify/Patreon/Kindle shipped link-out             |

- ECO-REG-1: <https://www.law.cornell.edu/uscode/text/18/220> · <https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0800-0899/0817/Sections/0817.505.html>
- ECO-REG-2: <https://www.mintz.com/insights-center/viewpoints/2146/2025-07-17-ninth-circuit-court-appeals-affirms-ekra-conviction-lab> · <https://recovery.com/>
- RG-REG-2: <https://www.hhs.gov/hipaa/for-professionals/covered-entities/index.html> · <https://cloud.google.com/security/compliance/hipaa> · <https://www.paubox.com/blog/stripe-hipaa-compliant>
- RG-REG-4: <https://docs.cloud.google.com/iam/docs/best-practices-for-managing-service-account-keys> · <https://aquilax.ai/blog/secrets-git-history-rotation>
- ECO-REG-3: <https://www.cms.gov/initiatives/burden-reduction/overview/interoperability/policies-regulations/cms-interoperability-prior-authorization-final-rule-cms-0057-f> · <https://www.azahcccs.gov/PlansProviders/CurrentProviders/ASAM.html>
- RG-REG-1: <https://developer.apple.com/news/?id=9txfddzf> · <https://cdn.ca9.uscourts.gov/datastore/opinions/2025/12/11/25-2935.pdf>

**Reading:** The one _hard_ regulatory gate is **anti-kickback (ECO-REG-1/2)** — real, criminal, all-payer, and enforced; it caps how the referral bus can ever be monetized. The other four regulatory "blockers" (HIPAA, leaked keys, FHIR/ASAM tailwind, Apple IAP) are real surfaces but **overstated as launch-blockers** — each has a cheap, solo-executable mitigation (free GCP BAA click-through; 1–2 hr key rotation; reframe the tailwind; route to the already-built web checkout).

### Roadmap (7 claims)

| claim_id       | assertion                                                                                                        | verdict       | conf   | strongest sources                                                                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | ------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ECO-ROAD-1** | ECO-6 facility dashboard + ECO-7 aftercare pipeline BOTH not_started (net-new HIPAA stack)                       | **weak**      | medium | chopdawg HIPAA build-cost ($50k–$500k+); saturated incumbents (Vista, CaredFor, AAC Together); 42 CFR Part 2 omitted                                                                   |
| **HG-ROAD-3**  | TC facility dashboard not_started; "highest-ACV B2B story has no product to demo"                                | **broken**    | high   | **Refuted in-repo** — `FacilityDashboardPage.js` (299 lines), routed `/facility-dashboard`, backed by `getFacilityEngagementMetrics.ts` (215 lines). Doc stale, not code               |
| **ECO-ROAD-2** | ECO-5 bridge: Regroup-side cross-project caller "not built"; callability UNVERIFIED                              | **weak**      | medium | **Caller IS built** (`getResidentMeetingAttendance`); but cross-project round-trip genuinely unverified (URL points at wrong project; all tests mock fetch). Firebase http-events docs |
| **HG-ROAD-2**  | No default Stripe price on intergroup Tier A/B → "silent revenue-zero"; every intergroup/TC checkout fails today | **weak**      | medium | Stripe API (default_price nullable; Checkout needs explicit price) — mechanism real; "every checkout fails today / silent / consumer-only" is GTM-doc-only & code-contradicted         |
| **RG-ROAD-1**  | Tier-billing flag + amountCents + resolver (RG-RM-7) not_started — gates ALL regroup subscription revenue        | **weak**      | medium | Stripe change-price/manage-prices docs — "gates ALL" overstated; true hard gate is RG-RM-8 (price IDs) + single-item billing, not the flag alone                                       |
| **RG-ROAD-2**  | Create 6 Stripe Price IDs (RG-RM-8) blocked; no operator can subscribe on a tier until set                       | **validated** | high   | Stripe `subscriptions.create` requires price/price_data; resolver throws "Price ID not configured" before any Stripe call. Deterministic                                               |
| **DX-ROAD-2**  | Paid PDFs blocked/undeliverable (env placeholders); "charging for undeliverable product" is headline leak risk   | **validated** | medium | Lemon Squeezy MoR (real, handles delivery/VAT); Chargeback Gurus (digital non-delivery = top dispute). Code drift makes risk _worse_ (live dead-link buttons)                          |

- ECO-ROAD-1: <https://www.chopdawg.com/building-a-hipaa-compliant-app-what-healthcare-founders-need-to-know-in-2026/> · <https://www.ecfr.gov/current/title-42/chapter-I/subchapter-A/part-2>
- HG-ROAD-3: <https://loosidapp.com/sam-alumni-engagement-platform/> · <https://www.sunwavehealth.com/blog/addiction-treatment-alumni-engagement/> (+ in-repo `FacilityDashboardPage.js`)
- ECO-ROAD-2: <https://firebase.google.com/docs/functions/http-events> · <https://github.com/firebase/firebase-tools/issues/5958>
- HG-ROAD-2: <https://docs.stripe.com/api/products/object> · <https://docs.stripe.com/api/checkout/sessions/create>
- RG-ROAD-1: <https://docs.stripe.com/billing/subscriptions/change-price> · <https://docs.stripe.com/products-prices/manage-prices>
- RG-ROAD-2: <https://docs.stripe.com/api/subscriptions/create>
- DX-ROAD-2: <https://docs.lemonsqueezy.com/help/payments/merchant-of-record> · <https://www.chargebackgurus.com/blog/digital-goods-chargebacks>

**Reading:** Two roadmap "blockers" collapsed under code-check — the homegroups facility dashboard **already exists** (HG-ROAD-3 broken) and the regroup cross-project caller **is built** (ECO-ROAD-2 caller-not-built clause false). The genuinely load-bearing, cheap-to-clear gates are **Stripe configuration** (RG-ROAD-2 validated; HG-ROAD-2 mechanism real) and **content authoring + delivery wiring** (DX-ROAD-2 validated). The net-new ECO-6/ECO-7 builds (ECO-ROAD-1) are the only roadmap items that are genuinely hard for a solo founder — and they are exactly the highest-ACV ones.

### Projection (3 claims — 1 broken, 2 weak)

| claim_id       | assertion                                                               | verdict    | conf   | strongest sources                                                                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **DX-PROJ-1**  | Detox Year-1 P50 $18,063 (P10 $7,500 / P90 $32,000)                     | **weak**   | medium | Recovery-coach part-time band $25k–$45k/yr & $75–$150/session (brackets headline as modest); but exact figure & 2-deal composition are internal-model only                                             |
| **DX-PROJ-3**  | 51% of Year-1 revenue from just 2 B2B engagements (~$8,500 of ~$18,063) | **weak**   | low    | CFI/Anders/Projectworks concentration thresholds (>20%/client = red flag) — direction real; but 51% is miscalculated (47.06%) AND internally contradicted across founder's own docs ($13,454/41%; 18%) |
| **ECO-PROJ-1** | Combined 3-yr ARR Conservative ~$1.74M / Moderate ~$7.84M               | **broken** | high   | Behave Health (same vertical, 8 staff, only $902.2K ARR after ~9 yrs); ChartMogul (only 13.4% of SaaS reach $1M ARR in 3 yrs). Internal sums self-contradict ($995k vs $1.216M claimed)                |
| **ECO-PROJ-2** | Implied valuation $46M–$87M at 8–15× moderate Y3 ARR                    | **weak**   | high   | SaaS Capital (bootstrapped 4.8×); Aventis (2026 median 3.4×, size = discount); Nelson HealthTech (4–6×, AI-premium 6–8×, NOT 8–15×)                                                                    |

- DX-PROJ-1: <https://www.corevaluesrecovery.com/blog/recovery-coach-salary> · <https://belkins.io/blog/cold-email-response-rates>
- DX-PROJ-3: <https://corporatefinanceinstitute.com/resources/valuation/customer-concentration/> · <https://www.projectworks.com/blog/client-concentration-risk>
- ECO-PROJ-1: <https://getlatka.com/companies/behave-health> · <https://chartmogul.com/reports/saas-growth-the-odds-of-making-it/>
- ECO-PROJ-2: <https://www.saas-capital.com/blog-posts/private-saas-company-valuations-multiples/> · <https://nelsonadvisors.co.uk/blog/healthtech-m-a-multiples-january-2026--current-trends-and-variables-driving-valuations>

**Reading:** The **headline ecosystem ARR ($1.74M/$7.84M) is broken** — internally self-contradicting (the doc's own per-product ladders sum to less than the headline, the gap attributed to _unbuilt_ synergy), cross-doc-contradictory (Aftercare credited 4.8×–19.7× its own SSOT figure), and externally refuted (a funded 8-person team in this exact vertical stalled below $1M after 9 years). The **valuation ($46M–$87M) is a ceiling-of-a-ceiling** — inflated multiple chained to the broken ARR; a disciplined 3–5× on the _conservative_ $1.22M Y3 ARR is ~$5M, not $46M+. The only near-term projection (detox Y1 $18,063) is modest in magnitude but fragile in composition: half rests on two unbooked B2B deals a no-network solo founder most-likely closes zero of in a part-time year, collapsing realized revenue toward the $7,500 P10.

### Market (3 claims — 1 broken, 2 weak)

| claim_id      | assertion                                                                         | verdict    | conf   | strongest sources                                                                                                                                                                                   |
| ------------- | --------------------------------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ECO-MKT-2** | 85% first-year relapse; 80% of clinicians never measure post-discharge outcomes   | **weak**   | medium | Real but precision-shopped: 85% is Sinha 2011 (pools alcohol/nicotine/weight, any-return); NIDA headline SUD = 40–60%; 80% inferred from Fortney 2017 (in-session MBC, wrong denominator)           |
| **ECO-MKT-1** | $143.62B (2024) SUD market; ~17,353 facilities; ~17,900 residences serve ~275,000 | **weak**   | high   | Grand View Research figure is **Mental Health AND Addiction** combined (mislabeled); narrow SUD = $2.3B–$41B; residences = upper-bound model, observed count ~10,400 (NSTARR)                       |
| **DX-MKT-4**  | Medicaid peer support reimbursable in 43 states; VA Community Care PSS pathway    | **broken** | high   | "43" matches no source (SAMHSA = 41 both / 48+DC either); unlicensed solo peer CANNOT independently enroll/bill (CO HCPF, NY Medicaid, WA HCA); VA PSS = W-2 federal role, not solo billing channel |

- ECO-MKT-2: <https://pmc.ncbi.nlm.nih.gov/articles/PMC3674771/> · <https://nida.nih.gov/publications/drugs-brains-behavior-science-addiction/treatment-recovery>
- ECO-MKT-1: <https://www.grandviewresearch.com/industry-analysis/us-mental-health-addiction-treatment-centers-market-report> · <https://www.samhsa.gov/data/report/2023-n-sumhss-annual-report>
- DX-MKT-4: <https://policycentermmh.org/app/uploads/2024/07/May-2024-Peer-Excellence-Medicaid-Reimbursement-Report.pdf> · <https://hcpf.colorado.gov/peerservices>

**Reading:** The TAM number is **mislabeled by ~10×** (behavioral-health operating revenue dressed as SUD-treatment software TAM; the real solo-serviceable SAM is low hundreds of millions against entrenched EHR incumbents). The pain stat is _directionally true but cherry-picked_. The **Medicaid/VA PSS revenue pillar is broken** — structurally barred to a solo unlicensed operator, the headline "43 states" is fabricated, and even where billable the economics ($6–$36 / 15-min unit) are immaterial.

### Risk Register

Likelihood × Impact on a 1–5 scale (5 = near-certain / existential). Sorted by composite.

| #   | Risk                                                                                                                                                                                                                                                                              | Likelihood                  | Impact                                          | Composite | Backing claim_id(s)               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------- | --------- | --------------------------------- |
| R1  | **Anti-kickback / patient-brokering criminal exposure** if any per-referral money (O-1/O-2) is switched on without specialized counsel. EKRA is all-payer, criminal, enforced; recovery-api is the entity moving the money.                                                       | 3 (only if relay monetized) | 5 (criminal, personal, existential)             | **15**    | ECO-REG-1, ECO-REG-2, HG-THE-3    |
| R2  | **Ecosystem ARR / valuation is fiction.** Headline $1.74M–$7.84M ARR is arithmetic-broken & externally refuted; $46M–$87M valuation is a ceiling-of-a-ceiling. Decisions anchored to these numbers misallocate the founder's scarce time.                                         | 5 (already wrong)           | 4 (strategic misdirection)                      | **20**    | ECO-PROJ-1, ECO-PROJ-2, ECO-MKT-1 |
| R3  | **Highest-ACV products don't exist / can't be sold solo.** ECO-6 dashboard + ECO-7 aftercare are net-new HIPAA builds; Medicaid/VA PSS pillar is structurally barred. The venture-scale revenue has no deliverable product.                                                       | 4                           | 5 (removes the entire upside case)              | **20**    | ECO-ROAD-1, DX-MKT-4, ECO-PRC-3\* |
| R4  | **Year-1 revenue concentration.** ~half of detox Y1 P50 rests on 2 unbooked B2B deals; a no-network solo founder likely closes zero, collapsing toward $7,500.                                                                                                                    | 4                           | 4                                               | **16**    | DX-PROJ-3, DX-PROJ-1              |
| R5  | **Projection fragility / internal contradiction.** Founder's own docs disagree on the base case (3 conflicting detox Y1 figures; ecosystem sums ≠ headline). Erodes credibility with any external reader.                                                                         | 5                           | 3                                               | **15**    | DX-PROJ-3, ECO-PROJ-1             |
| R6  | **Leaked GCP service-account keys** (rotation not done). Mechanism real (keys never expire); severity lowered because monorepo + public `regroup-go` scan clean and all other repos private — but rotation is the load-bearing step the acceptance criterion doesn't even verify. | 2                           | 4 (admin-key compromise of health-adjacent PII) | **8**     | RG-REG-4                          |
| R7  | **Regulatory tailwind is borrowed credibility.** FHIR/ASAM framing is wrong on date/party/object; a knowledgeable buyer who checks loses trust.                                                                                                                                   | 3                           | 2                                               | **6**     | ECO-REG-3                         |
| R8  | **HIPAA/IAP framed as launch-blockers** they aren't — risk is _self-imposed paralysis_, not the regulation.                                                                                                                                                                       | 2                           | 2                                               | **4**     | RG-REG-2, RG-REG-1                |

\* ECO-PRC-3 (aftercare ~$800–3,000/mo, highest ACV, unbuilt) is a ledger claim not in the 24-claim deep-dive set; cited here for the revenue-concentration linkage.

### Feasibility verdict per product (non-optimistic)

**detox-recovery / NextStep — feasible as a small, real cash business; not as a projection.** It is the only product with money live end-to-end today (Tier-2 $75 call + donations, per DX-ROAD-4 in the ledger). The Y1 $18,063 P50 is _modest_ against external coaching benchmarks (DX-PROJ-1, weak) but its composition is _fragile_: ~half hinges on two B2B engagements a no-network solo founder most-likely closes zero of (DX-PROJ-3, weak/low), and the base case is internally contradicted across three of the founder's own documents. The PDF revenue is undeliverable today and the code even renders live dead-link buy buttons (DX-ROAD-2, validated). The Medicaid/VA PSS "pillar" is broken for a solo unlicensed operator (DX-MKT-4, broken; DX-REG-3, weak/low). Honest expected Y1: closer to the $7,500 floor than the headline, with realistic upside from paid calls + a single B2B close, _not_ from PSS billing or PDFs until content and partnerships exist.

**homegroups — the most product-complete; revenue gated by configuration, not engineering.** The treatment-center facility dashboard the GTM doc calls unbuilt **already exists in-repo** (HG-ROAD-3, broken — the highest-ACV demo artifact is real, contradicting the doc). The B2B billing path's real blocker is an unticked Stripe default-price checkbox (HG-ROAD-2, weak — mechanism real, "every checkout fails today / silent" overstated). The consumer flywheel is constrained more by distribution than by 12-step pricing taboo (HG-REG-3, weak — Tradition-6 risk softened by the admin-pays-for-a-tool framing). Feasible to _transact_ B2B with hours of config work; whether a solo founder can _win_ TC sales against Kipu/Sunwave/One Step is a separate, unaddressed go-to-market gap the dashboard does not close.

**regroup — revenue path is built-but-dark; clear blockers are cheap, the real constraint is adoption.** Tier subscription revenue is hard-blocked by six missing Stripe Price IDs (RG-ROAD-2, validated — deterministic) plus single-item flat-fee billing (RG-ROAD-1, weak — "gates ALL" overstated; the flag/amountCents are near-redundant). Both are minutes-to-an-afternoon of solo work, not engineering risk. The only live revenue mechanism today is the 2% rent fee on 5 houses (ledger RG-ROAD-4). HIPAA (RG-REG-2, weak) and leaked keys (RG-REG-4, weak) are real surfaces with cheap self-serve mitigations, not launch gates. Apple IAP (RG-REG-1, weak) largely evaporated under 2025 case law — route to the already-built web checkout. Feasible to monetize after a config sprint; the binding constraint is Oxford-House acquisition/adoption, which the projections assume but have not validated.

**ecosystem / recovery-api integration layer — NOT feasible at venture scale for this operator; defer.** The network-effect moat is validated as _real-problem-but-unbuilt_ with zero live producers/consumers (ECO-THE-3, HG-THE-3, both validated). The only real comparable (Unite Us) needed ~$230M+ and 470–540 staff over ~8 years; UCSF SIREN's decade of evidence says the binding constraint is human network adoption, not code — precisely the part a part-time bootstrapped solo founder cannot staff. The first concrete connection (ECO-5 bridge) is mostly built but unverified across the project boundary (ECO-ROAD-2, weak — hours of solo deploy/smoke-test work). Monetizing the bus is gated by criminal anti-kickback law (ECO-REG-1, validated). The combined ARR/valuation that would justify investing here is broken (ECO-PROJ-1/2). **Recommendation: keep the rails, hand-broker any referrals manually (Cold Start "do things that don't scale"), spend zero build budget on the network until per-product revenue funds it, and never attach a per-referral fee without specialized healthcare counsel.**

---

## Section 2 — Decision Matrix

**Feasibility (1–5):** how realistically a solo, part-time-Y1, bootstrapped founder can deliver it. **Risk-adjusted return (1–5):** expected near-term real-money return after discounting for the verified risks. **Composite = Feasibility × Risk-adjusted return** (max 25).

| Product / initiative          | Feasibility | Risk-adj. return | Composite | One-line (non-optimistic) rationale                                                                                                                                             |
| ----------------------------- | ----------- | ---------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **detox-recovery (NextStep)** | 4           | 3                | **12**    | Only product with live end-to-end money; modest, fragile, concentration-risked Y1, but real cash and fully solo-deliverable. B2B + calls are the engine; PSS/PDFs are not Y1.   |
| **homegroups**                | 4           | 3                | **12**    | Most product-complete (dashboard already exists, contra doc); B2B revenue is a Stripe config fix away. Upside capped by unproven ability to win TC sales vs. funded incumbents. |
| **regroup**                   | 3           | 2                | **6**     | Revenue built-but-dark; clearing it is cheap, but realized return depends on Oxford-House adoption that is explicitly unvalidated, and only 5 live houses today.                |
| **recovery-api / ecosystem**  | 1           | 1                | **1**     | Validated real problem, but the moat is unbuilt, funded-team-scale, monetization is criminally gated, and the ARR/valuation case is broken. Defer; do-by-hand only.             |

### Recommended build / monetize sequence

**#1 — BET FIRST: detox-recovery services revenue + homegroups B2B billing fix (run in parallel — both are deliverable-now real money).**

- _detox:_ wire Lemon Squeezy delivery + author the PDF content (the true gate is writing, not infra — DX-ROAD-2 validated), hide live dead-link buy buttons immediately, and put founder time into the 1–2 B2B engagements + paid calls that actually move Y1.
- _homegroups:_ set the missing intergroup/TC default Stripe prices (the unticked checkbox — HG-ROAD-2), and lean on the _already-built_ facility dashboard (HG-ROAD-3 broken) as the live demo artifact for B2B outreach.
- _Why first:_ these are the only paths to near-term real money that a solo bootstrapped founder can fully control, and the work is config/content, not net-new HIPAA platform engineering.

**Specific risks that could break the #1 bet (cite claim_ids):**

1. **DX-PROJ-3 / DX-PROJ-1** — Y1 detox revenue is ~50% concentrated in 2 unbooked B2B deals; a no-network solo founder's single most-likely outcome is _zero_ B2B closes, collapsing realized revenue toward the $7,500 P10. Mitigate by diversifying the pipeline early and not budgeting on the 2 deals.
2. **DX-MKT-4 (broken) / DX-REG-3** — do NOT count on Medicaid/VA PSS billing as a detox revenue line; it is structurally barred to a solo unlicensed operator. Treating it as a pillar is a planning error.
3. **HG-ROAD-2 caveat** — the homegroups "every checkout fails / silent" framing is GTM-doc-only; verify the _live Stripe Dashboard_ state directly before assuming the fix is needed (the consumer group tier uses the same resolver, so "consumer-only transacts" is not a code guarantee).
4. **DX-PROJ-3 / ECO-PROJ-1 cross-doc contradictions** — the founder's own base-case numbers disagree; reconcile to one SSOT before quoting any figure externally, or credibility erodes on first check.

**#2 — SECOND: regroup billing activation (a short config sprint, then adoption).** Create the 6 Stripe Price IDs + secrets (RG-ROAD-2 validated — minutes of work), wire single-item tier billing (RG-ROAD-1), do the free GCP BAA click-through and rotate the GCP keys (RG-REG-2/RG-REG-4 — both cheap, neither a true blocker), and route the iOS upgrade CTA to the existing web checkout (RG-REG-1). _Why second, not first:_ the clearing work is trivially solo-feasible, but realized return depends on Oxford-House acquisition/rent-adoption rates that are explicitly unvalidated, and there are only 5 live houses today — so it earns less near-term than #1 per unit of founder time.

**#3 — THIRD (cheap, optional): light up the ECO-5 bridge by hand.** Deploy both functions, set the matching key, repoint the URL to the correct project, run one smoke curl (ECO-ROAD-2 — hours of solo work). This makes the "suite" story demoable _without_ building the network. Keep referrals hand-brokered (Cold Start: do things that don't scale). **Attach no fee.**

**DEFER / DO-NOT-BUILD (until per-product revenue funds it AND counsel clears it):**

- **ECO-6 facility dashboard scale-out + ECO-7 aftercare pipeline (ECO-ROAD-1, weak):** net-new HIPAA stack ($50k–$500k+ comparable build cost), saturated by funded incumbents, omits 42 CFR Part 2. The highest-ACV unlocks are exactly the ones a solo part-time founder cannot reach near-term.
- **Any per-referral monetization of the bus (ECO-REG-1/2, validated):** criminal anti-kickback exposure; requires specialized healthcare counsel covering EKRA + every applicable state patient-brokering statute. O-2 may be unsalvageable.

**KILL / RE-LABEL (stop presenting as live strategy):**

- **Ecosystem ARR $1.74M/$7.84M + $46M–$87M valuation (ECO-PROJ-1 broken, ECO-PROJ-2 weak):** stop using as a planning or pitch anchor; the numbers are arithmetic-broken and externally refuted.
- **Medicaid/VA PSS as a revenue pillar (DX-MKT-4 broken):** re-label as a mission/grant-adjacent aspiration contingent on agency partnership, not a solo billing line.

**Sequence rationale:** This ordering favors **near-term real money, solo-deliverable, low-capital** work (detox services + homegroups/regroup config fixes) over **aspirational, funded-team-scale, criminally-gated** work (the network moat and the highest-ACV unbuilt products). It is defensible for a bootstrapped solo founder precisely because every #1/#2 item is something one part-time person can ship and get paid for this year, while every deferred item either needs capital the founder does not have, a network that does not exist, or counsel that has not been engaged.

---

## Section 3 — Doc-Revision Prompt (self-contained)

> **Purpose:** This is an actionable, standalone prompt for a future `/superpowers:writing-plans` or `/claude-mem:make-plan` run to correct the GTM docs. It does NOT depend on the rest of this report. Each item is keyed by `claim_id` + the file line-anchor from the claim ledger / verdict `stated_source`. **This is edit _intent_, not the edit — a later controlled task performs the writes.** Per task constraints, the executor must NOT edit anything under `docs/go-to-market/**` without explicit human approval; treat the anchors below as the targets to _propose_ diffs against.
>
> Per-product on-disk GTM paths (shared docs use `../regroup/...` shorthand): `regroup/docs/go-to-market/`, `homegroups/docs/go-to-market/`, `detox-recovery/docs/go-to-market/`. Shared docs live at `docs/go-to-market/_shared/` and `docs/go-to-market/ecosystem/`.

### A. CORRECT (factually wrong, broken, or stale-vs-code — must change)

1. **HG-ROAD-3** — `homegroups/docs/go-to-market/roadmap.md:42,74-80`
   - _Current:_ TC facility dashboard (HG-RM-3) `not_started`; "Without this dashboard the sales pitch is theoretical."
   - _Research found:_ **Refuted in-repo** — `homegroups/web/src/pages/FacilityDashboardPage.js` (299 lines), routed at `/facility-dashboard` (`web/src/App.js:45`), backed by `functions/src/callable/getFacilityEngagementMetrics.ts` (215 lines, exported `index.ts:124`). The doc is stale; the dashboard exists.
   - _Edit intent:_ Change HG-RM-3 status from `not_started` to `built` (or `built, unsold`); remove "(new)" label on `FacilityDashboardPage.js`; reframe the gap as **sales motion / BAA contracting / alumni density**, not a missing artifact.

2. **ECO-PROJ-1** — `docs/go-to-market/ecosystem/monetization.md:150-154` (+ ladder rows 156-160)
   - _Current:_ Combined 3-yr ARR Conservative ~$1.74M / Moderate ~$7.84M.
   - _Research found:_ **Broken.** Per-product ladders the doc itself lists sum to $995,400 / $4,384,800 — the headline overshoots by $221k / $1.40M attributed to _unbuilt_ marketplace/synergy. Aftercare folded in at 4.8×–19.7× its owning SSOT (detox `pricing.md` DX-PROJ-Y3 = $139,250). Externally refuted (Behave Health $902.2K ARR after ~9 yrs; only 13.4% of SaaS reach $1M in 3 yrs).
   - _Edit intent:_ Replace the headline with the _sum of the actual per-product ladders only_ (no synergy credit); remove the unbuilt-synergy uplift; reconcile the Aftercare line to its SSOT or mark it explicitly "unbuilt — excluded from base case." Add an external reality-check footnote.

3. **ECO-PROJ-2** — `docs/go-to-market/ecosystem/monetization.md:162-164`
   - _Current:_ $46M–$87M implied valuation at 8–15× moderate Y3 ARR.
   - _Research found:_ Weak. 8–15× is 2–3× above market (SaaS Capital 4.8× bootstrapped; Aventis 2026 ~3.4× with size discount; Nelson HealthTech 4–6×, AI-premium 6–8×). Chained to the broken ARR.
   - _Edit intent:_ Replace 8–15× with a defensible 3–5× band; recompute off the _conservative, corrected_ Y3 ARR (yields ~$5M, not $46M+); explicitly state the multiple does not apply to a solo bootstrapped pre-scale operator.

4. **DX-MKT-4** — `detox-recovery/docs/go-to-market/monetization.md:187-194`
   - _Current:_ "Medicaid peer support reimbursable in 43 states"; VA Community Care PSS pathway as a Y2+ revenue pillar.
   - _Research found:_ **Broken.** "43" matches no source (SAMHSA: 41 both / 48+DC either). Unlicensed solo peer cannot independently enroll/bill (CO HCPF, NY Medicaid, WA HCA). VA PSS = W-2 federal role, not a solo Community Care billing channel. Economics immaterial ($6–$36/15-min unit).
   - _Edit intent:_ Correct "43" to the sourced figure; remove the solo-billing premise; re-label the whole pathway as contingent on partnering with / being employed by a licensed agency or fiscal sponsor; move from "revenue pillar" to "mission/grant-adjacent, not a solo billing line."

5. **DX-PROJ-3** — `detox-recovery/docs/go-to-market/monetization.md:136-139`
   - _Current:_ "51% of Year-1 revenue from just 2 engagements (~$8,500 of ~$18,063)."
   - _Research found:_ 8,500/18,063 = **47.06%**, not 51% — and the figure is internally contradicted by the founder's own archived docs ($13,454 / 41% in `financial-model.md`; 18% in `financial-projections-2026-05-24.md`).
   - _Edit intent:_ Fix the arithmetic (47%); reconcile to ONE base-case SSOT and delete or clearly supersede the conflicting archived figures; keep the concentration _warning_ (direction is externally supported).

6. **ECO-MKT-1** — `docs/go-to-market/ecosystem/vision.md:135-138`
   - _Current:_ "$143.62B (2024) substance-abuse treatment market."
   - _Research found:_ That Grand View figure is **Mental Health AND Addiction Treatment Centers combined**, not SUD treatment. Narrow SUD = $2.3B–$41B. Residences ~17,900/275,000 are an upper-bound _model_; observed count ~10,400 (NSTARR); NARR-certified <3,000.
   - _Edit intent:_ Re-label the $143.62B as the combined behavioral-health category (or swap to a narrow SUD figure with its source); mark residence/served figures as modeled upper bounds vs. observed counts; add a SAM paragraph (low hundreds of millions of _software_ spend) distinct from the TAM.

7. **ECO-ROAD-2** — `docs/go-to-market/ecosystem/roadmap.md:50,72`
   - _Current:_ ECO-5 "Regroup-side cross-project caller not built."
   - _Research found:_ **Caller IS built** — `regroup/functions/src/callable/homegroups.ts` `getResidentMeetingAttendance` (registered, secret-wired, unit-tested). What's genuinely true is the cross-project round-trip is _unverified_ (default URL points at `recovery-connect-prod` not `recovery-connect-cad4b`; all tests mock fetch).
   - _Edit intent:_ Change "not built" → "built but unverified across the project boundary"; replace the build task with a _verification/deploy_ task (fix URL to cad4b, set matching `RATS_API_KEY` in both projects, one smoke curl).

8. **ECO-REG-3** — `docs/go-to-market/ecosystem/vision.md:93-96`
   - _Current:_ "CMS mandates FHIR R4 by mid-2026; ASAM CONTINUUM endorsed/required by 30+ states."
   - _Research found:_ Weak/high-confidence facts. FHIR R4 APIs (CMS-0057-F) are due **Jan 1 2027**, bind **payers** not the buyer. "30+ states require CONTINUUM software" conflates free ASAM _Criteria framework_ adoption with a paid-software mandate (only Arizona AHCCCS confirmed); figure traces to vendor copy.
   - _Edit intent:_ Correct the date (2027), clarify it binds payers; downgrade ASAM claim to "ASAM Criteria framework broadly adopted; CONTINUUM software mandated in AZ"; remove the vendor-sourced "30+ states require." Soften "now is the moment" timing language.

9. **ECO-MKT-2** — `docs/go-to-market/ecosystem/vision.md:66-67`
   - _Current:_ "85% first-year relapse; 80% of clinicians never measure post-discharge outcomes."
   - _Research found:_ Both real but precision-shopped: 85% is Sinha 2011 pooling alcohol/nicotine/weight (any-return); NIDA headline SUD = 40–60%. 80% is _inferred_ from Fortney 2017 (in-session MBC, wrong denominator), with a misattributed citation.
   - _Edit intent:_ Either qualify 85% ("pooled across behaviors; NIDA SUD-specific is 40–60%") or swap to the SUD-specific figure; reframe 80% as "the field largely does not measure post-discharge outcomes" without the false-precision denominator; fix the citation.

### B. SOFTEN (directionally true but overstated — temper the framing, keep the point)

10. **HG-ROAD-2** — `homegroups/docs/go-to-market/monetization.md:42-46`
    - _Current:_ "silent revenue-zero failure mode; every intergroup/TC checkout fails today."
    - _Research found:_ Mechanism real (Stripe default_price nullable). But "silent" is wrong (server logs + throws `HttpsError`), "every checkout fails today" is unverifiable live-Dashboard state, and "consumer-only transacts" is not a code guarantee (same resolver). Fix is a ~10-min Dashboard click.
    - _Edit intent:_ Replace "silent" with "hard-fails loudly server-side"; qualify "today" as "if the default prices are unset in the live Dashboard (verify)"; downgrade "TOP BLOCKER" to "cheap config gap"; drop the consumer-only-transacts implication.

11. **RG-ROAD-1** — `regroup/docs/go-to-market/roadmap.md:50`
    - _Current:_ RG-RM-7 "gates ALL regroup subscription revenue."
    - _Research found:_ Overstated. The true hard gate is RG-RM-8 (price IDs) + single-item flat-fee billing; `amountCents` is near-redundant (Stripe price ID is source of truth). Phase 1 is an afternoon of pure functions.
    - _Edit intent:_ Reword "gates ALL subscription revenue" → "gates the new six-tier flat-fee billing path"; pair it with RG-RM-8 as the co-gate; note `amountCents` is near-redundant.

12. **DX-PROJ-1** — `docs/go-to-market/_shared/pricing.md:66`
    - _Current:_ Detox Y1 P50 $18,063 stated as the headline.
    - _Research found:_ Weak — magnitude is modest/bracketed by external benchmarks, but the exact figure & 2-deal composition are internal-model only; honest EV for a no-network solo part-timer is closer to the $7,500 P10.
    - _Edit intent:_ Keep the P50 but foreground the P10 as the _planning_ number; add a caveat that the P50 depends on 1–2 B2B closes with no external comparable for a solo non-clinical operator.

13. **ECO-ROAD-1** — `docs/go-to-market/ecosystem/roadmap.md:51-52,99-101`
    - _Current:_ ECO-6 + ECO-7 not_started; framed as the two highest-ACV unlocks.
    - _Research found:_ Weak — build is capital-intensive ($50k–$500k+ comparable), market saturated by funded incumbents, omits 42 CFR Part 2 (enforcement began Feb 2026). Unreachable near-term for a solo part-timer.
    - _Edit intent:_ Keep the items but add 42 CFR Part 2 to the scope; add a "solo-infeasible near-term; deferred until revenue funds it" note; soften "highest-ACV unlock" (internal-only ranking) to "highest-_potential_-ACV, unvalidated."

14. **RG-REG-2** — `docs/go-to-market/_shared/decisions-log.md:37` + `regroup/docs/go-to-market/project-management.md:151-154`
    - _Current:_ D-12 HIPAA/BAA "launch-blocking; written legal opinion required."
    - _Research found:_ Weak — a non-clinical housing+peer-support SaaS is typically NOT a covered entity; GCP BAA is free self-serve; Stripe doesn't sign BAAs (and doesn't need to). Doc omits the actually-stricter 42 CFR Part 2.
    - _Edit intent:_ Downgrade "launch-blocking" to "monitor; cheap self-serve mitigations"; remove the impossible "sign BAA with Stripe" instruction; add the free GCP BAA + 42 CFR Part 2 note; reframe the written legal opinion as "prudent, not a launch gate" (flag upmarket trigger — see C).

15. **RG-REG-4** — `regroup/docs/go-to-market/project-management.md:48,131-136`
    - _Current:_ "3 leaked service-account keys; live breach vector."
    - _Research found:_ Weak — mechanism real (keys never expire) but the monorepo + public `regroup-go` scan clean; all other repos private; the 3 specific keys are unverifiable. Load-bearing action is _rotation_, which the git-log acceptance criterion doesn't verify.
    - _Edit intent:_ Soften "live breach vector" → "latent exposure (private repos; no key material found in scanned history)"; re-specify the acceptance criterion to verify GCP key _rotation_, not just git-history cleanliness; keep rotation as a worthwhile P1.

16. **DX-REG-3** — `detox-recovery/docs/go-to-market/monetization.md:190-194`
    - _Current:_ "VA PSS cert ~40–80 hrs + exam; Community Care provider status 3–6 mo" as a gate that _unlocks_ a solo VA per-session revenue stream.
    - _Research found:_ Weak/low — cert hours mildly understated (VA 72, IL/MO 100); the revenue mechanism is a _category error_ (VA PSS = salaried federal role; Community Care = credentialed clinical providers via HSRM). No solo per-session VA billing exists.
    - _Edit intent:_ Keep the cert-gate caution; remove the "unlocks a solo VA revenue stream" framing; align with the DX-MKT-4 correction (agency/grant path only).

17. **HG-REG-3** — `homegroups/docs/go-to-market/monetization.md:90-94`
    - _Current:_ "groups handle $200–2,000+/yr; pricing must not signal commercialization or the consumer flywheel stalls."
    - _Research found:_ Weak — normative core strong (Traditions 6/7/11; Meeting Guide app precedent) but the $ bracket is the founder's own number (active groups overshoot $2,000) and "flywheel stalls" is unfalsifiable (no paid per-group AA app exists as a stalled comparable). Operative constraint is Tradition 6 (affiliation), softened by the admin-pays-for-a-tool framing.
    - _Edit intent:_ Mark the $ bracket as an estimate (not cited); replace "flywheel stalls" with "may dampen word-of-mouth adoption"; clarify the constraint is Tradition 6 affiliation, mitigated because an admin's tool purchase is not a group "outside contribution."

18. **ECO-REG-2** — `docs/go-to-market/ecosystem/monetization.md:100-132` (+ `_shared/decisions-log.md` D-10)
    - _Current:_ O-3 "sidesteps per-referral legal landmines."
    - _Research found:_ Validated/medium — but "sidesteps" overstates (_US v. Schena_: fixed/% label not auto-safe; O-3 _reduces_ not _eliminates_ risk). Threat is currently hypothetical (relay disabled).
    - _Edit intent:_ Replace "sidesteps" with "reduces (does not eliminate) per-referral exposure"; note O-3 still requires the unbuilt dashboard to earn, so the clean-posture narrative is partly aspirational near-term.

19. **ECO-PROJ-3 (ledger; supports ECO-PROJ-1)** — `docs/go-to-market/ecosystem/monetization.md:156-160`
    - _Current:_ Per-product Y3 ladders including Aftercare $666k–$2,748k.
    - _Research found:_ The Aftercare line (unbuilt product) is 4.8×–19.7× its owning SSOT and inflates the ECO-PROJ-1 headline.
    - _Edit intent:_ Mark Aftercare as unbuilt and exclude from the base-case sum (carry as clearly-labeled upside only); reconcile to the detox SSOT.

20. **DX-PROJ-1 cross-doc (ledger context)** — archived `detox-recovery/docs/_archive/financial-model.md:76-83` & `financial-projections-2026-05-24.md:194`
    - _Current:_ Conflicting Y1 base cases ($13,454/41%; B2B 18%) coexist with the live $18,063/47%.
    - _Edit intent:_ Supersede or delete the archived conflicting figures so a reader cannot cite three different base cases; point all to one SSOT.

### C. FLAG WITH CAVEAT (keep as-is, but annotate — true and load-bearing)

21. **ECO-REG-1** — `docs/go-to-market/ecosystem/monetization.md:100-132`
    - _Validated/high._ Keep the gate; **strengthen** it: add a caveat that O-1/O-2 are likely unsalvageable and the review must be _specialized healthcare counsel_ covering EKRA + every applicable state patient-brokering statute, not generic legal review.

22. **RG-ROAD-2** — `regroup/docs/go-to-market/roadmap.md:51`
    - _Validated/high._ Keep RG-RM-8 as `blocked`. Caveat: it is necessary-but-not-sufficient (RG-RM-7 single-item billing also required for end-to-end tier billing); note it is _operator config_ (minutes), not engineering.

23. **DX-ROAD-2** — `detox-recovery/docs/go-to-market/roadmap.md:35,39-45`
    - _Validated/medium._ Keep the revenue-leak flag; **code-state caveat:** the 5 PDFs currently render _live dead-link buy buttons_ (not disabled "coming-soon"), because `availability:"coming-soon"` is never set in `lib/products-data.ts` — so the P0 "hide the links" action is more urgent than the doc implies. The IAP/MoR sub-point is a red herring (NextStep is a website).

24. **RG-REG-2 upmarket trigger** — `regroup/docs/go-to-market/project-management.md:151-154`
    - Caveat (paired with item 14): flag the _upmarket trigger_ — if any regroup house bills insurance, does MAT, employs clinical staff, or partners with a treatment-center referral target, that house may become a covered entity and pull regroup in as a directly-liable business associate. Monitor as the product moves upmarket.

### Section 3 action summary

- **CORRECT (9):** HG-ROAD-3, ECO-PROJ-1, ECO-PROJ-2, DX-MKT-4, DX-PROJ-3, ECO-MKT-1, ECO-ROAD-2, ECO-REG-3, ECO-MKT-2.
- **SOFTEN (11):** HG-ROAD-2, RG-ROAD-1, DX-PROJ-1, ECO-ROAD-1, RG-REG-2, RG-REG-4, DX-REG-3, HG-REG-3, ECO-REG-2, ECO-PROJ-3, DX-PROJ-1-cross-doc.
- **FLAG-WITH-CAVEAT (4):** ECO-REG-1, RG-ROAD-2, DX-ROAD-2, RG-REG-2-upmarket-trigger.
