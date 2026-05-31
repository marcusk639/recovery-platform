# Product Strategy Assessment — RecoveryConnect / Homegroups

**Date:** 2026-02-23
**Reviewer:** Product Strategy Advisor
**Scope:** Full codebase scan + docs review (PRODUCT_REQUIREMENTS.md, ROADMAP.md, STRATEGIC_ANALYSIS.md, all implementation plans, screen inventory, callable functions, Redux slices)

---

## Executive Summary

RecoveryConnect is a well-built product solving a real, underserved problem. The core bet — purpose-built group management for 12-step communities — is sound. The privacy-first framing is correct. The $12/year price is defensible.

The problem is not the idea. The problem is execution velocity and scope discipline. The team has already built V4-level features before achieving meaningful V1 traction. The codebase contains governance systems, SSO integration, treatment center dashboards, election voting, bylaw ratification, and intergroup reporting — features that have zero validated user demand — while multiple V4 features contain critical bugs that would fail at runtime. The roadmap calls for 33+ more hours on V4 features that should not be touched until there are paying customers to validate that direction.

This is a classic pre-traction feature trap: building complexity to feel productive while the real work — acquiring and retaining the first 200 paying groups — remains unproven.

---

## 1. Is the Core Value Proposition Clearly Defined and Differentiated?

### What the Documents Say

The stated goal is "a privacy-first, group-centric mobile app that helps 12-step homegroups run smoothly." The STRATEGIC_ANALYSIS claims the differentiator is the combination of group-centric management, privacy-first design, and treasury management.

### What the Codebase Actually Reveals

The product has two entirely different value propositions that are not yet clearly separated in the UX or the strategy:

**Value Prop A — The Group Operations Tool**
Treasury management, announcements, service positions, meeting schedule management, treasurer handoff. This is a B2B-ish tool sold to group admins. The buyer is a trusted servant who cares about group operations. This is the subscription driver.

**Value Prop B — The Recovery Community App**
Sobriety tracker, daily reflections, gratitude journal, check-in streaks, step tracker, sponsor connections, milestones. This is a personal wellness and social app for individual members. The user is a person in recovery.

These two value propositions require different acquisition motions, different onboarding flows, different retention strategies, and different success metrics. The documents conflate them. The roadmap tries to serve both simultaneously, which is why the feature list has ballooned.

### The Real Differentiator

The genuine moat is the 100,000 pre-seeded groups. No competitor can replicate that data asset quickly. The meeting finder backed by real, nationwide group data gives members an immediate reason to open the app before any group has been claimed or subscribed. That is the acquisition wedge. The strategic documents mention it but do not treat it as the central competitive advantage it actually is.

### Verdict

The value proposition needs to be sharpened to: "Homegroups is the easiest way for a 12-step group secretary or treasurer to manage their group — and the best way for members to find and stay connected to their group." The personal recovery tools (gratitude journal, step tracker) are table stakes that reduce churn but should not lead the pitch.

---

## 2. Does the Roadmap Reflect the Right Priorities for Traction?

### What Has Been Built

According to the implementation plan README, as of 2026-02-23:
- MVP (v0): COMPLETE
- V1 (Admin Value): COMPLETE
- V2 (Retention): COMPLETE
- V3 (Growth): COMPLETE
- V4 (Platform): Plans written, code merged, code review filed as "NOT READY FOR PRODUCTION"

The V4 code review (`docs/plans/2026-02-23-v4-code-review.md`) identified 10 critical bugs, 13 important bugs, and several incomplete features — all in code that has already been merged to `main`.

### The Fundamental Problem

The roadmap assumes a linear progression from MVP to V4 where each phase is validated before building the next. In practice, the team has built through V4 before launching. The revenue model targets:

- MVP Launch: 50 groups, $600 ARR
- End of V1: 200 groups, $2,400 ARR
- End of V2: 500 groups, $6,000 ARR
- End of V3: 1,500 groups, $18,000 ARR
- End of V4: 5,000 groups, $60,000 ARR

But all four phases have been built before any of these milestones have been validated. The team is building to a hypothetical V4 customer (intergroup administrators, treatment centers, white-label enterprise clients) without having confirmed that V1 customers (basic homegroup admins) will pay $12/year.

### Priority Assessment

The roadmap is built on revenue-driven logic ("Conversion -> Retention -> Expansion") which is correct in principle. But the actual build sequence abandoned that logic. Critical V4 features like SSO, treatment center compliance exports, and intergroup dashboards have no validated buyer. Meanwhile, the V4 code review confirms that a security vulnerability (unauthenticated intergroup document creation that bypasses Stripe) already exists in `main`.

The right priorities for traction are not in the roadmap because traction requires customers, and the roadmap has no plan for getting the first 50 paying groups. The GTM_STRATEGY.md file referenced in the roadmap does not exist.

---

## 3. Features to Kill or Deprioritize

### KILL (or defer indefinitely — do not fix, do not maintain)

**Intergroup / District Accounts (V4.4.1)**
The enterprise pitch — intergroup admins managing 10-30 affiliated groups at $99-199/year — requires a sales motion that does not exist, a buyer persona that has not been validated, and organizational relationships with AA service structures that take years to build. There are also active critical bugs: the Stripe webhook handlers for intergroup subscriptions are not wired in (C8 in V4 code review), and unauthenticated users can create intergroup documents with active subscription status (C9). This feature is not just unvalidated — it is broken and has a security hole. Freeze it entirely until 500 paying homegroups exist.

**Treatment Center Integration (V4.4.2)**
The `FacilityDashboardScreen` and `exportFacilityComplianceReport` represent a completely different product and buyer (treatment centers with licensing and grant compliance requirements). This is not a homegroup feature. It is a healthcare-adjacent SaaS product that requires HIPAA consideration, a dedicated sales process, and regulatory expertise the team does not yet have. The PDF export is also broken (C10: produces `.txt` despite advertising PDF). Kill this feature set entirely until there is a validated treatment center customer willing to pay.

**SSO / Organization Sign-In (V4.4.5)**
The `IntergroupSSOScreen` implements email domain mapping for enterprise organizations. Zero individual homegroup admins will use this feature. It serves only the enterprise segment that has been killed above. Freeze.

**White-Label / Custom Branding (V4.4.3)**
Custom themes and logos for organizations. Again, enterprise-only. No individual group cares about white-labeling. The `submitBranding` and `uploadBrandingLogo` callable functions exist in the backend, and the `uploadBrandingLogo` function constructs a public Storage URL that will return 403 unless the bucket is explicitly made public (a bug that will surface when anyone actually tries to use this). Freeze.

**Group Conscience Voting + Bylaw Ratification (V4.1)**
The `GroupConscienceScreen`, `CreateConscienceVoteScreen`, `EditBylawsScreen`, and `GroupBylawsScreen` implement formal voting and bylaw management. These are real AA concepts but they represent the top 5% of groups that operate with that level of formality. The election voting transition is also broken at runtime (C1: direct client write blocked by Firestore rules). Before investing further in governance features, validate whether any actual groups request this. The risk of building it wrong — encoding specific governance procedures into software used by groups that follow their own traditions — is high.

**Officer Elections System (V4.1.2)**
`GroupElectionsScreen`, `ElectionDetailScreen`, `nominateForElection`, `castElectionVote`, `closeElection`, `openElectionVoting` — this is a substantial implementation of a contested leadership process. AA specifically discourages contested elections. The cultural fit is questionable. The feature is complex, has bugs, and serves a narrow use case. Deprioritize until there are active requests from paying groups.

**Intergroup Reports (V4.1.5)**
`IntergroupReportScreen`, `IntergroupReportHistoryScreen`, `generateIntergroupReport` — requires affiliation with an intergroup organization (which the kill of V4.4.1 removes anyway). Freeze.

**Attendance Analytics with Charts (V4.3)**
`AttendanceAnalyticsScreen` uses victory-native charting library to render attendance trends. The `getGroupHealthTimeSeries` function always returns zero for the engagement trend (C6: queries against `Timestamp` using integer milliseconds). Groups need to actually check in to meetings before this dashboard has any data to show. This is a retention feature for mature, active groups — not an acquisition feature. The bug should be fixed whenever it is reactivated, but do not prioritize this now.

**Sponsorship Analytics (V4.3)**
`SponsorshipAnalyticsScreen` with charts and metrics for sponsorship relationships. This requires a large, active group to have meaningful data. Deprioritize.

**Literature Library (V4.2)**
`LiteratureIndexScreen`, `LiteratureDetailScreen`, `contributeLiterature`, `saveLiteratureItem`, `bookmarkLiteratureForGroup` — this is a medium-effort feature with significant intellectual property risk (AA copyrights its literature). The `ContributeLiteratureScreen` was planned but not implemented despite the callable function being deployed. The moderation bypass bug exists (C: `bookmarkLiteratureForGroup` does not check `isApproved`). Deprioritize until the IP risk is assessed and paying groups request it.

**Daily Reflections (V4.2 / V2.0)**
`DailyReflectionScreen`, `seedDailyReflections` — the reflections library is only 151 of 365 entries (C3). Users on days 152-365 see null content. The seeding function is also non-idempotent (C4). Either complete the library or remove the feature from discovery surfaces. Do not leave it in a half-built state that produces empty screens for the majority of the year.

**Group Resource Library (V4.2)**
`GroupResourceLibraryScreen`, `AddGroupResourceScreen`, Firebase Storage rules for uploads were never created (important bug from V4 code review). Users can navigate to a screen that will fail silently when they try to upload files. Fix the storage rules before this feature is accessible.

### DEPRIORITIZE (build later, after validation)

**Step Tracker**
`StepTrackerScreen` with step progress, notes, and sponsor sharing. High personal value, but this is a member-side retention feature. It competes for attention with dedicated step work apps. Ship it, do not kill it, but do not build additional step work features until you know members are using this one.

**Gratitude Journal**
`GratitudeJournalScreen` — personal journaling feature. Low risk, low maintenance, low urgency. Leave it as is. Do not invest in AI-enhanced journaling or social sharing of journal entries.

**Group Health Dashboard**
`GroupHealthDashboardScreen` with victory-native charts — the engagement trend is always zero due to the sentAt bug. Fix the bug when this feature is otherwise ready to promote. Do not surface it prominently until there is actual data to display.

**Referral Program**
`ReferralDashboardScreen`, `generateReferralCode`, `getReferralStats`, `applyReferralCode` — referral programs are effective at scale, not at 50-200 groups. The K-factor target of >0.3 (V3) is ambitious for a community that values anonymity and is slow to adopt technology. Build the infrastructure (it exists), but do not invest marketing resources in it until you have 500 paying groups and real referral data.

---

## 4. What Is Missing From the Strategy

### No Go-to-Market Plan

The roadmap references `GTM_STRATEGY.md` in multiple places. That file does not exist. This is the single most important gap. The product is built. The question is how the first 50 groups discover, claim, and subscribe. The STRATEGIC_ANALYSIS has general recommendations (grassroots, content-led, service structure integration) but no specific tactics, owners, timelines, or success criteria.

The 100,000 pre-seeded groups are the GTM advantage that is being ignored. The product should have a group-claiming flow that is so simple and compelling that a treasurer who googles "how to manage our AA group treasury" ends up on the App Store in under three clicks. SEO for group names, meeting locations, and "AA group [city]" search terms is a free acquisition channel that is not mentioned anywhere.

### No Analytics or Instrumentation

The STRATEGIC_ANALYSIS recommends "privacy-respecting analytics (Plausible or similar)" as a post-launch priority. There is no mention of this being implemented. Without usage data, every feature prioritization decision is a guess. What percentage of group admins who claim a group during the trial actually use the treasury? What is the actual conversion funnel from install to trial to paid? The team is flying blind. Instrumentation is not a nice-to-have — it is the prerequisite for every future product decision.

### No User Research or Feedback Loop

The STRATEGIC_ANALYSIS mentions "gather testimonials and case studies" as a tactic. There is no mention of user interviews, NPS surveys, or any structured feedback process. The team has built through V4 without a single validated signal from a paying customer. This is the core risk.

### Pricing Is Probably Too Low

$12/year is less than a single cup of coffee per month. The stated rationale ("recovery community often has limited financial resources") applies to individual members, not to groups. A typical AA group collects $50-200 per meeting in the basket. $12/year is not a consideration — it will barely be noticed. The risk is not that groups won't pay $12. The risk is that the price is so low it signals that the product isn't serious. Consider testing $48/year ($4/month) or $99/year for groups with 10+ members. The pricing model document acknowledges this implicitly in the enterprise tier ($99-199/year for intergroups) but never surfaces the question for the core product.

### No Mechanism for Meeting Data Quality

The 100,000 pre-seeded groups are a competitive moat only if the meeting data is accurate. AA meeting schedules change constantly — meetings move, cancel, restart, change formats. There is no self-service mechanism for non-claiming groups to flag inaccurate data, and no outreach strategy to the AA groups that manage the source data (AA area websites, AAWS Meeting Guide). If members use the app to find meetings and show up to incorrect locations, that is a trust-destroying experience that will drive App Store reviews below the 4.0 threshold.

### No Deprecation or Feature Retirement Plan

With V4 already merged but broken, and V4 code review flagging 10 critical bugs, the codebase now contains production code paths that will fail silently or with security implications for real users. There is no documented plan for what is actually visible and accessible to users in the current build. The gap between what is built and what should be accessible to users needs to be addressed before launch.

---

## 5. Who Is the Real Target User and Does the Product Serve Them?

### The Three Users (in order of strategic importance)

**Primary: The Group Treasurer**
This is the person who will make the buy decision. They are responsible for the group's money, and they have a concrete, painful operational problem: tracking income and expenses, generating monthly reports for business meetings, and handing off records when their term ends. They attend AA regularly, hold a position of trust, and will have the phone number of the next 10 people who need this app if it solves their problem.

The product serves them well. The treasury management, treasurer handoff, and report generation features are the strongest in the codebase. The `TreasuryReportScreen` is 766 lines and clearly the most thought-through feature. This is the right target.

**Secondary: The Group Secretary**
Responsible for announcements, meeting records, and group communications. The `SecretaryToolkitScreen` and announcement features serve them. Service position reminders and the business meeting tools are directly relevant. This user also makes or influences the buy decision.

**Tertiary: The Regular Member**
Uses the app primarily to find meetings, receive announcements, and stay connected to the group. Has no buy authority. Drives the value prop for the treasurer and secretary ("if I use this app, my members get notified when meetings cancel"). The sobriety tracker, daily reflections, and personal features serve this user.

### Does the Product Serve the Primary User?

Yes, but the complexity of the app works against them. A group treasurer who claims their group during a 7-day trial needs to find the treasury features immediately. The `HomegroupMainScreen` and `GroupOverviewScreen` are 1,499 and 2,507 lines respectively, suggesting significant complexity. The GroupOverview screen loads announcements, meetings, members, milestones, sponsorships, pending reports, service positions, and subscription status simultaneously. This is a lot for a first-time user.

The onboarding value prop screen (`AdminValuePropScreen`) correctly leads with treasury, announcements, meetings, member directory, group chat, and admin controls. That ordering is right. The execution may bury the key feature under UI complexity.

### The Mismatch

The enterprise features (treatment center dashboards, SSO, intergroup compliance reports) serve a buyer who does not currently exist in the product. Building for them before the core user is retained is a strategic error.

---

## 6. Top Three Bets the Team Should Make Right Now

### Bet 1: Fix the V4 Critical Bugs Before Anything Else Ships

The V4 code review identified 10 critical bugs in code already merged to `main`. Two of them are security issues. The intergroup document creation vulnerability (C9) allows any authenticated user to grant themselves active intergroup admin status without paying. The `approveMeetingMinutes` function allows cross-group authorization bypass (C2). These are not cosmetic issues — they are trust-destroying vulnerabilities in a product serving a community that requires privacy and safety above all else.

The daily reflections library serving empty screens for 214 days of the year (C3) will produce App Store reviews like "app showed nothing for today's reflection." The treasury trends quarterly export (C7) will produce CSV files that contradict the charts. These bugs will destroy trust with exactly the early adopters the team needs most.

**Recommendation:** Before any new feature work, fix every critical bug in the V4 code review. Then assess which V4 feature surfaces should be hidden from users until they are stable. Do not launch with broken features accessible from the main navigation.

**Success criterion:** Every callable function returns correct results for its documented inputs. No critical path user action (viewing treasury, sending announcement, checking in) results in a permission denied error or empty state.

### Bet 2: Build the Group Claiming and Onboarding Funnel

The 100,000 pre-seeded groups are worthless without a frictionless path from "discover your group in the app" to "claim it" to "complete your first treasury entry." That conversion funnel is the only acquisition strategy that doesn't require marketing spend.

The current roadmap focuses on retaining admins who have already claimed groups. There is no documented funnel for how an unclaimed group gets discovered, how the discovery triggers a claiming action, how the claiming triggers a subscription trial, and how the subscription trial converts. The `GroupOverviewScreen` has a `showClaimBanner` parameter, suggesting a claim flow exists, but its effectiveness is unknown without analytics.

The bet: instrument the claiming funnel completely, run the first 100 group claims manually (find treasurers through personal outreach, church bulletins, AA area websites), identify where people drop off, and fix the top three drop-off points. Do this before building any new features.

**Success criterion:** 50 groups claimed, 10 converted to paying subscribers, with documented conversion funnel data showing where the other 40 dropped off.

### Bet 3: Double Down on Treasury as the Sole Conversion Driver

Every feature that is not treasury management, announcements, or meeting updates is a distraction from the conversion problem. The product already has a good treasury implementation. The treasurer handoff feature is genuinely unique. The monthly report generation directly replaces a painful manual process.

The bet: make the treasury experience best-in-class for the next 6 weeks. This means completing the V4 treasury work that is actually useful (recurring transactions, year-end summary, better report templates), fixing the treasury trends quarterly export bug, adding bank reconciliation (mentioned in the roadmap risk section), and creating onboarding content that shows a treasurer exactly what the first month looks like with the app.

Treasury is the reason a group pays $12/year. Every dollar spent on governance voting, literature libraries, and step trackers is a dollar not spent deepening the treasury moat.

**Success criterion:** A group treasurer who completes the 7-day trial has entered at least 3 transactions, generated one monthly report, and shared it with their group. Trial-to-paid conversion for treasurers who complete this action exceeds 40%.

---

## 7. Where Is the Roadmap Dangerously Optimistic?

### Timeline Assumptions

The roadmap originally estimated:
- MVP: 3-4 weeks
- V1: 5-6 weeks
- V2: 6-7 weeks
- V3: 8-9 weeks
- V4: 12+ weeks

Total: approximately 34-36 weeks of development. The implementation plan README shows all phases through V3 marked COMPLETE as of early 2026, with V4 plans written and code merged. If these estimates are even roughly accurate, this represents 6-9 months of development without a single paying customer validating the direction.

That is not a criticism of the execution speed — it is a warning about what comes next. The roadmap's success metrics assume:
- End of V1: Trial-to-paid conversion >15%
- End of V2: Annual churn <15%, DAU/MAU >20%
- End of V3: K-factor >0.3, 100+ groups

None of these metrics exist yet. The team is at V4 feature development with V1 success metrics unvalidated.

### The 1,000-2,000 Group Target for Year 1

The STRATEGIC_ANALYSIS estimates "1,000-5,000 groups" as a realistic Year 1 target. The ROADMAP revenue projections show "End of V2: 500 groups, $6,000 ARR" as achievable. These numbers are not grounded in any market research, user interviews, or comparables from similar apps in adjacent markets. The 12-step recovery app market is conservative, tech-averse, and word-of-mouth dependent. Adoption will be slower than projected.

A realistic Year 1 target is 100-300 paying groups, achieved through intensive personal outreach. 500-2,000 groups in Year 1 requires either a viral growth mechanism or paid acquisition — neither of which the strategy addresses.

### The GTM Assumption

The roadmap assumes that building good features creates organic growth in a tight-knit, word-of-mouth community. This may eventually be true, but in the early stages, growth in recovery communities happens through trusted relationships and service structure endorsements. The timeline for building those relationships (presenting at area assemblies, working with intergroups, getting mentioned in recovery publications) is 12-24 months, not the 8-16 weeks implied in the V3 growth phase.

### V4 Enterprise Revenue

The V4 revenue projection of "5,000 groups, $60,000 ARR" at $12/year per group is achievable through individual group subscriptions. But the V4 enterprise plan adds intergroup accounts at $99-199/year. The revenue projections in the ROADMAP do not reflect the enterprise tier, which means the enterprise features were built without any corresponding revenue model update or validation. If the enterprise tier works, it materially changes the economics. If it doesn't, it was expensive to build and maintain.

### The "60-75% Success Probability" Assessment

The STRATEGIC_ANALYSIS rates the success probability at 60-75%, which is "higher than typical app launches." This is a self-assessment, not a third-party analysis. The factors cited (genuine pain points, privacy-first design, low price, strong retention hooks, word-of-mouth potential) are all real. But they are product factors, not distribution factors. Most apps that fail do so because of distribution, not product quality. A 60-75% success probability claim requires a validated distribution strategy, which does not exist in writing.

---

## Summary Decision Matrix

| Feature / Area | Decision | Rationale |
|---|---|---|
| Treasury Management | BUILD FURTHER | Core conversion driver, already strong, deepen the moat |
| Treasurer Handoff | KEEP | Genuinely unique, no competitor has it |
| Announcements + Push Notifications | KEEP | Core communication value |
| Meeting Management | KEEP | Core utility, drives member retention |
| Sobriety Tracker | KEEP | Member-side daily engagement, low maintenance |
| Service Positions + Reminders | KEEP | Real admin value, already built and working |
| Admin Dashboard | KEEP | Good retention signal, already built |
| Trial Optimization | KEEP | Direct conversion impact |
| Group Claiming Flow | BUILD NOW | The acquisition engine; needs instrumentation |
| Analytics / Instrumentation | BUILD NOW | Prerequisite for all future decisions |
| Daily Reflections (151/365 entries) | FIX OR HIDE | Half-built = trust-destroying; complete or remove |
| Group Resource Library | FIX STORAGE RULES | Uploads will silently fail without storage rules |
| V4 Critical Bugs (C1-C10) | FIX IMMEDIATELY | Two are security vulnerabilities |
| Intergroup / District Accounts | KILL (freeze) | Unvalidated buyer, broken code, security hole |
| Treatment Center Integration | KILL | Wrong product, regulatory risk, broken export |
| SSO | KILL (freeze) | Enterprise-only, no buyers |
| White-Label Branding | KILL (freeze) | Enterprise-only, broken upload URL |
| Officer Elections | DEPRIORITIZE | Cultural misfit risk, bugs, low demand signal |
| Bylaw Ratification | DEPRIORITIZE | Niche use case, voting transition broken |
| Literature Library | DEPRIORITIZE | IP risk, moderation bypass bug, no demand validated |
| Attendance Analytics | DEPRIORITIZE | Always returns zero data (bug), needs active users first |
| Intergroup Reports | KILL (freeze) | Depends on killed intergroup accounts |
| GTM Strategy | BUILD NOW | Does not exist; most important missing document |
| Pricing validation ($12 vs $48-99/year) | NEED MORE DATA | May be leaving significant revenue on the table |

---

## Final Assessment

The product is technically solid and architecturally coherent. The team can execute. The core idea is right. The problem is that the team has been optimizing for feature completeness rather than customer acquisition, and is now at risk of launching with a product that is too complex to explain, has critical bugs in important surfaces, and has no documented plan for finding the first paying customer.

The next 90 days should be entirely focused on two things: fixing the V4 critical bugs and acquiring the first 50 paying groups through direct, personal outreach. Everything else is a distraction.

The question "who is going to be the treasurer of the Tuesday night Big Book group in Austin, TX, and how will they find out about this app?" has not been answered. Until it is, no new features should be started.

---

*Files examined:*
- `/Users/marcusklein/dev/RecoveryConnect/docs/PRODUCT_REQUIREMENTS.md`
- `/Users/marcusklein/dev/RecoveryConnect/docs/ROADMAP.md`
- `/Users/marcusklein/dev/RecoveryConnect/docs/STRATEGIC_ANALYSIS.md`
- `/Users/marcusklein/dev/RecoveryConnect/docs/PRICING_MODEL.md`
- `/Users/marcusklein/dev/RecoveryConnect/docs/plans/README.md`
- `/Users/marcusklein/dev/RecoveryConnect/docs/plans/2026-02-23-v4-code-review.md`
- `/Users/marcusklein/dev/RecoveryConnect/docs/plans/2026-02-22-v4-enterprise.md`
- `/Users/marcusklein/dev/RecoveryConnect/docs/plans/2026-02-22-v4-advanced-governance.md`
- `/Users/marcusklein/dev/RecoveryConnect/docs/plans/2026-02-22-v2-implementation.md`
- All screen files under `/Users/marcusklein/dev/RecoveryConnect/mobile/src/screens/`
- All callable functions under `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/`
- All Redux slices under `/Users/marcusklein/dev/RecoveryConnect/mobile/src/store/slices/`
