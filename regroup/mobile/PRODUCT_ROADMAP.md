# RATS Product Roadmap - Path to $200K+ ARR

**Date:** February 5, 2026
**Vision:** Become the standard management platform for sober living homes and Oxford Houses across the United States
**Success Metric:** $200K+/year sustainable income to support full-time development

---

## Current State

**Active Users:**
- 5 sober living houses
- ~50-100 residents total (estimated)
- $100-150/month revenue

**Product Status:**
- ✅ Core features working (chores, attendance, reports)
- ✅ React Native app (iOS/Android)
- ✅ Firebase backend
- ✅ Redux Toolkit state management
- ✅ TypeScript migration 91% complete
- ❌ 0% test coverage (critical gap)
- ❌ No payment processing (most requested feature)

**Distribution:**
- No active marketing
- Word of mouth only
- Oxford House connections available (local/regional)

---

## Path to $200K+/Year

### Revenue Milestones

| Milestone | Houses | Monthly Revenue | Annual Revenue | Timeline |
|-----------|--------|-----------------|----------------|----------|
| **Current** | 5 | $150 | $1,800 | Today |
| **Beta Success** | 20 | $800 | $9,600 | Month 3 |
| **Oxford Pilot** | 50 | $2,500 | $30,000 | Month 6 |
| **Regional Growth** | 100 | $6,000 | $72,000 | Month 12 |
| **Multi-Region** | 200 | $15,000 | $180,000 | Month 18 |
| **National Presence** | 300+ | $20,000+ | $240,000+ | Month 24 |

*Plus payment processing revenue (2.5% of rent collected) = $50K-200K additional*

**Target: $200K+ total by Month 18-24**

---

## Roadmap Phases

### Phase 0: Quality Foundation (Weeks 1-4)
**Goal:** Establish testing infrastructure before adding critical features

**Why This First:**
- Payment processing handles real money (must be bulletproof)
- E2E tests catch regression bugs
- Gives confidence for Oxford House pilots
- Professional quality for scaling

**Deliverables:**
1. Detox E2E testing setup
2. Critical user flow tests:
   - Login/signup
   - Add resident
   - Create chore
   - Mark attendance
   - Generate report
3. CI/CD integration
4. Test coverage target: 30% critical paths

**Time Investment:** 15-20 hours over 4 weeks
**Success Criteria:** All critical flows have passing E2E tests

---

### Phase 1: Payment Processing MVP (Weeks 5-8)
**Goal:** Launch payment system beta with 1-2 houses

**Why This Next:**
- #1 user request
- Primary revenue driver
- Must have for Oxford House adoption
- Differentiator vs. spreadsheets

**Features:**
1. **Resident Payment Portal**
   - Credit card/ACH payment
   - View payment history
   - Automatic receipts
   - Payment reminders

2. **House Manager Dashboard**
   - See all resident payments
   - Mark cash/check payments
   - Export for accounting
   - Overdue notifications

3. **Backend Integration**
   - Stripe Connect for houses
   - 2.5% processing fee
   - Automatic disbursements
   - Financial reporting

**Time Investment:** 20-25 hours over 4 weeks
**Success Criteria:**
- 1 house using it for all rent collection
- $0 in failed payments
- All E2E tests passing

**Revenue Impact:**
- 1 house × $10K/month × 2.5% = $250/month = $3K/year
- Proves concept for scaling

---

### Phase 2: Quality & Security Hardening (Weeks 9-10)
**Goal:** Production-ready before Oxford House outreach

**Critical Fixes:**
1. ✅ Remove hardcoded Stripe secret (CRITICAL - Week 1)
2. Add error handling to all services
3. Implement offline mode (basics)
4. Add monitoring/alerting
5. Security audit (auth, data access)

**Time Investment:** 10-12 hours over 2 weeks
**Success Criteria:**
- No hardcoded secrets
- All services have error boundaries
- Can create chores offline
- Basic monitoring in place

---

### Phase 3: Oxford House Pilot (Weeks 11-18)
**Goal:** Get 10-15 Oxford Houses using RATS

**Strategy:**
1. **Week 11-12: Preparation**
   - Create Oxford House-specific documentation
   - Build case study from beta testers
   - Set up pilot pricing ($0 first 3 months, then $20/month)
   - Create simple onboarding video

2. **Week 13-14: Local Outreach**
   - Contact local Oxford Houses via connections
   - Offer in-person onboarding
   - Goal: 3-5 houses committed

3. **Week 15-16: Regional Expansion**
   - Reach out to regional chapter
   - Offer group training/demo
   - Goal: 10-15 houses total

4. **Week 17-18: Feedback & Iteration**
   - Gather feedback from Oxford Houses
   - Fix high-priority issues
   - Build testimonials

**Time Investment:** 15-20 hours over 8 weeks
**Success Criteria:**
- 10+ Oxford Houses actively using RATS
- 80%+ satisfaction score
- 2-3 strong testimonials
- Payment processing adoption: 50%+

**Revenue Impact:**
- 15 houses × $20/month = $300/month
- + Payment processing = $1,500-3,000/month
- Total: ~$1,800-3,300/month = $22K-40K/year

---

### Phase 4: Feature Enhancement (Weeks 19-26)
**Goal:** Build features that drive adoption and retention

**Priority Features (from user research):**
1. **Enhanced Reporting** (2 weeks)
   - Compliance reports for state licensing
   - Resident progress tracking
   - House performance metrics
   - Revenue Impact: +$2K/month ($24K/year)

2. **Mobile Offline Support** (2 weeks)
   - Offline chore management
   - Sync when connection returns
   - Reduces friction for houses
   - Retention Impact: Reduces churn 20-30%

3. **Guest Portal** (2 weeks)
   - Residents can view their data
   - Self-service payment history
   - Reduces manager workload
   - Adoption Impact: Easier to onboard houses

4. **Multi-Property Management** (2 weeks)
   - For houses with multiple locations
   - Regional Oxford House chapters
   - Revenue Impact: $99-199/month tier

**Time Investment:** 25-30 hours over 8 weeks
**Success Criteria:**
- Each feature adopted by 50%+ of houses
- NPS score 8+ (Net Promoter Score)

---

### Phase 5: Regional Scaling (Months 7-12)
**Goal:** Expand to 100+ houses across multiple regions

**Growth Strategy:**
1. **Content Marketing** (ongoing)
   - Blog posts about sober living management
   - Case studies from successful houses
   - SEO for "sober living management software"

2. **Regional Oxford House Chapters** (targeted outreach)
   - Identify high-potential regions
   - Offer regional pricing ($299/month for 10-50 houses)
   - Partner with chapter leadership

3. **Traditional House Outreach**
   - Target states with licensing requirements
   - Position as compliance solution
   - Premium pricing ($49-99/month)

4. **Referral Program**
   - House managers refer other managers
   - Discount or credit for referrals
   - Build community

**Time Investment:** 10 hours/week ongoing
**Success Criteria:**
- 100+ houses using RATS
- 3+ regions with critical mass (10+ houses)
- 50%+ using payment processing
- NPS 8+

**Revenue Impact:**
- 100 houses × $25/month avg = $2,500/month
- + Payment processing (50 houses × $8K × 2.5%) = $10,000/month
- Total: $12,500/month = $150K/year

---

### Phase 6: National Expansion (Months 13-24)
**Goal:** Reach $200K+/year, become industry standard

**Strategies:**
1. **National Oxford House Partnership**
   - Approach national organization
   - Official partnership/endorsement
   - National conference presence

2. **State Licensing Partnerships**
   - Partner with state regulators
   - Become approved compliance tool
   - Massive credibility boost

3. **Platform Features**
   - API for third-party integrations
   - Marketplace for house supplies/services
   - Additional revenue streams

4. **Team Building**
   - Hire part-time support (when revenue > $100K/year)
   - Consider going full-time (when revenue > $200K/year)

**Success Criteria:**
- 300+ houses using RATS
- $200K+/year sustainable revenue
- Industry recognition
- You can go full-time if desired

---

## Detailed Phase 0: Testing Infrastructure

### Week 1: Detox Setup & Configuration

**Tasks:**
1. Install Detox dependencies
2. Configure iOS and Android test environments
3. Set up test runner (Jest)
4. Create first smoke test (app launches)

**Deliverables:**
```
/e2e
├── config.json         # Detox configuration
├── init.js            # Test initialization
├── setup.js           # Test setup
└── tests/
    └── app.test.js    # First smoke test
```

**Success:** `detox test` runs and passes

---

### Week 2: Critical Flow Tests

**User Flows to Test:**
1. **Authentication Flow**
   - Login with email/password
   - Signup new user
   - Logout
   - Forgot password

2. **House Manager Core Flows**
   - Add new resident
   - Create chore assignment
   - Mark attendance
   - View house dashboard

**Deliverables:**
```
/e2e/tests/
├── auth.test.js
├── residents.test.js
├── chores.test.js
└── attendance.test.js
```

**Success:** 15-20 test scenarios passing

---

### Week 3: Payment Flow Tests (Foundation)

**Prepare for payment testing:**
1. Mock payment gateway responses
2. Test payment UI flows (no real money)
3. Verify error handling
4. Test receipt generation

**Deliverables:**
```
/e2e/tests/
└── payments.test.js
```

**Success:** Payment flow tests ready for Phase 1

---

### Week 4: CI/CD Integration

**Tasks:**
1. Set up GitHub Actions workflow
2. Run tests on every PR
3. Block merges if tests fail
4. Generate test coverage reports

**Deliverables:**
```
.github/workflows/
└── e2e-tests.yml
```

**Success:** Automated testing on every commit

---

## Resource Requirements

### Time Investment by Phase

| Phase | Duration | Hours/Week | Total Hours | When |
|-------|----------|------------|-------------|------|
| Phase 0: Testing | 4 weeks | 4-5 hrs | 16-20 hrs | Now |
| Phase 1: Payments | 4 weeks | 5-6 hrs | 20-24 hrs | Weeks 5-8 |
| Phase 2: Hardening | 2 weeks | 5-6 hrs | 10-12 hrs | Weeks 9-10 |
| Phase 3: Oxford Pilot | 8 weeks | 2-3 hrs | 16-24 hrs | Weeks 11-18 |
| Phase 4: Features | 8 weeks | 3-4 hrs | 24-32 hrs | Weeks 19-26 |
| Phase 5: Scaling | 6 months | 2-3 hrs | 50-75 hrs | Months 7-12 |
| Phase 6: National | 12 months | 3-5 hrs | 150-250 hrs | Months 13-24 |

**Total Year 1:** ~150-200 hours (sustainable for spare-time project)
**Total Year 2:** ~150-250 hours

---

## Revenue Projections

### Conservative Scenario

| Timeline | Houses | Software Rev | Payment Rev | Total/Year | Cumulative |
|----------|--------|--------------|-------------|------------|------------|
| **Month 3** | 20 | $6K | $3K | $9K | $9K |
| **Month 6** | 50 | $15K | $15K | $30K | $39K |
| **Month 12** | 100 | $30K | $60K | $90K | $129K |
| **Month 18** | 200 | $60K | $150K | $210K | $339K |
| **Month 24** | 300 | $90K | $250K | $340K | $679K |

**Reaches $200K+/year threshold at Month 18** ✓

### Optimistic Scenario (Oxford House National Partnership)

| Timeline | Houses | Software Rev | Payment Rev | Total/Year |
|----------|--------|--------------|-------------|------------|
| **Month 12** | 200 | $60K | $120K | $180K |
| **Month 18** | 500 | $150K | $350K | $500K |
| **Month 24** | 1,000 | $300K | $750K | $1.05M |

**Could hit $200K by Month 12 with aggressive Oxford House adoption**

---

## Success Metrics & KPIs

### Phase 0-2 (Months 1-3)
- ✅ E2E test coverage: 30%+
- ✅ Payment processing live: 1-2 beta houses
- ✅ Zero security vulnerabilities
- ✅ Total houses: 15-20

### Phase 3 (Months 4-6)
- ✅ Oxford Houses: 10-15
- ✅ Payment adoption: 50%+
- ✅ NPS score: 8+
- ✅ MRR: $2,000+

### Phase 4-5 (Months 7-12)
- ✅ Total houses: 100+
- ✅ Regional coverage: 3+ regions
- ✅ MRR: $10,000+
- ✅ ARR: $120,000+

### Phase 6 (Months 13-24)
- ✅ Total houses: 300+
- ✅ ARR: $200,000+
- ✅ Industry recognition
- ✅ Decision point: Go full-time?

---

## Risk Mitigation

### Technical Risks

**Risk: Firebase costs spike**
- Mitigation: Monitor usage weekly
- Trigger: Move free tier houses to trial/paid at 80% of limits
- Estimated threshold: 75-100 houses

**Risk: Payment processing issues**
- Mitigation: Extensive E2E testing
- Mitigation: Beta test with 1-2 houses first
- Mitigation: Stripe has fraud protection

**Risk: App crashes in production**
- Mitigation: E2E tests catch regressions
- Mitigation: Monitoring/alerting (Sentry)
- Mitigation: Staged rollout of new features

### Business Risks

**Risk: Oxford Houses don't adopt**
- Mitigation: Pilot program with local houses first
- Mitigation: Gather feedback and iterate
- Alternative: Focus on traditional houses ($49/month)

**Risk: Competitors enter market**
- Mitigation: Move fast, build network effects
- Mitigation: Payment processing creates switching costs
- Mitigation: Focus on quality and support

**Risk: Can't scale support**
- Mitigation: Hire part-time support at $50K ARR
- Mitigation: Build comprehensive documentation
- Mitigation: Community support forums

---

## Decision Points

### Month 3 Decision: Continue or Pivot?
**Criteria for Continue:**
- 15+ houses using RATS
- 1+ house using payment processing successfully
- Positive user feedback
- Clear path to 50 houses

**If not meeting criteria:** Re-evaluate pricing, features, or target market

### Month 12 Decision: Accelerate or Maintain?
**Criteria for Accelerate (invest more time):**
- 80+ houses using RATS
- $80K+ ARR
- Strong Oxford House adoption
- Clear path to $200K

**If meeting criteria:** Consider going part-time on day job, hiring contractor

### Month 18 Decision: Go Full-Time?
**Criteria for Full-Time:**
- 200+ houses
- $200K+ ARR sustainable for 3+ months
- Growth trajectory strong
- Support needs require full-time attention

---

## Immediate Next Steps

### This Week:
1. ✅ Review and approve this roadmap
2. ✅ Fix hardcoded Stripe secret (30 minutes)
3. ✅ Set up Detox testing environment (2-3 hours)

### Next Week (Phase 0 Starts):
1. Create first E2E smoke test
2. Configure iOS/Android test builds
3. Set up test runner

### Week 2:
1. Build authentication flow tests
2. Build resident management tests
3. Build chore management tests

**Let's begin with Phase 0: Detox Setup**

Would you like me to help you set up Detox testing now? I have Detox tools available and can walk you through the setup process.

---

**This roadmap is your path from 5 houses to $200K+/year in 18-24 months while working in your spare time.**
