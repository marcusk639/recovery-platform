# Homegroups App - Pricing Model Recommendation

## Executive Summary

Based on analysis of the MVP specification, priorities documentation, and current implementation, this document recommends a **freemium model with a flat-rate group subscription** that balances accessibility for the recovery community with sustainable revenue.

---

## Recommended Pricing Model: **Freemium with Flat-Rate Premium**

### 🆓 **Free Tier (Individual Users)**

**Who:** All individual users (group members and non-members)

**Included Features:**
- Meeting search and directory access
- Offline meeting list
- Personal meeting schedule and favorites
- Join groups (via invite code)
- View group announcements (read-only)
- View group meeting schedules
- Basic member directory viewing (privacy-respecting)
- **Sobriety tracker** (personal milestone tracking)
- Basic group chat participation
- Direct messaging

**Rationale:**
- Removes barriers to entry and adoption
- Allows individuals to experience core value before group commitment
- Sobriety tracker drives daily engagement even without group subscription
- Builds user base and network effects

---

### 💎 **Premium Tier: Group Subscription**

**Price:** **$12/year per group** (effectively $1/month, billed annually)

**Who:** Groups (paid by group admin, shared cost among members optional)

**Additional Premium Features:**
- ✅ **Treasury Management System**
  - Income/expense tracking with categories
  - Balance and prudent reserve monitoring
  - **Generate printable monthly reports** for business meetings
  - **Seamless treasurer handoff** functionality
  
- ✅ **Advanced Meeting Management**
  - Exception handling (cancellations, special meetings)
  - Recurring meeting pattern editor
  - Temporary notices and special event scheduling
  - Meeting format templates
  
- ✅ **Admin-Only Announcement Posting**
  - Official group communications channel
  - Push notifications to members
  - Read receipt analytics (how many, not who)
  
- ✅ **Service Position Tracking & Rotation**
  - Assign members to positions with dates
  - Rotation reminders
  - Display open positions
  
- ✅ **Basic Business Meeting Support**
  - Schedule business meetings
  - Link treasury reports to meetings
  
- ✅ **Enhanced Group Features**
  - Full member management (add/remove members)
  - Role assignment (Secretary, Treasurer, GSR, etc.)
  - Group chat moderation tools

---

## Pricing Rationale

### Why $12/year ($1/month) Flat Rate?

1. **Accessibility**
   - Recovery community often has limited financial resources
   - Low barrier to adoption for small groups
   - Can be split among members (e.g., $12 ÷ 20 members = $0.60/year per person)

2. **Fairness**
   - Groups vary widely in size (5-100+ members)
   - Per-member pricing ($1/member) would unfairly penalize larger groups
   - Flat rate treats all groups equally

3. **Value Perception**
   - $12/year is less than one coffee per month
   - Treasury handoff feature alone saves hours of manual work
   - Clear operational value for groups

4. **Psychological Pricing**
   - Annual billing reduces friction (one payment per year)
   - $12 feels more accessible than monthly recurring charges
   - Groups can budget it as an annual expense (like literature)

5. **Sustainability**
   - At scale (1000 groups = $12,000/year revenue)
   - Covers infrastructure costs for MVP stage
   - Allows reinvestment for growth features

---

## Revenue Projections (Conservative Estimates)

| Groups | Annual Revenue | Monthly Recurring Equivalent |
|--------|----------------|------------------------------|
| 100    | $1,200         | $100/month                   |
| 500    | $6,000         | $500/month                   |
| 1,000  | $12,000        | $1,000/month                 |
| 5,000  | $60,000        | $5,000/month                 |

**Break-even Analysis:**
- Server/infrastructure costs (Firebase, Stripe): ~$500-1,500/month for 1,000-5,000 groups
- At 1,000+ groups, model becomes sustainable
- Revenue can fund moderation tools, support, and feature development

---

## Implementation Considerations

### Current Code Issue
The existing implementation uses **$1 per member** pricing (`quantity: memberCount` in subscription creation). This needs to be **changed to a flat rate**.

### Recommended Changes

1. **Update Stripe Pricing**
   - Create a single price ID for $12/year (or $1/month with annual billing)
   - Remove per-member quantity logic
   - Update `createGroupSubscription.ts` and related functions

2. **Billing Model Options**

   **Option A: Annual Subscription (Recommended)**
   - Charge $12/year upfront
   - Simplest for groups to budget
   - Reduces payment processing overhead
   
   **Option B: Monthly with Annual Discount**
   - $1/month ($12/year)
   - Annual payment option at $12 (same price, but upfront)
   - More flexibility but more complexity

3. **Free Trial Period**
   - **7-day free trial** (already implemented)
   - Allows groups to test premium features
   - No payment required during trial
   - Auto-cancels if not activated

4. **Payment Collection**
   - Group admin sets up payment method
   - Group pays as a unit (not individual contributions)
   - Groups can handle internal cost-sharing themselves
   - Consider future: optional member contribution tracking (informational only)

---

## Feature Gating Strategy

### Free vs. Premium Breakdown

| Feature | Free | Premium |
|---------|------|---------|
| Meeting search/directory | ✅ | ✅ |
| Join groups | ✅ | ✅ |
| View announcements | ✅ (read-only) | ✅ (read + post) |
| View meeting schedule | ✅ | ✅ |
| Edit meeting details | ❌ | ✅ |
| Treasury tracking | ❌ | ✅ |
| Treasury reports | ❌ | ✅ |
| Service positions | ❌ | ✅ |
| Member management | ❌ | ✅ |
| Group chat | ✅ (limited) | ✅ (full) |
| Direct messaging | ✅ | ✅ |
| Sobriety tracker | ✅ | ✅ |
| Business meetings | ❌ | ✅ |

### Upgrade Prompts
- Show subtle prompts for free groups when they try to access premium features
- Emphasize value: "Generate treasury reports with one click"
- No aggressive paywalls that block core free features

---

## Alternative Models Considered (Not Recommended)

### ❌ Per-Member Pricing ($1/member/month)
- **Problem:** Unfair to larger groups (50-member group = $50/month vs. 10-member = $10/month)
- **Problem:** Creates friction as groups grow
- **Problem:** Complicates billing when members join/leave

### ❌ Tiered Pricing (Basic/Pro/Enterprise)
- **Problem:** Adds complexity and decision fatigue
- **Problem:** Recovery groups don't need multiple tiers
- **Problem:** Harder to communicate value proposition

### ❌ Completely Free
- **Problem:** No revenue stream for sustainability
- **Problem:** Can't invest in moderation, support, or growth
- **Problem:** May not be taken seriously by groups (perceived value)

---

## Launch Strategy

### Phase 1: MVP Launch (First 6 months)
- **Promotional Pricing:** First 100 groups get lifetime $8/year (33% discount)
- Build trust and word-of-mouth
- Gather feedback on pricing perception

### Phase 2: Growth (Months 6-12)
- Standard $12/year pricing
- Highlight early adopter testimonials
- Focus on treasury handoff and report generation as key value drivers

### Phase 3: Maturity (Year 2+)
- Consider optional add-ons:
  - Multi-group management for individuals in multiple groups: $5/year
  - Advanced analytics: Included in premium
  - Custom branding: Future consideration

---

## Payment Implementation Checklist

- [ ] Create Stripe price ID for $12/year subscription
- [ ] Update `createGroupSubscription.ts` to use flat rate (remove member count)
- [ ] Update `createStripeCheckoutSession.ts` similarly
- [ ] Update UI to show "$12/year" not "$1/month per member"
- [ ] Add billing period display (annual)
- [ ] Update subscription info display
- [ ] Test upgrade flow from free to premium
- [ ] Test payment processing end-to-end
- [ ] Add clear pricing page/FAQ in app
- [ ] Update Terms of Service with pricing details

---

## Success Metrics

**Key Metrics to Track:**
1. **Conversion Rate:** % of free groups that upgrade to premium
2. **Trial Activation:** % of trials that convert to paid
3. **Churn Rate:** % of groups that cancel (target < 10%/year)
4. **Average Revenue Per Group (ARPG):** Should be ~$12/year
5. **Payment Success Rate:** % of payment attempts that succeed
6. **Upgrade Triggers:** Which features drive the most upgrades?

**Target Goals (Year 1):**
- 500+ active groups
- 15-20% conversion rate (free → premium)
- < 10% annual churn
- $6,000+ annual recurring revenue

---

## Conclusion

The **$12/year flat-rate premium model** provides the optimal balance of:
- ✅ Accessibility for the recovery community
- ✅ Fairness across group sizes
- ✅ Clear value proposition
- ✅ Sustainable revenue at scale
- ✅ Simplicity in implementation and communication

This pricing model aligns with the MVP goals, respects the community's financial constraints, and positions Homegroups for sustainable growth while delivering genuine value to 12-step recovery groups.

