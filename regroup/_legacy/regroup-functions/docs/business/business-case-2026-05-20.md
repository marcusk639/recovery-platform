> ⚠️ **Legacy document.** Carried over from the standalone `regroup-functions` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `regroup` documentation.

# Regroup — Business Case & Strategic Plan

**Date:** May 2026 | **Stage:** Pre-launch / MVP | **Model:** Bootstrapped SaaS
**Purpose:** Internal founder planning document

---

## Section 1: Executive Summary

### One-Line Description

Regroup is a per-house SaaS platform for sober living home operators that combines resident management, rent collection, and a two-sided directory where residents can discover homes and apply — the only purpose-built software in the market built for both sides of the recovery housing relationship.

### The Opportunity in One Paragraph

17,000–18,000 sober living homes operate in the United States today. 75–80% use spreadsheets, paper sign-in sheets, and Venmo to manage residents. The two purpose-built software incumbents charge per-user — pricing that becomes unpredictable and expensive as operators hire. Neither has a resident-facing application layer. Regroup enters with flat per-house pricing, an Oxford House-specific tier for the 3,500-home self-governed segment, and a resident directory that creates organic acquisition — a network effect neither incumbent has.

### 5-Year Snapshot (Base Case)

| Metric       | Today | Year 1 | Year 2  | Year 3  | Year 5  |
| ------------ | ----- | ------ | ------- | ------- | ------- |
| ARR          | $0    | $47K   | $163K   | $350K   | $727K   |
| Customers    | 0     | 43     | 136     | 270     | 505     |
| Blended ARPU | —     | $92/mo | $100/mo | $108/mo | $120/mo |
| Net income   | —     | $1K    | $30K    | $74K    | $240K   |
| Cash balance | $45K  | $48K   | $78K    | $152K   | $541K   |
| Team         | 1     | 1      | 1       | 2       | 4       |

**Starting capital:** $45K (savings). **No outside funding required.** Cash flow positive Month 7. Founder market salary ($72K) by Month 30.

### The Oxford House Swing Factor

A national partnership with Oxford House Inc. — a single nonprofit governing 3,500 homes — would represent $171K ARR added in a single deal. Combined with base case growth, this compresses Year 3 targets into Year 1.5 and creates venture-scale inflection by Year 4 ($2.6M ARR).

### Critical Milestone: Resident Application Workflow

Sobriety Hub (primary competitor) launched a read-only directory in March 2026. They do not have an application workflow. Shipping a functional resident application layer within 90 days is the single highest-leverage product action — it secures a structural moat before Sobriety Hub closes the gap.

---

## Section 2: Problem & Market Opportunity

### The Problem

Sober living operators run complex residences — managing applications, intake, resident agreements, weekly rent collection, meeting attendance tracking, drug test logging, house rules, and communications — almost entirely without purpose-built software.

**The status quo:**

- Resident applications: Google Forms or phone calls
- Rent collection: Venmo, CashApp, cash
- Meeting attendance: paper sign-in sheets
- Availability listings: Facebook groups, word-of-mouth
- Resident history: scattered notes, text threads, spreadsheets

**Cost of the status quo:**

- Inconsistent rent collection = revenue leakage (operators report 15–30% of monthly rent is paid late or not collected)
- No audit trail = NARR certification risk
- No application workflow = operators receive unqualified applicants; residents have no efficient way to find open beds
- Manual processes = 10–20 hours/week of administrative overhead per operator

### The Market

| Metric                             | Value    | Source                            |
| ---------------------------------- | -------- | --------------------------------- |
| Total US recovery homes            | ~17,943  | PMC / Substance Use Research 2021 |
| Oxford Houses specifically         | ~3,500   | Oxford House Inc., 2025           |
| NARR-certified recovery residences | ~2,500   | NARR                              |
| US sober living market CAGR        | 5.2%     | Credence Research                 |
| Americans with SUD (unmet need)    | 48.4M/yr | SAMHSA NSDUH 2024                 |

**Key growth drivers:**

1. Opioid epidemic sustaining demand for recovery housing
2. Medicaid expansion increasing operator capacity
3. NARR certification requirements pushing operators toward formal management systems
4. HUD Recovery Housing Program funding tied to outcome reporting (creates software need)
5. ~5% new home formation rate annually expanding the addressable market

### Market Sizing

| Market         | Calculation                                                   | Value                    |
| -------------- | ------------------------------------------------------------- | ------------------------ |
| **TAM**        | 13,500 traditional homes × $1,300/yr + 3,500 Oxford × $588/yr | ~$20–25M ARR             |
| **SAM**        | TAM × 60% (tech-ready) × 75% (not locked into software)       | ~$9–10M ARR              |
| **SOM Year 3** | 3.5% of SAM                                                   | ~$350K ARR (~270 houses) |
| **SOM Year 5** | 7% of SAM                                                     | ~$700K ARR (~505 houses) |

**Top-down validation:** US assisted living software market = $337.9M (2024). Sober living ≈ 6% of assisted living beds → $20.3M TAM. Validates bottom-up within 2%.

**Oxford enterprise upside (modeled separately):**

- State chapter pilot: 500 homes × $49/mo = $24.5K MRR = $294K ARR
- National deal: 3,500 homes × $49/mo = $171.5K MRR = $2.06M ARR

### Target Customer

**Primary:** Sober living home operator, US-based, 1–20 beds, operates 1–5 houses.

- Pain: Manual processes, unpredictable software costs, no resident pipeline
- Budget: $50–200/month; price-sensitive but will pay for clear ROI
- Decision-maker: The owner/operator directly; no procurement process

**Secondary:** Oxford House chapter directors (self-governed, democratic model; needs software that doesn't charge per-staff-member)

**Resident layer (free tier, long-term):** People in recovery searching for open beds near them. Free to residents; drives operator discovery and increases operator's occupancy rate.

---

## Section 3: Solution & Product

### What Regroup Does

Regroup is a mobile-first platform (React Native + Firebase) with three interconnected layers:

**1. Operator Management Layer**

- Resident applications, intake forms, and move-in/move-out workflows
- Weekly/monthly rent collection via Stripe (ACH + credit card)
- Meeting attendance tracking with missed-meeting alerts
- Drug testing log and schedule
- House rules, agreements, and document storage
- Staff communication and task management

**2. Resident Directory Layer**

- Publicly searchable directory of homes using Regroup
- Filters: location, bed availability, gender, Oxford/non-Oxford, price range
- Resident profile: intake questionnaire, references, sobriety date
- **Application workflow** (MVP in development): residents apply directly to operators from the app

**3. Oxford House Specific Layer**

- Democratic voting and governance tools
- No per-staff-user model (single home account, member-driven)
- 8-bed standardized configuration
- Oxford charter compliance tracking

### Value Proposition by Segment

| Segment                     | Primary ROI                                       | Secondary Benefit                       |
| --------------------------- | ------------------------------------------------- | --------------------------------------- |
| Small operator (1–2 houses) | Consistent rent collection; saves 5 hr/week admin | Resident pipeline from directory        |
| Multi-house operator (3–10) | Predictable flat pricing; unified dashboard       | NARR compliance audit trail             |
| Oxford House chapter        | Democratic governance tools; $49/house flat       | No per-user pricing that penalizes size |

### Pricing

| Tier                    | House Size | Monthly | Annual ACV |
| ----------------------- | ---------- | ------- | ---------- |
| Oxford / Small          | 1–8 beds   | $49     | $588       |
| Traditional Small       | 1–10 beds  | $89     | $1,068     |
| Traditional Medium      | 11–20 beds | $149    | $1,788     |
| Traditional Large       | 20+ beds   | $229    | $2,748     |
| Multi-house bundle (3+) | Any        | −10%    | —          |
| Multi-house bundle (5+) | Any        | −20%    | —          |

**Pricing philosophy:** Flat per-house (not per-user). Operators can add unlimited staff without the bill scaling against them.

### Product Roadmap

| Phase                | Timeline    | Milestones                                                                              |
| -------------------- | ----------- | --------------------------------------------------------------------------------------- |
| **MVP**              | Month 1–3   | Resident management, rent collection, meeting tracking, basic directory listing         |
| **Marketplace**      | Month 3–6   | Resident application workflow, in-app messaging, application status tracking            |
| **Oxford Tier**      | Month 4–8   | Voting/governance features, Oxford chapter onboarding flow, $49 tier                    |
| **Compliance**       | Month 9–15  | NARR outcome reporting, HUD progress tracking, audit log export                         |
| **Enterprise**       | Month 12–24 | Oxford House Inc. partnership proposal, multi-chapter dashboard, API access             |
| **Treatment Bridge** | Month 24+   | Treatment center referral pipeline, IOP/PHP integration, step-down housing coordination |

### Technical Foundation

- **Backend:** Firebase (Firestore, Cloud Functions, Auth, Messaging)
- **Mobile:** React Native (iOS + Android from shared codebase)
- **Web admin:** React
- **Payments:** Stripe Connect (supports marketplace payments between residents and operators)
- **Infrastructure cost:** <$200/month at 100 houses; scales to ~$1,200/month at 1,000 houses (94% gross margin maintained)

---

## Section 4: Competitive Analysis

### Landscape Overview

| Competitor             | Model             | Price         | Est. Market Share   | Trajectory                   |
| ---------------------- | ----------------- | ------------- | ------------------- | ---------------------------- |
| **Spreadsheets/paper** | Free              | $0            | ~75–80%             | Declining as operators scale |
| **Sobriety Hub**       | Per-user/month    | $75/user/mo   | ~10–15%             | Growing fast                 |
| **One Step Software**  | Custom enterprise | ~$100–200+/mo | ~10–15%             | Declining                    |
| **Behave Health**      | Per-facility      | $199–399/mo   | <3% (clinical orgs) | Not a direct competitor      |
| **Oathtrack**          | Unknown           | Unknown       | <1%                 | Emerging, limited presence   |

### Competitive Feature Matrix

| Factor                        | Regroup     | Sobriety Hub   | One Step    | Spreadsheets |
| ----------------------------- | ----------- | -------------- | ----------- | ------------ |
| Per-house flat pricing        | ✅          | ❌ (per-user)  | ❌ (custom) | N/A          |
| Oxford House support          | ✅          | ❌             | ❌          | ⚠️ (manual)  |
| Resident directory            | ✅          | ✅ (read-only) | ❌          | ❌           |
| Resident application workflow | ✅ (in dev) | ❌             | ❌          | ❌           |
| Meeting attendance            | ✅          | ✅             | ✅          | ⚠️ (manual)  |
| Drug test tracking            | ✅          | ✅             | ✅          | ⚠️ (manual)  |
| Rent collection (Stripe)      | ✅          | ✅             | ✅          | ❌           |
| No onboarding fee             | ✅          | ❌ ($250)      | ❌          | N/A          |
| DOC/BOP reporting             | 🔜 Roadmap  | ❌             | ⚠️ Partial  | ❌           |
| Mobile-first                  | ✅          | ✅             | ⚠️          | ❌           |

### Pricing Comparison (Typical Small Operator: 2 Staff, 10 Beds)

| Provider     | Monthly Cost | Annual Cost   | Notes                                 |
| ------------ | ------------ | ------------- | ------------------------------------- |
| Sobriety Hub | $150         | $1,800        | $75 × 2 users + $250 onboarding       |
| One Step     | ~$150–250    | ~$1,800–3,000 | Custom; varies                        |
| **Regroup**  | **$89**      | **$1,068**    | **Flat per-house; no onboarding fee** |

**Regroup is 41% cheaper than Sobriety Hub** for a standard 2-staff operator. As staff count grows, the gap widens further.

### Key Differentiators

1. **Per-house pricing** — operators know exactly what they'll pay regardless of how many staff they add. Sobriety Hub's per-user model creates anxiety as operators grow.

2. **Resident application workflow** — the primary structural moat. When residents apply through Regroup, operators get pre-qualified applicants and residents get status updates. Neither incumbent offers this. Sobriety Hub's directory is read-only listings only.

3. **Oxford House-specific tier** — democratic governance model (no staff hierarchy), $49/month flat, 8-bed standard configuration. Oxford House's 3,500 homes are completely unserved by Sobriety Hub or One Step.

4. **Network effects** — as more operators list homes, more residents use the directory, which drives more operator signups. This two-sided flywheel is not replicable quickly by a competitor with operator-only software.

5. **No onboarding friction** — no onboarding fee, self-serve setup, demo-to-live in under an hour.

### Primary Risk: Sobriety Hub Ships Application Workflow

Sobriety Hub launched a read-only directory in March 2026. They have the engineering capacity to add an application layer within 6–12 months. This is the highest-urgency competitive threat. **Shipping the resident application MVP within 90 days creates first-mover data advantages that compound over time** (resident profiles, application history, operator ratings).

---

## Section 5: Business Model & Go-to-Market

### Revenue Model

- **Primary:** Monthly SaaS subscription per house (tiered by bed count)
- **Secondary (Year 2+):** Annual subscription option (10–15% discount; improves cash flow predictability)
- **Future:** Marketplace take rate if Regroup facilitates rent payments between residents and operators (2–3% of transactions); premium resident directory listings; API access for treatment center integrations

### Customer Acquisition Model

**Year 1 — Founder-led, zero cash CAC:**

| Channel                                 | Target       | Approach                                                              |
| --------------------------------------- | ------------ | --------------------------------------------------------------------- |
| Oxford House chapters in TX/OH/FL       | 15–20 houses | Direct outreach to chapter directors; demo call; $49/month value prop |
| One Step dissatisfied operators         | 10–15 houses | "Free migration from One Step" offer; direct comparison landing page  |
| NARR state conferences                  | 5–10 houses  | Speaking + booth at 2–3 state NARR affiliate events                   |
| Cold outreach to Google Forms operators | 5–10 houses  | Identify operators using generic tools from directory searches        |

**Year 2 — Word-of-mouth + resident flywheel:**

| Channel                                     | Target       | Notes                                                           |
| ------------------------------------------- | ------------ | --------------------------------------------------------------- |
| Resident directory inbound                  | 20–30 houses | Residents searching → operators see directory traffic → sign up |
| Referral program                            | 15–20 houses | 1 month free per referred house                                 |
| Content: "How to start a sober living home" | 10–15 houses | High search intent; attracts new operators                      |

**Year 3 — Oxford enterprise + conference presence:**

| Channel                                | Target     | Notes                                        |
| -------------------------------------- | ---------- | -------------------------------------------- |
| Oxford House chapter pilots → national | 50+ houses | State pilot proves model → national proposal |
| NARR national conference               | 20+ houses | Established presence; speaking slot          |
| Treatment center referral agreements   | 10+ houses | IOP/PHP programs recommending Regroup homes  |

### Sales Model

**Self-serve with founder-assisted onboarding:**

- No sales team in Year 1–2
- Free trial: 14 days, no credit card
- Onboarding: async video + founder Loom walkthrough for first 50 customers
- Founder does live demos for Oxford chapter directors and larger operators

### Customer Success & Retention

- **Monthly churn target:** 2.5% (SMB SaaS benchmark; lower than average because resident history data creates switching cost)
- **Early warning:** Month 3 retention of each cohort. If <85% retained at Month 3, immediate customer interview blitz
- **Expansion trigger:** Customer with 3+ houses prompt for bundle discount conversation
- **Net Dollar Retention target:** 105%+ by Year 2 via tier upgrades and ARPU growth

### Go-to-Market Beachhead: Oxford Houses in Texas

- Texas has the 2nd highest Oxford House concentration nationally
- Oxford Houses are self-organized into chapters (easier to reach chapter directors vs. individual homes)
- $49/month tier is purpose-built for Oxford's democratic model
- A 20-house Texas pilot validates the Oxford-specific features before scaling
- Oxford House Inc. national headquarters (Silver Spring, MD) — initiate enterprise conversation at Month 6

---

## Section 6: Financial Projections

### Annual Summary (Base Case)

| Year        | Customers | ARPU/mo | ARR (EOY) | Rev Collected | Net Income | Cash Balance |
| ----------- | --------- | ------- | --------- | ------------- | ---------- | ------------ |
| **0 (now)** | 0         | —       | $0        | $0            | —          | $45K         |
| **1**       | 43        | $92     | $47.5K    | $23K          | $1K        | $48K         |
| **2**       | 136       | $100    | $163K     | $114K         | $30K       | $78K         |
| **3**       | 270       | $108    | $350K     | $250K         | $74K       | $152K        |
| **4**       | 390       | $115    | $538K     | $440K         | $149K      | $301K        |
| **5**       | 505       | $120    | $727K     | $595K         | $240K      | $541K        |

### Cost Structure

| Line Item                       | Year 1     | Year 2     | Year 3      | Year 5      |
| ------------------------------- | ---------- | ---------- | ----------- | ----------- |
| COGS (Firebase, Stripe, APIs)   | $2.5K      | $6.9K      | $15K        | $36.6K      |
| Gross margin                    | 89%        | 94%        | 94%         | 94%         |
| Founder salary                  | $12K       | $48K       | $72K        | $96K        |
| First hire (CS/Sales, Month 25) | —          | —          | $60K        | $70K        |
| Second hire (Eng, Month 37)     | —          | —          | —           | $95K        |
| S&M                             | $1.2K      | $6K        | $12K        | $30K        |
| G&A                             | $4.8K      | $9.6K      | $14.4K      | $18K        |
| **Total OpEx**                  | **$20.5K** | **$70.5K** | **$173.4K** | **$345.6K** |
| **Net Income**                  | **$2.5K**  | **$37.6K** | **$76.6K**  | **$249.4K** |

### Unit Economics

| Metric             | Year 1 | Year 2 | Year 3 | SMB Benchmark |
| ------------------ | ------ | ------ | ------ | ------------- |
| Blended ARPU/month | $92    | $100   | $108   | —             |
| Monthly churn      | 2.5%   | 2.5%   | 2.5%   | <3%           |
| Customer lifetime  | 40 mo  | 40 mo  | 40 mo  | —             |
| LTV                | $3,128 | $3,400 | $3,672 | —             |
| Cash CAC           | ~$0    | ~$50   | ~$67   | —             |
| LTV:CAC            | ~31x   | ~68x   | ~55x   | >3x ✅        |
| CAC payback        | <2 mo  | <1 mo  | <1 mo  | <18 mo ✅     |
| Gross margin       | 89%    | 94%    | 94%    | 75–85% ✅     |
| Rule of 40         | 348%   | 178%   | 173%   | >40% ✅       |

### Cash Flow

| Period        | Revenue | Expenses | Net         | Cash Balance |
| ------------- | ------- | -------- | ----------- | ------------ |
| Q1 (M1–3)     | $1,196  | $4,950   | −$3,754     | $41,246      |
| Q2 (M4–6)     | $3,864  | $5,250   | −$1,386     | $39,860      |
| **Q3 (M7–9)** | $7,452  | $5,250   | **+$2,202** | $42,062      |
| Q4 (M10–12)   | $10,764 | $5,250   | +$5,514     | $47,576      |
| Year 2        | $114K   | $84K     | +$30K       | $78K         |
| Year 3        | $250K   | $176K    | +$74K       | $152K        |
| Year 5        | $595K   | $355K    | +$240K      | $541K        |

**Minimum cash balance: ~$39,860 (Month 6).** Never goes negative on the base case.

### Path to Key Milestones

| Milestone                      | Month    | Customers Needed |
| ------------------------------ | -------- | ---------------- |
| Cash flow positive             | Month 7  | 23               |
| $10K MRR                       | Month 24 | ~108             |
| Founder living wage ($4K/mo)   | Month 18 | ~80              |
| Founder market salary ($6K/mo) | Month 30 | ~130             |
| First hire funded from revenue | Month 25 | ~120             |
| $100K ARR                      | Month 22 | ~108             |
| $350K ARR                      | Month 36 | ~270             |

### Three-Scenario Analysis (Year 3)

| Scenario            | ARR       | Customers | Net Income | Cash      | Key Assumption                     |
| ------------------- | --------- | --------- | ---------- | --------- | ---------------------------------- |
| Conservative        | $118K     | 126       | −$34K      | $11K      | 4% monthly churn, −30% acquisition |
| **Base**            | **$350K** | **270**   | **$74K**   | **$152K** | 2.5% churn, modeled acquisition    |
| Optimistic          | $680K     | 490       | $194K      | $280K     | 1.5% churn, +30% acquisition       |
| Oxford pilot + base | $644K     | 770       | $170K      | $260K     | State chapter deal (500 homes)     |

**Conservative scenario risk:** At 4% monthly churn, cash drops to $11K by Year 3. If Month 3 cohort retention falls below 85%, escalate immediately.

### Oxford House Enterprise Upside (Separate Model)

| Event                              | Timing     | MRR Added | ARR Impact |
| ---------------------------------- | ---------- | --------- | ---------- |
| State chapter pilot (500 homes)    | End Year 2 | +$24,500  | +$294K     |
| National Oxford Inc. (3,500 homes) | Mid Year 4 | +$171,500 | +$2.06M    |

Combined with base case: Year 4 ARR = **$2.6M** from a single relationship. This is the asymmetric bet worth prioritizing above nearly everything else on the roadmap.

---

## Section 7: Team & Organization

### Current Team

**Marcus Klein — Founder, Engineering & Product**

- Full-stack engineer with React Native / Firebase expertise (Regroup's entire stack)
- Building both product and GTM simultaneously in pre-launch phase
- Responsible for: product development, customer outreach, onboarding, support

**No co-founders; no advisors yet.**

**Open items:**

- Recovery housing domain advisor (operator or NARR board member)
- Legal / compliance counsel for HIPAA awareness as product touches clinical adjacencies

### Hiring Plan

| Role                     | Start Month | Trigger                                               | Salary |
| ------------------------ | ----------- | ----------------------------------------------------- | ------ |
| Customer Success / Sales | Month 25    | 120+ customers; founder spending >20 hr/wk on support | $55K   |
| Engineer (PT → FT)       | Month 37    | 270+ customers; product roadmap backlog >3 months     | $85K   |
| Marketing / Growth       | Month 49    | $500K ARR; paid channels ready to scale               | $65K   |

**Guiding principle:** Hire when a role is clearly creating a bottleneck, not in anticipation. The bootstrapped model funds each hire from existing revenue.

### Organization by Year

```
Year 1–2:  Founder only (1 person)
Year 3:    Founder + CS/Sales hire (2 people)
Year 4:    + Engineer (3 people)
Year 5:    + Marketing/Growth (4 people)
```

---

## Section 8: Risks & Mitigation

### Product Risks

| Risk                                                 | Probability | Impact | Mitigation                                                                 |
| ---------------------------------------------------- | ----------- | ------ | -------------------------------------------------------------------------- |
| Sobriety Hub ships application workflow (6–12 mo)    | HIGH        | HIGH   | Ship Regroup application MVP within 90 days; data moat compounds           |
| Firebase cost surprise at scale                      | Low         | Medium | Monitor monthly; architecture review at $500/mo                            |
| React Native platform parity issues (iOS vs Android) | Medium      | Medium | Test on both platforms weekly; prioritize Android for recovery demographic |

### Market / Acquisition Risks

| Risk                                         | Probability | Impact | Mitigation                                                                    |
| -------------------------------------------- | ----------- | ------ | ----------------------------------------------------------------------------- |
| Operator price sensitivity stalls conversion | Medium      | High   | Lead with rent collection ROI (concrete $$ value, not features)               |
| Slow acquisition in first 6 months           | Medium      | High   | Tighten ICP; pivot to One Step operators if Oxford outreach underperforms     |
| Oxford House Inc. declines partnership       | Medium      | Medium | Organic chapter adoption continues regardless; enterprise is upside, not base |
| NARR or regulatory changes                   | Low         | Medium | Track NARR certification requirements quarterly                               |

### Financial Risks

| Risk                          | Probability | Impact   | Threshold                     | Response                                                   |
| ----------------------------- | ----------- | -------- | ----------------------------- | ---------------------------------------------------------- |
| High early churn (>4%/month)  | Medium      | Critical | Month 3 retention <85%        | Customer interview blitz; pause acquisition spend          |
| Cash cushion erosion          | Low         | High     | Cash balance <$15K            | Reduce founder draw temporarily; pause S&M spend           |
| ARPU compression below $80/mo | Low         | Medium   | New customer avg ARPU <$80    | Tighten tier boundaries; strengthen medium-tier value prop |
| Founder burnout               | Medium      | High     | 2 months with 0 new customers | Add part-time sales contractor immediately                 |

### Competitive Risks

| Risk                                             | Probability | Impact | Mitigation                                                                |
| ------------------------------------------------ | ----------- | ------ | ------------------------------------------------------------------------- |
| Sobriety Hub lowers price to match               | Low         | Medium | Per-house model remains structurally simpler even at same price           |
| Well-funded new entrant                          | Very Low    | High   | TAM too small for VC; domain expertise is real barrier                    |
| One Step emergency price cut to retain customers | Low         | Low    | One Step operators are already leaving; Regroup wins on UX and simplicity |

---

## Section 9: Milestones & Decision Points

These are the decision gates that determine when to accelerate, pivot, or invest.

### Year 1 Milestones

| Milestone                           | Month    | Success Metric           | If Missed                               |
| ----------------------------------- | -------- | ------------------------ | --------------------------------------- |
| First 5 paying customers            | Month 2  | $460+ MRR                | Revisit pricing or ICP                  |
| Resident application MVP shipped    | Month 3  | App in TestFlight        | Descope; ship directory listing minimum |
| 10 paying customers                 | Month 4  | $920+ MRR                | Oxford outreach pivot                   |
| Oxford House chapter pilot          | Month 5  | 5–10 houses in 1 chapter | Continue traditional operator focus     |
| Cash flow positive                  | Month 7  | $2,000+ monthly surplus  | Draw on savings maximum 2 more months   |
| 30 paying customers                 | Month 9  | $2,760+ MRR              | Investigate churn root cause            |
| 43 paying customers (Year 1 target) | Month 12 | $3,956 MRR               | —                                       |

### Year 2 Milestones

| Milestone                           | Month       | Success Metric                        |
| ----------------------------------- | ----------- | ------------------------------------- |
| Resident directory organic traffic  | Month 15    | >100 resident directory sessions/week |
| Annual subscription option launched | Month 15    | >20% of new customers take annual     |
| Referral program live               | Month 18    | >5 referral-sourced customers         |
| 100 paying customers                | Month 22    | $10K+ MRR                             |
| Oxford state chapter pilot signed   | Month 20–24 | 50–500 homes in 1–2 state chapters    |
| First hire funded from revenue      | Month 25    | Revenue surplus covers CS salary      |

### Year 3 Milestones

| Milestone                                      | Month       | Success Metric                              |
| ---------------------------------------------- | ----------- | ------------------------------------------- |
| $350K ARR                                      | Month 36    | 270 customers                               |
| Oxford national enterprise conversation active | Month 30    | Meeting with Oxford House Inc. HQ scheduled |
| NARR compliance / HUD reporting tool           | Month 30–36 | First operator uses for funding compliance  |
| Treatment center referral pilot                | Month 36    | 1–2 IOP/PHP partners                        |

### Growth Acceleration Options (If Ahead of Plan)

If Year 2 ARR exceeds $250K or an Oxford deal is signed:

1. **Hire CS/Sales earlier** (Month 18 instead of 25) to accelerate growth
2. **Increase S&M spend** to $2–3K/month (currently modeled at $500/month)
3. **Optional angel raise** ($150–300K) to compress Oxford national timeline and fund product roadmap (treatment bridge features, DOC/BOP reporting)

An optional raise is not required and should only be considered if it meaningfully accelerates the Oxford national deal or opens a market segment the bootstrap model can't reach in time.

---

## Section 10: Strategic Priorities (Ranked)

1. **Ship resident application workflow** — 90 days. Closes the moat before Sobriety Hub catches up.

2. **Secure first Oxford House chapter pilot** — 120 days. 10–20 homes in Texas validates the Oxford tier and creates a reference for the national proposal.

3. **Build "Win from One Step" positioning** — 60 days. Landing page, direct comparison, free migration offer. One Step operators are actively evaluating; this is free inbound traffic.

4. **Reach 23 customers (cash flow positive)** — Month 7. This is the survival threshold. Everything in Years 1–2 is oriented around this milestone.

5. **Initiate Oxford House Inc. national conversation** — Month 6. The $2.06M ARR deal takes 12–18 months to close. Plant the seed now.

6. **Add multi-house bundle discount** — Month 2 (pricing table only). Regroup becomes more expensive than Sobriety Hub for operators with 5+ houses at the same per-user team size. Bundle discount closes this gap before it becomes a sales objection.

7. **First hire: CS/Sales at Month 25** — The founder will spend >20 hours/week on support and onboarding at 120+ customers. Hiring before that threshold creates organizational slack without funding.

---

## Appendix: Key Metrics Dashboard

| Metric                      | Monitor   | Alert Threshold                   |
| --------------------------- | --------- | --------------------------------- |
| Month 3 cohort retention    | Monthly   | <85%                              |
| Monthly new customers       | Monthly   | <3/month for 2 consecutive months |
| Blended ARPU                | Quarterly | <$80/month for new customers      |
| Cash balance                | Monthly   | <$15,000                          |
| Firebase monthly cost       | Monthly   | >$500 before 100 customers        |
| Customer support hours/week | Weekly    | >20 hr/week at <120 customers     |
| Churn rate                  | Monthly   | >3.5%/month                       |

---

## Source Documents

- [Market Opportunity Analysis](./market-opportunity-analysis-2026-05-20.md) — TAM/SAM/SOM methodology and calculations
- [Financial Projections](./financial-projections-2026-05-20.md) — 5-year cohort model, three-scenario analysis, unit economics
- [Competitive Landscape](./competitive-landscape-2026-05-20.md) — Porter's Five Forces, competitor profiles, Blue Ocean positioning
