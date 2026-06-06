> ⚠️ **Legacy document.** Carried over from the standalone `regroup-rn7` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `mobile` documentation.

# Recovery Ecosystem — Product & Market Intelligence Brief
> **Purpose:** Claude Code development context document. Synthesizes market research, competitive intelligence, product strategy, GTM findings, and feature requirements for a three-product recovery technology ecosystem. Use as persistent context during development sessions.

***
## 1. Overview: The Three-Product Ecosystem
This project comprises three interconnected applications targeting the addiction recovery continuum. Each app is independently viable but significantly more defensible and valuable as a combined platform.

| App | Core Purpose | Primary Customer | Current Status |
|---|---|---|---|
| **12-Step Community App** | Group management, meeting finder (100K+ pre-seeded meetings), service positions, treasury tools | AA/NA/12-step groups, intergroups, individual members in recovery | Built, MVP stage |
| **Sober Living App** | Resident management, phases, accountability, payment processing, directory (sober living homes), Oxford House model support | Sober living operators (traditional + Oxford House model) | Built, MVP stage, traditional homes showing interest |
| **Aftercare Management System** | Post-discharge outcome tracking, discharge planning, sober living referrals, alumni engagement — sold to treatment centers | Addiction treatment center clinical and administrative staff | To be built |
### The Ecosystem Logic
The three apps map directly to the **ASAM Continuum of Care** — the clinical standard for addiction treatment level-of-care transitions:[^1][^2]

```
Detox → Residential → PHP → IOP → Outpatient → [SOBER LIVING APP] → [12-STEP APP]
                                                        ↑
                                              [AFTERCARE SYSTEM bridges the gap]
```

**No competitor in the market connects these three phases digitally.** Current treatment center software (Kipu Health, Sunwave, LightningStep, Opus EHR) treats the patient journey as ending at discharge. Sober living software and 12-step apps are completely separate industries with no integration. This gap is the strategic opportunity.[^3][^4]

***
## 2. Market Context
### Size & Growth
- U.S. substance abuse treatment market: **$143.62B (2024)**, projected $408B by 2033 at 12.3% CAGR[^5]
- Behavioral health software overall: **$4.13B (2025)**, projected $20.79B by 2034 at 19.85% CAGR[^6]
- Behavioral health EHR segment: **$3.56B (2024)**, projected $14.22B by 2034 at 14.85% CAGR[^7]
- ~17,353 licensed SUD treatment facilities in the U.S.[^8]
- ~17,900+ recovery residences nationally serving ~275,000 people at any time[^9]
- ~4,324 Oxford Houses with 35,796 beds across 47 states[^10]
- SAMHSA: ~1.5 million treatment admissions annually (~86 per facility/year, ~7 discharges/month/facility)[^11][^12]
### Key Macro Tailwinds
- AI adoption in behavioral health: 17% (2024) → 27% (2025), 59% YoY increase[^13]
- 65% of clinicians using AI report more time for direct patient care[^13]
- CMS mandates FHIR R4 interoperability by mid-2026[^14]
- ASAM CONTINUUM software endorsed/required by 30+ states[^15]
- Relapse rates reach 85% in the first year post-discharge — 80% of clinicians never measure post-discharge outcomes[^16]
- Value-based care contracts increasingly require outcome documentation[^17]

***
## 3. Competitive Landscape: Treatment Center Software
### Market Leaders (Primary Competitors for Future Aftercare/Treatment Platform)
| Platform | Customers | Pricing Model | Key Strengths | Key Weaknesses |
|---|---|---|---|---|
| **Kipu Health** | 1,800+, 6,000+ locations[^18] | Custom enterprise | Market leader, HITRUST certified, AI ("Helix" OS), GRC via Hatch Compliance acquisition[^19] | Expensive, no post-discharge integration, no sober living/12-step connection |
| **Sunwave Health** | 400+ est. | From ~$30/user/mo[^20] | SunwaveAI charting, 90% satisfaction, alumni management module[^21][^22] | Limited post-discharge depth, no sober living integration |
| **LightningStep** | 200+ est. | $49+/user/mo, modular[^23] | AI saves 12.5 hrs/clinician/month[^24] | 36-month contracts, mixed UI reviews[^23][^25] |
| **Opus EHR** | 150+ est. | $79/user/mo + AI add-on $119[^26] | Good UX, Co-Pilot AI feature | Implementation delays, limited breadth |
| **CaredFor** (ContinuumCloud) | 75+ est.[^27] | Custom (est. $500-2K/facility/mo) | Purpose-built alumni engagement, white-label patient app[^28] | Communication-only; no real sober living/meeting data |
| **Team Recovery** | 110+ partner apps[^29] | Custom, white-label | Alumni consulting + app platform[^30] | No sober living or meeting integration |
### Critical Competitive Gap
Every incumbent treats the patient journey as ending at discharge (or at best, sending push notifications post-discharge). **None connect treatment centers to sober living homes or 12-step communities through operational software.** This is the structural blind spot this ecosystem exploits.
### Pricing Benchmarks
- Per-user SaaS: $25–$700/clinician/month[^31][^32]
- Per-facility: $1,000–$10,000/month[^32]
- Per-patient/month (aftercare/alumni): est. $3–$8[^33]
- Target pricing: $49–$149/user/month (undercut Kipu), $800–$3,000/facility/month

***
## 4. Competitive Landscape: Sober Living Software
### Market Leaders (Direct Competitors for Sober Living App)
| Platform | Founded | Rating | Pricing | Strengths | Weaknesses |
|---|---|---|---|---|---|
| **Sobriety Hub** | 2022 | 5.0[^34] | Listed pricing, AI search[^34] | Dead-simple UX, exceptional support, mobile-first | No Oxford model support, no treatment referral integration |
| **Behave Health** | 2015 | 4.9[^34] | Custom | Full-stack (EMR + SL), robust reporting | Complex for SL-only operators, expensive[^35] |
| **One Step Software** | 2017 | 4.6[^34] | Custom | Drug court functionality | Losing market share to Sobriety Hub; 3x more operators switching away[^34] |
| **OathTrack** | — | — | Free trial[^36] | Low cost entry | Limited features |

**Key finding**: No existing sober living software supports the Oxford House democratic governance model. This is an unserved market of 4,324 houses.[^10]

***
## 5. Oxford House: Strategic GTM Intelligence
### What Oxford Houses Are
- **NARR Level 1** peer-run recovery residences — self-governed, self-supported, no paid staff[^37][^38]
- **Three rules**: Sobriety, financial contribution, democratic self-governance[^39]
- **Service positions**: President, Secretary, Treasurer, Comptroller, Chore Coordinator — elected, 6-month terms[^40][^37]
- **Rent**: $110–$160/person/week covering all expenses[^41]
- **Chapter structure**: 3+ houses within 100 miles = chapter[^42][^43]
- **OHI**: 501(c)(3), ~$2.3M budget, 26 outreach workers nationwide, funded by state contracts ($120–200K/state)[^44][^45]
- **World Council Technology Committee** explicitly wants to bring digital tools to houses[^46]
- 76% of Oxford residents attend weekly AA/NA meetings[^47]
### Why Traditional Sober Living Software Fails for Oxford
Traditional software assumes an operator/owner making purchasing decisions. Oxford Houses have no such person — buying decisions require a majority house vote, budgets are razor-thin, and roles rotate every 6 months. Every existing competitor ignores this entirely.[^34]
### Oxford-Specific Pain Points (Treasury is the #1 Problem)
- Manual checkbook ledger maintenance[^48]
- Weekly Financial Status Report prepared by hand[^48]
- Monthly 3-person audits (President + Treasurer + Comptroller) with paper forms[^48]
- Bank reconciliation done manually[^48]
- Chapter Treasurer collects dues from each house — all via paper/email[^49]
- Financial mismanagement is a recurring documented problem[^50]
### GTM Strategy for Oxford
1. **Free core tier for individual houses** — treasury management, EES calculator, service position tracking, meeting minutes. Removes budget objection; rotation-driven virality.
2. **Premium at chapter level** — $200–$500/chapter/month for multi-house roll-ups, automated chapter reporting, vacancy management. Paid from chapter dues, not house budgets.
3. **OHI enterprise partnership** — pitch to Oxford House Inc. leadership directly. Value prop: standardized reporting, early financial distress detection, World Convention as GTM venue (annual, August/September).[^51]
4. **State association pilots** — target NC (320+ houses), VA, TX (tech-forward) first.[^41][^45]
### Oxford App Feature Requirements
- EES (Equal Expense Sharing) rent calculator — adjusts per-bed rate as vacancy changes
- Democratic voting tools (house decisions, motions, meeting minutes)
- Service position registry with rotation countdown alerts and handoff checklists
- Treasurer dashboard: digital rent collection, expense tracking, bank reconciliation, auto-generated weekly financial status report
- Comptroller dual-approval workflows
- Chapter-level financial roll-up and reporting
- Vacancy posting integrated with operator-facing directory

***
## 6. The Aftercare System: Business Case & Architecture
### The Problem It Solves
- 85% relapse rate in first year post-discharge[^16]
- 80% of clinicians never measure post-discharge outcomes[^16]
- No software bridges treatment discharge → sober living placement → community recovery
- CaredFor and Team Recovery offer communication tools, not operational integration with where patients actually live and what meetings they actually attend
### Why the Aftercare System Is the Distribution Engine
Every treatment center that adopts the aftercare system becomes a **pipeline for users of the other two apps**:

- A 40-bed facility discharges ~7 patients/month[^11][^12]
- ~30% referred to sober living → ~2 sober living app users/month/facility
- ~50% onboarded to 12-step app via discharge plan → ~3–4 12-step app users/month/facility
- At 50 facilities: **100 sober living users/month + 175 12-step users/month**, zero consumer marketing spend

This is a **B2B2C flywheel**: sell to treatment centers (B2B) → patients become users of other apps (B2C) → sober living homes want referral volume so they adopt your app → more homes in directory makes aftercare system more valuable → more treatment centers adopt → repeat.
### Core Aftercare System Features
- **Discharge planning workflow** with integrated sober living directory search (powered by sober living app data)
- **Meeting finder** within discharge plan builder (powered by 12-step app's 100K+ meeting database)
- **Referral portal** — clinician selects home, sends referral, patient onboarded to sober living app automatically
- **Outcome tracking dashboard** — real data from sober living app (phase completion, rent status) and 12-step app (meeting attendance) feeds back to treatment center
- **Relapse risk scoring** — drops in meeting attendance, housing instability, payment failures trigger clinical outreach
- **Alumni engagement** — automated check-ins, milestone celebrations, re-engagement campaigns
- **12-month post-discharge monitoring** window (industry standard gap filled by Discovery365 only for internal use)[^16]
- **Payer-ready outcome reports** — exportable longitudinal data for value-based care contracts and accreditation
### Aftercare System Pricing
- Flat facility fee: $800–$3,000/facility/month (based on facility size/census)
- Per-patient add-on: $3–$8/active alumni patient/month
- Implementation/setup: $2,000–$5,000 one-time
- Outcomes reporting add-on (for payers, research): premium tier

***
## 7. Revenue Projections (3-Year)
All figures are annual recurring revenue (ARR). Conservative assumes slow organic adoption; Moderate assumes solid GTM execution without external funding.
### Individual Apps
| Product | Scenario | Year 1 ARR | Year 2 ARR | Year 3 ARR |
|---|---|---|---|---|
| 12-Step App | Conservative | $9,600 | $47,400 | $141,600 |
| 12-Step App | Moderate | $52,800 | $294,000 | $960,000 |
| Sober Living App | Conservative | $21,600 | $75,600 | $187,800 |
| Sober Living App | Moderate | $57,600 | $245,280 | $676,800 |
| Aftercare System | Conservative | $69,600 | $246,000 | $666,000 |
| Aftercare System | Moderate | $180,000 | $892,800 | $2,748,000 |
### Combined Ecosystem (with marketplace + data + cross-sell synergy)
| Scenario | Year 1 ARR | Year 2 ARR | Year 3 ARR | 3-Year Total |
|---|---|---|---|---|
| Conservative | $105,840 | $417,900 | $1,216,020 | ~$1.74M |
| Moderate | $325,380 | $1,731,888 | $5,781,000 | ~$7.84M |

Ecosystem adds 15–32% revenue premium over sum of individual apps by Year 3, through referral marketplace fees, anonymized outcomes data licensing, and cross-sell uplift.

At moderate Year 3 ARR of $5.78M and vertical health-tech SaaS multiples of 8–15x, implied valuation: **$46M–$87M**.

***
## 8. Technical Architecture Requirements
### Compliance (Non-Negotiable)
- **HIPAA Security Rule**: AES-256 encryption at rest, TLS 1.3 in transit, RBAC, MFA[^52]
- **42 CFR Part 2**: Special segmentation rules for substance abuse treatment records — more restrictive than standard HIPAA. Requires explicit patient consent for each disclosure; cannot be overridden by general treatment authorization.[^52]
- **BAA** required with all infrastructure providers (GCP, Stripe, Twilio, etc.)[^53]
- **FHIR R4 APIs**: CMS-mandated interoperability standard. Required for treatment center integrations with existing EHRs.[^14]
- **SOC 2 Type II**: Target within 6–12 months of launch. Required for enterprise treatment center sales.
- **HITRUST**: Longer-term target (1–2 years). Kipu Health has this — useful differentiator.[^19]
### Recommended Stack
Given existing TypeScript/React/Node.js/GCP expertise:

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React + Next.js | Known stack, fast iteration with Claude Code |
| Backend | Node.js / TypeScript | FHIR-compliant REST API layer |
| Database | PostgreSQL (Neon) | HIPAA-friendly, existing familiarity |
| Cache | Redis | Session management, rate limiting |
| Infrastructure | GCP (Cloud Run + Cloud SQL) | Existing expertise, HIPAA BAA available |
| Encryption | GCP KMS | Key management for PHI |
| Auth | SMART on FHIR + OAuth 2.0 | Standard for health app interoperability |
| Payments | Stripe Connect | HIPAA BAA available; supports marketplace payouts |
| Telehealth (future) | Daily.co or Twilio Video | Both offer HIPAA BAA |
| AI/Agents | Claude API (Anthropic) | Clinical documentation, discharge planning agent, relapse risk scoring |
| SMS/Alerts | Twilio | HIPAA BAA available |
### Data Architecture: Shared Identity Across Apps
The three apps share a unified patient/resident/member identity layer:

```
[Person]
  ├── Treatment Patient (Aftercare System)
  │     └── discharge_plan → sober_living_referral, meeting_assignments
  ├── Sober Living Resident (Sober Living App)
  │     └── phase, rent_status, chore_compliance, house_id
  └── Recovery Community Member (12-Step App)
        └── meeting_attendance, service_positions, group_memberships
```

Event-driven architecture: discharge event triggers sober living referral; meeting attendance updates flow back to aftercare dashboard; housing instability flags trigger clinical alert.
### Key Integration Points
- **EHR integrations** (Kipu, Sunwave, etc.): FHIR R4 API connectors — do not require rip-and-replace, overlay on existing systems
- **ASAM CONTINUUM**: Licensed clinical decision support tool endorsed by 30+ states — integration builds credibility with clinical staff[^15]
- **oxfordvacancies.com**: Oxford House's existing vacancy listing site — integrate/replace for referral routing
- **Stripe Connect**: Powers payment marketplace (treatment center → sober living rent, inter-app fee routing)

***
## 9. Sober Living App: Essential Features by Build Sprint
### Sprint 1 — Table Stakes (Weeks 1–4)
Features operators will pay for on day one. Without these, no adoption.[^54][^55]

- **Resident intake & profiles**: Digital application, screening workflow, waitlist, emergency contacts, legal info, insurance, referring center
- **Billing & rent collection**: Recurring invoices, prorated calculations, ACH/card/cash, family payment portal, installment plans, automated SMS/email reminders, auto-generated receipts
- **Outstanding balance dashboard**: Per-resident and house-wide view
- **Drug testing module**: Random test scheduling (weighted algorithm), resident notification, result logging with timestamp + observer, positive result escalation workflow
- **Mobile-responsive UI**: Full feature parity on mobile for house managers
- **Resident mobile portal**: Pay rent, view balance, submit maintenance requests, view announcements
### Sprint 2 — Competitive Parity (Weeks 5–8)
Matches Sobriety Hub and One Step. Required to win against incumbents.[^34]

- **Phase/program tracking**: Configurable phases, advancement criteria (meetings, drug tests, employment, time), auto-advancement with manager approval, resident-facing progress dashboard
- **Chore management**: Assignments, rotation scheduling, completion verification, photo evidence
- **Accountability scoring**: Composite of chore completion + meeting attendance + curfew + drug tests + rent
- **Automated consequence workflows**: Warning → probation → discharge, configurable triggers
- **Incident reporting**: Timestamped, escalation routing, audit-ready export
- **Basic compliance reports**: NARR standard tracking, state requirement checklists
- **Multi-house dashboard**: Cross-portfolio occupancy, revenue, compliance
### Sprint 3 — Differentiation & Moat (Weeks 9–12)
No competitor has these. Creates switching costs and ecosystem lock-in.

- **Oxford House mode** (see Section 5 for full feature list): EES calculator, democratic voting, service position registry with rotation alerts, treasurer dashboard, comptroller approval workflows, chapter roll-ups
- **Directory & public listing**: SEO-optimized home profiles, searchable by geography/program/availability, application-to-admission pipeline
- **Treatment center referral portal**: Inbound referrals from aftercare system, referral source tracking, bi-directional progress sharing (consent-controlled)
- **12-Step meeting integration**: Meeting search from 12-step app database, meeting attendance logging within resident profile, aftercare plan compliance tracking
- **Outcomes analytics dashboard**: Occupancy trends, average LOS, collection rate, phase completion rates, employment status at discharge — exportable for grants/NARR/marketing

***
## 10. 12-Step App: Strategic Role & Monetization
### Strategic Role in Ecosystem
The 12-step app's primary value is not standalone revenue — it is:
1. **Data asset**: 100K+ pre-seeded meetings + groups creates a directory moat no competitor can quickly replicate
2. **Aftercare distribution**: Treatment centers embed meeting assignments into discharge plans, driving app installs without consumer marketing
3. **Engagement layer**: Meeting attendance data feeds relapse risk scoring in aftercare system
### Revenue Streams
- **Premium user subscriptions**: $5–$8/month — sobriety tracking, advanced features (conversion target: 3–5% of user base)[^56]
- **Group/organization subscriptions**: $20–$30/month — treasury management, service position tracking for intergroups and area service committees
- **Treatment center API access**: Meeting finder embedded in aftercare system's discharge planning workflow
- **Data/directory licensing** (long-term): Meeting data licensed to payers, researchers, other platforms
### Key Features
- Meeting search with filters (fellowship, type, day/time, format, accessibility, language)
- Meeting attendance check-in and logging
- Sobriety counter and milestone tracking
- Service position management (Chairperson, GSR, Treasurer, etc.) with term reminders
- Group treasury: Contributions, expenses, 7th Tradition tracking, rent/utilities, prudent reserve
- Group calendar, announcements, and meeting format management
- Group member roster (anonymized as appropriate per tradition)
- Intergroup/district roll-up reporting
- Step work tracking and journaling (premium)

***
## 11. GTM Sequencing
### Phase 1: Now → Month 3
- Continue onboarding traditional sober living homes (paying customers, existing demand)
- Build and launch Sprint 1 features; convert interested homes to paying subscribers
- Build 12-step app user base organically (community-driven, zero-cost)
### Phase 2: Months 3–6
- Ship Sprint 2 + Sprint 3 sober living features including Oxford mode
- Launch Oxford House free tier — pilot in one state (target: Texas or North Carolina)
- Begin aftercare system development (highest-revenue standalone product)
### Phase 3: Months 6–12
- Launch aftercare system with founding treatment center customers (5–15 facilities)
- Aftercare system begins piping patients into sober living app and 12-step app
- Flywheel begins: treatment center adoption → patient users → sober living homes see referral volume → more homes adopt → better directory → more treatment centers adopt
### Phase 4: Year 2
- Attend Oxford House World Convention (annual, Aug/Sept)[^51]
- Pitch OHI enterprise partnership and state association pilots
- Launch referral marketplace (treatment centers pay for priority directory placement)
- Begin outcomes data reporting product for payers and accreditation bodies

***
## 12. Competitive Positioning Summary
### What Makes This Defensible
1. **Data moat**: 100K+ meetings + growing sober living directory cannot be quickly replicated
2. **Network effects**: Treatment centers need home volume → homes need referral volume → patients need meeting data. Each user type makes the platform more valuable for the others.
3. **Oxford model exclusivity**: First and only software built for peer-run democratic governance. 4,324 houses, zero real competitors.[^10][^34]
4. **Longitudinal outcomes data**: Only platform tracking patients from treatment admission through sober living through community recovery. This data is uniquely valuable for payers, researchers, and accreditation bodies — and impossible for any single-segment competitor to replicate.
5. **42 CFR Part 2 + FHIR architecture**: Building compliance in from day one creates moat for treatment center sales that new entrants cannot easily match.
### The One-Line Pitch
**"The only platform that follows patients through the full recovery journey — from treatment discharge to sober living to community — with real operational data, not just check-ins."**

***
## 13. Key Risks & Mitigations
| Risk | Severity | Mitigation |
|---|---|---|
| HIPAA/42 CFR Part 2 complexity | High | Build compliant architecture from day one; budget $15–30K for compliance audit; use GCP HIPAA-eligible services with BAA[^53] |
| Treatment center sales cycle (6–12 months) | High | Lead with smaller facilities (<50 beds) first; use aftercare system as wedge product that doesn't require full EHR replacement |
| EHR switching costs/lock-in | Medium | Don't require rip-and-replace; FHIR overlay model works alongside Kipu/Sunwave[^57] |
| Oxford adoption pace | Medium | Free tier removes budget friction; OHI partnership creates top-down endorsement path[^46] |
| Solo founder bandwidth | Medium | Claude Code compresses dev timelines; prioritize revenue-generating features first; consider clinical/sales co-founder for treatment center vertical |
| 12-step cultural resistance to monetization | Medium | Core app and group tools free; premium = personal productivity features only, never community access |

***

*Document compiled from research conducted February 26, 2026. Sources include SAMHSA TEDS data, market research from Precedence Research / Toward Healthcare / Grand View Research, competitive intelligence from G2 / Capterra / Slashdot, Oxford House organizational documents, and operator community discussions. All revenue projections are estimates based on stated market pricing benchmarks and comparable SaaS growth trajectories.*

---

## References

1. [Continuum of Addiction Care - Next Step Recovery](https://nextsteprecovery.com/continuum-of-addiction-care/) - The ASAM Continuum of Care is an addiction treatment roadmap. It is designed as a gapless system of ...

2. [About the ASAM Criteria](https://www.asam.org/asam-criteria/about-the-asam-criteria) - The ASAM Criteria provide a framework for organizing the addiction treatment system. Implementation ...

3. [Continuum of Care in Addiction Recovery](https://www.therecoveryvillage.com/treatment-program/why-continuum-of-care-is-important-in-recovery/) - A solid continuum of care is especially crucial for individuals receiving drug and alcohol rehab. Wi...

4. [Why a Full Continuum of Care Works Best for Addiction Recovery](https://recoverycentersofamerica.com/blogs/full-continuum-of-care-for-addiction-recovery/) - Medical detoxification · Residential rehab · Partial hospitalization programs · Intensive outpatient...

5. [US Mental Health and Addiction Treatment Centers Market Size ...](https://www.researchandmarkets.com/reports/5846785/u-s-mental-health-addiction-treatment-centers) - The U.S. Mental Health and Addiction Treatment Centers Market, valued at USD 143.62B in 2024, is pro...

6. [Behavioral Health Software Market to Rise at 19.85% CAGR till 2034](https://www.towardshealthcare.com/insights/behavioral-health-software-market-sizing) - The behavioral health software market size is predicted to grow from USD 4.13 billion in 2025 to USD...

7. [Behavioral Health EHR Software Companies and Market Forecast](https://www.towardshealthcare.com/companies/behavioral-health-ehr-software-companies) - The global behavioral health EHR software market size marked US$ 3.56 billion in 2024 and is forecas...

8. [U.S. Mental Health And Addiction Treatment Centers Market Report ...](https://www.grandviewresearch.com/industry-analysis/us-mental-health-addiction-treatment-centers-market-report) - The U.S. mental health and addiction treatment centers market was estimated at USD 143.62 billion in...

9. [Recovery housing for substance use disorder: a systematic review](https://pmc.ncbi.nlm.nih.gov/articles/PMC11922849/) - Recovery housing, an abstinence-based living environment, is the most widely available form of subst...

10. [Oxford House currently has 4,324 houses and 35,796 Beds!!!](https://www.facebook.com/groups/oxfordhouseworldcouncil/posts/4280299038906474/) - Oxford House currently has 4324 houses and 35796 Beds!!! Oxford House has grown to 4324 houses and 3...

11. [[PDF] 2022 Substance Use Treatment Services State Profile ... - SAMHSA](https://www.samhsa.gov/data/sites/default/files/quick_statistics/state_profiles/NSUMHSS-US22.pdf) - Utilization rate3. 82 4. 151 9. Average number of designated beds per facility. 30. 58. 1Excludes fa...

12. [New Treatment Report Shows Most Admissions in US for Alcohol ...](https://www.addictionpolicy.org/post/new-treatment-report-shows-most-admissions-in-us-for-alcohol-followed-by-heroin-and-meth) - Age: Admissions and discharges were highest among individuals aged 21-34 years (37.1% and 37.7%) and...

13. [AI Becomes a Clinical and Workforce Imperative in Behavioral Health](https://finance.yahoo.com/news/kipu-health-survey-ai-becomes-153800299.html) - (PRNewsfoto/Kipu Health) ... Adoption has climbed from 17 percent in 2024 to 27 percent in 2025, wit...

14. [Interoperability Framework - CMS](https://www.cms.gov/health-technology-ecosystem/interoperability-framework) - The CMS Interoperability Framework is a call to action for health data networks that want to move fa...

15. [ASAM CONTINUUM™ and CO-Triage - FEI Systems](https://feisystems.com/ancillaryservices/continuum/) - With them, data, reports and level of care recommendations from ASAM are seamlessly integrated with ...

16. [Discovery Behavioral Health Launches First-of-its-kind AI Platform ...](https://www.prnewswire.com/news-releases/discovery-behavioral-health-launches-first-of-its-kind-ai-platform-with-videra-health-and-leading-research-hospital-to-address-the-one-year-recovery-gap-301941216.html) - The platform tracks patient progress for 12 months after discharge from a behavioral treatment progr...

17. [Does it PAY to Reimburse Providers Based on Patient Outcomes?](https://www.recoveryanswers.org/research-post/does-it-pay-to-reimburse-providers-based-on-patient-outcomes/) - This policy analysis of a pay-for-performance (P4P) pilot program showed that paying treatment progr...

18. [/C O R R E C T I O N -- Kipu Health/ - Yahoo Finance](https://finance.yahoo.com/news/c-o-r-r-e-190500619.html) - Kipu now supports more than 1,800 behavioral healthcare customers across 6,000 locations nationwide,...

19. [Kipu Health Acquires Hatch Compliance to Strengthen Behavioral ...](https://www.kipuhealth.com/news/kipu-acquires-hatch-compliance/) - New acquisition enhances Kipu's comprehensive platform with advanced compliance management solutions...

20. [Sunwave EMR: Reviews, Pricing & Free Demo - 2025](https://softwarefinder.com/emr-software/sunwave) - Starting Price: The basic pricing plan starts at $30 per month. Customization: Pricing can vary grea...

21. [Sunwave EMR: Is This the Best Behavioral Health EHR for ...](https://yung-sidekick.com/blog/sunwave-emr-is-this-the-best-behavioral-health-ehr-for-2025) - This piece helps you decide if Sunwave EMR fits your behavioral health practice's needs in 2025. You...

22. [Behavioral Health Alumni Management](https://www.sunwavehealth.com/modules/alumni-management/) - A strong alumni program isn't just a follow-up—it's a lifeline. Sunwave connects every step of the p...

23. [Lightning Step Technologies EHR Review (2026) - EHR Source](https://www.ehrsource.com/vendors/lightning-step/) - The most critical pricing consideration is the reported 36-month contract requirement. Three-year co...

24. [Addiction Treatment EMR: Compare Features, Pricing, & Fit](https://www.lightningstep.com/blog/addiction-treatment-emr-compare-features-pricing-fit) - LightningStep stands out with its unified platform that combines CRM, EMR, and RCM capabilities, whi...

25. [Lightning Step Reviews, Pros and Cons - 2026 Software Advice](https://www.softwareadvice.com/medical/lightning-step-profile/reviews/) - There is very little to recommend LightningStep. The user interface is clunky, the server is slow, t...

26. [Opus EHR: Pricing, Free Demo & Features (2026) | Software Finder](https://softwarefinder.com/emr-software/opus) - OPUS is a leading behavioral EHR software providing a suite of integrated services for behavioral he...

27. [CaredFor Helps Treatment and Recovery Centers Stay Engaged ...](https://www.biospace.com/caredfor-helps-treatment-and-recovery-centers-stay-engaged-with-clients-and-alumni) - CaredFor, a mobile app that helps treatment centers build long-lasting relationships with clients an...

28. [Patient Engagement Platform & Software for Behavioral Health ...](https://continuumcloud.com/behavioral-health-software/caredfor/) - The CaredFor platform allows for a diverse set of micro-interactions that continually engage and sup...

29. [Team Recovery: Alumni Consulting & Apps for Behavioral Health](https://www.teamrecovery.io) - Improve behavioral health alumni management with software built for treatment centers. Learn how to ...

30. [The Complete Guide to Addiction Alumni Program Software](https://www.teamrecovery.io/post/the-complete-guide-to-addiction-alumni-program-software) - Addiction alumni program software is a specialized platform designed to help treatment centers stay ...

31. [What to Know About Mental Health Billing Software Pricing - Benji](https://benji.health/blog/mental-health-billing-software-pricing/) - Learn how much mental health billing and EMR software costs for small practices, including pricing m...

32. [EHR Software Pricing Guide: Models, Costs, And Hidden Fees](https://softwarefinder.com/resources/ehr-pricing) - Industry estimates of the cost of per-user pricing are approximately $1,200/user ... Per-location or...

33. [How Much Does Software for Remote Patient Monitoring (RPM) Cost?](https://www.thoroughcare.net/blog/remote-patient-monitoring-software-cost) - Care coordination software options can start as low as $0.99 per month or run as high as $8 per mana...

34. [Buyer's Guide: Best Sober Living Software for Recovery Homes in ...](https://www.sobrietyhub.com/our-blog/2026-buyers-guide-the-big-3-of-sober-living-software) - This guide compares the top sober living and recovery house management software in 2026: Sobriety Hu...

35. [Kipu Versus Behave Health: Which EMR is Best for Addiction ...](https://behavehealth.com/blog/2023/3/16/kipu-versus-behave-health-which-emr-is-best-for-behavioral-health) - Explore a side-by-side comparison of two behavioral health EHR choices; Kipu vs. Behave Health. Comp...

36. [Best Sober Living Software | Try Oathtrack for Free!](https://www.oathtrack.com) - Oathtrack is the best all-in-one software for managing sober living homes. Automate billing, tasks, ...

37. [House Traditions](https://www.oxfordhouse.org/house-traditions) - By running Oxford House on a democratic basis, members of Oxford House become able to accept the aut...

38. [What is NARR? - Sobriety Hub](https://www.sobrietyhub.com/our-blog/narr) - The Four Levels of NARR Certification · Level 1: Peer-Run Residences · Level 2: Monitored Residences...

39. [What Is an Oxford House?](https://blueviewrecovery.com/what-is-an-oxford-house/) - Oxford Houses are self-run, meaning decisions are made collectively during house meetings. This stru...

40. [[PDF] Oxford House Manual ©](https://oxfordhousekansas.org/wp-content/uploads/2024/07/Manual-House.pdf) - The election of a treasurer and a Comptroller emphasizes the importance each Oxford House places on ...

41. [Oxford Houses of North Carolina](https://oxfordhousenc.com) - As of February 2025, there are 320 houses in North Carolina, with homes statewide. With an average o...

42. [Insights: Oxford House on the Sober House Directory](https://soberhousedirectory.com/insights/oxford-house-on-the-sober-house-directory/) - Local Chapters: When three or more Oxford Houses exist within a 100-mile radius, they form a Chapter...

43. [[PDF] Chapter Manual](https://oxfordhousenc.com/wp-content/uploads/2020/03/chapter-manual.pdf) - Oxford Houses are a network of self-run, self-supported recovery houses for recovering alcoholics an...

44. [[PDF] Oxford House Inc.](https://arkleg.state.ar.us/Home/FTPDocument?path=%2FAssembly%2FMeeting+Attachments%2F830%2FI7876%2FOxford+House+Stats.pdf) - The national nonprofit, tax-exempt Oxford House umbrella organization — ... provides trained outreac...

45. [[PDF] oxford house world services](https://dbhds.virginia.gov/library/substance%20abuse%20services/osas-directoryoxfordhouse.pdf) - Today, Virginia has a contract with OHI of approximately $120,000 that permits the utilization of tw...

46. [[PDF] Oxford House™ World Council Manual©](https://appwarmer.com/pdf/oxford-house-world-council-manual.pdf) - The Oxford House World Council Technology Committee will work with chapters, associations, and regio...

47. [Oxford House Recovery Homes - American Addiction Centers](https://americanaddictioncenters.org/sober-living/oxford-house) - An Oxford House is a self-sustaining, democratically run home that's free from drugs and alcohol. 1 ...

48. [[PDF] TREASURER - Oxford Houses of Virginia](https://www.vaoxfordhouse.org/wp-content/uploads/Treasurer-Training-Packet-2020.pdf) - The Treasurer will have the overall responsibility for assuring the sound financial management of th...

49. [Oxford House Treasurer Report March 2010 | PDF - Scribd](https://www.scribd.com/doc/54924370/OHVA-Chapter-Treasurer-Report) - This document is a treasurer's report for the Oxford Houses of Virginia chapter. It summarizes the c...

50. [[PDF] Protect Bank Account-Correcting Difficulties](https://www.vaoxfordhouse.org/wp-content/uploads/Protect-Bank-Account-Correcting-Difficulties.pdf) - Make sure your checks require two signatures that are on file at the bank. Keep card updated as offi...

51. [Oxford House World Convention](https://www.oxfordhouse.org/convention) - Oxford House World Convention. August 28-31st, 2025. National Harbor, Maryland. The Oxford House Mod...

52. [Mental Health Software Requirements Checklist: Features, Security ...](https://www.accountablehq.com/post/mental-health-software-requirements-checklist-features-security-and-hipaa-compliance) - Assess PHI safeguards, HIPAA controls, encryption, access, logging, consent, and DR with our mental ...

53. [HIPAA Compliance for SaaS - The HIPAA Journal](https://www.hipaajournal.com/hipaa-compliance-for-saas/) - HIPAA compliance for SaaS consists of ensuring the software product or service complies with all app...

54. [Sober Living Management Software Guide (2026)](https://soberlivingapp.com/blog/sober-living-management-software-complete-guide-2024) - Essential features include resident management with intake workflows, automated billing and rent col...

55. [Is Your Recovery Residence Software Holding You Back? | Growth ...](https://behavehealth.com/blog/software-holding-back-recovery-residence-growth) - Recovery residence operators need tools built for their real-world challenges. Why Good Intentions f...

56. [How to Build Addiction Recovery App Making $50K/Month](https://ideas.maxincubator.com/addiction-recovery-app-50k-month/) - Learn how QUITTR generates $50K monthly with 50000+ users. Complete blueprint for building your own ...

57. [Why is EHR software so bad? : r/medicine - Reddit](https://www.reddit.com/r/medicine/comments/1d229xl/why_is_ehr_software_so_bad/) - In infrastructure studies, this is called "path dependence." Replacing IT infrastructure can cost mi...


---
*Last reviewed: 2026-05-24 | Audience: operator | Type: concept*
