# RecoveryConnect — Product Strategy & Launch Analysis
**Date:** 2026-02-23
**Analyst:** Product Strategy Advisor
**Codebase state:** V4 merged to main, all critical bugs resolved per code review, 428 tests passing

---

## Executive Summary

RecoveryConnect is a capable, over-built product attempting to launch without a validated acquisition strategy. The feature set is genuine and coherent — treasury management, meeting tools, group communication, and recovery utilities are all real needs. The problem is the product has been built as if 10,000 groups are already waiting for it. They aren't. The next 60 days must be spent finding 100 of them and learning what actually causes them to pay.

---

## Core Value Proposition

**The single clearest statement:**

> RecoveryConnect is the group admin tool for AA, NA, and Al-Anon homegroups — digitizing treasury, meetings, and member communication for the group secretary or treasurer who currently manages everything in a spreadsheet, group text, and a cash box.

**What this is NOT:**

- A recovery wellness app (that is a secondary hook for members, not a conversion driver)
- An intergroup management platform (that is a future enterprise story, not a launch story)
- A treatment center compliance tool (that is a different buyer entirely)

The admin is the buyer. The member is the beneficiary. These must never be conflated in marketing copy.

---

## Target User Profile

**Ideal First Customer — Be Specific:**

- **Name archetype:** "Pat, the Group Secretary"
- **Age range:** 35–65 (median: late 40s; digital-native enough for a smartphone app, recovery-tenured enough to hold a service position)
- **Role:** Group secretary, treasurer, or group service representative (GSR) for an AA, NA, or Al-Anon homegroup with 10–50 active members
- **Current tools:** Google Sheets or Excel for treasury, a WhatsApp or GroupMe thread for communication, handwritten meeting minutes, a physical cash envelope
- **Primary pain:** When the treasurer rotates out every 6–12 months, financial history disappears. There is no institutional memory.
- **Secondary pain:** Members call Pat to find out when the meeting is, because there is no single source of truth.
- **Willingness to pay:** $12/year is essentially free for a group that passes the basket at every meeting. The friction is not price — it is trust and time-to-value.
- **Geographic context:** Densely populated US metro areas first (NYC, LA, Chicago, Houston, Phoenix) where group density is highest and smartphone adoption is essentially universal.

---

## 1. The Single Feature That Makes a Group Admin Say "I Need This"

**Treasury Management.**

Not because it is the most impressive feature — it isn't. It is the most *painful* problem it solves. The 12-step tradition of rotating service positions means the group treasurer changes every 6–12 months. When they rotate out, the financial history of the group is in their personal spreadsheet, their phone, or their head. The next treasurer starts from zero.

RecoveryConnect's treasury module — income/expense tracking, prudent reserve configuration, year-end summary, treasurer handoff with documented history — solves a real operational failure that happens in virtually every group, every year, on a predictable schedule.

**The demo pitch is simple:** "Show an admin the handoff screen. Ask them how their last treasurer transition went."

Treasury is the conversion driver. Everything else is retention.

---

## 2. Launch MVP — Include vs. Exclude

### Include for Launch

These features represent the minimum set that delivers the core value proposition and justifies the $12/year price:

| Feature | Why It Must Be In |
|---|---|
| Treasury management (income, expenses, balance, reports) | Primary conversion driver; solves the #1 admin pain |
| Treasurer handoff workflow | Makes treasury stickier; solves the rotation problem specifically |
| Meeting schedule management | Admin can maintain accurate times/locations; baseline expected feature |
| Member directory + phone list | Replaces the group text chain; immediate utility |
| Announcements with push notifications | Replaces the WhatsApp thread; the clearest "aha moment" for members |
| Group chat | Communication hub for the group |
| Sobriety tracker (individual) | Member hook that drives app adoption in the group; increases admin's ability to invite members |
| Daily reflections (365-day library) | Daily engagement driver; reason to open the app every day |
| Onboarding: intent-based (seeker/member/admin) | Already exists and is well-designed; critical for conversion |
| Trial period (7 days free) | Already implemented; must remain |

### Exclude from Launch (Hide or De-Emphasize)

These features are built, but surfacing them at launch adds complexity and confusion without adding conversion:

| Feature | Disposition | Rationale |
|---|---|---|
| Officer Elections (GroupElectionsScreen) | HIDE from nav tile; accessible via URL | Cultural misfit: AA/NA groups don't run formal elections in most cases; will confuse non-governance-oriented groups; partially broken election transition was a critical bug |
| Bylaw Ratification / GroupBylawsScreen (voting aspect) | KEEP the viewing screen; HIDE voting/ratification workflow | Viewing guidelines is useful; formal ratification votes are a niche use case |
| Intergroup / District (IntergroupNavigator) | HIDDEN ALREADY in nav; keep hidden | No validated enterprise buyer; no viable Stripe webhook for intergroup billing |
| Facility / Treatment Center (FacilityDashboardScreen) | HIDDEN; keep hidden | Wrong buyer persona entirely |
| SSO (IntergroupSSOScreen) | HIDDEN; keep hidden | Enterprise-only; no buyers exist |
| Group Health Dashboard / Analytics (GroupHealthDashboardScreen, TreasuryTrends) | AVAILABLE but NOT promoted | Data is zero at launch; charts with no data destroy credibility |
| White-Label Branding | N/A — admin UI; keep hidden | Storage URL will 403; no enterprise buyer |
| Literature "disabled" tile | FIX: Remove the greyed-out Literature tile | A disabled tile with "opacity: 0.5" in the main nav grid is a trust-destroyer; either enable it or remove the tile |
| Referral Program | DEPRIORITIZE | Referral programs work at scale; with zero users, this is noise |
| Admin Removal Voting | HIDE | This is a governance edge case; surfacing it early will confuse normal users |
| Year-End Summary | KEEP but not promoted | Useful for admins; no reason to push it in the first 30 days |
| GSR Report tile | KEEP for admins | The GSR (Group Service Representative) report is genuine value for engaged admins |

---

## 3. Top 3 Reasons a Group Admin Will NOT Adopt This App

### Blocker 1: Trust and Anonymity Anxiety

**The reality:** AA and NA have an explicit principle of anonymity. Many members are deeply uncomfortable with any digital system that stores information about them — especially one linked to their recovery. The cultural default is distrust of technology in this context.

**Evidence from the codebase:** The onboarding already addresses this with a "Your Privacy Matters" slide listing "First names only," "Messages stay within your group," and "Your data is never sold." This is good instinct. It is not prominent enough.

**Mitigation:**
- The privacy slide in onboarding is the right content, but it needs to appear *before* the paywall, not be skippable.
- The app should use the word "Homegroup" not "Group" wherever possible — this is the language of the community.
- Testimonials from real group members (ideally GSRs or district officers) are worth more than any marketing copy.
- Consider explicit "We are not affiliated with AA World Services" language to pre-empt the "is this official?" question.

### Blocker 2: The Group Adoption Problem — the Admin Can't Force Members

**The reality:** A group admin can subscribe and use the treasury features alone. But the value of announcements, group chat, phone list, and milestones is zero unless members also download and use the app. The admin has no way to force this. Recovery groups explicitly operate on attraction, not promotion.

**Evidence from the codebase:** The invite functionality (InviteShareSheet, GroupInviteModal) exists. It is good. The problem is structural, not technical.

**Mitigation:**
- Frame the initial pitch around features the *admin alone* derives value from (treasury, meeting management) before pitching features that require member adoption.
- Build a "group adoption rate" metric that admins can see, showing how many members have joined — this creates a visible goal and allows admins to nudge members naturally.
- Consider a lightweight "web view" of the group schedule that non-app users can see via a link — this creates utility even for groups with zero app-using members and gives the admin something to share.
- The QR check-in feature (MeetingQRCodeScreen) is actually a clever adoption driver — members scan a QR code at the meeting to check in, which prompts them to download the app. This should be prominently featured in the admin value prop.

### Blocker 3: Payment Before Value — the Trial Conversion Funnel Is Still Broken

**The evidence:** The claim modal in `GroupOverviewScreen.tsx` line 1582 reads: *"A monthly subscription ($9.99/month) is required to manage this group."* The actual price is $12/year. This is a factual error in production UI. A user who sees $9.99/month (approximately $120/year) and then lands on a Stripe checkout showing $12/year will be confused or suspicious.

**Beyond the pricing bug:** The current flow asks for payment information before the admin has experienced meaningful value. Industry data consistently shows that payment conversion from trials is 15–30% when users have experienced a product, and under 5% when they have not.

**The trial optimization plan (2026-02-04-v1-trial-optimization.md) is in the codebase but the trial status infrastructure exists while the *content shown during trial* is unclear.** The admin needs to be guided through their first treasury entry, their first announcement, and their first member invite during the 7-day trial — not left to discover features on their own.

**Mitigation:**
- Fix the $9.99/month copy in GroupOverviewScreen immediately — it is a conversion-killing trust issue.
- Build a 3-step "Quick Win" checklist into the trial experience: (1) Add your first treasury transaction, (2) Post an announcement, (3) Invite one member. Completion of these three steps should be the trigger for the upgrade prompt, not the calendar.
- The TrialStatusBanner and SubscriptionUpgradeScreen infrastructure exists. Wire a completion-based nudge into it.

---

## 4. What Would Need to Be True for 100 Groups to Adopt in the First 90 Days

### The Math

100 groups at $12/year = $1,200 ARR. This is not a revenue milestone — it is a validation milestone. The goal of the first 90 days is to prove that *specific types of groups* adopt and retain the product.

### The Required Conditions

**Condition 1: A direct outreach channel to group secretaries and treasurers exists.**

The 100k pre-seeded group database is the single most valuable asset in this product. It is currently sitting unused as a Firestore collection. Converting it to an SEO/search discovery mechanism (groups can be found by name + city at homegroups-app.com) is the only free, scalable acquisition channel available.

**Zero paid acquisition** should be spent until organic adoption is validated. The 100k group database combined with search is the GTM moat — the question is whether anyone has built the web presence to make it discoverable.

**Condition 2: The trial-to-paid conversion funnel works end-to-end without human intervention.**

The existing Stripe integration needs to be tested by someone who has never seen the app, going through the full flow: onboarding → find group → claim group → trial → upgrade. One error in this flow stops all conversion. This test must happen before any outreach.

**Condition 3: The pricing is consistent across every surface.**

Currently: $12/year in CreateGroupScreen, $9.99/month in GroupOverviewScreen. Every pricing touchpoint must say the same thing before outreach begins.

**Condition 4: A feedback loop with early adopters is established from day one.**

Not surveys. Actual conversations. The first 20 groups that adopt should be personally contacted within their first week. The questions to ask: What feature did you use first? What was confusing? What's missing? This is the only source of truth about whether the product-market fit hypothesis is correct.

**Condition 5: Word-of-mouth is plausible within the community structure.**

AA/NA districts hold monthly intergroup meetings. A GSR who adopts RecoveryConnect for their home group and reports on it at district is the highest-leverage marketing event possible. Targeting GSRs (group service representatives) specifically — they are already in a service mindset and already attending meetings about group operations — is the right early adopter strategy.

**The 90-day target is achievable if and only if direct outreach to GSRs begins in week 1.** Waiting for organic discovery alone will not reach 100 groups in 90 days.

---

## 5. Mobile-First or Web Companion?

**Recommendation: Mobile-first at launch. Add a read-only web companion within 60 days of first 50 paying groups.**

**Why mobile-first is right for now:**
- The buyer (group admin) and the user (member) are both on mobile. AA/NA populations skew older but smartphone penetration is essentially universal.
- The codebase is a React Native app. A web app is not weeks of work — it is months. The opportunity cost is too high pre-traction.
- The trial optimization, Stripe checkout, and onboarding flows are all mobile-native and functional.

**Why a web companion becomes necessary:**
- The single most common request from group admins managing treasury will be: "Can I enter transactions on my laptop?"
- Meeting schedules need to be shareable as a web link for non-app users (addresses Blocker 2 above)
- Web presence is required for SEO discovery of the 100k pre-seeded groups

**The minimum viable web companion is:**
1. A public group page (homegroups-app.com/groups/{groupId}) showing meeting schedule and group info — shareable, no login required
2. A web treasury entry form for admins (authenticated) — reduces the "I have to use my phone" friction

Neither of these requires a full web app. Both can be built as lightweight Next.js pages hitting the existing Firebase backend. This is a 2-week project, not a 3-month one.

---

## 6. Feature Kill List — What to Hide/Remove for Launch

The following features should be hidden from the navigation UI before launch. They are built, they work (or have been fixed), but they add cognitive load and confuse the value proposition for a first-time admin.

| Feature | Current Status | Action | Reason |
|---|---|---|---|
| Intergroup / District tab | Already hidden from main nav | Keep hidden | No buyers; Stripe not wired for intergroup billing |
| Officer Elections tile | Visible in GroupOverview grid | HIDE tile | Cultural misfit for most groups; recently had critical bugs |
| Admin Removal Voting | Visible in GroupStackNavigator | HIDE; accessible to power users only | Edge case; confusing for new groups |
| White-Label Branding | Not surfaced in main nav | Keep hidden | Storage 403 issue; enterprise-only |
| Facility / Treatment Center | Not surfaced in main nav | Keep hidden | Wrong buyer persona |
| SSO | Not surfaced in main nav | Keep hidden | Enterprise-only; no buyers |
| Group Health Dashboard | Accessible from Admin Actions | KEEP but mark as "coming soon" or remove empty-state charts | Meaningful only with 90+ days of data |
| Treasury Trends | Accessible from admin area | KEEP but suppress when no historical data exists | Trend chart with 1 data point is meaningless |
| Literature tile (disabled) | Greyed out at 0.5 opacity in tile grid | REMOVE the tile entirely | Disabled features visible in the nav destroy trust |
| Referral Dashboard | Accessible from Admin Actions in GroupOverview | HIDE from admin actions section | Referrals work at scale; misleads new admins into thinking they need to recruit |
| Group Data Export | Accessible from Admin Actions | KEEP; useful for data portability | Trust builder for privacy-conscious admins |
| Scheduled Announcements | In plans (2026-02-22) but status unclear | Validate it works or do not surface | Scheduled features that fail silently destroy trust |

---

## 7. What the Onboarding Needs to Look Like

**The current onboarding is structurally sound but is optimized for conversion, not for understanding.**

The existing flow: Welcome slide → Privacy slide → Intent selection (seeker/member/admin) → [admin path] Value prop slide → Group search → Group preview → Auth → Payment

**What the admin path currently gets right:**
- Intent-based branching is correct — the seeker, member, and admin have different needs
- The admin value prop slide exists and is shown before payment
- Privacy is addressed early

**What needs to change:**

### Fix 1: The "Admin Value Prop" slide needs to lead with treasury, not a feature list.

The AdminValuePropSlide currently exists but its content is unknown without reading it. If it shows a bullet list of features, it is doing it wrong. The correct approach is a single concrete before/after statement:

> "Before: Your treasurer keeps financial records in a personal spreadsheet. When they rotate out, 12 months of records disappear. After: Your group's full financial history lives in the app, and the next treasurer picks up where the last one left off."

This is a story, not a feature list. It takes 10 seconds to read and 0 seconds to understand why this is valuable.

### Fix 2: Pricing must be consistent and displayed BEFORE payment.

The admin value prop slide should show the price ($12/year, first 7 days free). Not on the Stripe checkout page — the admin's mental model needs to be set *before* they see a payment form. Surprises at checkout kill conversions.

### Fix 3: The post-onboarding first session needs a guided checklist.

After an admin claims their group and subscribes (or enters trial), they land on GroupOverview and see a wall of 15+ navigation tiles. This is overwhelming. The first session needs a single focused prompt:

> "Get started: Add your first treasury entry to set your opening balance."

One action. Not a tutorial. Not a wizard. One prompt that delivers value in under 60 seconds.

### Fix 4: The member onboarding (non-admin path) needs a faster path to value.

The current member path: Welcome → Privacy → Intent → Group search → Group preview → Auth → App. This is fine. The problem is that after completing onboarding, a member who joins a group that has no admin yet sees an empty shell. The onboarding should set expectations: "Your group admin will add content here. You can explore recovery tools in your profile while you wait."

### Fix 5: The Seeker path works — protect it.

The seeker flow (find a meeting without creating an account) is genuinely good UX for a 12-step app. Non-members who are in the middle of finding a first meeting should not be blocked by a paywall or forced registration. This flow should be zero-friction. Meeting Finder tab is public. Keep it that way.

---

## Feature Priority Matrix

| Feature | User Value | Launch Necessity | V/N Rating | Decision |
|---|---|---|---|---|
| Treasury management | HIGH — solves documented pain | HIGH — primary conversion driver | H/H | LAUNCH |
| Treasurer handoff | HIGH — solves rotation problem | HIGH — makes treasury sticky | H/H | LAUNCH |
| Meeting schedule mgmt | HIGH — expected by admins | HIGH — baseline feature | H/H | LAUNCH |
| Announcements + push | HIGH — replaces WhatsApp | HIGH — drives member adoption | H/H | LAUNCH |
| Member directory / phone list | MEDIUM-HIGH | HIGH — immediate utility | M/H | LAUNCH |
| Group chat | MEDIUM | HIGH — communication hub | M/H | LAUNCH |
| Sobriety tracker (personal) | HIGH for members | MEDIUM — member hook | H/M | LAUNCH |
| Daily reflections (365) | MEDIUM-HIGH | MEDIUM — engagement | M/M | LAUNCH |
| QR check-in | MEDIUM-HIGH — clever adoption driver | MEDIUM | M/M | LAUNCH (promote more) |
| Secretary toolkit / minutes | MEDIUM — secretary-specific | LOW — niche role | M/L | KEEP accessible |
| Service positions tracker | MEDIUM | LOW — secondary to treasury | M/L | KEEP accessible |
| Business meetings | MEDIUM | LOW — power user feature | M/L | KEEP accessible |
| Milestones / celebrations | HIGH for members | MEDIUM — community glue | H/M | LAUNCH |
| Step tracker / sponsor tools | HIGH for members | LOW — personal feature | H/L | KEEP accessible |
| Group conscience voting | MEDIUM | LOW — niche use case | M/L | KEEP accessible |
| Officer elections | LOW — cultural misfit | LOW | L/L | HIDE |
| Analytics / health dashboard | LOW at launch (no data) | LOW | L/L | HIDE until 90 days of data |
| Intergroup / district | N/A — no buyer | NONE | N/N | FREEZE |
| SSO | N/A — no buyer | NONE | N/N | FREEZE |
| Facility compliance | N/A — wrong buyer | NONE | N/N | FREEZE |
| White-label branding | N/A — no buyer | NONE | N/N | FREEZE |
| Literature tile (disabled) | N/A — not functional | NONE | N/N | REMOVE from nav |

---

## Strategic Recommendation: The Next 60 Days

**One clear directive:**

> Stop building. Start selling. The product is good enough. The next constraint is not features — it is whether real group admins will pay $12/year for it. Answer that question in 60 days.

**Specifically:**

### Week 1–2: Fix the two trust-killers before any outreach
1. Fix the $9.99/month copy in GroupOverviewScreen.tsx line 1582 to read "$12/year" — this is a one-line fix with significant conversion impact
2. Remove or replace the greyed-out "Literature" tile in GroupOverviewScreen.tsx (opacity: 0.5, disabled: true) — dead UI in the main grid signals an unfinished product
3. Run the full claim-group-and-pay flow manually as a first-time user. Document every friction point.

### Week 2–4: Activate the GTM moat
4. Build the minimal public group page at homegroups-app.com/groups/{groupId} — this creates SEO surface area for the 100k pre-seeded groups and gives admins something to share with members
5. Identify 5–10 AA/NA district intergroup meetings happening in your metro area. Attend 2–3 of them. Introduce the app to GSRs in person. This is the highest-leverage distribution channel available.

### Week 4–8: Run a structured 30-group pilot
6. Target: 30 groups claiming and activating via trial. Source: direct outreach at intergroup meetings + word of mouth from first adopters.
7. Call every admin who activates within their first week. Ask three questions: What did you do first? What was confusing? What's missing?
8. Do not build anything new during this period. Fix only what blocks activation or causes churning trial users.

### Week 8–12: Evaluate and decide
9. With 30 groups in trial: How many converted to paid? What was the conversion rate? What was the reason for non-conversion?
10. If conversion rate > 30%: scale outreach, consider paid acquisition, and build the web treasury entry form
11. If conversion rate < 30%: the problem is in the onboarding or trial experience, not the feature set — do not build new features until trial conversion is fixed

### What NOT to do in the next 60 days
- Do not build intergroup features for a customer who does not yet exist
- Do not build analytics features when you have no historical data to analyze
- Do not spend engineering time on elections, bylaws ratification, or other governance edge cases
- Do not redesign the UI — the current UI is functional and acceptable for a pilot
- Do not run paid ads before you have validated trial-to-paid conversion organically

---

## Critical Pre-Launch Bug to Fix

**Pricing inconsistency — GroupOverviewScreen.tsx line 1582:**

```
// CURRENT (WRONG):
"A monthly subscription ($9.99/month) is required to manage this group."

// CORRECT:
"A subscription ($12/year) is required to manage this group. Your first 7 days are free."
```

This is the highest-impact single fix available before launch. A user who sees $9.99/month and then sees $12/year on the Stripe checkout will either abort or, worse, trust the product less before they have even used it.

File: `/Users/marcusklein/dev/RecoveryConnect/mobile/src/screens/homegroup/GroupOverviewScreen.tsx`
Line: 1582

---

*Report generated: 2026-02-23. Based on code review of main branch post-V4 merge, navigation architecture analysis, and UX flow analysis of GroupOverviewScreen.tsx, OnboardingScreen.tsx, and related files.*
