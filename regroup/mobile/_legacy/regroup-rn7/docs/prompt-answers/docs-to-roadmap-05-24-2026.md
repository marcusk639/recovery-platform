---
Section 0: Source of Truth Verdict

Doc: detox-recovery/docs/delivery-gaps.md
Location: Verified on disk
Verdict: SOURCE_OF_TRUTH
Rationale: Last updated May 2026; authoritative audit of every gap between what's sold and what's delivered
────────────────────────────────────────
Doc: detox-recovery/docs/features.md
Location: Verified on disk
Verdict: SOURCE_OF_TRUTH
Rationale: Tracks live vs. pending features with explicit checkbox state; regularly maintained
────────────────────────────────────────
Doc: RecoveryConnect/docs/push-notifications-treasury-features.md
Location: Verified on disk
Verdict: SUPPORTING
Rationale: Technical implementation doc for Dec 2025 features; useful for understanding what's built
────────────────────────────────────────
Doc: RecoveryConnect/priorities.md
Location: Verified on disk
Verdict: SUPPORTING
Rationale: Vision-level feature prioritization; useful for backlog context
────────────────────────────────────────
Doc: RecoveryConnect/priorities2.md
Location: Verified on disk
Verdict: SUPPORTING
Rationale: MVP feature list with monetization notes
────────────────────────────────────────
Doc: RecoveryConnect/mvp-reqs.md
Location: Verified on disk
Verdict: SUPPORTING
Rationale: MVP feature categories; partially complete
────────────────────────────────────────
Doc: RecoveryConnect/todo.md
Location: Verified on disk
Verdict: SUPPORTING
Rationale: Quick list of pending features
────────────────────────────────────────
Doc: regroup-functions/.full-review/05-final-report.md
Location: Verified on disk
Verdict: SOURCE_OF_TRUTH
Rationale: Just-completed comprehensive code review; authoritative current state of rats-v2 codebase
────────────────────────────────────────
Doc: Session-summary-referenced docs (RC ROADMAP, REVENUE_OPPORTUNITIES, ecosystem plan, LAUNCH_BLOCKERS,
  superpowers/plans)
Location: Not found on disk
Verdict: ARCHIVE/UNVERIFIABLE
Rationale: Referenced in compacted context summary but do not exist in the filesystem; excluded from this analysis

Note on session summary docs: The prior session summary referenced several files (RecoveryConnect/docs/ROADMAP.md, RecoveryConnect/docs/REVENUE_OPPORTUNITIES.md, RecoveryConnect/docs/plans/2026-04-13-recovery-ecosystem-12-month-plan.md, etc.) that do not exist on disk. The roadmap below is built exclusively from files I have verified exist and read.

---

> ⚠️ **Legacy document.** Carried over from the standalone `regroup-rn7` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `mobile` documentation.

Section 1: Doc Audit Summary

┌───────────────────┬───────────────────────────────────────────────────────────────────────┬─────────────────────┐
│      Product      │                             Docs Reviewed                             │      Coverage       │
├───────────────────┼───────────────────────────────────────────────────────────────────────┼─────────────────────┤
│                   │ delivery-gaps.md, features.md, roadmap-2026-05-24.md,                 │                     │
│ detox-recovery    │ pdf-delivery.md, financial-projections-2026-05-24.md,                 │ Comprehensive       │
│                   │ discovery-strategy.md, architecture.md, 3 manual-task docs            │                     │
├───────────────────┼───────────────────────────────────────────────────────────────────────┼─────────────────────┤
│                   │ push-notifications-treasury-features.md, priorities.md,               │ Partial (product    │
│ RecoveryConnect   │ priorities2.md, mvp-reqs.md, todo.md, spec.md, llm-context.md, git    │ has thin doc        │
│                   │ log                                                                   │ coverage)           │
├───────────────────┼───────────────────────────────────────────────────────────────────────┼─────────────────────┤
│                   │ .full-review/05-final-report.md (5-phase comprehensive review),       │ Authoritative for   │
│ regroup-functions │ CLAUDE.md                                                             │ current codebase    │
│                   │                                                                       │ state               │
└───────────────────┴───────────────────────────────────────────────────────────────────────┴─────────────────────┘

---
Section 2: Implementation Status Matrix

detox-recovery

┌───────────────────────────────────────────┬────────────────────────┬───────────────────────────────────────────┐
│                Requirement                │         Source         │                  Status                   │
├───────────────────────────────────────────┼────────────────────────┼───────────────────────────────────────────┤
│ PDF delivery for 5 paid products          │ delivery-gaps.md Tier  │ ❌ MISSING — Lemon Squeezy migration      │
│                                           │ 1                      │ decision made; not implemented            │
├───────────────────────────────────────────┼────────────────────────┼───────────────────────────────────────────┤
│ Lead magnet: "What to Do When Withdrawal  │ delivery-gaps.md §2.1  │ ⚠️ PARTIAL — email captured; guide not    │
│ Starts Unsafe"                            │                        │ written; MailerLite automation not set up │
├───────────────────────────────────────────┼────────────────────────┼───────────────────────────────────────────┤
│ Lead magnet: "How to Help Someone in      │ delivery-gaps.md §2.2  │ ⚠️ PARTIAL — email captured; guide not    │
│ Withdrawal"                               │                        │ written; automation not set up            │
├───────────────────────────────────────────┼────────────────────────┼───────────────────────────────────────────┤
│ Lead magnet: B2B guide "10 Ways Detox     │ delivery-gaps.md §2.3  │ ⚠️ PARTIAL — email captured; guide not    │
│ Programs Lose Patient Trust"              │                        │ written; automation not set up            │
├───────────────────────────────────────────┼────────────────────────┼───────────────────────────────────────────┤
│ Thank-you page after Stripe checkout      │ delivery-gaps.md infra │ ❌ MISSING                                │
│                                           │  table                 │                                           │
├───────────────────────────────────────────┼────────────────────────┼───────────────────────────────────────────┤
│ Analytics (Plausible/GA4)                 │ delivery-gaps.md +     │ ❌ MISSING                                │
│                                           │ features.md            │                                           │
├───────────────────────────────────────────┼────────────────────────┼───────────────────────────────────────────┤
│ Error monitoring (Sentry)                 │ delivery-gaps.md infra │ ❌ MISSING                                │
│                                           │  table                 │                                           │
├───────────────────────────────────────────┼────────────────────────┼───────────────────────────────────────────┤
│ Custom domain (nextsteprecovery.com)      │ delivery-gaps.md infra │ ❌ MISSING — Firebase App Hosting backend │
│                                           │  table                 │  live at default URL                      │
├───────────────────────────────────────────┼────────────────────────┼───────────────────────────────────────────┤
│ 60-minute family navigation call          │ features.md Coming     │ ❌ MISSING — needs Calendly event +       │
│ (Calendly + Stripe)                       │ Soon                   │ Stripe link wired                         │
├───────────────────────────────────────────┼────────────────────────┼───────────────────────────────────────────┤
│ MailerLite nurture sequences              │ features.md Future     │ ❌ MISSING                                │
│                                           │ Ideas                  │                                           │
├───────────────────────────────────────────┼────────────────────────┼───────────────────────────────────────────┤
│ Intake questionnaire before calls         │ delivery-gaps.md infra │ ❌ MISSING                                │
│                                           │  table                 │                                           │
└───────────────────────────────────────────┴────────────────────────┴───────────────────────────────────────────┘

RecoveryConnect

┌──────────────────────────────┬─────────────────────────────────────────┬────────────────────────────────────────┐
│         Requirement          │                 Source                  │                 Status                 │
├──────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────────┤
│ Announcement push            │ push-notifications-treasury-features.md │ ✅ DONE — sendAnnouncementNotification │
│ notifications                │                                         │  CF + mobile integration               │
├──────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────────┤
│ Treasury PDF report          │ push-notifications-treasury-features.md │ ✅ DONE — generateTreasuryReport CF +  │
│ generation                   │                                         │ TreasuryReportScreen                   │
├──────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────────┤
│ Treasurer handoff flow       │ push-notifications-treasury-features.md │ ✅ DONE — initiate/complete/cancel     │
│                              │                                         │ handoff CFs + mobile screens           │
├──────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────────┤
│ Group subscription billing   │ git: ca4e3c6, f6312c9, 6d70b0b          │ ✅ DONE — Stripe subscription on group │
│                              │                                         │  creation                              │
├──────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────────┤
│ Meetings management          │ git history, priorities2.md             │ ✅ DONE                                │
├──────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────────┤
│ Member directory             │ git history, priorities2.md             │ ✅ DONE                                │
├──────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────────┤
│ Sobriety milestone           │                                         │                                        │
│ celebrations (automated      │ todo.md, priorities2.md                 │ ❌ MISSING                             │
│ group notifications)         │                                         │                                        │
├──────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────────┤
│ Service positions tracking   │                                         │                                        │
│ (GSR, secretary, chair,      │ todo.md, priorities.md §5               │ ❌ MISSING                             │
│ etc.)                        │                                         │                                        │
├──────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────────┤
│ Direct messaging (E2E        │ mvp-reqs.md §4                          │ ❌ MISSING                             │
│ encrypted)                   │                                         │                                        │
├──────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────────┤
│ Offline capabilities         │ mvp-reqs.md §7                          │ ❌ MISSING                             │
├──────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────────┤
│ App Store submission         │ mvp-reqs.md, git: no release commits    │ ❌ MISSING                             │
├──────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────────┤
│ Onboarding UX cleanup        │ todo.md                                 │ ❌ MISSING                             │
├──────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────────┤
│ Meeting chair tracker with   │ todo.md                                 │ ❌ MISSING                             │
│ member notifications         │                                         │                                        │
├──────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────────┤
│ Admin notification when      │ todo.md                                 │ ❌ MISSING                             │
│ access is requested          │                                         │                                        │
├──────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────────┤
│ Payment method change for    │ todo.md                                 │ ❌ MISSING                             │
│ group admin handoff          │                                         │                                        │
├──────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────────┤
│ Group feed / activity feed   │ todo.md, priorities.md §7               │ ❌ MISSING                             │
├──────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────────┤
│ Business meeting support     │                                         │                                        │
│ (scheduling + link to        │ priorities.md §6                        │ ❌ MISSING                             │
│ treasury report)             │                                         │                                        │
└──────────────────────────────┴─────────────────────────────────────────┴────────────────────────────────────────┘

regroup-functions (rats-v2 sober living)

┌────────────────────────────────────────────────┬─────────────────────┬─────────────────────────────────────────┐
│                  Requirement                   │       Source        │                 Status                  │
├────────────────────────────────────────────────┼─────────────────────┼─────────────────────────────────────────┤
│ Rotate Google Maps API key committed to git    │ .full-review/05     │ ❌ MISSING — live secret in             │
│                                                │ DO-C1               │ api/api.ts:6                            │
├────────────────────────────────────────────────┼─────────────────────┼─────────────────────────────────────────┤
│ Rotate SendGrid API key committed to git       │ .full-review/05     │ ❌ MISSING — scripts/.env commit        │
│ history                                        │ DO-C1               │ 0c927a9                                 │
├────────────────────────────────────────────────┼─────────────────────┼─────────────────────────────────────────┤
│ Fix privilege escalation in callable/auth.ts   │ .full-review/05 C-1 │ ❌ MISSING — none of the 5 handlers     │
│                                                │                     │ check assertHouseAdmin()                │
├────────────────────────────────────────────────┼─────────────────────┼─────────────────────────────────────────┤
│ Fix Stripe payment method hijacking            │ .full-review/05 C-4 │ ❌ MISSING — caller-supplied customerId │
│                                                │                     │  unverified                             │
├────────────────────────────────────────────────┼─────────────────────┼─────────────────────────────────────────┤
│ Remove SSN from plaintext entities/User.ts:30  │ .full-review/05 C-5 │ ❌ MISSING                              │
├────────────────────────────────────────────────┼─────────────────────┼─────────────────────────────────────────┤
│ Firestore security rules                       │ .full-review/05 C-7 │ ❌ MISSING — Admin SDK is the only auth │
│                                                │                     │  layer                                  │
├────────────────────────────────────────────────┼─────────────────────┼─────────────────────────────────────────┤
│ CI/CD pipeline                                 │ .full-review/05     │ ❌ MISSING                              │
│                                                │ DO-C2               │                                         │
├────────────────────────────────────────────────┼─────────────────────┼─────────────────────────────────────────┤
│ Separate dev Firebase project                  │ .full-review/05     │ ❌ MISSING — default and dev both point │
│                                                │ DO-C3               │  to production                          │
├────────────────────────────────────────────────┼─────────────────────┼─────────────────────────────────────────┤
│ Fix updatePaymentInfo returning error object   │ .full-review/05 C-2 │ ❌ MISSING                              │
│ instead of throwing                            │                     │                                         │
├────────────────────────────────────────────────┼─────────────────────┼─────────────────────────────────────────┤
│ Fix calculateWeeklyHealth oldest-entry         │ .full-review/05     │ ❌ MISSING                              │
│ deletion bug                                   │ H-4/H-5             │                                         │
├────────────────────────────────────────────────┼─────────────────────┼─────────────────────────────────────────┤
│ Upgrade axios@0.19.2 (5 CVEs)                  │ .full-review/05     │ ❌ MISSING                              │
│                                                │ FB-C2               │                                         │
├────────────────────────────────────────────────┼─────────────────────┼─────────────────────────────────────────┤
│ Fix getResidentMeetingAttendance RC bridge     │ git: 393cd00        │ ✅ DONE                                 │
├────────────────────────────────────────────────┼─────────────────────┼─────────────────────────────────────────┤
│ Caller authorization on createPaymentIntent    │ git: 8a0116d        │ ✅ DONE                                 │
├────────────────────────────────────────────────┼─────────────────────┼─────────────────────────────────────────┤
│ setOxfordEnabled callable                      │ git: fbd5d48        │ ✅ DONE                                 │
└────────────────────────────────────────────────┴─────────────────────┴─────────────────────────────────────────┘

---
Section 3: Growth-Optimized Roadmap

Growth lens key: Usability (U) / Acquisition (A) / Revenue (R): H/M/L

P0 — Fix immediately (revenue leak / security breach)

┌───────────────────────┬───────────────────┬─────┬─────┬─────┬───────────────────┬──────────────────────────────┐
│         Item          │      Product      │  U  │  A  │  R  │      Effort       │             Why              │
├───────────────────────┼───────────────────┼─────┼─────┼─────┼───────────────────┼──────────────────────────────┤
│                       │                   │     │     │     │                   │ Customers are paying and     │
│ Migrate 5 paid PDFs   │ detox-recovery    │ H   │ L   │ H   │ M (2-4 hrs +      │ receiving nothing.           │
│ to Lemon Squeezy      │                   │     │     │     │ content writing)  │ Chargebacks accumulate       │
│                       │                   │     │     │     │                   │ silently.                    │
├───────────────────────┼───────────────────┼─────┼─────┼─────┼───────────────────┼──────────────────────────────┤
│ Rotate Google Maps    │                   │     │     │     │                   │ Live key committed to git.   │
│ API key               │ regroup-functions │ L   │ L   │ H   │ S (30 min)        │ Anyone who has cloned the    │
│                       │                   │     │     │     │                   │ repo has it.                 │
├───────────────────────┼───────────────────┼─────┼─────┼─────┼───────────────────┼──────────────────────────────┤
│ Rotate SendGrid API   │ regroup-functions │ L   │ L   │ H   │ S (30 min + git   │ Live key in git history      │
│ key                   │                   │     │     │     │ filter-repo)      │ since commit 0c927a9.        │
├───────────────────────┼───────────────────┼─────┼─────┼─────┼───────────────────┼──────────────────────────────┤
│ Fix privilege         │                   │     │     │     │                   │ Any user can grant           │
│ escalation in         │ regroup-functions │ L   │ L   │ H   │ S (2 hrs)         │ themselves or others house   │
│ callable/auth.ts      │                   │     │     │     │                   │ admin. No auth check in 5    │
│                       │                   │     │     │     │                   │ handlers.                    │
├───────────────────────┼───────────────────┼─────┼─────┼─────┼───────────────────┼──────────────────────────────┤
│ Write + deliver 3     │                   │     │     │     │ M (content: 1-2   │ Every signup since launch is │
│ lead magnets          │ detox-recovery    │ H   │ H   │ M   │ days; automation: │  sitting cold. These are     │
│                       │                   │     │     │     │  2 hrs)           │ your entire top-of-funnel.   │
├───────────────────────┼───────────────────┼─────┼─────┼─────┼───────────────────┼──────────────────────────────┤
│ Remove SSN plaintext  │                   │     │     │     │                   │ PII field stored as an       │
│ from entities/User.ts │ regroup-functions │ L   │ L   │ H   │ S (1 hr)          │ unencrypted string.          │
│                       │                   │     │     │     │                   │ HIPAA-adjacent exposure.     │
└───────────────────────┴───────────────────┴─────┴─────┴─────┴───────────────────┴──────────────────────────────┘

P1 — Fix before next sprint (security + retention)

┌─────────────────────────┬───────────────────┬─────┬─────┬─────┬────────────────┬────────────────────────────────┐
│          Item           │      Product      │  U  │  A  │  R  │     Effort     │              Why               │
├─────────────────────────┼───────────────────┼─────┼─────┼─────┼────────────────┼────────────────────────────────┤
│ Fix Stripe payment      │ regroup-functions │ L   │ L   │ H   │ S (2 hrs)      │ Caller-supplied customerId not │
│ method hijacking        │                   │     │     │     │                │  verified.                     │
├─────────────────────────┼───────────────────┼─────┼─────┼─────┼────────────────┼────────────────────────────────┤
│                         │                   │     │     │     │                │ Admin SDK is the only          │
│ Add Firestore security  │ regroup-functions │ L   │ L   │ H   │ L (1 week)     │ authorization layer.           │
│ rules                   │                   │     │     │     │                │ Misconfigured client could     │
│                         │                   │     │     │     │                │ read/write anything.           │
├─────────────────────────┼───────────────────┼─────┼─────┼─────┼────────────────┼────────────────────────────────┤
│                         │                   │     │     │     │ S (30 min +    │ Site lives at a Firebase       │
│ Wire custom domain      │ detox-recovery    │ H   │ M   │ M   │ DNS            │ default URL; breaks            │
│ nextsteprecovery.com    │                   │     │     │     │ propagation)   │ credibility for a              │
│                         │                   │     │     │     │                │ health-adjacent service.       │
├─────────────────────────┼───────────────────┼─────┼─────┼─────┼────────────────┼────────────────────────────────┤
│                         │                   │     │     │     │                │ Manual deploys from dirty      │
│ Create CI/CD pipeline   │ regroup-functions │ L   │ L   │ H   │ M (1-2 days)   │ working trees. No lint/test    │
│                         │                   │     │     │     │                │ gate. Security-critical code   │
│                         │                   │     │     │     │                │ ships untested.                │
├─────────────────────────┼───────────────────┼─────┼─────┼─────┼────────────────┼────────────────────────────────┤
│ Create separate dev     │ regroup-functions │ L   │ L   │ M   │ S (2 hrs)      │ Every test deploy hits         │
│ Firebase project        │                   │     │     │     │                │ production data.               │
├─────────────────────────┼───────────────────┼─────┼─────┼─────┼────────────────┼────────────────────────────────┤
│                         │                   │     │     │     │                │ Post-Stripe checkout lands on  │
│ Add /thank-you page     │ detox-recovery    │ H   │ M   │ M   │ S (2 hrs)      │ generic Stripe page; breaks    │
│                         │                   │     │     │     │                │ purchase funnel                │
├─────────────────────────┼───────────────────┼─────┼─────┼─────┼────────────────┼────────────────────────────────┤
│ App Store submission    │                   │     │     │     │                │ Mobile app not in App Store    │
│ for RecoveryConnect     │ RecoveryConnect   │ H   │ H   │ H   │ M (2-3 days)   │ limits organic discovery for a │
│                         │                   │     │     │     │                │  mobile-first product          │
├─────────────────────────┼───────────────────┼─────┼─────┼─────┼────────────────┼────────────────────────────────┤
│ Sobriety milestone      │                   │     │     │     │                │ Daily engagement loop; drives  │
│ celebrations            │ RecoveryConnect   │ H   │ M   │ M   │ M (2-3 days)   │ notification re-engagement and │
│                         │                   │     │     │     │                │  group retention               │
├─────────────────────────┼───────────────────┼─────┼─────┼─────┼────────────────┼────────────────────────────────┤
│                         │                   │     │     │     │                │ Returns Stripe error object    │
│ Fix updatePaymentInfo   │ regroup-functions │ M   │ L   │ H   │ S (1 hr)       │ instead of throwing; failed    │
│ error return            │                   │     │     │     │                │ payment updates appear to      │
│                         │                   │     │     │     │                │ succeed                        │
├─────────────────────────┼───────────────────┼─────┼─────┼─────┼────────────────┼────────────────────────────────┤
│ Upgrade axios from      │ regroup-functions │ L   │ L   │ M   │ S (2 hrs)      │ 5 active CVEs including SSRF   │
│ 0.19.2                  │                   │     │     │     │                │                                │
└─────────────────────────┴───────────────────┴─────┴─────┴─────┴────────────────┴────────────────────────────────┘

P2 — Next 60 days (growth + retention features)

┌────────────────────────────┬───────────────────┬─────┬─────┬─────┬────────────────┬────────────────────────────┐
│            Item            │      Product      │  U  │  A  │  R  │     Effort     │            Why             │
├────────────────────────────┼───────────────────┼─────┼─────┼─────┼────────────────┼────────────────────────────┤
│                            │                   │     │     │     │                │ No visibility into which   │
│ Analytics (Plausible)      │ detox-recovery    │ L   │ H   │ M   │ S (30 min)     │ pages convert, what        │
│                            │                   │     │     │     │                │ channels work              │
├────────────────────────────┼───────────────────┼─────┼─────┼─────┼────────────────┼────────────────────────────┤
│ Error monitoring (Sentry)  │ detox-recovery    │ M   │ L   │ M   │ S (1 hr)       │ Production errors are      │
│                            │                   │     │     │     │                │ silent                     │
├────────────────────────────┼───────────────────┼─────┼─────┼─────┼────────────────┼────────────────────────────┤
│ MailerLite nurture         │                   │     │     │     │ M (3-5 emails  │ Leads captured but never   │
│ sequences                  │ detox-recovery    │ M   │ H   │ H   │ per sequence)  │ nurtured toward paid       │
│                            │                   │     │     │     │                │ products                   │
├────────────────────────────┼───────────────────┼─────┼─────┼─────┼────────────────┼────────────────────────────┤
│                            │                   │     │     │     │                │ Core 12-step operational   │
│ Service positions tracking │ RecoveryConnect   │ H   │ M   │ M   │ M (3-5 days)   │ feature; drives daily      │
│                            │                   │     │     │     │                │ admin engagement           │
├────────────────────────────┼───────────────────┼─────┼─────┼─────┼────────────────┼────────────────────────────┤
│ Admin notification on      │ RecoveryConnect   │ H   │ L   │ M   │ S (1-2 days)   │ Admins currently blind to  │
│ access request             │                   │     │     │     │                │ pending member requests    │
├────────────────────────────┼───────────────────┼─────┼─────┼─────┼────────────────┼────────────────────────────┤
│ 60-minute family           │                   │     │     │     │ S (2 hrs to    │ Natural upsell from free   │
│ navigation call            │ detox-recovery    │ H   │ M   │ H   │ wire Calendly  │ fit check; next service    │
│                            │                   │     │     │     │ + Stripe)      │ ladder rung                │
├────────────────────────────┼───────────────────┼─────┼─────┼─────┼────────────────┼────────────────────────────┤
│ Replace moment.js with     │ regroup-functions │ M   │ L   │ L   │ M (2-3 days)   │ 67 KB cold-start overhead  │
│ native Date                │                   │     │     │     │                │ in scheduled functions     │
├────────────────────────────┼───────────────────┼─────┼─────┼─────┼────────────────┼────────────────────────────┤
│ npm audit fix + axios +    │ regroup-functions │ L   │ L   │ M   │ S (2 hrs)      │ 4 critical + 19 high vulns │
│ @sendgrid/mail upgrades    │                   │     │     │     │                │  in production deps        │
├────────────────────────────┼───────────────────┼─────┼─────┼─────┼────────────────┼────────────────────────────┤
│                            │                   │     │     │     │                │ Centralizes group          │
│ Group feed / activity feed │ RecoveryConnect   │ H   │ M   │ M   │ M (3-5 days)   │ information; reduces       │
│                            │                   │     │     │     │                │ member churn               │
├────────────────────────────┼───────────────────┼─────┼─────┼─────┼────────────────┼────────────────────────────┤
│ Fix calculateWeeklyHealth  │                   │     │     │     │                │ Scheduled function deletes │
│ deletion bug               │ regroup-functions │ M   │ L   │ M   │ S (1 hr)       │  newest entry not oldest;  │
│                            │                   │     │     │     │                │ runs weekly in production  │
├────────────────────────────┼───────────────────┼─────┼─────┼─────┼────────────────┼────────────────────────────┤
│ tslint → ESLint migration  │ regroup-functions │ L   │ L   │ L   │ M (1-2 days)   │ tslint EOL since 2020; no  │
│                            │                   │     │     │     │                │ security or rules updates  │
└────────────────────────────┴───────────────────┴─────┴─────┴─────┴────────────────┴────────────────────────────┘

P3 — Backlog

- RecoveryConnect: Direct messaging (E2E encrypted) — architectural decision needed before building
- RecoveryConnect: Offline capabilities — Firestore offline persistence + action queue
- RecoveryConnect: Meeting chair tracker with member notifications
- RecoveryConnect: Payment method change flow for group admin handoffs
- RecoveryConnect: Business meeting support (scheduling + treasury link)
- detox-recovery: Two-week navigation package (Year 2 — requires Tier 3 pattern established)
- detox-recovery: Sliding-scale / sponsored slots (Year 2 — requires donation funding)
- detox-recovery: Group workshop for families (needs 50+ email list before viable cohort)
- regroup-functions: Integration/E2E test suite (100% unit tests currently)
- regroup-functions: Firebase App Check on callables
- regroup-functions: Correlation IDs / distributed tracing
- regroup-functions: Cloud Monitoring alerting policies

---
Section 4: Implementation Plan

P0-1: Migrate 5 paid PDFs to Lemon Squeezy

Status: MISSING
Growth Score: U: H | A: L | R: H
Effort: M
Depends on: Content writing (the PDFs must actually exist)

What's needed:
- [ ] Write all 5 PDFs (priority order from delivery-gaps.md): Withdrawal Safety Checklist → Family Survival Guide → Appointment Prep → Treatment Comparison → Relapse Prevention
- [ ] Create Lemon Squeezy account; upload PDFs as products
- [ ] Replace 5 NEXT_PUBLIC_STRIPE_* links in lib/products-data.ts with Lemon Squeezy checkout URLs
- [ ] Remove old Stripe links from apphosting.yaml

Acceptance criteria:
- [ ] A customer completing checkout receives an email with a working PDF download link within 60 seconds
- [ ] All 5 products removed from Stripe or replaced with pre-order notice until above is live

---
P0-2: Rotate live secrets

Status: MISSING
Effort: S

What's needed:
- [ ] Revoke AIza<redacted-this-key-needs-rotating> in Google Cloud Console; replace with defineSecret("GOOGLE_MAPS_API_KEY") in functions/src/config.ts
- [ ] Run firebase functions:secrets:set GOOGLE_MAPS_API_KEY with new value
- [ ] Rotate SendGrid API key in dashboard; run firebase functions:secrets:set SENDGRID_API_KEY
- [ ] Run git filter-repo --path scripts/.env --invert-paths to remove from history
- [ ] Add scripts/.env and **/.env to root .gitignore

Acceptance criteria:
- [ ] git log -p -- functions/src/api/api.ts shows no API key in any commit
- [ ] git log -p -- scripts/.env — file not present in any commit

---
P0-3: Fix privilege escalation in callable/auth.ts

Status: MISSING
Effort: S
File: functions/src/callable/auth.ts

What's needed:
- [ ] Import assertHouseAdmin from util/houseAuth.ts in auth.ts
- [ ] Add await assertHouseAdmin(context, data.houseId) at the top of addGuestAuthorization, addAdminAuthorization, promoteGuestsToAdmin, removePrivilegesForGuests, deleteAdminAuthorization
- [ ] Add negative-path tests asserting non-admin callers receive HttpsError('permission-denied')

Acceptance criteria:
- [ ] A user with no admin claims calling addAdminAuthorization receives permission-denied
- [ ] Tests pass red, then green after fix

---
P0-4: Write and deliver 3 lead magnets

Status: PARTIAL (email capture works; no delivery)
Growth Score: U: H | A: H | R: M
Effort: M (content is the bottleneck)

What's needed:
- [ ] Write "What to Do When Withdrawal Starts Feeling Unsafe" (1,000-2,500 words; PDF or email-native)
- [ ] Write "How to Help Someone in Withdrawal Without Making It Worse" (family audience)
- [ ] Write "10 Ways Detox Programs Lose Patient Trust" (B2B; 2-4 page professional PDF)
- [ ] Host each in MailerLite file manager
- [ ] Create MailerLite automation per group: immediate delivery → Day 3 tip → Day 7 CTA to paid product
- [ ] Test each flow before activating

Acceptance criteria:
- [ ] Signup → guide delivered to inbox within 2 minutes
- [ ] Day 3 and Day 7 emails send on schedule
- [ ] B2B sequence ends with consultation CTA

---
P1-1: Wire custom domain + thank-you page

Status: MISSING
Effort: S

What's needed:
- [ ] Point DNS for nextsteprecovery.com to Firebase App Hosting (per docs/deployment.md)
- [ ] Create app/thank-you/page.tsx — confirm purchase, show download instructions placeholder, link to next resource
- [ ] Add ?success_url=https://nextsteprecovery.com/thank-you to each Lemon Squeezy product (not applicable to Calendly bookings)

Acceptance criteria:
- [ ] Site loads at nextsteprecovery.com with valid HTTPS
- [ ] Completing a purchase redirects to /thank-you

---
P1-2: App Store submission (RecoveryConnect)

Status: MISSING
Effort: M

What's needed:
- [ ] Verify no placeholder app ID remains in deep link configuration (mobile/src/lib/deepLinks.js — check for id0000000000)
- [ ] Configure Firebase Auth authorized domains to include production domain
- [ ] Set up App Store Connect record with screenshots and metadata
- [ ] Build production iOS archive via Xcode; submit for review

Acceptance criteria:
- [ ] App visible on App Store
- [ ] Deep links resolve correctly to in-app screens

---
P1-3: Add Firestore security rules (regroup-functions)

Status: MISSING
Effort: L

What's needed:
- [ ] Create firestore.rules with rules for each collection: users, houses, guests, guest-weeks, admins, notifications, na-meetings, meetings, payments, stripeEvents, contact
- [ ] Rule principles: users can only read/write their own users/{uid} doc; house data requires membership check; stripeEvents and payments are read-only from clients; na-meetings is public read
- [ ] Add emulator integration tests that verify rules deny unauthorized access
- [ ] Deploy via firebase deploy --only firestore:rules

Acceptance criteria:
- [ ] firebase emulators:exec "npm test" includes rule violation tests that pass
- [ ] Direct Firestore SDK client cannot read another user's data

---
P1-4: CI/CD pipeline (regroup-functions)

Status: MISSING
Effort: M

What's needed:
- [ ] Create .github/workflows/deploy.yml with: npm ci → npm run lint → npm run build → npm audit --audit-level=high → firebase deploy --only functions (main branch only)
- [ ] Restore firebase.json predeploy hooks: "predeploy": ["npm --prefix functions run build"]
- [ ] Create phoenix-cleanhouse-dev Firebase project; update .firebaserc to map default → dev, prod → phoenix-cleanhouse

Acceptance criteria:
- [ ] Push to main triggers automated deploy to prod only after all checks pass
- [ ] PR branches deploy to dev environment or fail with actionable error

---
P1-5: Sobriety milestone celebrations (RecoveryConnect)

Status: MISSING
Growth Score: U: H | A: M | R: M
Effort: M

What's needed:
- [ ] Cloud Function: triggerMilestoneNotification — runs on group member sobriety date; sends push to opted-in group members
- [ ] Scheduled function: daily check for upcoming milestones (7-day, 30-day, 90-day, year)
- [ ] Mobile: opt-in toggle in group member settings (notificationSettings.celebrations)
- [ ] Mobile: celebration card in group feed on milestone day

Acceptance criteria:
- [ ] Member with 30-day sobriety receives group celebration notification on that day
- [ ] Members who opt-out receive no notification
- [ ] Celebration appears in group feed

---
Section 5: Cross-Product Sequencing

The three products serve different but adjacent audiences and share a strategic dependency chain:

detox-recovery (Next Step Recovery)
      ↓ B2B lead magnet → consulting pipeline
      ↓ treatment center relationships
RecoveryConnect (homegroups app)
      ↓ getResidentMeetingAttendance bridge callable
rats-v2 / regroup-functions (sober living)

Rule 1: Fix revenue leaks before adding features.
detox-recovery has live Stripe payment flows collecting money with no delivery. This is the highest-priority fix across the entire ecosystem — it generates chargebacks and destroys trust before any other product can benefit from referrals.

Rule 2: Secure regroup-functions before pitching B2B.
The rats-v2 platform is the operational backbone for sober living houses. A privilege escalation bug where any user can grant themselves admin is a showstopper for treatment center pilots. The getResidentMeetingAttendance bridge callable (just built) enables the B2B pitch to treatment centers — but that pitch requires a secure platform underneath it.

Rule 3: App Store before growth spend.
RecoveryConnect is mobile-first. Any acquisition spend (paid, content, partnership) requires the app to be in the App Store. This is a prerequisite to everything in P1/P2 for that product.

Rule 4: Lead magnet delivery before B2B outreach.
The B2B lead magnet ("10 Ways Detox Programs Lose Patient Trust") feeds the consulting pipeline, which in turn generates treatment center relationships, which feeds the rats-v2 enterprise story. Every week the automation is unset is a week of cold B2B leads.

Integration bridge: getResidentMeetingAttendance (regroup-functions) is the bridge between the rats-v2 sober living platform and RecoveryConnect's homegroup attendance data. This callable enables treatment centers to see resident meeting participation — which is the core value proposition for the enterprise/Oxford pilot sales story. It's built; the next step is the API contract documentation so treatment center staff can use it.

---
Section 6: Confidence Notes

High confidence (verified against code + git):
- detox-recovery PDF delivery gap — confirmed by reading features.md and delivery-gaps.md; no delivery mechanism found in codebase
- regroup-functions security issues — confirmed by comprehensive 5-phase code review
- RecoveryConnect treasury/announcements/handoff features — confirmed by reading implementation doc and git commit diff
- getResidentMeetingAttendance callable built — confirmed by git log commit 393cd00

Medium confidence:
- RecoveryConnect App Store submission status — git log shows no release/submission commits; assumed not submitted but not verified against App Store Connect
- RecoveryConnect sobriety tracker implementation status — mentioned in priorities docs as needed; git log doesn't confirm it's built; verify before marking DONE

Low confidence (verify before acting):
- apphosting.yaml RUNTIMEi typo — delivery-gaps.md flags it; commit 092c855 may have cleaned it up; read the current file before fixing
- RecoveryConnect subscription gating status — git shows subscription creation but gating of premium features (treasury reports, exception handling) is unverified
- RecoveryConnect direct messaging implementation — mvp-reqs.md lists it; no code evidence found but not exhaustively searched

Action: Before starting any P1 RecoveryConnect work, run grep -r "sobriety\|sobrietyDate" mobile/src/screens to verify sobriety tracker state, and read mobile/src/navigation to confirm which screens are actually wired.

✻ Baked for 8m 58s

※ recap: Ran the docs-to-roadmap skill across all three products — RecoveryConnect, regroup-functions, and detox-recovery — and produced the full prioritized roadmap. Next action: start the P0 work, beginning with migrating detox-recovery's 5 undelivered paid PDFs to Lemon Squeezy.

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯
─────────────────────────────────────
