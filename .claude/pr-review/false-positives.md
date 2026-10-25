# Known-intentional patterns: do not flag

Each entry is deliberate and documented. Flag one only if the PR changes the reason it is safe, and then say
which reason changed.

## regroup callables deliberately not gated by entitlement

`regroup/functions/CLAUDE.md` lists callables that stay open to a lapsed operator on purpose: resident rent
payment, claim revocations, invitation redemption, the billing and auth escape hatches (subscription create,
reactivate, billing portal, payment-method update, the Stripe Connect trio) and read-only reports. Gating them
would strand residents or lock an operator out of paying. Don't report a missing entitlement check on these.
Do report a new write callable that skips the gate without being added to that list.

Related: when no subscription status is recorded, entitlement behaviour follows `regroup/functions/src/util/entitlement.ts`.
Read the code before calling a grant or a denial wrong, because the docs describing earlier phases have lagged it.

## detox-recovery silent 200 responses

`detox-recovery/app/api/contact/route.ts` and `detox-recovery/app/api/subscribe/route.ts` return
`200 { success: true }` when the honeypot trips, when optional provider env vars are missing, and on idempotent
duplicates. This is the anti-bot design in `detox-recovery/CLAUDE.md` and `detox-recovery/lib/abuse-protection.ts`.
It is not class 9. A new form must include the honeypot input.

## Firebase web API keys in client config

The Firebase web `apiKey` in `regroup/web/src/environments/environment.ts`, mobile `GoogleService-Info.plist` /
`google-services.json` files and web Firebase config is a public client identifier, not a secret. The
pre-commit scan exempts it in Firebase client config. Other Google API keys (Maps, Places) outside Firebase client
config are still class 11.

## No rules file in regroup/web

regroup web shares the rules in `regroup/mobile/firebase/firestore.rules` (`regroup/web/CLAUDE.md`). A "missing
rules" flag scoped to `regroup/web/` is wrong. A new web write to a new collection still needs a rule in the mobile file.

## The two public homegroups callables

`getPublicGroupProfile` (`homegroups/functions/src/callable/getPublicGroupProfile.ts`) and `submitPartnershipLead`
(`homegroups/functions/src/callable/submitPartnershipLead.ts`) are public by design and don't call `requireAuth`.
Review what they return and their abuse limits, not the absence of auth.

## v1 Firestore triggers in homegroups

Kept on purpose (`conventions.md`). Don't suggest migrating them to v2 as part of an unrelated PR.

## Duplicated helpers and entities

The twins listed under twin-helper in `contract-map-cross-product.md` exist because `shared/` doesn't yet.
Duplication alone is not a finding.

## Nested product workflows

`*/.github/workflows/*.yml` under product folders are inert. Editing them has no effect. Say so once if a PR
relies on them; don't review their contents as if they run.

## Facts the repo can't verify

Don't claim these are broken or fine. List them under "Not reviewed / limits":

- APNs keys and push certificates, iOS signing and provisioning, Android keystores.
- Stripe Dashboard settings: webhook endpoint URLs, enabled events, Connect settings, live vs test mode.
- Hosting domains, DNS, and whether association files are actually served.
- Mailboxes, sender verification, Calendly and other third-party account settings.
- Deployed Firestore rules and indexes, and Secret Manager contents.
