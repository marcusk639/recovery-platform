# Areas

One subagent per applicable area (see the matrix in SKILL.md), running in parallel with the
ledger subagents. Each traces its area end to end and adds anything launch-relevant that no
targeted doc mentions to the ledger as `UNDOCUMENTED`.

## Contents

- [Money path](#money-path)
- [Auth and onboarding](#auth-and-onboarding)
- [Deploy and config](#deploy-and-config)
- [Store and distribution](#store-and-distribution)
- [Retention mechanics](#retention-mechanics)
- [Operational readiness](#operational-readiness)
- [Failure classes every area checks](#failure-classes-every-area-checks)

## Money path

Trace signup → checkout → webhook → entitlement, and for marketplaces payment → transfer →
payout. Check:

- Stripe products and prices: live vs test, and that each product has a default price.
- Webhook endpoints: the events registered vs each handler's `switch`, signing secrets per
  endpoint, and stale duplicate endpoints that deliver every event twice.
- Connect: the account API the platform actually supports (regroup: v1; v2 is gated), onboarding
  links, and the capability that gates the charge type.
- Amount units at every boundary: cents in Stripe and storage, dollars only at the UI.
- Whether every charge path, including scheduled or automatic ones, has a real destination and a
  status gate. Follow each field to its writer.
- Whether a payment produces a durable entitlement the app actually reads.
- Pending data migrations on money fields, and the order they must run in relative to deploys.

## Auth and onboarding

Can a brand-new user reach a paid state unaided? List every step where they can get stuck, drop
off, or need manual intervention: invite redemption, claims propagation, role-gated screens, and
the return path from hosted onboarding.

## Deploy and config

Compare what is deployed with what is committed:

- functions, by update time vs merge time;
- Firestore rules and indexes, which are deployed by hand;
- callable regions vs client call sites;
- secrets and environment values the code reads;
- the functions `ignore` list, and what a deploy would upload;
- feature switches (`TIER_BILLING_ENABLED`, `CONNECT_ACCOUNTS_API`, and so on) and their intended
  live values.

Anything that exists only live, or only in a commit, is a risk.

## Store and distribution

Mobile: iOS and Android build health, bundle IDs, store metadata, privacy labels, and exposure to
review guidelines (payments for real-world services, health data). Web targets: domain, SSL,
SEO basics, and the SSR or hosting rewrites that serve redirect endpoints.

## Retention mechanics

Report what exists in code (notifications, invites, referrals, re-engagement surfaces) and
whether each one is wired end to end. Don't model their impact.

## Operational readiness

What happens the first time something breaks for a paying customer?

- error visibility (logs, alerting, who watches Cloud Scheduler);
- the support path;
- refund and dispute handling;
- abuse handling;
- cost per user.

## Failure classes every area checks

Each of these has already hurt this repo, and none is visible from docs or code alone:

1. **Merged on GitHub, absent from `main`.** A stacked PR merged into a dead branch. Confirm on
   `origin/main`.
2. **Correct by mocks, rejected by the real service.** A green suite says nothing about whether
   an external service accepts the call. Mark as L2 and name the L4 check.
3. **Committed but not deployed.** Rules, indexes, function code, webhook registrations.
4. **Written but never run.** Migrations, backfills, one-off scripts, especially those with a
   deploy-time cutoff.
5. **A field read but never written.** In a schemaless store, a reader keyed on a field nobody
   writes fails silently. Grep for the writers of every field on the money path.
6. **Tests that ratify the defect.** Fixtures modelling states production never produces. Check
   them against the SDK typings or a real response.
7. **Secrets that ship.** A deploy upload without an `ignore` list, keys in example env files,
   test keys in committed config.
