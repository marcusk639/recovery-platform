# RecoveryConnect / Homegroups — Knowledge Synthesis
**Date:** 2026-02-23
**Scope:** Full documentation corpus + codebase structure
**Sources:** PRODUCT_REQUIREMENTS.md, ROADMAP.md, STRATEGIC_ANALYSIS.md, BILLING_AND_PAYMENTS.md, PRICING_MODEL.md, MESSAGING_ENGINEERING.md, SECURITY_RULES.md, SECURITY_AUDIT.md, codebase-review-2026-02-22.md, plans/README.md, plans/2026-02-22-v2-implementation.md, plans/2026-02-22-v3-implementation.md, plans/2026-02-23-v4-code-review.md, mobile/src/ tree, functions/src/ tree

---

## 1. Product Vision Synthesis

### What the product is trying to be

RecoveryConnect (marketed as "Homegroups") is attempting a precise positioning: not a social recovery app (Sober Grid, In The Rooms), and not a generic group-management tool (Slack, WhatsApp), but the specific operational backbone for 12-step homegroups. The vision has three layers:

**Layer 1 — Operational Infrastructure (MVP, V1):** Replace the spreadsheet treasurer, the paper phone list, and the group-text-chain with structured, privacy-respecting digital equivalents. The $12/year flat rate is sized to come from 7th-tradition group funds, not individual pockets, which is a deliberate alignment with 12-step self-support traditions.

**Layer 2 — Member Engagement Engine (V2, V3):** Build enough individual member value (sobriety tracking, step work, gratitude journal, check-in streaks, daily reflections) that members — not just admins — want the app. The V3 plan articulates this as a bottom-up adoption flywheel: members bring the app to groups that would otherwise never subscribe.

**Layer 3 — Community Platform (V4+):** Intergroup coordination, governance tooling, enterprise deals with treatment centers, white-label. This is the long-term monetization expansion; it requires the group density of V1/V2 to be worthwhile.

### The strategic insight the docs share

All three strategic documents (PRODUCT_REQUIREMENTS, ROADMAP, STRATEGIC_ANALYSIS) converge on one diagnosis: 12-step groups are a large (~180,000 worldwide), underserved, fragmented market that has strong word-of-mouth dynamics and high switching costs once administrative data (treasury history, member roster, service position records) accumulates. The competitive moat is not the features themselves but the institutional knowledge that accumulates inside the app over time.

### Where the vision docs diverge

The STRATEGIC_ANALYSIS (dated December 2024) was written before much of the codebase existed. It lists features like "Meeting Favorites UI" and "Meeting Reminders" as missing, when by February 2026 the codebase contains implementations of both. The analysis's risk table notes "Privacy/security incident" as low-probability, but the February 2026 codebase review found 12 critical bugs including data-privacy violations (account deletion batch bug leaving messages un-anonymized). The strategic optimism in the December 2024 analysis does not reflect the implementation quality actually achieved.

---

## 2. Architectural Decisions — Consistent Across Docs and Code

The following patterns appear consistently in both documentation and code, suggesting they are stable and intentional:

### Firebase custom claims for authorization
Every security-sensitive document (SECURITY_RULES.md, SECURITY_AUDIT.md) and the actual `firestore.rules` file use the same three-claim model: `memberGroups`, `adminGroups`, `treasurerGroups`. This is well-documented and consistently implemented in `onMemberWrite.ts` and `onGroupTreasurerUpdate.ts`. The 1000-byte limit caveat is documented and handled (with graceful truncation). This is the most consistently executed architectural decision in the codebase.

### Composite member document IDs
`{groupId}_{userId}` as the member document ID is documented in SECURITY_RULES.md and reflected in the schema definition. However, this is also the source of the highest-density bug class in the codebase review: `membersSlice.updateGroupMember`, `removeMemberFromGroup`, and `membersSlice.removeMemberFromGroup` all had bugs where bare `userId` was used instead of the composite key. The pattern is documented but not enforced by a type system or constructor, so it breaks repeatedly.

### Redux Toolkit entity adapters with 14+ slices
The MEMORY.md notes 14 slices; the actual slice count in `mobile/src/store/slices/` is 29 files. The growth from the documented 14 to the actual 29 reflects the V2/V3/V4 feature additions, which were planned in docs but the documentation's slice count was not updated. Entity adapters are used throughout, but the Redux `serializableCheck: false` flag masks systemic date serialization bugs (4 separate crashes traced to this in the February 2026 review).

### Cloud Functions as the sole authorization boundary
The docs and code agree that client-side code never writes to sensitive collections directly. All subscription creation, admin removal, invite generation, and claims-sensitive writes go through callable Cloud Functions. This is consistently applied, though several high-priority issues in the review show that auth checks are missing on some functions (`findMeetings`, `sendMentionNotifications`, `searchGroupsByLocation`).

### Stripe product-first pricing
The BILLING_AND_PAYMENTS.md, PRICING_MODEL.md, and `functions/src/utils/stripe.ts` all reflect that billing is per-group (flat $12/year), not per-member. The `productIdGroup` / `getDefaultPriceForProduct()` pattern in `stripe.ts` is the canonical way to resolve price IDs. This was a deliberate fix (documented in MEMORY.md) from an earlier bug where product ID was being compared to price ID.

---

## 3. Contradictions and Misalignments

### Contradiction 1: Announcement collection path

The single most consequential architectural contradiction in the codebase is the announcements collection location:

- `SECURITY_RULES.md` and `firestore.rules` treat announcements as a **top-level** `announcements/{id}` collection.
- The `announcementsSlice.ts` on mobile reads from the top-level collection.
- The `scheduledAnnouncementPublisher.ts` writes to the top-level collection.
- BUT `onAnnouncementCreate` (the trigger that fires push notifications) listens on `groups/{groupId}/announcements/{id}` — a subcollection path that receives zero documents.

This means **announcement push notifications have never worked** since the feature was built. The docs (MESSAGING_ENGINEERING.md, SECURITY_RULES.md) do not document which collection is canonical; they simply omit the question. There is also a dead duplicate file (`triggers/pubsub/scheduledAnnouncementPublisher.ts`) that compounds the confusion.

### Contradiction 2: Meeting collection path

The same split exists for meetings:
- `onMeetingCreate` trigger and `findMeetings` callable reference top-level `meetings/{id}`.
- `createGroupWithSubscription` writes meetings to `groups/{groupId}/meetings/{id}` subcollection.

The result is that meetings created through the subscription flow never generate `MeetingInstance` documents, so their schedule never appears. No doc acknowledges this split.

### Contradiction 3: PRICING_MODEL.md mentions per-member pricing as a current bug that needs fixing

PRICING_MODEL.md (section "Current Code Issue") states: "The existing implementation uses $1 per member pricing (`quantity: memberCount`). This needs to be changed to a flat rate." This was written as a prospective fix recommendation. The MEMORY.md indicates the fix was made (the `findSubscriptionItemId` bug was resolved). However, PRICING_MODEL.md was never updated to reflect the completed fix, leaving the document in a permanently misleading "this is broken" state.

### Contradiction 4: Roadmap MVP checklist vs. codebase reality

The ROADMAP.md MVP checklist includes three unchecked items as of its last-updated date (2026-02-05):
- Sobriety date respects privacy setting everywhere
- Prudent reserve configurable per group
- Meeting cancellations trigger push notification

The plans/README.md shows "P1 Fixes (Privacy, Prudent Reserve, Notifications)" as DONE (PR #26). The roadmap document was not updated after the PR merged, leaving the MVP checklist permanently showing work as incomplete that is actually done.

### Contradiction 5: Plan README claims V2 and V3 are DONE; codebase review shows critical bugs

The plans/README.md marks V2 (DONE), V3 (DONE), and notes V4 features were merged. The 2026-02-23 v4-code-review.md document lists 9 critical blockers including crashes, missing Stripe webhook wiring, unauthenticated collection access, and wrong data type comparisons. The plans/README.md status field of "DONE" means "the plan was implemented," not "the implementation is bug-free and production-ready." This distinction is not documented anywhere.

### Contradiction 6: UserDocument has two parallel phone number fields

`UserDocument` in `schema.ts` has:
- Top-level `showPhoneNumber?: boolean` and `phoneNumber?: string`
- Also `privacySettings.showPhoneNumber?: boolean`

Both are present with the same semantic intent. The V3 plan for `GroupPhoneListScreen` references only the top-level field, but the SECURITY_RULES.md-derived access control table doesn't clarify which field drives phone-list visibility. This will cause inconsistent behavior depending on which field a given screen checks.

### Contradiction 7: BILLING_AND_PAYMENTS.md environment variable list is incomplete

The environment variable section in BILLING_AND_PAYMENTS.md lists `STRIPE_PRICE_ID_MEMBER` and related keys, but `functions/src/utils/stripe.ts` also uses `STRIPE_PRODUCT_ID_GROUP`, `STRIPE_TEST_PRODUCT_ID_GROUP`, `STRIPE_PRODUCT_ID_INTERGROUP_A`, `STRIPE_PRODUCT_ID_INTERGROUP_B`, and their test variants. The V4 enterprise intergroup products are entirely absent from the billing documentation.

---

## 4. Hidden Assumptions in the Docs

### Assumption 1: "Group admin" and "group subscription holder" are always the same person

The payment architecture in BILLING_AND_PAYMENTS.md assumes the admin who clicks "Become Admin" is the correct billing contact for the group. In practice, AA groups often have a treasurer who handles financial matters separately from whoever set up the app. There is no mechanism for a different member to take over billing without also becoming the technical admin. This will cause churn when admins rotate and the new admin does not know (or wants to change) the billing email.

### Assumption 2: The claims byte limit (1000 bytes, ~15-25 groups) is acceptable for all users

SECURITY_RULES.md documents this limitation and says it handles power users by truncating `memberGroups` while preserving `adminGroups`. This assumes members do not need claims-based access to their many member-groups simultaneously. However, for a user who is a member of 30+ groups (plausible for long-sober individuals active in multiple programs), reading group-scoped announcements or group chat will silently fail via the claims path, falling back to document reads. The document acknowledges this but treats it as an edge case without defining what percentage of users might hit it.

### Assumption 3: iOS users will accept the WebView payment flow without friction

BILLING_AND_PAYMENTS.md describes a mandatory WebView redirect for iOS subscription payments (Apple's in-app purchase rules). The docs assume this flow works transparently. No documentation covers what happens when the WebView deep-link callback (`homegroups-app://payment-success`) fails to fire — for example, if the user closes the browser before the redirect, or if the app is backgrounded during payment. This is a common source of "I paid but I'm not getting access" support requests.

### Assumption 4: Push notification delivery is reliable enough for mission-critical meeting cancellation alerts

The ROADMAP.md lists "Meeting cancellations trigger push notification to members" as a key P1 item. The assumption is that push notifications are a reliable delivery channel for something as important as "your meeting is cancelled." FCM delivery is best-effort; it is not guaranteed. No fallback (in-app badge, SMS, email) is documented for when push fails.

### Assumption 5: Firestore offline persistence is sufficient for all offline use cases

STRATEGIC_ANALYSIS.md marks "Offline Support" as completed via Firestore persistence. This is correct for reading cached data. However, writes queued during offline operation (sending a chat message, recording a transaction) are not surfaced to the user with any status indicator in the documented or implemented UI. The MESSAGING_ENGINEERING.md flags "offline message queuing" as a recommended architecture improvement. There is a gap between the "implemented" checkbox and production-grade offline write semantics.

### Assumption 6: A $12/year price point will remain economically viable at scale

The PRICING_MODEL.md projects infrastructure costs of $500-$1,500/month at 1,000-5,000 groups. At 5,000 groups ($60,000 ARR), the margin is tight given the complexity of the system (80+ Cloud Functions, Firestore, FCM, SendGrid, Stripe). The docs do not model the cost of support, fraud, chargebacks, or the increasing Cloud Function invocation cost as V4 features (scheduled jobs, analytics, elections, SSO) add substantially more compute per group.

### Assumption 7: "Completed" V4 features are stable code

The plans/README.md marks all V4 features as TODO (not done), but the codebase contains implemented V4 files (governance screens, intergroup functions, analytics CFs). The v4-code-review.md shows 9 critical bugs across these. The hidden assumption — that only "DONE" plan items are deployed — is broken. Code that was written as part of planning or exploratory implementation is already merged to main and is in an unknown deployment state.

---

## 5. Knowledge Gaps

The following topics should be documented but currently have no canonical document:

### Gap 1: Canonical Firestore collection layout

There is no single document that authoritatively lists every Firestore collection, its location (top-level vs. subcollection), its schema, and its access pattern. The split between top-level and subcollection paths for announcements and meetings is the direct cause of two critical production bugs. A `FIRESTORE_SCHEMA.md` covering all collections, paths, and the rationale for each layout decision would be the highest-priority documentation artifact.

### Gap 2: Feature flag / gating architecture

PRICING_MODEL.md describes which features are free vs. premium, but there is no document or code pattern for how feature gating is enforced at runtime. Questions that have no documented answer: Does the mobile app check `subscriptionStatus` in the group document? Does it check a Redux flag? Is there a helper function? Can a user bypass gating by directly navigating to a premium screen? The SECURITY_RULES.md does not prevent non-subscribing groups from writing treasury transactions (the rule is "treasurer or admin" without a subscription check).

### Gap 3: FCM token lifecycle management

`UserDocument.fcmTokens` stores an array of push notification tokens. There is no documentation covering how tokens are registered, when stale tokens are removed, whether there is a maximum token count per user, or how the `sendMentionNotifications` and `onAnnouncementCreate` functions handle tokens that have become invalid (FCM returns errors for unregistered tokens). Token accumulation is a known failure mode that silently increases notification costs and error rates.

### Gap 4: Data deletion and account lifecycle

PRODUCT_REQUIREMENTS.md mentions "account deletion" as an app store compliance requirement. The `deleteUserAccount` callable function exists. But there is no document describing: what data is deleted vs. anonymized vs. retained, the legal basis for retention, how group data is handled when an admin deletes their account (who takes over?), and what happens to active Stripe subscriptions. The code review found that batch reuse in `deleteUserAccount` means messages beyond the first 400 are not anonymized — a privacy compliance failure that has no corresponding documentation about the intended behavior.

### Gap 5: Migration and backfill strategy for schema evolution

The docs describe the claims migration script (`scripts/migrateClaimsAndRoles.ts`) but no general pattern is documented for how new schema fields are backfilled into existing documents when features add new required fields. V3 features (milestones, step notes, conscience votes) add new collections and new fields to `GroupMemberDocument`. No document explains how existing groups or users get default values for new fields.

### Gap 6: Error handling and user-facing messaging strategy

No document describes the UX contract for errors. When a Cloud Function returns an error, what does the user see? When a payment fails, what is the recovery flow? The BILLING_AND_PAYMENTS.md has a "Common Issues" troubleshooting section for developers, but there is no document defining user-facing error messages, their location in code, or their tone guidelines (which matters for a recovery audience where error messages can increase anxiety).

### Gap 7: Testing strategy and coverage

The plans/README.md review checklist mentions `npx tsc --noEmit` and manual testing. The codebase has unit tests in `functions/src/__tests__/` and security rule tests in `functions/src/tests/`. But there is no document describing: the overall test strategy, what is unit-tested vs. integration-tested vs. manually verified, minimum coverage thresholds, or how to run the full test suite. The V4 code review found a test that gives false-positive signal (wrong mock assertions). This indicates tests are being written without a shared quality standard.

### Gap 8: Stripe webhook reliability and replay semantics

BILLING_AND_PAYMENTS.md documents the `processed_stripe_events` idempotency collection but does not document what happens when a webhook fails processing: Does Stripe retry? How long? What is the impact of a webhook processing gap (e.g., a subscription renewal that is not acknowledged)? The codebase review found that the webhook returns HTTP 200 when the secret is not configured — silently dropping all events. This is an operational gap with no runbook.

---

## 6. Cross-Cutting Concerns Assessment

### Authentication

**Consistency: Moderate.** The custom claims pattern is well-documented and consistently implemented in Firestore rules. The weakness is in Cloud Functions: at least three callable functions (`findMeetings`, `sendMentionNotifications`, `searchGroupsByLocation`) have no authentication check at all, which is undocumented and inconsistent with the stated security model. The mobile-to-web token handoff for payments (via `createWebAuthToken`) is well-documented but the error path (expired token, network failure) is not.

### Payments (Stripe)

**Consistency: Low.** The payment system is the area of greatest doc-to-code divergence:
- PRICING_MODEL.md still describes the per-member pricing bug as unfixed.
- BILLING_AND_PAYMENTS.md omits the V4 intergroup product IDs.
- `createStripeCheckoutSession` uses `priceIdMember` instead of `getDefaultPriceForProduct(productIdGroup)` — a different price than intended.
- The duplicate subscription guard checks only `"active"` status, missing `"trialing"` and `"past_due"`.
- Stripe subscriptions are not cancelled when a user deletes their account.
- The webhook returns HTTP 200 when the secret is not configured.
- HTML injection in email templates (group name not sanitized).

The billing subsystem has 2 critical and 5 high-severity issues in the review that collectively mean active subscription management is unreliable.

### Push Notifications (FCM)

**Consistency: Low.** Announcement notifications never fire (wrong collection path). Meeting reminder notifications show UTC time (wrong timezone). `sendMentionNotifications` has no auth check. The referral reward implementation uses `trial_end` on an active subscription, which incorrectly downgrades it to `trialing`. FCM token management is entirely undocumented. The notification system is the weakest-documented cross-cutting concern.

### Privacy and Data Handling

**Consistency: Moderate.** The high-level principle (privacy-first, anonymity-respecting) is consistently stated across all docs. The implementation has specific violations: the sobriety date privacy leak is fixed (per plans/README.md PR #26), but the batch reuse bug in `deleteUserAccount` means message anonymization is incomplete. Business meeting `decisions` subcollection is readable by unauthenticated users. The phone number dual-field issue creates inconsistent privacy enforcement depending on which field a screen checks.

### Security Rules

**Consistency: High (relative to other concerns).** SECURITY_RULES.md, SECURITY_AUDIT.md, and `firestore.rules` are the most consistently maintained and cross-referenced documents in the corpus. The audit was completed and updated. The remaining known issues (duplicate `recurring_transactions` rule block, `decisions` public read, missing rules for `stripe_disputes` and `processed_stripe_events`) are documented in the codebase review but have not yet been fixed.

### State Management (Redux)

**Consistency: Low.** The docs do not describe the Redux architecture in detail. The actual codebase has 29 slices (not the 14 in MEMORY.md), two parallel gratitude journal implementations (`engagementSlice` and `gratitudeSlice`), `serializableCheck: false` masking systemic date bugs, three competing `User`/`UserData` type definitions, and non-serializable state stored in entity adapters. No document describes which slices own which domain, naming conventions for thunks, or the serialization contract for dates.

---

## 7. Recommended Knowledge Artifacts

The following documents should be created to close the most critical gaps, ranked by impact:

### Priority 1 — Immediate (blocks safe production operation)

**`docs/FIRESTORE_SCHEMA.md`**
A single authoritative table of every Firestore collection: its canonical path (top-level vs. subcollection), document ID format, key schema fields, and which code files read/write it. This document resolves the announcements/meetings collection ambiguity that causes two critical production bugs and will prevent recurrence as new features are added. Specifically needs to resolve: is `announcements` top-level or `groups/{groupId}/announcements`? Is `meetings` top-level or `groups/{groupId}/meetings`?

**`docs/KNOWN_BUGS.md`** (or convert to GitHub Issues)
The February 2026 codebase review identified 90 issues (12 critical, 24 high). There is no tracking document that records which are fixed, which are in progress, and which are accepted. Without this, the same bugs will be rediscovered or will be introduced as new features reference broken infrastructure.

### Priority 2 — Pre-Launch Required

**`docs/FEATURE_GATING.md`**
Documents how the premium subscription gate is enforced in the mobile app. Answers: which Redux selector or hook is used to check subscription status, what the fallback behavior is for expired subscriptions, and whether Firestore security rules enforce the paywall (they currently do not — treasure features are rule-gated on admin/treasurer role, not subscription status).

**`docs/NOTIFICATION_ARCHITECTURE.md`**
Documents FCM token registration lifecycle, stale token cleanup, which collections and triggers produce which notifications, and how timezone is handled for scheduled notifications. Currently the notification system has no centralized documentation and multiple critical bugs.

**`docs/ACCOUNT_LIFECYCLE.md`**
Documents the full lifecycle of a user account (creation, email verification, subscription activation, subscription lapse, account deletion) and a group account (creation, admin assignment, subscription, admin rotation, deletion/archival). Specifically covers what data is retained vs. deleted on account deletion and the Stripe subscription cancellation requirement.

### Priority 3 — Architecture Health

**`docs/REDUX_ARCHITECTURE.md`**
Documents the 29-slice state tree: which slices own which domain, the serialization contract (all dates must be Unix timestamps or ISO strings before entering Redux), and the canonical `User` type (resolving the three-definition divergence). This is the prerequisite for re-enabling `serializableCheck` and eliminating the class of runtime crashes it currently masks.

**`docs/TESTING_STRATEGY.md`**
Documents the test layers (unit, integration, rules, e2e), minimum coverage expectations, how to run the full suite, and what "DONE" means in the plans/README.md context (functionally implemented vs. production-ready). Prevents the false-signal problem found in the V4.2 test.

**Update `docs/PRICING_MODEL.md`**
Remove or clearly mark the "Current Code Issue" section as resolved. Add the V4 intergroup pricing tiers (`productIdIntergroupA`, `productIdIntergroupB`). Update the break-even analysis to reflect V4 compute costs.

**Update `docs/plans/README.md`**
Add a "Status" column distinction between "plan implemented" and "production-ready." Add links to codebase-review-2026-02-22.md and plans/2026-02-23-v4-code-review.md as the authoritative lists of outstanding issues per version.

---

## 8. Summary: State of the System as of 2026-02-23

### What is solid

- The product vision is coherent, well-defined, and consistent across documents.
- The Firestore security rules architecture (custom claims) is the most correctly implemented subsystem.
- The business model (flat-rate group subscription, treasury as key value driver) is well-reasoned and consistently reflected in the code.
- Treasury management, treasurer handoff, and PDF report generation are among the most complete features.
- The plans documents (V2, V3, V4) contain detailed, actionable implementation plans that were apparently executed, creating a large feature surface area.

### What is fragile

- The collection path inconsistency for announcements and meetings is a systemic fault that makes it impossible to rely on two of the app's core push notification flows.
- The Redux serialization problem (`serializableCheck: false`) is a time bomb: each new date field added to state is a potential crash that will not be caught in tests.
- The Stripe payment subsystem has multiple independent bugs that together mean: the wrong price may be charged, duplicate subscriptions can be created, subscriptions are not cancelled on account deletion, and webhook processing may silently fail.
- The codebase has grown very fast (V2+V3+V4 in rapid succession). The plan README marks all of V2, V3 as done, and V4 as TODO, but the actual state is: V4 is implemented but has at least 9 critical bugs. Production deployment of V4 features in their current state would introduce security vulnerabilities and billing failures.

### The most important single action

Resolve the Firestore collection path ambiguity for announcements and meetings. This single decision, documented clearly and applied consistently, fixes two critical bugs, closes the biggest doc-to-code gap, and prevents future features from accidentally using the wrong path again.
