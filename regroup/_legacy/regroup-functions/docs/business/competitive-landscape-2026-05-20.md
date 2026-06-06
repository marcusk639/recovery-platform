> ⚠️ **Legacy document.** Carried over from the standalone `regroup-functions` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `regroup` documentation.

# Regroup / RATS — Competitive Landscape Analysis

**Date:** May 2026 | **Stage:** Pre-launch / MVP | **Geography:** United States

---

## Section 1: Executive Summary

The US recovery housing software market has two meaningful software incumbents (Sobriety Hub and One Step), one enterprise player (Behave Health) that doesn't compete for small operators, and a long tail of general-purpose tools. The dominant "competitor" is inertia — 75–80% of sober living homes use spreadsheets or paper.

Sobriety Hub is the primary competitive threat: growing fast, 5-star reviews, and now shipping a resident-facing directory (March 2026). The window to establish differentiation via a true two-sided marketplace — with an application workflow Sobriety Hub's directory lacks — is narrowing.

**Key conclusion:** Regroup can win by occupying the unclaimed quadrant of _SMB-simple + genuine two-sided marketplace_, pricing predictably per-house, and building the resident application workflow before Sobriety Hub does.

---

## Section 2: Porter's Five Forces

### Force 1: Threat of New Entrants — LOW/MODERATE (2/5)

| Factor           | Assessment                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------- |
| Capital required | Low — Firebase + React Native is a lean stack                                                |
| Network effects  | Moderate — resident directory creates switching costs once populated                         |
| Domain knowledge | High barrier — recovery housing compliance, Oxford House democratic model, DOC/BOP reporting |
| Regulatory       | Minimal — no SaaS-specific licensing, but HIPAA awareness needed for clinical data           |

**Verdict:** Easy to build a basic tool; hard to build the network and domain depth. New entrants are unlikely to hit critical mass without deep community relationships.

### Force 2: Bargaining Power of Suppliers — VERY LOW (1/5)

- Firebase / Google Cloud: commodity, many alternatives
- Stripe: standard payment processor, switchable
- Push notification providers: commoditized

**Verdict:** No supplier has meaningful leverage.

### Force 3: Bargaining Power of Buyers — HIGH (4/5)

| Factor            | Assessment                                                               |
| ----------------- | ------------------------------------------------------------------------ |
| Customer size     | Small operators (1–5 houses) have no switching cost and no budget        |
| Price sensitivity | Operators run on thin margins; price is a frequent objection             |
| Substitutes       | Spreadsheets are free and always available                               |
| Lock-in           | Low at launch; grows with resident directory data and historical records |

**Verdict:** Buyers have high power. Mitigation: resident application data and historical records create lock-in over time.

### Force 4: Threat of Substitutes — HIGH (4/5)

| Substitute                          | Threat Level | Notes                                                         |
| ----------------------------------- | ------------ | ------------------------------------------------------------- |
| Spreadsheets + Google Forms         | Very high    | Free; already in use by ~80% of market                        |
| Generic PM tools (Notion, Airtable) | Moderate     | Flexible but require setup; no recovery-specific features     |
| Buildium / AppFolio                 | Low          | Property management, no recovery features, per-unit pricing   |
| Yardi / MRI                         | Very low     | Enterprise property management; too expensive for sober homes |

**Verdict:** The biggest competition is inertia. Software adoption requires demonstrating ROI clearly.

### Force 5: Competitive Rivalry — MODERATE (3/5)

| Factor                | Assessment                                                   |
| --------------------- | ------------------------------------------------------------ |
| Number of competitors | 2–3 real competitors; market is not crowded                  |
| Market growth         | 5–10% CAGR; growing pie reduces zero-sum pressure            |
| Differentiation       | Per-house vs. per-user is a meaningful structural difference |
| Rivalry intensity     | Sobriety Hub is actively marketing; One Step is declining    |

**Verdict:** Moderate rivalry. Sobriety Hub is the only aggressive competitor; One Step is losing share.

### Forces Summary

| Force          | Score (1–5) | Impact                                 |
| -------------- | ----------- | -------------------------------------- |
| New Entrants   | 2           | Low threat; domain knowledge is a moat |
| Supplier Power | 1           | Negligible                             |
| Buyer Power    | 4           | High; price sensitivity is real        |
| Substitutes    | 4           | High; spreadsheets dominate            |
| Rivalry        | 3           | Moderate; 1 aggressive competitor      |

**Overall:** Moderate-attractiveness market. The beachhead TAM ($20–25M) is small but near-monopoly potential exists in a fragmented space with one aggressive competitor.

---

## Section 3: Competitor Profiles

### 3a. Sobriety Hub — Primary Threat

**Overview:** Founded ~2018; San Diego-based; growing fast. The current market leader by review velocity.

| Attribute           | Detail                                                                    |
| ------------------- | ------------------------------------------------------------------------- |
| **Pricing**         | $75/user/month (full platform) + $250 onboarding fee; discounts available |
| **Reviews**         | 5.0★ on Capterra (47 reviews as of May 2026)                              |
| **Market position** | Operators switching from One Step to Sobriety Hub at 3:1 ratio            |
| **Target**          | Traditional operator-owned sober living homes, 5–50 beds                  |

**Core Features:**

- Resident management (applications, intake, residency)
- Rent and fee collection (ACH + credit card via Stripe)
- Meeting attendance and accountability
- Drug testing tracking
- House rules and agreements
- Staff communication tools
- Chore and task management

**Recent moves (March 2026):**

- Launched "Sober Living Directory" — a searchable listing of homes using Sobriety Hub
- Resident-facing app for viewing home listings
- _However:_ Directory is read-only listings only. No application workflow. Residents cannot apply through the app.

**Strengths:**

- Highest review scores in the market
- Active product development (shipping features frequently)
- Strong community presence at NARR conferences
- Modern mobile-friendly UI

**Weaknesses:**

- Per-user pricing is unpredictable for operators who add staff
- No Oxford House support (democratic model incompatible with staff-user pricing)
- No DOC/BOP reporting for operators working with correctional populations
- Directory is bolted on — not architecturally two-sided
- No resident application workflow
- $250 onboarding fee creates friction for small operators

**Pricing comparison (operator with 2 staff, 10 beds):**

- Sobriety Hub: $75 × 2 = $150/month = $1,800/year
- Regroup: $89/month = $1,068/year → **41% cheaper**

---

### 3b. One Step Software — Declining Incumbent

**Overview:** Established player, ~2,000+ organizations. Losing market share to Sobriety Hub. Enterprise-leaning pricing and slower product iteration.

| Attribute           | Detail                                                                   |
| ------------------- | ------------------------------------------------------------------------ |
| **Pricing**         | Custom/enterprise; opaque; estimated $100–200+/month for small operators |
| **Reviews**         | 4.6★ on Capterra; fewer recent reviews                                   |
| **Market position** | Losing to Sobriety Hub; operators switching away                         |
| **Target**          | Mid-to-large recovery organizations, treatment centers                   |

**Strengths:**

- Large existing customer base (switching costs keep them)
- Established brand in recovery housing conferences
- More clinical/treatment center features

**Weaknesses:**

- Custom pricing creates anxiety for small operators
- Slower shipping cadence; UI feels dated
- No resident-facing directory or application features
- Losing operators to Sobriety Hub at 3:1 ratio in online reviews

**GTM implication:** Operators looking to leave One Step are an active TAM. A "free migration from One Step" offer with a direct comparison page could accelerate acquisition.

---

### 3c. Behave Health — Enterprise / Non-Competing

**Overview:** Clinical behavioral health software, focused on residential treatment centers (RTCs) and PHP/IOP programs.

| Attribute   | Detail                                                      |
| ----------- | ----------------------------------------------------------- |
| **Pricing** | $199–399/month/facility (clinical tier)                     |
| **Target**  | Licensed treatment centers, not sober living homes          |
| **Overlap** | Minimal — different regulatory context, buyer, and use case |

**Verdict:** Not a direct competitor for sober living operators. May be relevant for Phase 2 (treatment center integration).

---

### 3d. Oathtrack — Emerging Player

**Overview:** Newer entrant; limited reviews and public presence. Court-ordered monitoring and accountability focus.

| Attribute   | Detail                                               |
| ----------- | ---------------------------------------------------- |
| **Pricing** | Not publicly listed                                  |
| **Target**  | Drug courts, probation programs, sober living        |
| **Overlap** | Partial — monitoring/accountability features overlap |

**Verdict:** Watch, not a primary threat yet.

---

### 3e. Spreadsheets and Paper — The Real Competition

75–80% of the sober living market runs on:

- Google Sheets for resident tracking
- Venmo / CashApp for rent collection
- Paper sign-in sheets for meetings
- Facebook groups for availability listings

**Why operators stay here:**

- Free
- Familiar
- No onboarding required

**Why they leave:**

- Rent collection is inconsistent
- No audit trail for compliance/NARR certification
- Can't manage applications at scale
- Can't prove outcomes for HUD funding

**GTM implication:** Messaging must lead with ROI (consistent rent collection, less time on admin) not features.

---

## Section 4: Positioning Map

### Dimension 1: Pricing Model Complexity

```
Predictable/Simple                          Unpredictable/Complex
        |                                               |
        |  [Regroup]          [Sobriety Hub]            |
        |  Per-house flat     Per-user scales up        |
        |                                               |
        |               [One Step]                      |
        |               Custom enterprise               |
```

### Dimension 2: Operator Size vs. Marketplace Functionality

```
Two-sided marketplace
(resident can apply)
         ^
         |
         |        [Regroup target]
         |       (SMB + true marketplace)
         |
         |  [Sobriety Hub directory]
         |  (read-only listings)
         |
No marketplace (operator-only)
         |__________________|_________________
        SMB/Small op    Enterprise/Large op
         [Regroup]         [One Step] [Behave]
```

**Unclaimed quadrant:** SMB-simple + genuine two-sided marketplace (application workflow, not just listings). This is Regroup's target position.

---

## Section 5: Blue Ocean Analysis

### Four Actions Framework

**Eliminate:**

- Per-user pricing model (eliminates unpredictability for operators)
- Onboarding fees (One Step and Sobriety Hub both charge; Regroup removes friction)
- Complexity of setup (progressive disclosure; sober living context pre-configured)

**Reduce:**

- Sales-touch requirement (self-serve with in-app onboarding)
- Time-to-value (demo-to-live in under 1 hour)

**Raise:**

- Resident application workflow (from zero — no incumbent offers this)
- Oxford House suitability (democratic voting, no staff-user model)
- Pricing predictability (flat per-house vs. per-user scaling)

**Create:**

- Two-sided marketplace: resident directory with in-app application + messaging
- Organic acquisition channel: residents searching for homes drive operator signups
- Oxford House-specific tier and feature set (democratic governance, 8-bed standard)

### Strategy Canvas

| Factor              | Spreadsheets | One Step    | Sobriety Hub       | Regroup           |
| ------------------- | ------------ | ----------- | ------------------ | ----------------- |
| Price               | Free         | High/opaque | Mid ($150/mo)      | Low ($89/mo)      |
| Setup friction      | Low          | High        | Medium             | Low               |
| Resident-facing     | None         | None        | Read-only listings | Full app workflow |
| Oxford House fit    | Poor         | Poor        | None               | Purpose-built     |
| Predictable pricing | N/A          | No          | No                 | Yes               |
| Meeting attendance  | No           | Yes         | Yes                | Yes               |
| Drug test tracking  | No           | Yes         | Yes                | Yes               |
| Rent collection     | Manual       | Yes         | Yes                | Yes               |
| DOC/BOP reporting   | No           | Partial     | No                 | Planned           |

---

## Section 6: Competitive Advantages Assessment

### Sustainable Advantages

| Advantage                          | Durability | Why                                                              |
| ---------------------------------- | ---------- | ---------------------------------------------------------------- |
| Resident directory network effects | High       | Data compounds; residents attract operators                      |
| Oxford House-specific tier         | High       | Non-trivial to replicate democratic governance model             |
| Per-house pricing structure        | Medium     | Competitors could copy, but changing pricing model is disruptive |
| Two-sided application workflow     | Medium     | First-mover window; Sobriety Hub lacks this today                |
| Community trust (recovery context) | High       | Earned over time; can't be bought quickly                        |

### Vulnerability Assessment

| Risk                                    | Probability        | Mitigation                                           |
| --------------------------------------- | ------------------ | ---------------------------------------------------- |
| Sobriety Hub ships application workflow | HIGH — 6–12 months | Ship MVP application flow by Month 3                 |
| Sobriety Hub drops price                | Medium             | Per-house pricing remains simpler even at same price |
| Oxford House declines partnership       | Medium             | Build organic Oxford chapter adoption in parallel    |
| New entrant with VC backing             | Low                | Domain expertise barrier; small TAM discourages VC   |

---

## Section 7: GTM Strategy

### Beachhead Market

**Primary beachhead: Oxford Houses in Texas**

- 3,500 Oxford Houses nationally; Texas has the second-highest concentration
- Oxford House chapters are self-governed, democratic, no staff — perfectly suited to Regroup's model
- A single state chapter pilot of 10–20 houses proves the model
- Oxford House Inc. national partnership = asymmetric upside ($171K ARR, compressed timeline)

### Customer Acquisition Playbook

**Phase 1 — Year 1 (0–40 customers):**

1. Direct outreach to Oxford House chapter directors in TX, OH, FL
2. NARR state affiliate conferences (2026 schedule)
3. "Free migration from One Step" positioning + direct comparison page
4. Cold email operators using free Google Forms setups (identified via directory listings)

**Phase 2 — Year 2 (40–115 customers):**

1. Resident directory drives inbound: residents searching → operators see value → sign up
2. Referral program: 1 month free per referred house
3. Content marketing: "How to start a sober living home" (search-intent content for new operators)
4. State NARR affiliate speaking opportunities

**Phase 3 — Year 3+ (115–270 customers):**

1. Oxford House national enterprise deal
2. Outpatient treatment center partnerships (step-down housing referrals)
3. HUD Recovery Housing Program reporting tool (outcome tracking for funding compliance)

### Win-From-One-Step Playbook

One Step operators are actively evaluating alternatives. Capture them with:

- Direct comparison page: One Step vs. Regroup (feature + price + experience)
- "We'll migrate your data for free" offer
- 2-month free trial (no credit card) to reduce switching risk
- One Step operators are larger (more sophisticated) → can land medium/large tier pricing faster

### Oxford House Dual Strategy

| Track                    | Approach                                             | Timeline   |
| ------------------------ | ---------------------------------------------------- | ---------- |
| Organic chapter adoption | Direct outreach to chapter directors; $49/month tier | Month 1+   |
| Enterprise partnership   | Proposal to Oxford House Inc. national headquarters  | Month 6–12 |

The enterprise partnership is the swing factor: 3,500 homes × $49/month = $171K ARR in a single deal.

---

## Section 8: Critical Action Items

Ranked by urgency:

1. **Ship resident application workflow (Month 1–3)** — This is the primary differentiator Sobriety Hub doesn't have. If Sobriety Hub ships application workflow in their directory, the moat narrows significantly. This is the highest-priority product initiative.

2. **Launch Oxford House Texas pilot (Month 2–4)** — 10–20 houses in one state chapter validates per-house pricing and Oxford-specific features before scaling outward.

3. **Build "Win from One Step" landing page (Month 2)** — Low-effort, high-intent traffic. Operators Googling alternatives are pre-qualified.

4. **Add multi-house bundle discount (pricing adjustment)** — Regroup becomes more expensive than Sobriety Hub for operators with 5+ houses (Sobriety Hub flat if same team size). Fix: 3+ houses = 10% off, 5+ houses = 20% off.

5. **Initiate Oxford House Inc. enterprise conversation (Month 6)** — Plant the seed early. National office partnership takes 6–18 months to close.

---

## Section 9: Positioning Statement

```
For sober living home operators in the United States
Who are managing residents with spreadsheets or paying unpredictable per-user
software bills that scale against them as they hire,
Regroup is a recovery housing management platform
That charges a flat per-house rate and connects operators to residents
through a two-sided directory where residents can actually apply — not just browse.
Unlike Sobriety Hub and One Step,
Regroup was built for the Oxford House democratic model, offers
predictable flat pricing, and creates an organic acquisition channel
operators don't have to pay for.
```

---

## Sources

- Sobriety Hub: Capterra reviews, pricing page, product changelog (May 2026)
- One Step Software: Capterra reviews, company website
- NARR: narronline.org — certification standards and state affiliates
- [Sobriety Hub 2026 Buyer's Guide](https://www.sobrietyhub.com/our-blog/2026-buyers-guide-the-big-3-of-sober-living-software)
- [Oxford House Inc.](https://www.oxfordhouse.org) — national chapter directory
- Market Opportunity Analysis: `docs/business/market-opportunity-analysis-2026-05-20.md`
- Financial Projections: `docs/business/financial-projections-2026-05-20.md`
