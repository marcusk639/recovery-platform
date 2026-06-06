> ⚠️ **Legacy document.** Carried over from the standalone `regroup-functions` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `regroup` documentation.

# Regroup / RATS — 5-Year Financial Projections

**Date:** May 2026 | **Model type:** Bootstrapped SaaS | **Base currency:** USD

---

## Section 1: Executive Summary

| Metric                  | Year 1    | Year 2    | Year 3    | Year 5   |
| ----------------------- | --------- | --------- | --------- | -------- |
| ARR (end of period)     | $47K      | $163K     | $350K     | $727K    |
| Total customers         | 43        | 136       | 270       | 505      |
| Blended ARPU/mo         | $92       | $100      | $108      | $120     |
| Total revenue collected | $23K      | $114K     | $250K     | $595K    |
| Operating expenses      | $22K      | $84K      | $176K     | $355K    |
| Net income              | $1K       | $30K      | $74K      | $240K    |
| Founder salary          | $12K      | $48K      | $72K      | $96K     |
| Cash balance (est.)     | $47K      | $78K      | $152K     | $541K    |
| Monthly surplus         | Breakeven | +$2.5K/mo | +$6.2K/mo | +$20K/mo |

**Key finding:** Regroup reaches a sustainable founder market salary by Month 30 (Q10) entirely bootstrapped, with no external funding required. The business is cash-flow positive from Month 7 and operationally profitable (after founder salary) by Month 20.

---

## Section 2: Model Assumptions

### Revenue

| Assumption            | Value               | Rationale                                                                                                          |
| --------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Blended ARPU Year 1   | $92/month           | 70% small ($89), 20% medium ($149), 5% large ($229), 5% Oxford ($49)                                               |
| ARPU Year 3           | $108/month          | Mix shift toward medium tier as platform matures                                                                   |
| ARPU Year 5           | $120/month          | Continued mix shift + modest annual price increase                                                                 |
| Monthly churn         | 2.5%                | SMB SaaS benchmark; 26% annual. Lower than average due to operational switching costs once resident data is loaded |
| Avg customer lifetime | 40 months           | 1 / 2.5% churn                                                                                                     |
| Payment terms         | Monthly credit card | No annual prepay in Year 1; introduce annual option in Year 2                                                      |
| Expansion revenue     | ARPU growth proxy   | Tier upgrades modeled as blended ARPU increase over time                                                           |

### Costs

| Line                           | Year 1 | Year 2 | Year 3 |
| ------------------------------ | ------ | ------ | ------ |
| Gross margin target            | 89%    | 94%    | 94%    |
| COGS (hosting, Stripe, APIs)   | $2.5K  | $6.9K  | $15K   |
| Founder salary                 | $12K   | $48K   | $72K   |
| S&M spend                      | $1.2K  | $6K    | $12K   |
| G&A (accounting, legal, tools) | $4.8K  | $9.6K  | $14.4K |
| Contractors / first hire       | $0     | $12K   | $60K   |

### Acquisition

| Assumption                      | Year 1                         | Year 2                               | Year 3                                 |
| ------------------------------- | ------------------------------ | ------------------------------------ | -------------------------------------- |
| Gross new customers/month (avg) | 4                              | 10                                   | 15                                     |
| Primary acquisition channel     | Founder outreach, NARR network | Word-of-mouth, Oxford chapter pilots | Content, conferences, referral program |
| Cash CAC                        | ~$0                            | ~$50                                 | ~$67                                   |
| LTV:CAC                         | ~31x                           | ~68x                                 | ~55x                                   |

---

## Section 3: Revenue Projections — Year 1 Monthly Detail

_ARPU = $92/month. Churn = 2.5%/month (rounded to nearest whole customer)._

| Month | New Cust. | Churned | Total Cust. | MRR        | ARR Run Rate | MoM Growth |
| ----- | --------- | ------- | ----------- | ---------- | ------------ | ---------- |
| 1     | 2         | 0       | 2           | $184       | $2.2K        | —          |
| 2     | 2         | 0       | 4           | $368       | $4.4K        | +100%      |
| 3     | 3         | 0       | 7           | $644       | $7.7K        | +75%       |
| 4     | 3         | 0       | 10          | $920       | $11K         | +43%       |
| 5     | 4         | 0       | 14          | $1,288     | $15.5K       | +40%       |
| 6     | 4         | 0       | 18          | $1,656     | $19.9K       | +29%       |
| 7     | 5         | 0       | 23          | $2,116     | $25.4K       | +28%       |
| 8     | 5         | 1       | 27          | $2,484     | $29.8K       | +17%       |
| 9     | 5         | 1       | 31          | $2,852     | $34.2K       | +15%       |
| 10    | 5         | 1       | 35          | $3,220     | $38.6K       | +13%       |
| 11    | 5         | 1       | 39          | $3,588     | $43.1K       | +11%       |
| 12    | 5         | 1       | **43**      | **$3,956** | **$47.5K**   | +10%       |

**Year 1 total revenue collected:** $23,276
**Year 1 ending ARR:** $47.5K

---

## Section 4: Revenue Projections — Year 2 Quarterly Detail

_ARPU rises to $100/month as mix shifts toward medium tier._

| Quarter     | New Cust. | Churned | Total Cust. | Ending MRR  | Ending ARR | Rev Collected |
| ----------- | --------- | ------- | ----------- | ----------- | ---------- | ------------- |
| Q5 (M13-15) | 30        | 3       | 70          | $7,000      | $84K       | $18.8K        |
| Q6 (M16-18) | 30        | 5       | 95          | $9,500      | $114K      | $25.5K        |
| Q7 (M19-21) | 30        | 7       | 118         | $11,800     | $141.6K    | $32.1K        |
| Q8 (M22-24) | 30        | 12      | **136**     | **$13,600** | **$163K**  | $38.0K        |

**Year 2 total revenue collected:** ~$114K
**Year 2 ending ARR:** $163K

---

## Section 5: Annual Summary — Years 1–5

| Year | Customers | ARPU/mo | MRR (EOY) | ARR (EOY) | Rev Collected | Net Income |
| ---- | --------- | ------- | --------- | --------- | ------------- | ---------- |
| 1    | 43        | $92     | $3.96K    | $47.5K    | $23K          | $1K        |
| 2    | 136       | $100    | $13.6K    | $163K     | $114K         | $30K       |
| 3    | 270       | $108    | $29.2K    | $350K     | $250K         | $74K       |
| 4    | 390       | $115    | $44.9K    | $538K     | $440K         | $149K      |
| 5    | 505       | $120    | $60.6K    | $727K     | $595K         | $240K      |

---

## Section 6: Cost Breakdown

### Annual Operating Expenses

| Line Item                         | Year 1      | Year 2      | Year 3       | Year 4       | Year 5       |
| --------------------------------- | ----------- | ----------- | ------------ | ------------ | ------------ |
| **COGS**                          |             |             |              |              |              |
| Hosting / Firebase                | $1,200      | $2,400      | $5,400       | $9,600       | $14,400      |
| Stripe / payment processing       | $672        | $3,300      | $7,200       | $12,600      | $17,400      |
| Email / APIs                      | $600        | $1,200      | $2,400       | $3,600       | $4,800       |
| **COGS Subtotal**                 | **$2,472**  | **$6,900**  | **$15,000**  | **$25,800**  | **$36,600**  |
| **Gross Profit**                  | **$20.8K**  | **$107K**   | **$235K**    | **$414K**    | **$558K**    |
| **Gross Margin**                  | **89%**     | **94%**     | **94%**      | **94%**      | **94%**      |
|                                   |             |             |              |              |              |
| **Operating Expenses**            |             |             |              |              |              |
| Founder salary                    | $12,000     | $48,000     | $72,000      | $84,000      | $96,000      |
| First hire (CS/Sales, starts Q9)  | —           | —           | $60,000      | $65,000      | $70,000      |
| Second hire (Eng, starts Q13)     | —           | —           | —            | $90,000      | $95,000      |
| Contractors / freelance           | —           | $12,000     | $10,000      | $10,000      | $10,000      |
| S&M (outreach, content, events)   | $1,200      | $6,000      | $12,000      | $20,000      | $30,000      |
| G&A (accounting, legal, software) | $4,800      | $9,600      | $14,400      | $16,800      | $18,000      |
| **OpEx Subtotal**                 | **$18,000** | **$75,600** | **$168,400** | **$285,800** | **$319,000** |
|                                   |             |             |              |              |              |
| **Net Operating Income**          | **$2.8K**   | **$31.5K**  | **$66.6K**   | **$128K**    | **$239K**    |

---

## Section 7: Headcount Plan

| Role                            | Start          | Annual Salary      | Fully Loaded |
| ------------------------------- | -------------- | ------------------ | ------------ |
| Founder (eng / product / sales) | Month 1        | $72K (Year 3 rate) | $72K         |
| Customer Success / Sales        | Month 25 (Q9)  | $55K               | $60K         |
| Engineer (contract → FT)        | Month 37 (Q13) | $85K               | $93.5K       |
| Marketing / Growth              | Month 49 (Q17) | $65K               | $71.5K       |

**Team size:** 1 → 2 → 3 → 4 across Years 1–5 (bootstrapped pace).

---

## Section 8: Cash Flow Analysis

_Starting cash: $45K. No outside funding._

| Period      | Revenue  | Expenses | Net         | Cash Balance | Notes              |
| ----------- | -------- | -------- | ----------- | ------------ | ------------------ |
| Q1 (M1-3)   | $1,196   | $4,950   | -$3,754     | $41,246      | Drawing on savings |
| Q2 (M4-6)   | $3,864   | $5,250   | -$1,386     | $39,860      | Drawing on savings |
| Q3 (M7-9)   | $7,452   | $5,250   | **+$2,202** | $42,062      | Cash flow positive |
| Q4 (M10-12) | $10,764  | $5,250   | +$5,514     | $47,576      |                    |
| Y2 total    | $114,000 | $84,000  | +$30,000    | $77,576      |                    |
| Y3 total    | $250,000 | $176,000 | +$74,000    | $151,576     | First hire         |
| Y4 total    | $440,000 | $291,000 | +$149,000   | $300,576     | Second hire        |
| Y5 total    | $595,000 | $355,000 | +$240,000   | $540,576     |                    |

**Cash flow positive (operating): Month 7**
**Founder living wage ($4K+/month): Month 18**
**Founder market salary ($6K/month): Month 30**
**Minimum cash balance: ~$39K (Month 6)** — stays above zero throughout with no external funding.

---

## Section 9: Unit Economics

| Metric                         | Year 1 | Year 2 | Year 3 | SMB SaaS Benchmark |
| ------------------------------ | ------ | ------ | ------ | ------------------ |
| Blended ARPU/month             | $92    | $100   | $108   | —                  |
| Monthly churn                  | 2.5%   | 2.5%   | 2.5%   | <3%                |
| Avg customer lifetime          | 40 mo  | 40 mo  | 40 mo  | —                  |
| LTV (ARPU × GM% / churn)       | $3,128 | $3,400 | $3,672 | —                  |
| Cash CAC                       | ~$0    | ~$50   | ~$67   | —                  |
| LTV : CAC                      | ~31x   | ~68x   | ~55x   | >3x                |
| CAC payback period             | <2 mo  | <1 mo  | <1 mo  | <18 mo             |
| Gross margin                   | 89%    | 94%    | 94%    | 75–85%             |
| Operating margin (post salary) | 12%    | 27%    | 30%    | >20% at scale      |
| Rule of 40                     | 348%   | 178%   | 173%   | >40%               |

_Note: LTV:CAC will compress toward 5–10x once paid marketing channels are introduced — still excellent. Track carefully at that transition._

---

## Section 10: Three-Scenario Analysis

### Scenario Assumptions

| Driver                | Conservative  | Base        | Optimistic                        |
| --------------------- | ------------- | ----------- | --------------------------------- |
| Monthly new customers | -30% vs base  | As modeled  | +30% vs base                      |
| Monthly churn         | 4.0%          | 2.5%        | 1.5%                              |
| Blended ARPU          | -15% ($78/mo) | $92–$120/mo | +15% ($106–$138/mo)               |
| Cash CAC              | +25%          | Modeled     | -25%                              |
| Oxford House deal     | None          | None        | Year 2 chapter pilot (500 houses) |

### Year 3 Outcomes

| Scenario                   | ARR       | Customers     | Rev Collected | Net Income | Cash Balance |
| -------------------------- | --------- | ------------- | ------------- | ---------- | ------------ |
| Conservative               | $118K     | 126           | $83K          | -$34K      | $11K         |
| **Base**                   | **$350K** | **270**       | **$250K**     | **$74K**   | **$122K**    |
| Optimistic                 | $680K     | 490           | $490K         | $194K      | $280K        |
| Oxford Deal (base + pilot) | $644K     | 270 + 500 ch. | $460K         | $170K      | $260K        |

### Year 5 Outcomes

| Scenario             | ARR       | Customers | Rev Collected | Net Income | Cash Balance |
| -------------------- | --------- | --------- | ------------- | ---------- | ------------ |
| Conservative         | $240K     | 210       | $170K         | -$19K      | -$8K\*       |
| **Base**             | **$727K** | **505**   | **$595K**     | **$240K**  | **$341K**    |
| Optimistic           | $1.6M     | 970       | $1.3M         | $530K      | $860K        |
| Oxford National Deal | $2.1M+    | 1,000+    | $1.8M         | $900K      | $1.4M        |

_\*Conservative scenario requires a $10–20K bridge in Year 4 if churn stays elevated. Manageable._

**Conservative scenario risk:** 4% monthly churn means churning the full customer base every ~2 years. This is the primary scenario risk — if Month 3 retention of cohort 1 is below 85%, investigate immediately.

---

## Section 11: Oxford House Enterprise Upside

This is modeled separately as a single-deal swing factor.

**Deal structure assumption:**

- Pilot signed end of Year 2 with 1–2 Oxford House state chapters
- 500 homes at $49/month = $24,500 MRR = $294K ARR added instantly
- Expansion to national Oxford House Inc. (3,500 homes) in Year 3–4

| Event                              | Timing | MRR Added | ARR Impact |
| ---------------------------------- | ------ | --------- | ---------- |
| State chapter pilot (500 homes)    | End Y2 | +$24,500  | +$294K     |
| National Oxford Inc. (3,500 homes) | Mid Y4 | +$171,500 | +$2.06M    |

**With national Oxford deal:** Year 4 ARR jumps from $538K (base) to $2.6M — venture-scale inflection from a single relationship.

This single partnership opportunity is worth prioritizing above almost anything else on the Year 1–2 roadmap.

---

## Section 12: Path to Profitability

| Milestone                       | Month    | Customers Needed |
| ------------------------------- | -------- | ---------------- |
| First paying customer           | Month 1  | 1                |
| Cash flow positive              | Month 7  | 23               |
| $10K MRR                        | Month 24 | ~108             |
| Founder living wage ($48K/yr)   | Month 18 | ~80              |
| Founder market salary ($72K/yr) | Month 30 | ~130             |
| First hire funded from revenue  | Month 25 | ~120             |
| $100K ARR                       | Month 22 | ~108             |
| $350K ARR                       | Month 36 | ~270             |
| $700K ARR                       | Month 60 | ~505             |

---

## Section 13: Key Risks and Monitoring Metrics

| Risk                 | Indicator                     | Threshold                  | Response                        |
| -------------------- | ----------------------------- | -------------------------- | ------------------------------- |
| High early churn     | Month 3 retention of cohort 1 | <85% retained              | Customer interview blitz        |
| Slow acquisition     | Month 6 customer count        | <10 customers              | Adjust ICP, outreach script     |
| ARPU compression     | New customer avg ARPU         | <$80/mo                    | Tighten tier boundaries         |
| COGS surprise        | Firebase bill                 | >$500/mo at <100 customers | Architecture review             |
| Founder burnout      | Months with 0 new customers   | 2 consecutive months       | Add part-time sales help        |
| Cash cushion erosion | Cash balance                  | <$15K                      | Reduce founder draw temporarily |

---

## Companion Document

See [market-opportunity-analysis-2026-05-20.md](./market-opportunity-analysis-2026-05-20.md) for TAM/SAM/SOM analysis underpinning these projections.
