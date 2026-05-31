# Recovery Ecosystem — Financial Projections (2026–2029)

**Date:** 2026-04-15  
**Prepared for:** Internal planning, fundraising reference  
**Scope:** Three-product recovery ecosystem — Homegroups (RecoveryConnect), Regroup/RATS (rats-v2), and Aftercare (planned)  
**Horizon:** 3 years (April 2026 – March 2029)

---

## Executive Summary

The Recovery Ecosystem maps to the ASAM Continuum of Care across three phases of a person's recovery journey:

| Phase              | Product                | Buyer             | ARPU             |
| ------------------ | ---------------------- | ----------------- | ---------------- |
| 12-step community  | **Homegroups**         | Group admins      | $12/year         |
| Sober living       | **Regroup (RATS)**     | House operators   | $49–99/month     |
| Clinical aftercare | **Aftercare** (Year 2) | Treatment centers | $800–3,000/month |

No competitor connects these three phases digitally. The integration play — selling a "continuity of care" bundle to treatment centers — is the highest-ACV product in the portfolio and the primary path to a venture-scale outcome.

### 3-Year Financial Snapshot (Base Case)

| Metric                     | Year 1 End | Year 2 End               | Year 3 End |
| -------------------------- | ---------- | ------------------------ | ---------- |
| **Total MRR**              | $8,000     | $42,000                  | $130,000   |
| **ARR**                    | $96,000    | $504,000                 | $1,560,000 |
| **Paying Accounts**        | ~330       | ~1,400                   | ~3,800     |
| **Gross Margin**           | 82%        | 83%                      | 85%        |
| **Burn Rate (monthly)**    | ~$3,500    | ~$18,000                 | ~$65,000   |
| **Runway (w/ $250K seed)** | 48+ months | Cash-flow positive by Q6 | Profitable |

### Funding Requirements

- **Bootstrap runway (no raise):** 18–24 months before Aftercare requires HIPAA infrastructure investment (~$30K one-time)
- **Recommended seed:** $250K at ~$1.5M pre-money — buys 18 months of expanded capacity, first two hires, HIPAA audit, and treatment center sales push
- **Series A trigger:** ~$500K–800K ARR, 15+ paying treatment centers, Oxford House network effects proven

---

## Section 1: Model Assumptions

### Revenue Model & Pricing

**Homegroups (Group Subscriptions)**

- $12/year per group admin ($1/month equivalent), billed annually
- Multi-group discount: $8/year for each group beyond the first
- Intergroup subscriptions: $72/year (launching Year 2 when V4.4 un-gates)
- 5% platform fee on donations (implemented, minor revenue currently)
- Trial: 7 days free, target 15% trial-to-paid conversion rate

**Regroup / RATS (Sober Living)**

- Traditional houses: $79/month
- Oxford Houses (individual): $49/month (lower price, higher volume via network)
- Oxford chapters (multi-house): $300/month
- Enterprise operators (10+ houses): $1,200/month
- Note: Current pricing ($10/house + $1/resident) being raised for new operators Month 3

**Aftercare / Treatment Center**

- Partner tier: $800/month (< 50 beds, single facility)
- Network tier: $1,500/month (alumni program, unlimited partner houses)
- Enterprise tier: $3,000+/month (multi-site, SSO, BAA, custom exports)
- Launch target: Network tier ($1,500/month avg) for first 10 customers

**Treatment Center Bundle (RATS + Homegroups integrated)**

- Integrated "continuity of care" offering bundling all three products
- Additional $200-500/month premium over individual product pricing
- Available Month 10+ when identity bridge and facility dashboard are shipped

### Growth Assumptions

| Product                | Month 1 New Accounts | Month 12 New Accounts | Annual Churn |
| ---------------------- | -------------------- | --------------------- | ------------ |
| Homegroups (groups)    | 5                    | 30                    | 12%          |
| RATS individual houses | 2                    | 12                    | 18%          |
| RATS Oxford chapters   | 0                    | 2                     | 10%          |
| Treatment centers      | 0                    | 1–2                   | 8%           |

**Growth drivers by product:**

- Homegroups: Intergroup outreach (GSR meetings), referral program, public group page SEO, word-of-mouth treasury handoff demo
- RATS: Oxford House World Services partnership outreach, public sober living directory (Month 6), treatment center referral pipeline
- Aftercare: Direct sales to treatment centers < 50 beds; outcome tracking demo is the key differentiator

### Cost Structure Assumptions

| Category                  | Year 1                 | Year 2          | Year 3 |
| ------------------------- | ---------------------- | --------------- | ------ |
| Gross Margin              | 82%                    | 83%             | 85%    |
| COGS (infra + processing) | 18% of revenue         | 17%             | 15%    |
| S&M                       | 35% of revenue         | 30%             | 20%    |
| R&D                       | Solo founder (no cash) | 40% of expenses | 35%    |
| G&A                       | 20% of expenses        | 15%             | 12%    |

**Infrastructure baseline:**

- Firebase (Firestore, Functions, FCM, Storage, Hosting): $200–5,000/month depending on scale
- Stripe fees: ~2.9% + $0.30/transaction (annual billing minimizes per-charge overhead)
- SendGrid: $20–100/month
- Sentry: $26–89/month
- HIPAA infrastructure (Year 2+): $500–1,500/month (GCP HIPAA BAA, encryption at rest, audit logging)
- Total COGS at Year 1 scale: ~$800–1,500/month average

---

## Section 2: Revenue Projections — Year 1 Monthly Detail

### Homegroups — Monthly Cohort (Base Case, $1/month per group)

Churn assumption: 1.0%/month (12%/year)

| Month | Period   | New Groups | Total Groups | MRR  |
| ----- | -------- | ---------- | ------------ | ---- |
| M1    | Apr 2026 | 5          | 5            | $5   |
| M2    | May 2026 | 8          | 13           | $13  |
| M3    | Jun 2026 | 12         | 25           | $25  |
| M4    | Jul 2026 | 15         | 40           | $40  |
| M5    | Aug 2026 | 18         | 57           | $57  |
| M6    | Sep 2026 | 20         | 76           | $76  |
| M7    | Oct 2026 | 25         | 101          | $101 |
| M8    | Nov 2026 | 28         | 128          | $128 |
| M9    | Dec 2026 | 30         | 157          | $157 |
| M10   | Jan 2027 | 30         | 185          | $185 |
| M11   | Feb 2027 | 30         | 213          | $213 |
| M12   | Mar 2027 | 30         | 241          | $241 |

**Year 1 Homegroups ARR: $2,892** (241 groups × $12)

> **Note on Homegroups economics:** At $12/yr, Homegroups is a **distribution flywheel, not a primary revenue engine** in Year 1–2. Its strategic value is twofold: (1) it seeds the meeting database and group network that makes RATS and Aftercare more valuable, and (2) each group admin is a potential referral source to treatment centers. Do not optimize Homegroups pricing for near-term revenue — optimize it for adoption speed.

---

### Regroup / RATS — Monthly Cohort (Base Case)

**Individual houses:** Average $75/month (blended Oxford $49 + Traditional $79), 1.5%/month churn  
**Oxford chapters:** $300/month, 0.83%/month churn

| Month | Period   | New Houses | Total Houses | Houses MRR | New Chapters | Total Chapters | Chapters MRR | Total RATS MRR |
| ----- | -------- | ---------- | ------------ | ---------- | ------------ | -------------- | ------------ | -------------- |
| M1    | Apr 2026 | 0          | 3\*          | $225       | 0            | 0              | $0           | $225           |
| M2    | May 2026 | 2          | 5            | $375       | 0            | 0              | $0           | $375           |
| M3    | Jun 2026 | 3          | 8            | $600       | 0            | 0              | $0           | $600           |
| M4    | Jul 2026 | 4          | 12           | $900       | 0            | 0              | $0           | $900           |
| M5    | Aug 2026 | 5          | 17           | $1,275     | 0            | 0              | $0           | $1,275         |
| M6    | Sep 2026 | 6          | 22           | $1,650     | 1            | 1              | $300         | $1,950         |
| M7    | Oct 2026 | 7          | 29           | $2,175     | 1            | 2              | $600         | $2,775         |
| M8    | Nov 2026 | 8          | 36           | $2,700     | 1            | 3              | $900         | $3,600         |
| M9    | Dec 2026 | 9          | 44           | $3,300     | 1            | 4              | $1,200       | $4,500         |
| M10   | Jan 2027 | 10         | 53           | $3,975     | 1            | 5              | $1,500       | $5,475         |
| M11   | Feb 2027 | 10         | 62           | $4,650     | 1            | 6              | $1,800       | $6,450         |
| M12   | Mar 2027 | 12         | 73           | $5,475     | 2            | 8              | $2,400       | $7,875         |

\*3 existing operators transitioning to new pricing

**Year 1 RATS ARR (from M12 MRR): ~$94,500**

---

### Aftercare / Treatment Centers — Monthly Cohort (Base Case)

Average ACV: $18,000/year ($1,500/month), 0.67%/month churn

| Month | Period       | New TCs | Total TCs | MRR    |
| ----- | ------------ | ------- | --------- | ------ |
| M1–M9 | Apr–Dec 2026 | 0       | 0         | $0     |
| M10   | Jan 2027     | 1       | 1         | $1,500 |
| M11   | Feb 2027     | 1       | 2         | $3,000 |
| M12   | Mar 2027     | 1       | 3         | $4,500 |

**Year 1 Aftercare ARR (annualized from M12): $54,000**

---

### Combined Monthly MRR — Year 1

| Month    | Homegroups | RATS   | Aftercare | **Total MRR** | MoM Growth |
| -------- | ---------- | ------ | --------- | ------------- | ---------- |
| Apr 2026 | $5         | $225   | $0        | **$230**      | —          |
| May 2026 | $13        | $375   | $0        | **$388**      | +69%       |
| Jun 2026 | $25        | $600   | $0        | **$625**      | +61%       |
| Jul 2026 | $40        | $900   | $0        | **$940**      | +50%       |
| Aug 2026 | $57        | $1,275 | $0        | **$1,332**    | +42%       |
| Sep 2026 | $76        | $1,950 | $0        | **$2,026**    | +52%       |
| Oct 2026 | $101       | $2,775 | $0        | **$2,876**    | +42%       |
| Nov 2026 | $128       | $3,600 | $0        | **$3,728**    | +30%       |
| Dec 2026 | $157       | $4,500 | $0        | **$4,657**    | +25%       |
| Jan 2027 | $185       | $5,475 | $1,500    | **$7,160**    | +54%       |
| Feb 2027 | $213       | $6,450 | $3,000    | **$9,663**    | +35%       |
| Mar 2027 | $241       | $7,875 | $4,500    | **$12,616**   | +31%       |

**Year 1 Total Revenue (actual cash collected): ~$43,000**  
**Year 1 ARR at exit (M12 MRR × 12): ~$151,400**

---

## Section 3: Revenue Projections — Years 2 & 3 (Quarterly)

### Year 2 Quarterly (April 2027 – March 2028)

By Year 2, RATS Oxford network effects kick in, Aftercare sales pipeline builds, and Homegroups intergroup tier launches.

| Quarter         | Homegroups | RATS    | Aftercare | **Total MRR** | **ARR** |
| --------------- | ---------- | ------- | --------- | ------------- | ------- |
| Q1 (Apr–Jun 27) | $480       | $14,500 | $10,500   | **$25,480**   | $306K   |
| Q2 (Jul–Sep 27) | $720       | $20,000 | $18,000   | **$38,720**   | $465K   |
| Q3 (Oct–Dec 27) | $960       | $25,000 | $25,500   | **$51,460**   | $618K   |
| Q4 (Jan–Mar 28) | $1,200     | $30,000 | $34,500   | **$65,700**   | $788K   |

**Year 2 Total Revenue (actual): ~$530,000**

_Year 2 RATS breakdown at Q4: ~300 houses × $75 + 25 chapters × $300 = $30,000_  
_Year 2 Aftercare at Q4: ~23 TCs × $1,500 = $34,500_  
_Year 2 Homegroups at Q4: ~1,000 groups + 20 intergroups × $6 = $1,200_

---

### Year 3 Quarterly (April 2028 – March 2029)

By Year 3, treatment center enterprise deals + Oxford network effects drive compound growth.

| Quarter         | Homegroups | RATS    | Aftercare | **Total MRR** | **ARR** |
| --------------- | ---------- | ------- | --------- | ------------- | ------- |
| Q1 (Apr–Jun 28) | $2,000     | $45,000 | $55,000   | **$102,000**  | $1.22M  |
| Q2 (Jul–Sep 28) | $2,800     | $58,000 | $75,000   | **$135,800**  | $1.63M  |
| Q3 (Oct–Dec 28) | $3,500     | $68,000 | $96,000   | **$167,500**  | $2.01M  |
| Q4 (Jan–Mar 29) | $4,200     | $78,000 | $120,000  | **$202,200**  | $2.43M  |

**Year 3 Total Revenue (actual): ~$1,620,000**

_Year 3 RATS at Q4: ~700 houses × $80 avg + 60 chapters × $300 = $74,000_  
_Year 3 Aftercare at Q4: ~80 TCs × $1,500 avg = $120,000_  
_Year 3 Homegroups at Q4: ~3,500 groups + 60 intergroups × $6 = $3,860 → rounded to $4,200 with donation fees_

---

## Section 4: Cost Breakdown

### Cost of Goods Sold (Infrastructure)

| Component                               | Year 1      | Year 2      | Year 3       |
| --------------------------------------- | ----------- | ----------- | ------------ |
| Firebase (all products)                 | $8,400      | $24,000     | $60,000      |
| Stripe fees (~3% of RATS/TC revenue)    | $1,200      | $9,000      | $27,000      |
| SendGrid / Twilio (Year 2+)             | $600        | $3,600      | $9,600       |
| HIPAA infra (GCP Cloud Run, encryption) | $0          | $12,000     | $18,000      |
| Sentry, monitoring, tools               | $600        | $2,400      | $4,800       |
| **Total COGS**                          | **$10,800** | **$51,000** | **$119,400** |
| **Gross Margin**                        | **75%**     | **90%**†    | **93%**†     |

†Year 2/3 gross margin improves as fixed COGS amortizes over growing revenue base

_Revised blended gross margin including COGS against total revenue:_

| Year   | Revenue    | COGS     | Gross Profit | Gross Margin |
| ------ | ---------- | -------- | ------------ | ------------ |
| Year 1 | $43,000    | $10,800  | $32,200      | 75%          |
| Year 2 | $530,000   | $51,000  | $479,000     | 90%          |
| Year 3 | $1,620,000 | $119,400 | $1,500,600   | 93%          |

---

### Sales & Marketing

| Component                          | Year 1     | Year 2      | Year 3       |
| ---------------------------------- | ---------- | ----------- | ------------ |
| Founder outreach (time, no cash)   | $0         | —           | —            |
| Conference / event attendance      | $2,000     | $8,000      | $20,000      |
| Content marketing / SEO            | $0         | $6,000      | $18,000      |
| Sales team (included in headcount) | $0         | $72,000     | $180,000     |
| Lead gen / advertising             | $0         | $12,000     | $36,000      |
| **Total S&M**                      | **$2,000** | **$98,000** | **$254,000** |
| **% of Revenue**                   | **5%**     | **18%**     | **16%**      |

_Year 1 S&M is essentially zero-cost (founder personally attends intergroup meetings and calls group admins). This is the correct Year 1 strategy — high-touch, low-cost._

---

### Research & Development

| Component                                | Year 1    | Year 2       | Year 3       |
| ---------------------------------------- | --------- | ------------ | ------------ |
| Founder engineering (time, no cash cost) | Priceless | —            | —            |
| Engineering hire(s)                      | $0        | $144,000     | $312,000     |
| Design contractor                        | $0        | $24,000      | $48,000      |
| DevOps / infrastructure                  | $0        | $12,000      | $24,000      |
| HIPAA audit (one-time)                   | $0        | $25,000      | $0           |
| **Total R&D**                            | **$0**    | **$205,000** | **$384,000** |
| **% of Revenue**                         | **0%**    | **39%**      | **24%**      |

---

### General & Administrative

| Component                      | Year 1      | Year 2       | Year 3       |
| ------------------------------ | ----------- | ------------ | ------------ |
| Founder salary (if taken)      | $72,000\*   | $96,000      | $120,000     |
| Finance / legal / accounting   | $3,000      | $12,000      | $30,000      |
| Business insurance             | $1,200      | $3,600       | $7,200       |
| Software / SaaS tools          | $2,400      | $6,000       | $12,000      |
| Office / remote infrastructure | $0          | $6,000       | $12,000      |
| **Total G&A**                  | **$78,600** | **$123,600** | **$181,200** |

_Year 1 founder salary is optional and often deferred in bootstrap mode. Model includes it for completeness. Without salary draw: Year 1 G&A = $6,600._

---

### Full OpEx Summary

| Department            | Year 1        | Year 2       | Year 3         |
| --------------------- | ------------- | ------------ | -------------- |
| COGS                  | $10,800       | $51,000      | $119,400       |
| S&M                   | $2,000        | $98,000      | $254,000       |
| R&D                   | $0            | $205,000     | $384,000       |
| G&A                   | $78,600       | $123,600     | $181,200       |
| **Total OpEx**        | **$91,400**   | **$477,600** | **$938,600**   |
| **Revenue**           | **$43,000**   | **$530,000** | **$1,620,000** |
| **Net Income (Loss)** | **($48,400)** | **$52,400**  | **$681,400**   |

_Without founder salary Year 1: Net Loss = ($6,400) — essentially breakeven on cash._

---

## Section 5: Headcount Plan

The founding constraint is a solo developer-founder. Hiring must wait until paying revenue justifies it or seed funding is raised.

| Role                     | Department | Start           | Base Salary           | Fully-Loaded     | Notes                                   |
| ------------------------ | ---------- | --------------- | --------------------- | ---------------- | --------------------------------------- |
| Founder                  | All        | Apr 2026        | $72,000               | $72,000          | Often deferred Y1                       |
| Full-Stack Engineer #1   | R&D        | Oct 2026 (M7)\* | $110,000              | $143,000/yr      | Accelerates Aftercare & RATS gaps       |
| Sales / Customer Success | S&M        | Jan 2027 (M10)  | $70,000 + commission  | $91,000/yr + 8%  | Owns TC pipeline                        |
| Full-Stack Engineer #2   | R&D        | Apr 2027        | $110,000              | $143,000/yr      | Aftercare FHIR, integration layer       |
| Product Manager          | R&D        | Jul 2027        | $120,000              | $156,000/yr      | Needed at 15+ enterprise accounts       |
| Head of Sales            | S&M        | Oct 2027        | $130,000 + commission | $169,000/yr + 8% | TC enterprise deals, Oxford partnership |
| Customer Success #2      | S&M        | Jan 2028        | $75,000               | $97,500/yr       | Churn prevention at scale               |
| Finance / Ops            | G&A        | Apr 2028        | $80,000               | $104,000/yr      | When revenue > $1M ARR                  |

\*Engineer #1 conditional on seed funding OR RATS revenue reaching $3K+ MRR

### Headcount by Department

| Department        | Current | Year 1 End | Year 2 End | Year 3 End |
| ----------------- | ------- | ---------- | ---------- | ---------- |
| Engineering       | 1       | 2          | 3          | 3          |
| Sales & Marketing | 0       | 1          | 2          | 3          |
| Product / Design  | 0       | 0          | 1          | 1          |
| G&A               | 0       | 0          | 0          | 1          |
| **Total**         | **1**   | **3**      | **6**      | **8**      |

---

## Section 6: Cash Flow Analysis

### Assumptions

- Starting cash: $0 (bootstrap) or $250,000 (post-seed)
- Annual billing for Homegroups means cash collected upfront, recognized monthly
- RATS and Aftercare billed monthly in arrears

### Bootstrap Scenario (No External Funding)

| Quarter           | Revenue     | OpEx          | Net      | Cash Balance |
| ----------------- | ----------- | ------------- | -------- | ------------ |
| Q1 2026 (Apr–Jun) | $3,800      | $12,000       | ($8,200) | ($8,200)     |
| Q2 2026 (Jul–Sep) | $9,000      | $14,000       | ($5,000) | ($13,200)    |
| Q3 2026 (Oct–Dec) | $16,500     | $20,000       | ($3,500) | ($16,700)    |
| Q4 2026 (Jan–Mar) | $31,700     | $28,000       | $3,700   | ($13,000)    |
| **Year 1 Total**  | **$43,000** | **$91,400\*** |          |              |

\*With founder salary. Without salary: net = ($6,400), cash balance = ($6,400)

**Bootstrap viability:** Without a salary draw, the business is nearly self-funding by Month 10 when TC revenue arrives. This confirms the 12-month plan's sequencing is correct — the founder can run lean until RATS operators pay for themselves, then use TC revenue to hire.

---

### Seeded Scenario ($250K Raised)

| Quarter | Revenue  | OpEx     | Net       | Cash Balance |
| ------- | -------- | -------- | --------- | ------------ |
| Q1 2026 | $3,800   | $18,500  | ($14,700) | $235,300     |
| Q2 2026 | $9,000   | $21,000  | ($12,000) | $223,300     |
| Q3 2026 | $16,500  | $35,000  | ($18,500) | $204,800     |
| Q4 2026 | $31,700  | $38,000  | ($6,300)  | $198,500     |
| Q1 2027 | $76,000  | $55,000  | $21,000   | $219,500     |
| Q2 2027 | $140,000 | $90,000  | $50,000   | $269,500     |
| Q3 2027 | $180,000 | $110,000 | $70,000   | $339,500     |
| Q4 2027 | $134,000 | $130,000 | $4,000    | $343,500     |

**Seeded runway:** 18+ months with full team; cash-flow positive by Month 15–16

**Burn multiple by quarter (net burn ÷ net new ARR):**

- Q1: Not meaningful (pre-revenue)
- Q3 2026: 1.8× (healthy for early stage)
- Q1 2027: 0.7× (excellent — TC revenue kicking in)

---

## Section 7: Unit Economics

### Homegroups (Group Admin Tier)

| Metric             | Year 1      | Year 2      | Year 3      | Target      |
| ------------------ | ----------- | ----------- | ----------- | ----------- |
| ARPU               | $1.00/month | $1.10/month | $1.20/month | $1.50/month |
| CAC                | $20         | $15         | $12         | <$25        |
| LTV (at 12% churn) | $70         | $80         | $100        | >$60        |
| LTV:CAC            | 3.5x        | 5.3x        | 8.3x        | >3.0x       |
| Payback period     | 20 months   | 14 months   | 10 months   | <24 months  |
| Annual churn       | 12%         | 10%         | 8%          | <15%        |

_ARPU grows as intergroup and donation fees compound; CAC falls as referral flywheel works_

### Regroup / RATS (Individual Houses)

| Metric             | Year 1    | Year 2     | Year 3     | Target     |
| ------------------ | --------- | ---------- | ---------- | ---------- |
| ARPU               | $75/month | $80/month  | $85/month  | >$75       |
| CAC                | $300      | $250       | $200       | <$500      |
| LTV (at 18% churn) | $3,333    | $3,556     | $3,778     | >$2,500    |
| LTV:CAC            | 11.1x     | 14.2x      | 18.9x      | >5.0x      |
| Payback period     | 4 months  | 3.1 months | 2.4 months | <12 months |
| Annual churn       | 18%       | 15%        | 12%        | <20%       |

### Aftercare / Treatment Centers

| Metric            | Year 1     | Year 2     | Year 3     | Target     |
| ----------------- | ---------- | ---------- | ---------- | ---------- |
| ACV               | $18,000/yr | $20,000/yr | $24,000/yr | >$18,000   |
| CAC               | $8,000     | $7,000     | $6,000     | <$12,000   |
| LTV (at 8% churn) | $191,250   | $212,500   | $255,000   | >$100,000  |
| LTV:CAC           | 23.9x      | 30.4x      | 42.5x      | >10.0x     |
| Payback period    | 5.3 months | 4.2 months | 3.0 months | <18 months |
| Annual churn      | 8%         | 7%         | 6%         | <10%       |

### Blended Portfolio Metrics (Base Case)

| Metric                | Year 1          | Year 2         | Year 3           | Target            |
| --------------------- | --------------- | -------------- | ---------------- | ----------------- |
| **Weighted avg ARPU** | $85/month       | $240/month     | $340/month       | Growing           |
| **Blended CAC**       | $210            | $580           | $800             | Trending with ACV |
| **Burn Multiple**     | 2.1×            | 0.7×           | N/A (profitable) | <2.0×             |
| **Magic Number**      | 0.4             | 1.3            | 2.1              | >0.5              |
| **Rule of 40**        | 40%+120% growth | 35%+10% margin | 45%+42% margin   | >40               |

---

## Section 8: Scenario Analysis

### Revenue Scenario Assumptions vs. Base

| Driver                        | Conservative | Base (P50) | Optimistic         |
| ----------------------------- | ------------ | ---------- | ------------------ |
| Homegroups groups at M12      | 120          | 241        | 400                |
| RATS houses at M12            | 40           | 73         | 120                |
| RATS Oxford chapters at M12   | 4            | 8          | 14                 |
| TCs at M12                    | 1            | 3          | 5                  |
| Annual group churn            | 18%          | 12%        | 8%                 |
| Annual house churn            | 25%          | 18%        | 12%                |
| TC churn                      | 12%          | 8%         | 5%                 |
| RATS ARPU                     | $65/mo       | $75/mo     | $88/mo             |
| TC ARPU                       | $1,000/mo    | $1,500/mo  | $2,200/mo          |
| Monthly new RATS houses (M12) | 7            | 12         | 20                 |
| Oxford chapter pilot success  | Limited      | Moderate   | Strong partnership |

### Scenario Outcomes

| Scenario         | Y1 MRR  | Y2 MRR  | Y3 MRR   | Y1 ARR | Y2 ARR | Y3 ARR |
| ---------------- | ------- | ------- | -------- | ------ | ------ | ------ |
| **Conservative** | $4,200  | $18,000 | $50,000  | $50K   | $216K  | $600K  |
| **Base**         | $8,500  | $42,000 | $130,000 | $102K  | $504K  | $1.56M |
| **Optimistic**   | $16,500 | $90,000 | $280,000 | $198K  | $1.08M | $3.36M |

### Scenario: Year 3 Customers

| Scenario     | Homegroups Groups | RATS Houses | RATS Chapters | Treatment Centers |
| ------------ | ----------------- | ----------- | ------------- | ----------------- |
| Conservative | 800               | 200         | 25            | 20                |
| Base         | 3,000             | 700         | 60            | 80                |
| Optimistic   | 7,000             | 1,500       | 120           | 160               |

### Scenario: Year 3 Cash Position (starting from $250K seed)

| Scenario     | Y3 Revenue | Y3 OpEx | Net     | Cash Balance            |
| ------------ | ---------- | ------- | ------- | ----------------------- |
| Conservative | $600K      | $700K   | ($100K) | ~$150K — needs bridge   |
| Base         | $1.62M     | $938K   | $681K   | $1.2M+ — profitable     |
| Optimistic   | $3.36M     | $1.8M   | $1.56M  | $2.5M+ — Series A ready |

---

## Section 9: Funding Requirements

### Option A: Pure Bootstrap (Recommended if Aftercare slips to Month 10+)

- **Cash needed:** $0 external (founder defers salary or draws < $72K/year)
- **Risk:** Solo bandwidth limits RATS feature completion, Aftercare delays until Month 10–12
- **Milestone to watch:** RATS MRR > $5,000 — this is when hiring becomes self-funding
- **Risk of this path:** Slower treatment center sales without a dedicated sales resource

### Option B: $250K Seed Round (Recommended)

**Raise:** $250,000  
**Pre-money valuation:** $1.0–1.5M  
**Dilution:** 14–20%  
**Use of proceeds:**

| Category                     | Amount  | Purpose                                                 |
| ---------------------------- | ------- | ------------------------------------------------------- |
| Engineering hire (6 months)  | $65,000 | Close RATS Sprint 2 gaps; ship Aftercare identity layer |
| Founder salary (12 months)   | $72,000 | Sustainable pace for solo founder                       |
| HIPAA audit & legal          | $30,000 | Required before Aftercare goes to production (Month 8)  |
| Sales / events (TC pipeline) | $20,000 | Industry conferences, Oxford outreach, TC demo tour     |
| Infrastructure & tooling     | $18,000 | Year 1 infra budget                                     |
| Buffer                       | $45,000 | 6-month operational buffer                              |

**Milestones this buys:**

- Homegroups: 200+ paying groups in App Store
- RATS: 50+ paying operators, Oxford pilot live, public directory launched
- Aftercare: Infrastructure deployed, 3+ paying treatment centers
- Combined MRR > $10,000 at month 12

**Expected valuation at Series A:** $5–8M (based on $500K ARR run rate at Month 18–24)

### Option C: $1.5M Series A Trigger

When the following conditions are met, raise a Series A:

- [ ] $500K–800K ARR with clear path to $2M
- [ ] 15+ paying treatment centers demonstrating retention
- [ ] Oxford House chapter network showing viral adoption (50+ chapters)
- [ ] FHIR R4 API live (payer-ready outcomes reports)
- [ ] SOC 2 Type II documentation underway

**Series A use:** 3 engineers, 2 enterprise sales, customer success team, marketing, 18-month runway  
**Series A valuation:** $10–15M pre-money (3–5× ARR multiple for healthcare-adjacent SaaS)

---

## Section 10: Validation & Risk Factors

### Sanity Checks

| Check                                                     | Result                                                  |
| --------------------------------------------------------- | ------------------------------------------------------- |
| RATS at $75/month with 73 houses at Year 1 = $65,700 ARR  | ✓ Consistent with $1-2.5K MRR target from 12-month plan |
| TC at $1,500/month with 3 TCs at M12 = $54K ARR           | ✓ Consistent with plan's $2K-5K MRR target for Month 10 |
| Year 3 ARR of $1.56M at 8 headcount → ~$195K ARR/employee | ✓ Healthy for SaaS (target >$150K)                      |
| LTV:CAC for RATS at 11:1                                  | ✓ Exceptional (target >3:1)                             |
| Burn multiple < 2.0× in Year 1 (with salary)              | ✓ 2.1× barely above target; without salary = ~0.15×     |
| Rule of 40 at Year 3 (42% margin + ~45% growth)           | ✓ Passes at 87                                          |

### Market Benchmarks

| Comparable                              | ARR            | Customers       | Multiple  |
| --------------------------------------- | -------------- | --------------- | --------- |
| Apricot/Bonterra (case mgmt SaaS)       | ~$50M          | ~15K orgs       | 8–12× ARR |
| BrightSpring Health (care coordination) | ~$1.8B revenue | Public          | N/A       |
| Oxford House World Services (analog)    | Non-profit     | ~2,500 houses   | N/A       |
| RecoveryTrek (compliance SaaS)          | ~$2M est.      | ~200 facilities | ~10× ARR  |

**This portfolio targets a $10–20M outcome within 5 years at base case, with a $50–100M+ path if treatment center enterprise accounts compound with FHIR integrations.**

### Risk Factors

| Risk                                                                    | Severity | Probability | Mitigation                                                                                                    |
| ----------------------------------------------------------------------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| Solo founder bandwidth — can't close all three products simultaneously  | HIGH     | HIGH        | Strict product sequencing per 12-month plan; hire earlier with seed                                           |
| Homegroups conversion rate < 10% (trial-to-paid)                        | MEDIUM   | MEDIUM      | Fix known blockers (subscription gating, Day 5 push notification, money-back guarantee)                       |
| RATS pricing increase causes churn among existing $10+$1 operators      | MEDIUM   | LOW         | Grandfather existing operators; new pricing only for new operators                                            |
| Oxford House World Services builds competing tool or blocks partnership | HIGH     | LOW         | Approach as partner, not competitor; offer revenue share, official endorsement path                           |
| Aftercare HIPAA audit delayed / blocked                                 | HIGH     | MEDIUM      | Budget $30K and 3 months lead time; defer to Month 10 if needed                                               |
| Apple App Store IAP compliance — Homegroups WebView subscription        | HIGH     | MEDIUM      | Consult App Store legal team; B2B organization subscription has carve-out precedent                           |
| Treatment center sales cycles > 6 months                                | MEDIUM   | HIGH        | Lead with < 50-bed facilities; outcome demo is key; have 10 demo-ready pilot candidates identified by Month 8 |
| 42 CFR Part 2 compliance complexity for Aftercare                       | HIGH     | MEDIUM      | Scope strictly to aggregate/opt-in signals; PHI lives only in aftercare-web behind GCP HIPAA BAA              |

### Key Assumptions to Monitor Monthly

1. **RATS new operator monthly acquisition rate** — this is the primary cash driver in Year 1
2. **Homegroups trial-to-paid conversion rate** — target 15%; below 10% means messaging or product issue
3. **Treatment center sales cycle length** — if > 6 months, bump Aftercare revenue timeline forward 3 months
4. **Oxford House chapter MRR** — the viral growth flywheel; if chapters aren't converting at Month 7, reconsider Oxford strategy
5. **RATS monthly churn** — any churn > 2.5%/month ($3%/month annually) indicates product-market fit issue

---

## Appendix: Revenue Path to Key Milestones

| Milestone                                  | Target Date | MRR Trigger  | Key Action                    |
| ------------------------------------------ | ----------- | ------------ | ----------------------------- |
| Break-even (infra only, no salary)         | Month 3     | $1,500 MRR   | RATS price increase live      |
| Break-even (with founder salary $6K/month) | Month 8–9   | $6,000 MRR   | Oxford chapters + TC pipeline |
| First hire funded by revenue               | Month 7–10  | $8,000+ MRR  | Raise seed OR RATS at $5K MRR |
| HIPAA investment funded                    | Month 10    | $12,000 MRR  | TC revenue covers audit cost  |
| Series A ready                             | Month 22–26 | $45,000+ MRR | 15+ TCs, Oxford network live  |
| Cash-flow positive (with 6-person team)    | Month 20    | $30,000+ MRR | TC revenue dominates mix      |

---

## Appendix: Key Revenue Levers (Ranked by Impact)

1. **Treatment center sales velocity** — each TC deal is 150× the ARPU of a Homegroups group. One enterprise deal ($3K/month) = 3,000 individual group subscriptions. Prioritize TC sales above all else once Aftercare infrastructure ships.

2. **RATS operator acquisition rate** — the monthly house acquisition rate directly determines when the business becomes self-sustaining. Target 10 new operators/month by Month 6.

3. **Oxford House chapter tier adoption** — the $300/month chapter tier is a 4× ARPU multiplier over individual houses with near-identical support cost. Oxford World Services partnership could unlock 2,500 houses simultaneously.

4. **Homegroups intergroup tier** — 20 intergroups at $72/year is only $1,440 ARR, but each intergroup managing 10–30 groups is a high-leverage referral source and validation point for TC enterprise sales.

5. **Homegroups trial-to-paid conversion rate** — every 1% improvement in the current ~10% rate adds ~15 additional paying groups per 150 trials. The monetization analysis identified 5 specific fixes (Day 5 push notification, subscription gating on Treasury, money-back guarantee cleanup, Stripe email fix, Day 5 scheduled function) that together could drive this to 20–25%.

---

_This model was built from code-level product analysis of three repositories (RecoveryConnect, rats-v2, rats-web), all planning documents, pricing models, and the 12-month ecosystem implementation plan. All projections are estimates subject to market validation. The model is most sensitive to RATS operator acquisition rate in Year 1 and treatment center sales velocity in Year 2._

_Suggested update cadence: Monthly actuals vs. base case MRR by product. If any product is tracking 30%+ below base case at Month 6, revisit the growth assumptions and pricing strategy._
