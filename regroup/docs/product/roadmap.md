# Regroup Feature Priority Roadmap

## Customer Acquisition & Retention Strategy

**Last Updated:** November 29, 2025  
**Focus:** Maximize house (customer) acquisition and retention through strategic feature development

---

## Executive Summary

This document prioritizes Regroup platform features based on their potential to acquire new customers (houses) and retain existing ones. **Oxford House support is identified as the #1 priority** due to the massive untapped market opportunity (~2,500 Oxford Houses nationwide vs. ~25,000 traditional sober living homes).

### Market Opportunity Analysis

**Oxford House Market:**

- **~2,500 Oxford Houses** in the United States
- **100% currently underserved** by technology solutions
- **Democratic governance model** creates strong viral adoption potential (houses talk to each other)
- **Lower price point** ($39-69/month) with high volume potential
- **Oxford House World Services** partnership could unlock entire network
- **High retention potential**: Once a house adopts and trains officers, switching cost is high

**Traditional House Market:**

- **~25,000 traditional sober living homes** in the United States
- **Fragmented competition** from property management and compliance tools
- **Higher ARPU** ($49-99/month) but more competitive
- **Multi-house operators** represent high-value customers

**Combined Opportunity:**

- **Total Addressable Market**: 27,500 houses
- **Current penetration**: <0.1% (assuming ~10-20 active houses)
- **Revenue potential at 10% penetration**: $1.5-2M ARR
- **Revenue potential at 25% penetration**: $4-5M ARR

---

## Priority Framework

Features are scored (1-10) across four dimensions:

1. **Customer Acquisition Impact**: Will this feature help us sign new houses?
2. **Customer Retention Impact**: Will this feature reduce churn?
3. **Development Effort**: How much work is required? (Lower score = more work)
4. **Market Differentiation**: Does this create competitive advantage?

**Priority Score** = (Acquisition × 2) + (Retention × 2) + Differentiation + (Effort × 0.5)

---

## TIER 1: CRITICAL - Oxford House Foundation (Q1 2025)

### 🚀 Priority Score: 95/100

These features unlock the Oxford House market and must be built first. Without them, we cannot serve 2,500 potential customers.

#### 1.1 House Model Selector & Basic Oxford Infrastructure

**What:** During onboarding, select "Traditional" or "Oxford House" model, which configures the appropriate feature set.

**Why Critical:**

- **Blocks all Oxford House adoption** - cannot acquire ANY Oxford Houses without this
- **Technical foundation** for model-specific features
- **Simple addition** with massive market unlock

**Customer Acquisition Impact:** 10/10 (unlocks entire Oxford market)  
**Customer Retention Impact:** 9/10 (proper fit = lower churn)  
**Development Effort:** 8/10 (relatively straightforward)  
**Market Differentiation:** 10/10 (first platform for Oxford Houses)

**Build Requirements:**

- House model field in database (`model: 'traditional' | 'oxford'`)
- Onboarding flow selector UI
- Conditional feature rendering based on model
- Model-specific terminology (EES vs. Rent, Officers vs. Admins)

**Success Metrics:**

- 50+ Oxford Houses onboarded in first 3 months
- <20% churn rate for Oxford Houses
- 80%+ of Oxford Houses complete onboarding

---

#### 1.2 Officer Role System (President, Treasurer, Secretary, Comptroller)

**What:** Four elected officer roles with term limits (~6 months), specific permissions, and term tracking.

**Why Critical:**

- **Core to Oxford House model** - houses cannot function without officers
- **Enables democratic governance** - officers facilitate, don't control
- **Term limits prevent "bossism"** - automatic rotation reminders

**Customer Acquisition Impact:** 10/10 (required for Oxford adoption)  
**Customer Retention Impact:** 9/10 (proper governance = stable house)  
**Development Effort:** 6/10 (moderate complexity - roles, permissions, term tracking)  
**Market Differentiation:** 10/10 (unique to recovery housing)

**Build Requirements:**

- Officer roles in Guest/User entity
- Term start/end date tracking
- Permissions system (Treasurer sees finances, Secretary manages minutes, etc.)
- Term expiration alerts (30/15/7 days)
- Role assignment UI
- Officer dashboard views

**Success Metrics:**

- 100% of Oxford Houses assign all four officers
- 90%+ of officers complete term without early removal
- Average officer transition time <7 days

---

#### 1.3 Equal Expense Share (EES) Tracking & Financial Transparency

**What:** Track EES amount (same for all residents), payment status, house expenses, and provide full financial transparency to all residents.

**Why Critical:**

- **Financial self-sufficiency** is a charter requirement
- **Transparency builds trust** - all residents see all finances
- **Treasurer's primary tool** for house management
- **Differentiation from traditional rent tracking**

**Customer Acquisition Impact:** 10/10 (required for Oxford adoption)  
**Customer Retention Impact:** 10/10 (financial stability = house stability)  
**Development Effort:** 7/10 (moderate - new payment model, reporting)  
**Market Differentiation:** 10/10 (unique financial model)

**Build Requirements:**

- EES amount field (house-level, not resident-level)
- EES payment tracking per resident
- House expense tracking (rent, utilities, bills)
- Automatic EES recalculation when residents move in/out
- Prorated EES for partial months
- Financial transparency dashboard (all residents can view)
- Treasurer collection workflow
- Overdue payment tracking

**Success Metrics:**

- 95%+ EES collection rate across Oxford Houses
- 100% financial transparency (all residents access)
- <5% of houses have consistent payment issues

---

#### 1.4 Business Meeting Management

**What:** Mandatory weekly business meeting scheduler, attendance tracking, agenda builder, and meeting minutes repository.

**Why Critical:**

- **Mandatory in Oxford model** - houses must meet weekly
- **Hub of democratic decision-making**
- **Officer accountability** - Treasurer reports, votes are held
- **Secretary's primary responsibility**

**Customer Acquisition Impact:** 9/10 (core Oxford feature)  
**Customer Retention Impact:** 10/10 (engaged houses = stable houses)  
**Development Effort:** 7/10 (moderate - scheduler, attendance, minutes)  
**Market Differentiation:** 10/10 (unique to Oxford Houses)

**Build Requirements:**

- Recurring weekly meeting scheduler
- Meeting attendance check-in (manual or QR code)
- Agenda builder (officers/residents can add items)
- Meeting minutes text editor (Secretary)
- Minutes repository (searchable, accessible to all)
- Financial report template (Treasurer)
- Attendance tracking (affects engagement score)
- Reminder notifications 24hrs/1hr before

**Success Metrics:**

- 90%+ average attendance at business meetings
- 95%+ of meetings have recorded minutes
- <10% of Oxford Houses skip business meetings

---

#### 1.5 Democratic Voting System

**What:** In-app voting for house decisions (new members, expulsions, rule changes), with configurable thresholds and vote history.

**Why Critical:**

- **Foundation of Oxford House democracy** - one person, one vote
- **New member acceptance** requires ~80% approval
- **Expulsion votes** for substance use or violations
- **Decision documentation** for transparency

**Customer Acquisition Impact:** 10/10 (essential Oxford feature)  
**Customer Retention Impact:** 9/10 (democratic process = member buy-in)  
**Development Effort:** 6/10 (moderate - voting UI, tallying, privacy)  
**Market Differentiation:** 10/10 (first democratic voting in sober living)

**Build Requirements:**

- Vote creation workflow (any resident or officer)
- Vote types (new member, expulsion, rule change, general)
- Configurable thresholds (simple majority, 80%, unanimous)
- Anonymous voting option (house decides)
- Real-time vote tallying
- Vote notification to all residents
- Vote history and archive
- Outcome recording

**Success Metrics:**

- 80%+ voting participation rate across Oxford Houses
- <5% disputed vote outcomes
- 100% of new members accepted via vote

---

#### 1.6 Charter Compliance Monitoring

**What:** Automated tracking of the three Oxford House charter conditions with alerts for violations.

**Why Critical:**

- **Charter compliance is non-negotiable** for Oxford House status
- **Prevents losing official recognition**
- **Early warning system** for house instability
- **Demonstrates value** to Oxford House World Services

**Customer Acquisition Impact:** 8/10 (credibility with Oxford network)  
**Customer Retention Impact:** 10/10 (prevents catastrophic failure)  
**Development Effort:** 8/10 (relatively simple - condition tracking)  
**Market Differentiation:** 10/10 (unique to Oxford Houses)

**Build Requirements:**

- Track three conditions:
  1. Democratic self-governance (voting participation rate)
  2. Financial self-sufficiency (EES collection rate, expense coverage)
  3. Zero tolerance (substance use incidents → expulsion votes)
- Charter compliance dashboard
- Alert system for violations (e.g., EES collection <90%, no business meeting in 7+ days)
- Compliance report for Oxford House chapters
- Charter number entry and verification

**Success Metrics:**

- 95%+ of Oxford Houses maintain charter compliance
- <2% houses lose Oxford House status due to charter violations
- 90%+ houses use compliance dashboard weekly

---

## TIER 2: HIGH PRIORITY - Payment Integration & Core Improvements (Q2 2025)

### 📈 Priority Score: 85/100

These features improve monetization, retention, and user experience for both Traditional and Oxford Houses.

#### 2.1 Stripe Payment Integration

**What:** Direct online payment processing for rent (Traditional) and EES (Oxford) via Stripe.

**Why High Priority:**

- **Reduces payment friction** - easier for residents to pay
- **Improves collection rates** - automated reminders, recurring billing
- **Revenue opportunity** - 2.9% + $0.30 per transaction
- **Competitive necessity** - expected feature in 2025

**Customer Acquisition Impact:** 7/10 (modern payment = professional)  
**Customer Retention Impact:** 9/10 (better cash flow = happier operators)  
**Development Effort:** 6/10 (well-documented Stripe API)  
**Market Differentiation:** 6/10 (competitors have this)

**Build Requirements:**

- Stripe account connection flow
- Payment method storage (cards, ACH)
- One-time and recurring payment setup
- Payment reminder automation
- Digital receipt generation
- Payment history dashboard
- Automatic late fee calculation (Traditional)
- EES payment allocation (Oxford)
- Treasurer payment collection workflow (Oxford)

**Success Metrics:**

- 60%+ of houses enable Stripe within 30 days
- 25%+ increase in on-time payment rate
- $50K+ monthly payment volume within 6 months

---

#### 2.2 Enhanced Reporting & Export

**What:** Improved reporting with PDF/CSV exports, scheduled delivery, and model-specific templates.

**Why High Priority:**

- **Critical for operators** managing multiple houses
- **Compliance documentation** for licensing/inspections
- **Oxford Houses need it** for chapter reporting
- **Low development cost** with high perceived value

**Customer Acquisition Impact:** 6/10 (nice-to-have in sales demos)  
**Customer Retention Impact:** 8/10 (operators depend on reports)  
**Development Effort:** 8/10 (templates + export libraries)  
**Market Differentiation:** 7/10 (good reports = professional)

**Build Requirements:**

- PDF export for all report types
- CSV export for raw data
- Email delivery scheduling
- Report templates:
  - Weekly compliance summary (Traditional)
  - Weekly engagement summary (Oxford)
  - Financial transparency report (Oxford)
  - Business meeting summary (Oxford)
  - Multi-house rollup (Super Admin)
- Customizable date ranges
- Logo/branding on reports

**Success Metrics:**

- 70%+ of houses generate reports weekly
- 40%+ of houses use scheduled email delivery
- 80%+ satisfaction rating for reporting

---

#### 2.3 Mobile App Performance & UX Improvements

**What:** Optimize React Native app performance, fix remaining Android issues, improve navigation.

**Why High Priority:**

- **Residents use mobile app daily** - poor UX = low engagement
- **Android issues still exist** - need polish
- **Competitive table stakes** - apps must be fast and intuitive
- **Affects all users** - broad impact

**Customer Acquisition Impact:** 6/10 (demo well = good impression)  
**Customer Retention Impact:** 8/10 (bad UX = churn)  
**Development Effort:** 7/10 (ongoing optimization)  
**Market Differentiation:** 5/10 (expected, not differentiating)

**Build Requirements:**

- Performance profiling and optimization
- Reduce bundle size
- Faster cold start time
- Smoother animations
- Better offline support
- Improved Android keyboard handling
- Simplified navigation flows
- Better error messages
- Loading state improvements

**Success Metrics:**

- <3 second cold start time
- <1% app crash rate
- 4+ star average app store rating
- 80%+ daily active user rate among residents

---

#### 2.4 Two-Factor Authentication (2FA)

**What:** Optional 2FA via SMS or authenticator app for enhanced security.

**Why High Priority:**

- **Security requirement** for enterprise customers
- **Compliance necessity** for HIPAA certification path
- **Peace of mind** for operators with sensitive data
- **Competitive necessity** in 2025

**Customer Acquisition Impact:** 7/10 (enterprise sales requirement)  
**Customer Retention Impact:** 6/10 (prevents security incidents)  
**Development Effort:** 7/10 (well-established libraries)  
**Market Differentiation:** 5/10 (table stakes)

**Build Requirements:**

- SMS-based 2FA
- Authenticator app support (Google Authenticator, Authy)
- Backup codes
- Remember device option
- Admin enforcement capability
- Recovery flow

**Success Metrics:**

- 30%+ of administrators enable 2FA
- 100% of enterprise customers require 2FA
- Zero security breaches related to authentication

---

## TIER 3: MEDIUM PRIORITY - Growth & Engagement Features (Q3 2025)

### 📊 Priority Score: 70/100

These features drive engagement, virality, and differentiation.

#### 3.1 Oxford House Network & Directory

**What:** Inter-house directory, resource sharing, and network effects between Oxford Houses.

**Why Medium Priority:**

- **Viral growth potential** - houses refer other houses
- **Oxford House World Services partnership** opportunity
- **Network effects** - more houses = more value
- **Unique differentiator** for Oxford market

**Customer Acquisition Impact:** 9/10 (viral growth engine)  
**Customer Retention Impact:** 7/10 (network lock-in)  
**Development Effort:** 6/10 (directory, permissions)  
**Market Differentiation:** 9/10 (unique to Oxford)

**Build Requirements:**

- Oxford House directory (opt-in visibility)
- Inter-house messaging
- Resource sharing (meeting minutes templates, bylaws, best practices)
- Referral system (house-to-house)
- Officer training library
- Oxford House World Services integration
- Regional chapter coordination
- Vacancy alerts to network

**Success Metrics:**

- 60%+ of Oxford Houses opt into directory
- 10+ referrals per month from existing Oxford Houses
- 50%+ of new Oxford Houses come from referrals

---

#### 3.2 Photo Verification for Activities

**What:** Optional photo verification (selfie + location) for meeting check-ins and chore completion.

**Why Medium Priority:**

- **Reduces fraud** - proves attendance/completion
- **Increases accountability** - residents know verification exists
- **Differentiator** in competitive sales
- **Requested feature** from traditional house operators

**Customer Acquisition Impact:** 7/10 (sales demo feature)  
**Customer Retention Impact:** 7/10 (operators want accountability)  
**Development Effort:** 6/10 (camera + storage)  
**Market Differentiation:** 8/10 (advanced verification)

**Build Requirements:**

- Camera integration
- Photo upload and storage
- Photo gallery for administrators
- Optional vs. required (house configures)
- Privacy controls
- Photo retention policy
- Verification status indicator

**Success Metrics:**

- 40%+ of traditional houses enable photo verification
- 20%+ reduction in disputed activities
- <1% false verification rate

---

#### 3.3 Advanced Analytics Dashboard

**What:** Model-specific analytics, trends, predictive insights, and benchmarking.

**Why Medium Priority:**

- **Data-driven decisions** - operators want insights
- **Competitive advantage** - most competitors lack this
- **Retention tool** - operators depend on insights
- **Oxford Houses benefit** from financial forecasting

**Customer Acquisition Impact:** 7/10 (impressive in demos)  
**Customer Retention Impact:** 8/10 (operators depend on data)  
**Development Effort:** 5/10 (complex analysis)  
**Market Differentiation:** 9/10 (AI/ML differentiation)

**Build Requirements:**

- Traditional analytics:
  - Compliance trends
  - Phase progression patterns
  - Risk scoring (relapse prediction)
  - Occupancy forecasting
- Oxford analytics:
  - Financial health scoring
  - Democratic engagement metrics
  - Officer effectiveness
  - EES collection trends
- Cross-house benchmarking
- Predictive alerts
- Custom report builder

**Success Metrics:**

- 50%+ of houses view analytics weekly
- 30%+ of houses act on predictive alerts
- 70%+ satisfaction rating for analytics

---

#### 3.4 Marketing & Lead Management Tools

**What:** House listing pages, applicant tracking, waitlist management, and referral tracking.

**Why Medium Priority:**

- **Keeps houses full** - addresses #1 operator pain point
- **Reduces churn** - houses stay because they need occupancy
- **Revenue opportunity** - can charge for premium listings
- **Competitive gap** - most competitors don't have this

**Customer Acquisition Impact:** 6/10 (some operators prioritize marketing)  
**Customer Retention Impact:** 9/10 (full houses = happy operators)  
**Development Effort:** 5/10 (complex CRM-like features)  
**Market Differentiation:** 8/10 (few competitors have this)

**Build Requirements:**

- Public house listing pages
- Online application forms
- Applicant pipeline (lead → interview → accepted)
- Automated responses
- Waitlist management
- Referral source tracking
- SEO optimization
- Review/testimonial collection
- **Oxford-specific**: Interview scheduling with vote workflow

**Success Metrics:**

- 40%+ of houses use listing pages
- 20%+ increase in qualified applicants
- 85%+ occupancy rate for houses using tools

---

## TIER 4: LOW PRIORITY - Advanced Features (Q4 2025+)

### 🔮 Priority Score: 55/100

These features are valuable but not critical for initial growth.

#### 4.1 Direct Messaging Enhancement

**What:** Improve existing group/direct chat with better UX, read receipts, file sharing.

**Why Low Priority:**

- **Basic messaging already exists**
- **Not a key differentiator**
- **Nice-to-have, not must-have**
- **Can wait until user base is larger**

**Customer Acquisition Impact:** 4/10  
**Customer Retention Impact:** 6/10  
**Development Effort:** 6/10  
**Market Differentiation:** 4/10

---

#### 4.2 Alumni Network & Aftercare

**What:** Alumni directory, mentorship matching, event management for former residents.

**Why Low Priority:**

- **Long-term value proposition**
- **Requires critical mass of alumni**
- **Differentiation potential**
- **Not a day-1 selling point**

**Customer Acquisition Impact:** 5/10  
**Customer Retention Impact:** 7/10  
**Development Effort:** 5/10  
**Market Differentiation:** 7/10

---

#### 4.3 Integrations (QuickBooks, Background Checks, etc.)

**What:** Third-party integrations for accounting, screening, and operations.

**Why Low Priority:**

- **Nice-to-have for large operators**
- **Complex to build and maintain**
- **Limited immediate impact**
- **Can use manual export/import for now**

**Customer Acquisition Impact:** 6/10 (enterprise requirement)  
**Customer Retention Impact:** 7/10 (operators want integrations)  
**Development Effort:** 4/10 (complex integration work)  
**Market Differentiation:** 6/10

---

#### 4.4 White-Label Options

**What:** Allow large operators to rebrand the platform.

**Why Low Priority:**

- **Only relevant for very large customers**
- **Requires architectural changes**
- **Can negotiate custom deals later**

**Customer Acquisition Impact:** 7/10 (for enterprise)  
**Customer Retention Impact:** 9/10 (enterprise lock-in)  
**Development Effort:** 3/10 (significant work)  
**Market Differentiation:** 8/10

---

## Recommended Development Sequence

### Phase 1: Oxford House Foundation (Months 1-3)

**Goal:** Launch Oxford House support and acquire first 50 Oxford Houses

1. House model selector (Week 1)
2. Officer role system (Weeks 2-3)
3. EES tracking & financial transparency (Weeks 4-5)
4. Business meeting management (Weeks 6-7)
5. Democratic voting system (Weeks 8-9)
6. Charter compliance monitoring (Weeks 10-11)
7. Bug fixes and polish (Week 12)

**Resources Needed:**

- 2 full-stack developers
- 1 designer
- 1 QA engineer

**Success Criteria:**

- 50+ Oxford Houses onboarded
- <20% churn rate
- 80%+ feature adoption

---

### Phase 2: Payment & Core Improvements (Months 4-6)

**Goal:** Improve monetization and retention for all house types

1. Stripe integration (Weeks 13-15)
2. Enhanced reporting (Weeks 16-17)
3. Mobile performance optimization (Weeks 18-20)
4. Two-factor authentication (Weeks 21-22)
5. Bug fixes and polish (Weeks 23-24)

**Resources Needed:**

- 2 full-stack developers
- 1 mobile specialist
- 1 QA engineer

**Success Criteria:**

- 60%+ houses using Stripe
- 25%+ payment collection improvement
- <1% app crash rate

---

### Phase 3: Growth & Engagement (Months 7-9)

**Goal:** Drive viral growth and deepen engagement

1. Oxford House network (Weeks 25-27)
2. Photo verification (Weeks 28-29)
3. Advanced analytics (Weeks 30-32)
4. Marketing tools (Weeks 33-35)
5. Bug fixes and polish (Week 36)

**Resources Needed:**

- 2 full-stack developers
- 1 data analyst
- 1 QA engineer

**Success Criteria:**

- 10+ referrals per month
- 50%+ houses use analytics
- 85%+ occupancy rates

---

## Key Success Metrics by Quarter

### Q1 2025 (Oxford House Launch)

- **Customer Acquisition:**

  - 50 Oxford Houses onboarded
  - 25 Traditional houses onboarded (ongoing growth)
  - Total: 75 new customers

- **Revenue:**

  - $3,000/month from Oxford Houses ($39 × 50 + $69 × 10)
  - $6,000/month from Traditional houses ($49 × 30 + $99 × 20)
  - Total MRR: $9,000
  - Annual run rate: $108,000

- **Retention:**
  - <20% churn rate
  - 80%+ feature adoption for Oxford Houses

### Q2 2025 (Payment & Improvements)

- **Customer Acquisition:**

  - 100 additional Oxford Houses (viral growth starting)
  - 50 additional Traditional houses
  - Total: 225 customers

- **Revenue:**

  - $8,000/month from Oxford Houses
  - $12,000/month from Traditional houses
  - Payment processing fees: $5,000/month
  - Total MRR: $25,000
  - Annual run rate: $300,000

- **Retention:**
  - <15% churn rate
  - 60%+ houses using Stripe

### Q3 2025 (Growth & Engagement)

- **Customer Acquisition:**

  - 150 additional Oxford Houses (network effects)
  - 75 additional Traditional houses
  - Total: 450 customers

- **Revenue:**

  - $18,000/month from Oxford Houses
  - $22,000/month from Traditional houses
  - Payment processing fees: $12,000/month
  - Total MRR: $52,000
  - Annual run rate: $624,000

- **Retention:**
  - <12% churn rate
  - 50%+ houses using analytics

### Q4 2025 (Scale & Optimize)

- **Customer Acquisition:**

  - 200 additional Oxford Houses
  - 100 additional Traditional houses
  - Total: 750 customers

- **Revenue:**

  - $30,000/month from Oxford Houses
  - $35,000/month from Traditional houses
  - Payment processing fees: $20,000/month
  - Total MRR: $85,000
  - Annual run rate: $1,020,000

- **Retention:**
  - <10% churn rate
  - Approaching 1M ARR

---

## Competitive Positioning

### Against Traditional Sober Living Software

**Our Advantages:**

- ✅ Dual model support (Traditional + Oxford)
- ✅ Mobile-first approach
- ✅ Recovery-specific features (phases, meetings, GPS)
- ✅ Affordable pricing
- ❌ Less mature than established players

**Strategy:** Focus on Oxford Houses (blue ocean) while gradually improving traditional features.

### Against Property Management Software

**Our Advantages:**

- ✅ Recovery-specific features
- ✅ Compliance tracking
- ✅ Meeting database integration
- ❌ Less robust property management

**Strategy:** Partner with property management tools, focus on recovery-specific value.

### Against Oxford House Manual Processes

**Our Advantages:**

- ✅ Digital-first (vs. paper)
- ✅ Financial transparency
- ✅ Democratic tools
- ✅ Network effects
- ❌ Learning curve for technology-resistant houses

**Strategy:** Position as "modernizing Oxford House" with free training and support.

---

## Risk Mitigation

### Risk: Oxford Houses resistant to technology

**Mitigation:**

- Offer free trials
- Provide extensive training
- Get endorsement from Oxford House World Services
- Showcase early adopter success stories
- Keep UI extremely simple

### Risk: Traditional house churn during Oxford House focus

**Mitigation:**

- Maintain parallel development tracks
- Quick wins for traditional houses (Stripe, reports)
- Communicate roadmap clearly
- Price incentives for long-term contracts

### Risk: Oxford House World Services competitive response

**Mitigation:**

- Partner, don't compete
- Offer to share revenue
- Position as complementary tool
- Get official certification/endorsement

### Risk: Development delays on Oxford House features

**Mitigation:**

- MVP approach (simplest version first)
- Phased rollout
- Beta program with 5-10 Oxford Houses
- Continuous feedback loops

---

## Conclusion

**Oxford House support is the #1 priority** for customer acquisition. The 2,500-house market is completely underserved, offers viral growth potential, and provides competitive differentiation.

**Recommended immediate action:**

1. Commit to Oxford House Phase 1 roadmap (Months 1-3)
2. Hire additional developer if needed
3. Begin outreach to first 10 beta Oxford Houses
4. Develop partnership strategy with Oxford House World Services

**Expected outcome by end of 2025:**

- 750 total customers (400 Oxford, 350 Traditional)
- $1M+ annual recurring revenue
- Clear market leadership in Oxford House software
- Foundation for Series A fundraising

**This roadmap balances immediate Oxford House opportunity with maintaining traditional house customer base while building toward long-term platform vision.**

---
*Last reviewed: 2026-05-24 | Audience: operator | Type: reference*
