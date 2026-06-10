# Regroup Feature Prioritization & Revenue/Growth Strategy

**Date:** February 5, 2026
**Purpose:** Strategic feature prioritization optimized for revenue generation and user growth
**Methodology:** Revenue Impact × User Acquisition × Implementation Feasibility

---

## Executive Summary

This document prioritizes Regroup platform features based on their potential to drive **revenue growth** and **user acquisition**, balanced against implementation effort. The analysis reveals that **Oxford House support** represents the single highest-impact opportunity, followed by **payment system completion** and **retention-focused features**.

### Top Strategic Priorities

| Rank | Feature | Revenue Impact | User Acquisition | Retention Impact | Implementation | Priority Score |
|------|---------|----------------|------------------|------------------|----------------|----------------|
| 1 | **Resident Payment System** | 🔥 CRITICAL | HIGH | VERY HIGH | Medium | **98/100** |
| 2 | **Oxford House Features** | VERY HIGH | 🔥 MASSIVE | HIGH | High | **95/100** |
| 3 | **Enhanced Reporting** | HIGH | MEDIUM | HIGH | Low | **82/100** |
| 4 | **2FA & Security** | MEDIUM | MEDIUM | VERY HIGH | Medium | **78/100** |
| 5 | **Photo Verification** | MEDIUM | HIGH | HIGH | Medium | **74/100** |

---

## Table of Contents

1. [Prioritization Framework](#1-prioritization-framework)
2. [Tier 1: Must-Have for Revenue (P0)](#2-tier-1-must-have-for-revenue-p0)
3. [Tier 2: High-Impact Growth Features (P1)](#3-tier-2-high-impact-growth-features-p1)
4. [Tier 3: Retention & Differentiation (P2)](#4-tier-3-retention--differentiation-p2)
5. [Tier 4: Future Expansion (P3)](#5-tier-4-future-expansion-p3)
6. [Market Opportunity Analysis](#6-market-opportunity-analysis)
7. [Revenue Optimization Strategies](#7-revenue-optimization-strategies)
8. [Implementation Roadmap by Revenue Impact](#8-implementation-roadmap-by-revenue-impact)
9. [Competitive Analysis & Positioning](#9-competitive-analysis--positioning)
10. [Feature-to-Revenue Mapping](#10-feature-to-revenue-mapping)

---

## 1. Prioritization Framework

### Scoring Methodology

Each feature is scored across five dimensions (0-10 scale):

1. **Revenue Impact** - Will this directly generate or enable revenue?
2. **User Acquisition** - Will this attract new customers?
3. **User Retention** - Will this reduce churn?
4. **Competitive Advantage** - Is this a differentiator?
5. **Implementation Feasibility** - How quickly can we ship? (Higher = easier)

**Priority Score Formula:**
```
Priority Score = (Revenue × 2.5) + (Acquisition × 2) + (Retention × 2) + (Competitive × 1.5) + (Feasibility × 1)
```

Revenue is weighted highest because it directly impacts business sustainability.

---

### Feature Categories

**P0 - Critical Blockers:**
- Blocks revenue generation
- Prevents customer acquisition
- Must fix before ANY sales
- Timeline: 0-4 weeks

**P1 - High Impact:**
- Significant revenue/growth impact
- Strong customer demand
- Competitive necessity
- Timeline: 4-12 weeks

**P2 - Medium Impact:**
- Nice-to-have improvements
- Gradual revenue increase
- Differentiation features
- Timeline: 3-6 months

**P3 - Low Impact:**
- Future roadmap
- Experimental features
- Long-term bets
- Timeline: 6-12+ months

---

## 2. Tier 1: Must-Have for Revenue (P0)

### Feature 1: Resident Payment Collection System

**Priority Score: 98/100**
- Revenue Impact: 10/10 🔥 DIRECTLY GENERATES REVENUE
- User Acquisition: 8/10 (operators NEED this)
- User Retention: 10/10 (operators won't churn with this)
- Competitive Advantage: 7/10 (table stakes)
- Implementation: 7/10 (4 weeks, well-documented Stripe API)

**Why P0:**
- **#1 operator need** according to market research
- **Blocks all revenue** from rent collection fees
- **Current gap:** Operator billing exists, resident payments missing
- **Immediate ROI:** 2.9% of all transactions processed

**Revenue Impact Analysis:**

Assuming 250 houses with average 12 residents paying $600/month rent:

```
Transaction Volume Projection:
250 houses × 12 residents × $600 rent = $1,800,000/month

Stripe Processing Revenue (2.9% + $0.30):
2.9% × $1,800,000 = $52,200/month
+ $0.30 × 3,000 transactions = $900/month
= $53,100/month = $637,200/year

With 60% adoption (conservative):
$637,200 × 0.60 = $382,320/year additional revenue
```

**This feature alone generates more revenue than subscriptions at current pricing!**

**What to Build:**

**Phase 1 (Week 1-2):**
- [ ] Payment method storage (cards/ACH) for residents
- [ ] One-time payment processing endpoint
- [ ] Payment UI in mobile app
- [ ] Digital receipt generation
- [ ] Payment history view

**Phase 2 (Week 3):**
- [ ] Recurring payment setup (auto-pay)
- [ ] Payment reminder system (automated)
- [ ] Late fee calculation (configurable)
- [ ] Payment allocation (rent vs. fees)

**Phase 3 (Week 4):**
- [ ] Administrator payment dashboard
- [ ] Payment analytics and reporting
- [ ] Failed payment retry logic
- [ ] Payment dispute handling

**Success Metrics:**
- 60%+ houses enable Stripe within 60 days
- 25%+ increase in on-time payment rates
- $50K+ monthly payment volume within 6 months
- <2% payment failure rate

---

### Feature 2: Enhanced Reporting with Export

**Priority Score: 82/100**
- Revenue Impact: 8/10 (enables upsell to Professional tier)
- User Acquisition: 6/10 (demo-friendly)
- User Retention: 9/10 (operators depend on reports)
- Competitive Advantage: 7/10 (good reports = professional)
- Implementation: 8/10 (1-2 weeks, PDF libraries available)

**Why P0:**
- **Required for Professional tier** justification ($129/mo vs $69/mo)
- **Compliance need** for licensing inspections
- **Sales demo essential** - operators expect this
- **Low effort, high value** - great ROI

**Revenue Impact:**

```
Tier Upsell Opportunity:
150 traditional houses

Current distribution (without reporting):
- 80 on Starter ($69/mo)
- 60 on Professional ($129/mo)
- 10 on Enterprise ($249/mo)
= $14,470/month

With enhanced reporting (upsell driver):
- 40 on Starter ($69/mo)
- 95 on Professional ($129/mo)
- 15 on Enterprise ($249/mo)
= $19,280/month

Incremental revenue: $4,810/month = $57,720/year
```

**What to Build:**

**Week 1:**
- [ ] PDF export for key reports (occupancy, compliance, financial)
- [ ] CSV export for raw data
- [ ] Email delivery scheduling (weekly/monthly)
- [ ] Custom date range selection

**Week 2:**
- [ ] Report templates for Traditional houses
- [ ] Report templates for Oxford Houses (future)
- [ ] Logo/branding customization
- [ ] Multi-house rollup reports (Enterprise tier)

**Success Metrics:**
- 70%+ houses generate reports weekly
- 40%+ use scheduled email delivery
- 80%+ satisfaction rating
- 30% conversion from Starter to Professional tier

---

## 3. Tier 2: High-Impact Growth Features (P1)

### Feature 3: Oxford House Support (Complete Platform)

**Priority Score: 95/100**
- Revenue Impact: 10/10 🔥 UNLOCKS 2,500 HOUSE MARKET
- User Acquisition: 10/10 🔥 ENTIRELY NEW CUSTOMER BASE
- User Retention: 9/10 (democratic model = high switching cost)
- Competitive Advantage: 10/10 (FIRST TO MARKET)
- Implementation: 6/10 (8-10 weeks, complex features)

**Why P1 (not P0):**
- Doesn't block current revenue (traditional houses)
- Requires significant development (8-10 weeks)
- Can launch traditional houses first, then add Oxford

**But this is THE biggest opportunity.**

**Market Opportunity:**

```
Oxford House Market Analysis:
- 2,500 Oxford Houses in United States
- 0% currently served by software
- 100% underserved market
- Democratic model = viral adoption potential

Revenue Projection (Conservative):

Year 1 (100 Oxford Houses):
- 70 on Standard ($49/mo) = $3,430/mo
- 28 on Plus ($89/mo) = $2,492/mo
- 2 on Network ($299/mo) = $598/mo
= $6,520/month = $78,240/year

Year 2 (400 Oxford Houses - network effects):
- 280 Standard × $49 = $13,720/mo
- 112 Plus × $89 = $9,968/mo
- 8 Network × $299 = $2,392/mo
= $26,080/month = $313,000/year

Year 3 (1,000 Oxford Houses - 40% market penetration):
- 700 Standard × $49 = $34,300/mo
- 280 Plus × $89 = $24,920/mo
- 20 Network × $299 = $5,980/mo
= $65,200/month = $782,400/year
```

**Plus payment processing on top of subscriptions:**
```
1,000 houses × 12 residents × $450 EES × 2.9% = $156,600/year additional
```

**Total Oxford House Opportunity: ~$1M ARR in Year 3**

**What to Build (Per FEATURE_PRIORITY_ROADMAP.md):**

**Phase 1: Foundation (Weeks 1-3)**
1. House model selector (Traditional vs Oxford)
2. Officer role system (President, Treasurer, Secretary, Comptroller)
3. Term tracking and rotation reminders

**Phase 2: Financial System (Weeks 4-5)**
4. Equal Expense Share (EES) tracking
5. Financial transparency dashboard (all residents see finances)
6. Automatic EES recalculation when residents move
7. Treasurer collection workflow

**Phase 3: Democratic Governance (Weeks 6-9)**
8. Business meeting management
   - Recurring weekly scheduler
   - Attendance tracking
   - Meeting minutes repository
   - Agenda builder
9. Democratic voting system
   - New member votes (80% threshold)
   - Expulsion votes
   - Rule change votes
   - Anonymous option

**Phase 4: Compliance (Weeks 10-11)**
10. Charter compliance monitoring
    - Three conditions tracking
    - Violation alerts
    - Compliance dashboard
11. Chapter reporting

**Phase 5: Polish (Week 12)**
12. Beta testing with 5-10 Oxford Houses
13. Bug fixes and UX improvements
14. Training materials

**Success Metrics:**
- 50+ Oxford Houses onboarded within 3 months
- <20% churn rate
- 90%+ voting participation rate
- 95%+ EES collection rate
- 80%+ houses maintain charter compliance

**Strategic Recommendation:**
Start Oxford House development immediately after payment system (P0) is complete. The market opportunity is too large to delay.

---

### Feature 4: Two-Factor Authentication (2FA)

**Priority Score: 78/100**
- Revenue Impact: 6/10 (enables enterprise sales)
- User Acquisition: 6/10 (enterprise requirement)
- User Retention: 10/10 🔥 (prevents security incidents)
- Competitive Advantage: 5/10 (table stakes in 2026)
- Implementation: 8/10 (2 weeks, well-established libraries)

**Why P1:**
- **Enterprise requirement** - large operators demand 2FA
- **Security incident prevention** - protects sensitive resident data
- **Compliance step toward HIPAA** - needed for healthcare sector
- **Quick implementation** - 2 weeks for full feature

**Revenue Impact:**

```
Enterprise Tier Enablement:
Without 2FA:
- 0 enterprise customers at $249/mo = $0

With 2FA:
- 10 enterprise customers (multi-house operators) at $249/mo = $2,490/mo
- Plus 10 multi-house discounts (10% off 3+ houses)
= ~$3,000/month = $36,000/year

Plus prevents churn from security concerns:
- 5% churn reduction on 100 houses at $85/mo average
= $4,250/year retained
```

**What to Build:**

**Week 1:**
- [ ] SMS-based 2FA (Twilio)
- [ ] Authenticator app support (Google Authenticator, Authy)
- [ ] Backup codes generation
- [ ] "Remember this device" option

**Week 2:**
- [ ] Admin enforcement toggle (require for all staff)
- [ ] Recovery flow (lost phone)
- [ ] 2FA setup wizard
- [ ] Audit logging for 2FA events

**Success Metrics:**
- 30%+ administrators enable 2FA
- 100% enterprise customers require 2FA
- Zero security breaches related to authentication

---

### Feature 5: Photo Verification for Activities

**Priority Score: 74/100**
- Revenue Impact: 6/10 (Professional/Enterprise tier differentiator)
- User Acquisition: 8/10 (impressive in demos)
- User Retention: 8/10 (operators want accountability)
- Competitive Advantage: 9/10 (advanced verification)
- Implementation: 7/10 (2 weeks, camera + storage)

**Why P1:**
- **Differentiation** in competitive market
- **Reduces fraud** - proves meeting attendance/chore completion
- **Requested feature** from operators in beta
- **Tier upgrade driver** - justifies Professional tier

**Revenue Impact:**

```
Tier Upsell:
20 Starter tier houses upgrade to Professional for photo verification
= 20 × ($129 - $69) = $1,200/month = $14,400/year

Plus reduces disputes:
- 25% reduction in disputed activities
- 10 hours/month saved per house × 100 houses × $50/hr value
= $50,000/year value delivered to customers (retention)
```

**What to Build:**

**Week 1:**
- [ ] Camera integration (React Native Camera)
- [ ] Photo upload to Firebase Storage
- [ ] Photo attachment to activities
- [ ] Optional vs. required (house configures)

**Week 2:**
- [ ] Photo gallery for administrators
- [ ] Photo verification status indicator
- [ ] Privacy controls (auto-delete after 30 days)
- [ ] Storage quota management

**Success Metrics:**
- 40%+ traditional houses enable photo verification
- 20%+ reduction in disputed activities
- <1% false verification rate

---

### Feature 6: Staff Notes & Shift Logs

**Priority Score: 72/100**
- Revenue Impact: 5/10 (mid-tier feature)
- User Acquisition: 6/10 (expected by larger operators)
- User Retention: 9/10 (operators depend on this)
- Competitive Advantage: 6/10 (some competitors have this)
- Implementation: 7/10 (2 weeks, structured data)

**Why P1:**
- **Core requirement** from CORE_REQUIREMENTS.md
- **Multi-house operators need this** for shift handoffs
- **Compliance documentation** for licensing
- **Reduces miscommunication** between staff

**Revenue Impact:**

```
Retention Improvement:
10% churn reduction on multi-house operators (20 houses at $150/mo avg)
= 20 × $150 × 0.10 = $300/month = $3,600/year retained

Plus enables enterprise sales:
5 new multi-house operators at $249/mo (need shift logs)
= $1,245/month = $14,940/year
```

**What to Build:**

**Week 1:**
- [ ] StaffNote entity (type, severity, resident, house, follow-up)
- [ ] Notes service (CRUD)
- [ ] Notes UI (per resident)
- [ ] Notes UI (per house)

**Week 2:**
- [ ] ShiftLog entity (start/end, incidents, handoff items)
- [ ] Shift handoff workflow
- [ ] Note search and filters
- [ ] Notification for urgent notes

**Success Metrics:**
- 80%+ multi-house operators use staff notes daily
- 50%+ single-house operators adopt
- 90%+ report improved communication

---

## 4. Tier 3: Retention & Differentiation (P2)

### Feature 7: Document Management (Basic)

**Priority Score: 68/100**
- Revenue Impact: 5/10 (compliance-focused houses pay more)
- User Acquisition: 5/10 (nice-to-have)
- User Retention: 8/10 (once adopted, sticky)
- Competitive Advantage: 7/10 (few competitors have this)
- Implementation: 6/10 (2 weeks for basic version)

**What to Build:**
- Document upload and storage
- Document viewer (PDF/images)
- Expiration tracking
- Per-resident document library

**Revenue Impact:** $12,000-18,000/year (modest tier upsell)

---

### Feature 8: Advanced Analytics Dashboard

**Priority Score: 65/100**
- Revenue Impact: 7/10 (Enterprise tier feature)
- User Acquisition: 7/10 (impressive in demos)
- User Retention: 8/10 (data-driven operators love this)
- Competitive Advantage: 9/10 (AI/ML differentiation)
- Implementation: 4/10 (3-4 weeks, complex)

**What to Build:**
- Compliance trend analysis
- Risk scoring (relapse prediction)
- Occupancy forecasting
- Cross-house benchmarking
- Financial health scoring (Oxford)

**Revenue Impact:** $30,000-50,000/year (Enterprise tier differentiation)

---

### Feature 9: Marketing & Lead Management

**Priority Score: 62/100**
- Revenue Impact: 6/10 (keeps houses full = retention)
- User Acquisition: 5/10 (niche appeal)
- User Retention: 9/10 🔥 (full houses = happy operators)
- Competitive Advantage: 8/10 (few have this)
- Implementation: 5/10 (3 weeks, CRM complexity)

**What to Build:**
- Public house listing pages
- Online application forms
- Applicant pipeline tracking
- Waitlist management
- Automated responses

**Revenue Impact:** $24,000-36,000/year (retention from full occupancy)

---

## 5. Tier 4: Future Expansion (P3)

### Feature 10: Oxford House Network & Directory

**Priority Score: 58/100**
- Revenue Impact: 8/10 (viral growth = compounding revenue)
- User Acquisition: 10/10 🔥 (network effects)
- User Retention: 8/10 (network lock-in)
- Competitive Advantage: 10/10 (unique to Oxford)
- Implementation: 6/10 (2-3 weeks)

**Why P3 (despite high scores):**
- Requires critical mass of Oxford Houses first
- Network effects only work at scale (100+ houses)
- Build after Oxford House core features

**Long-term Revenue Impact:** Massive - enables viral growth
- 50% of new Oxford Houses from referrals
- Accelerates path to 1,000 house adoption

---

### Feature 11: Alumni Network & Aftercare

**Priority Score: 52/100**
- Revenue Impact: 4/10 (long-term value prop)
- User Acquisition: 5/10 (differentiation for forward-thinking operators)
- User Retention: 7/10 (unique feature)
- Competitive Advantage: 8/10 (few have this)
- Implementation: 5/10 (3 weeks)

**Why P3:**
- Long-term value proposition (payoff in 2+ years)
- Requires alumni base to exist
- Not day-1 selling point

**Revenue Impact:** $8,000-15,000/year (modest, long-term)

---

### Feature 12: Third-Party Integrations

**Priority Score: 48/100**
- Revenue Impact: 6/10 (enterprise requirement)
- User Acquisition: 6/10 (large operators want this)
- User Retention: 7/10 (reduces churn for integrated houses)
- Competitive Advantage: 6/10 (expected)
- Implementation: 4/10 (ongoing maintenance burden)

**Potential Integrations:**
- QuickBooks (accounting)
- Background check services
- Drug testing labs
- Electronic health records

**Why P3:**
- Complex to build and maintain
- Each integration = separate project
- Can use manual export/import for now

**Revenue Impact:** $50,000+/year (enterprise sales enabler)

---

## 6. Market Opportunity Analysis

### Total Addressable Market (TAM)

**Traditional Sober Living:**
- ~25,000 houses in United States
- Average 12 residents per house
- Target: 10% penetration = 2,500 customers
- ARPU: $100/month
- **TAM: $30M ARR**

**Oxford Houses:**
- ~2,500 houses in United States
- Average 10-12 residents per house
- Target: 40% penetration = 1,000 customers
- ARPU: $60/month
- **TAM: $720K ARR**

**Combined TAM: $30.7M ARR**

---

### Competitive Landscape

**Direct Competitors:** NONE for comprehensive solution

**Partial Competitors:**
1. **Property Management Software** (Buildium, AppFolio)
   - Pricing: $50-400/month
   - Weakness: Not recovery-specific

2. **Excel/Manual Tracking**
   - Pricing: Free
   - Weakness: Time-consuming, error-prone

3. **Custom Databases**
   - Pricing: $0-50/month
   - Weakness: Limited features

**Regroup Competitive Advantage:**
- ✅ ONLY solution for Oxford Houses
- ✅ GPS meeting verification with 300K+ database
- ✅ Recovery-specific features (phases, sponsors, accountability)
- ✅ Mobile-first approach
- ✅ Affordable pricing ($49-129/mo)

---

### Market Timing

**Why Now:**
1. **COVID-19 aftermath** - Increased opioid crisis, more need for recovery housing
2. **Technology adoption** - Sober living operators becoming tech-savvy
3. **Compliance pressure** - States increasing licensing requirements
4. **Generation shift** - Younger operators expect software solutions
5. **Oxford House growth** - Network expanding, ready for modernization

---

## 7. Revenue Optimization Strategies

### Strategy 1: Payment Processing Revenue

**Opportunity:**
- 2.9% + $0.30 per transaction
- Low effort (Stripe integration)
- Passive income stream

**Optimization:**
```
Year 1 Projection:
250 houses × 60% adoption × 12 residents × $600 rent × 2.9%
= $313,200/year

Year 2 Projection (network effects):
500 houses × 70% adoption × 12 residents × $650 rent × 2.9%
= $788,550/year

Year 3 Projection:
1,000 houses × 75% adoption × 12 residents × $700 rent × 2.9%
= $1,827,000/year
```

**Action Items:**
- Make payment setup frictionless
- Offer payment discounts (vs. check/cash)
- Auto-enroll houses with opt-out
- Promote resident convenience

---

### Strategy 2: Tier-Based Upselling

**Current Tier Distribution (Estimated without optimization):**

Traditional Houses (150):
- Starter ($69): 53% = 80 houses = $5,520/mo
- Professional ($129): 40% = 60 houses = $7,740/mo
- Enterprise ($249): 7% = 10 houses = $2,490/mo
**Total: $15,750/mo = $189,000/year**

**Optimized Distribution (with feature differentiation):**

Traditional Houses (150):
- Starter ($69): 27% = 40 houses = $2,760/mo
- Professional ($129): 63% = 95 houses = $12,255/mo
- Enterprise ($249): 10% = 15 houses = $3,735/mo
**Total: $18,750/mo = $225,000/year**

**Incremental Revenue: $36,000/year** from optimization alone

**Upsell Drivers:**
- Starter → Professional: Enhanced reporting, photo verification, advanced analytics
- Professional → Enterprise: Multi-house management, white-label, dedicated support
- Feature gating: Reserve best features for higher tiers

---

### Strategy 3: Oxford House Network Effects

**Viral Coefficient Target: 0.5**
- Each Oxford House refers 0.5 new houses per month
- After 6 months of use (established houses become advocates)

**Growth Projection:**

```
Month 1: 10 houses (beta)
Month 3: 30 houses (word of mouth)
Month 6: 70 houses (chapter endorsements)
Month 12: 200 houses (viral growth)
Month 18: 400 houses (network effects)
Month 24: 700 houses (approaching saturation)
```

**Strategy:**
- Referral incentives ($50 credit per house referred)
- Chapter-level packages (regional discounts)
- Oxford House World Services partnership
- Inter-house directory (houses refer each other)

---

### Strategy 4: Annual Billing Discount

**Current:** Monthly billing only

**Proposed:** Annual prepay with 20% discount

**Impact:**
```
Example: Professional tier customer
Monthly: $129 × 12 = $1,548/year
Annual: $129 × 12 × 0.80 = $1,238/year (20% off)

Customer saves: $310/year
Regroup gains: Improved cash flow, reduced churn

With 30% annual adoption:
75 houses × $1,238 prepay = $92,850 cash upfront
vs. $11,610/mo monthly billing (13% churn risk each month)

Annual billing reduces churn from 15% to 5% (locked in)
= 10% × 75 houses × $129/mo × 12 = $11,610/year retained
```

**Net benefit:** Improved cash flow + reduced churn > discount cost

---

### Strategy 5: Add-On Revenue Streams

**Potential Add-Ons:**

1. **Additional Houses**
   - Base: 1 house included
   - Add-on: +$25/month per additional house (30% discount)
   - Target: Multi-house operators (50 customers × 3 extra houses)
   - Revenue: $3,750/month = $45,000/year

2. **Premium Support**
   - Base: Email support (48hr response)
   - Add-on: Phone/video support + 4hr response for $50/mo
   - Target: 20% of Professional/Enterprise customers (40 customers)
   - Revenue: $2,000/month = $24,000/year

3. **Custom Integrations**
   - Add-on: QuickBooks, drug testing, background checks
   - Price: $100-200/month per integration
   - Target: Enterprise customers (10 customers × 2 integrations avg)
   - Revenue: $3,000/month = $36,000/year

4. **Professional Services**
   - Training packages: $500 per house onboarding
   - Consulting: $200/hour for custom configuration
   - Target: 50 houses/year
   - Revenue: $25,000/year

**Total Add-On Opportunity: $130,000/year**

---

## 8. Implementation Roadmap by Revenue Impact

### Phase 1: Revenue Foundation (Months 1-2)

**Goal:** Unlock immediate revenue opportunities

| Week | Feature | Revenue Impact | Effort |
|------|---------|----------------|--------|
| 1-4 | Resident Payment System | $382K/year | High |
| 5-6 | Enhanced Reporting | $58K/year | Low |
| 7-8 | Tier Optimization (pricing page, upsell flows) | $36K/year | Low |

**Phase 1 Total Impact: $476K/year**
**Phase 1 Total Effort:** 8 weeks

---

### Phase 2: Market Expansion (Months 3-5)

**Goal:** Unlock Oxford House opportunity

| Week | Feature | Revenue Impact | Effort |
|------|---------|----------------|--------|
| 9-11 | Oxford House Foundation | $78K/year (Year 1) | High |
| 11 | House Model Selector | - | Low |
| 12-13 | Officer Roles | - | Medium |
| 14-15 | EES Tracking | - | Medium |
| 16-17 | Business Meetings | - | Medium |
| 18-19 | Democratic Voting | - | Medium |
| 20 | Charter Compliance | - | Low |

**Phase 2 Total Impact: $78K/year → $782K/year (Year 3)**
**Phase 2 Total Effort:** 12 weeks

---

### Phase 3: Retention & Differentiation (Months 6-8)

**Goal:** Reduce churn, increase ARPU

| Feature | Revenue Impact | Effort |
|---------|----------------|--------|
| 2FA & Security | $40K/year | 2 weeks |
| Photo Verification | $14K/year | 2 weeks |
| Staff Notes | $19K/year | 2 weeks |
| Document Management | $15K/year | 2 weeks |
| Advanced Analytics | $40K/year | 3 weeks |

**Phase 3 Total Impact: $128K/year**
**Phase 3 Total Effort:** 11 weeks

---

### Cumulative Revenue Impact

**Year 1:**
- Phase 1: $476K
- Phase 2: $78K (Oxford Year 1)
- Phase 3: $128K
- Add-ons: $65K (50% of potential)
**Total Year 1: $747K ARR**

**Year 2:**
- Subscription growth: $600K (2x customer base)
- Oxford House scale: $313K (Year 2 projection)
- Payment processing: $789K
- Add-ons: $130K
**Total Year 2: $1.83M ARR**

**Year 3:**
- Subscription growth: $1.2M (4x customer base)
- Oxford House scale: $782K
- Payment processing: $1.83M
- Add-ons: $260K (2x adoption)
**Total Year 3: $4.07M ARR**

**This roadmap creates a path to $4M ARR in 3 years.**

---

## 9. Competitive Analysis & Positioning

### Regroup vs. Traditional Property Management

**Buildium (Competitor):**
- Pricing: $50-160/month
- Strengths: Mature product, accounting features, large customer base
- Weaknesses: Not recovery-specific, no meeting tracking, no GPS verification

**Regroup Advantage:**
- Recovery-specific features (phases, meetings, sponsors)
- GPS meeting verification (unique)
- Lower price point ($49-129 vs $50-160)
- Purpose-built for sober living

**Positioning:** "Built for recovery housing, not generic rentals"

---

### Regroup vs. Manual Tracking (Excel)

**Excel (Status Quo):**
- Pricing: Free
- Strengths: Flexible, familiar
- Weaknesses: Time-consuming (10-20 hrs/month), error-prone, no GPS, no automation

**Regroup Advantage:**
- Saves 15+ hours/month (value: $750/month at $50/hr)
- Automated reminders and reports
- GPS meeting verification (fraud prevention)
- Real-time data for all staff

**Positioning:** "From 20 hours of spreadsheets to 20 seconds of insights"

**Value Equation:**
```
Regroup cost: $129/month
Time saved: 15 hours × $50/hr = $750/month
ROI: 481% ($750 / $129 - 1)
Payback period: 5 days
```

---

### Regroup vs. Oxford House Manual Processes

**Current Oxford House Tools:**
- Paper forms
- Manual expense tracking
- In-person voting
- Paper meeting minutes

**Regroup Advantage:**
- ✅ Digital-first (accessible anywhere)
- ✅ Financial transparency (all residents see finances)
- ✅ Democratic tools (voting, meetings)
- ✅ Charter compliance monitoring
- ✅ Network effects (houses help each other)

**Positioning:** "Modernizing Oxford House for the 21st century"

**Oxford House-specific value:**
- Treasurer saves 5+ hours/month on finances
- Secretary saves 3+ hours/month on minutes
- Better EES collection (+5% = $200-300/month per house)
- Reduced conflicts through transparency

---

## 10. Feature-to-Revenue Mapping

### Direct Revenue Features

| Feature | Mechanism | Annual Impact |
|---------|-----------|---------------|
| **Resident Payments** | Transaction fees (2.9%) | $382K (Year 1) |
| **Enhanced Reporting** | Tier upsell (Starter → Professional) | $58K |
| **Photo Verification** | Tier upsell | $14K |
| **Advanced Analytics** | Enterprise tier differentiation | $40K |
| **Document Management** | Compliance tier upsell | $15K |
| **Marketing Tools** | Retention (full houses) | $30K |
| **Add-Ons** | Additional houses, support, integrations | $130K |

**Total Direct Revenue Features: $669K/year**

---

### Indirect Revenue Features (Acquisition & Retention)

| Feature | Mechanism | Annual Impact |
|---------|-----------|---------------|
| **Oxford House Features** | New market (2,500 houses) | $78K → $782K (Years 1-3) |
| **2FA** | Enterprise sales enabler | $36K |
| **Staff Notes** | Multi-house operator retention | $19K |
| **GPS Meeting Verification** | Competitive differentiation (existing ✅) | Retention benefit |
| **Oxford House Network** | Viral growth (50% referral rate) | Accelerates acquisition |

**Total Indirect Revenue Features: $133K/year + massive acquisition impact**

---

### Feature ROI Analysis

| Feature | Development Cost | Year 1 Revenue | ROI | Payback |
|---------|------------------|----------------|-----|---------|
| **Resident Payments** | $60K (4 weeks) | $382K | 537% | 2 months |
| **Enhanced Reporting** | $15K (1 week) | $58K | 287% | 3 months |
| **Oxford House** | $120K (12 weeks) | $78K → $782K | 552% (Year 3) | 18 months |
| **Photo Verification** | $30K (2 weeks) | $14K | -53% (Year 1) | Loss (but strategic) |
| **2FA** | $30K (2 weeks) | $36K | 20% | 10 months |
| **Staff Notes** | $30K (2 weeks) | $19K | -37% (Year 1) | Loss (but retention) |

**Key Insights:**
1. **Payment system has incredible ROI** (537% Year 1) - PRIORITIZE
2. **Enhanced reporting is quick win** (287% ROI, 1 week effort)
3. **Oxford House is long-term bet** but massive payoff (Year 3)
4. **Retention features** (Photo, 2FA, Staff Notes) may not have immediate ROI but reduce churn

**Strategic Recommendation:**
Build revenue features first (Payments, Reporting), then retention features (2FA, Staff Notes), then expansion (Oxford House).

---

## Conclusion

### Top 5 Strategic Priorities (Final Ranking)

**1. Resident Payment System (P0) - BUILD IMMEDIATELY**
- Revenue: $382K/year
- Effort: 4 weeks
- ROI: 537%
- Status: CRITICAL BLOCKER

**2. Enhanced Reporting (P0) - BUILD IMMEDIATELY**
- Revenue: $58K/year
- Effort: 1-2 weeks
- ROI: 287%
- Status: Quick win

**3. Oxford House Features (P1) - BUILD AFTER P0**
- Revenue: $78K → $782K/year (Years 1-3)
- Effort: 12 weeks
- ROI: 552% (Year 3)
- Status: Biggest opportunity

**4. 2FA & Security (P1) - BUILD IN PARALLEL**
- Revenue: $36K/year (enterprise)
- Effort: 2 weeks
- ROI: 20% (plus security benefit)
- Status: Enterprise requirement

**5. Photo Verification (P2) - BUILD AFTER OXFORD**
- Revenue: $14K/year
- Effort: 2 weeks
- ROI: -53% (Year 1), but strategic differentiation
- Status: Competitive advantage

---

### Revenue Roadmap Summary

**Phase 1 (Months 1-2): Revenue Foundation**
- Payment system + Reporting
- Impact: $476K/year
- Effort: 8 weeks

**Phase 2 (Months 3-5): Market Expansion**
- Oxford House complete platform
- Impact: $78K → $782K/year
- Effort: 12 weeks

**Phase 3 (Months 6-8): Retention & ARPU**
- 2FA, Photo Verification, Staff Notes, Analytics
- Impact: $128K/year + churn reduction
- Effort: 11 weeks

**3-Year Revenue Projection:**
- Year 1: $747K ARR
- Year 2: $1.83M ARR
- Year 3: $4.07M ARR

**This feature prioritization creates a clear path to $4M ARR in 3 years by focusing on revenue-generating features first, then expanding to new markets, then optimizing retention and ARPU.**

---

**Document Version:** 1.0
**Next Review:** After Phase 1 completion (Month 2)
**Owner:** Product & Revenue Strategy Team
