# Regroup live Stripe configuration: findings and change log, 2026-11-21

Regroup's production functions (`phoenix-cleanhouse`) against Regroup's live Stripe account
`acct_1GfryQKsstp3aqoP` (regroup-app.com). Each read was read-only. Each write is listed with who
made it and when, and how to undo it. No secret value appears in this file.

## How it was read

- **Deployed config:** `gcloud functions describe createOperatorSubscription --region us-central1 --project phoenix-cleanhouse`.
  This gives the environment variable names, the price-ID and switch values, and the secret bindings by name and version only.
- **Secret versions:** `gcloud secrets versions list STRIPE_SECRET_KEY --project phoenix-cleanhouse` for the metadata.
  For each version, only its byte length, its key type and the account it authenticates as
  (`accounts.retrieve()`) were read, never the value.
- **Regroup's live account:** the owner's Stripe CLI (v1.54), switched with
  `stripe switch acct_1GfryQKsstp3aqoP --live`.
- **Documentation the prices were confirmed against before any write:**
  - `regroup/functions/src/config.ts:133-218` (`SUBSCRIPTION_TIERS` monthly `amountCents`);
  - `regroup/CLAUDE.md:49` (Traditional 69/129/249, Oxford 49/89/299 a month);
  - the launch design §4.1 item 3 (`docs/superpowers/specs/2026-11-06-regroup-launch-reboot-design.md:251-262`: annual = monthly × 10, on the same two products, no trial on a Price, Oxford Network created though not for sale);
  - `regroup/docs/launch-readiness/regroup-pricing-revision-plan.md:23` (P-4 "~17% (2 months free)", with the examples $490/yr and $1,290/yr, both × 10);
  - the annual amounts in `regroup/scripts/stripe-product-values.md`.

  The web pricing page hardcodes no amounts: it computes the savings from the two prices (`pricing-one.component.ts:75-80`).

## Findings (2026-11-22 UTC)

| #   | What                                                                       | Live state at the start                                                                                                                                                                                             | Verdict                                                                                                                     |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| F1  | `STRIPE_SECRET_KEY` bound to production functions                          | `@3` (created 2026-06-06) is a live **secret** key for `acct_1RNFH5ID2FGlm411`, dashboard name "Homegroups App", not Regroup's account                                                                              | **Wrong account.** Every Regroup Stripe call went to the Homegroups App account, where none of Regroup's prices exist       |
| F2  | `STRIPE_SECRET_KEY` versions 4, 5, 6                                       | 0 bytes each. A broken command in the instructions given to the owner caused this: zsh's `read -p` doesn't prompt                                                                                                   | **Empty.** While enabled, `latest` was empty                                                                                |
| F3  | 6 monthly `STRIPE_PRICE_*` (deployed)                                      | `price_1TkbS*`, all live and active, at the right amounts                                                                                                                                                           | OK                                                                                                                          |
| F4  | 6 annual `STRIPE_PRICE_*_ANNUAL` (deployed, and in `stripe-prices.env`)    | Test-mode IDs ("a similar object exists in test mode")                                                                                                                                                              | **Missing live.** Annual checkout failed                                                                                    |
| F5  | Monthly IDs in `regroup/scripts/stripe-product-values.md` (`price_1TnBm*`) | Test-mode IDs                                                                                                                                                                                                       | Doc was wrong                                                                                                               |
| F6  | Duplicate active monthly prices                                            | Two more full sets, `price_1TkbH*` and `price_1Ti67*`/`price_1Ti682*`, none configured                                                                                                                              | Archive, per the launch design                                                                                              |
| F7  | Tier products' default price                                               | None on either product                                                                                                                                                                                              | OK: the code uses env price IDs                                                                                             |
| F8  | Webhook endpoint `we_1UNgxzKsstp3aqoPyxhYJkuY` → `stripeEvents`            | 11 events. It lacks `customer.subscription.created`, `customer.subscription.trial_will_end` and `invoice.payment_action_required`, which the handler implements (`regroup/functions/src/webhooks/stripeWebhook.ts`) | **Incomplete.** Without `invoice.payment_action_required`, an operator whose renewal needs 3-D Secure gets no notice        |
| F9  | Customer Portal configuration                                              | None                                                                                                                                                                                                                | **Missing.** `createBillingPortalSession` (`subscriptions.ts:707-710`) passes no configuration, so it needs a saved default |
| F10 | Platform account                                                           | Charges and payouts enabled, 0 requirements due, 0 connected accounts                                                                                                                                               | OK                                                                                                                          |
| F11 | Legacy prices                                                              | `plan_HFkfwM5lQx6oud` ($10/mo Home) and `plan_HFkh7QvRnNjMy8` ($1/mo Resident) are the products' defaults                                                                                                           | Kept until the launch plan cancels the legacy subscriptions                                                                 |
| F12 | Legacy IDs in `regroup/scripts/stripe-prices.env:10-11`                    | `STRIPE_HOUSE_PRICE_ID` and `STRIPE_OXFORD_PRICE_ID` carry another account's suffix (`…RuYQlYKoSl…`)                                                                                                                | **Wrong IDs** (launch design §4.1 item 3). Not changed here: only the legacy path reads them                                |

## Changes made

| When (UTC)               | By                     | Change                                                                                                                                                                         | Undo                                                       |
| ------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| 2026-11-22 05:22–05:26   | Owner                  | Added `STRIPE_SECRET_KEY` versions 4, 5, 6: all empty (F2)                                                                                                                     | —                                                          |
| 2026-11-22, before 11:11 | Owner                  | Disabled versions 4, 5, 6                                                                                                                                                      | `gcloud secrets versions enable`                           |
| 2026-11-22 11:11         | Owner                  | Added `STRIPE_SECRET_KEY` version 7. Checked by Claude: 107 bytes, live **secret** key, authenticates as `acct_1GfryQKsstp3aqoP` (regroup-app.com)                             | Disable version 7                                          |
| 2026-11-22               | Claude                 | Switched the local Stripe CLI to `acct_1GfryQKsstp3aqoP --live` (local CLI config only)                                                                                        | `stripe switch`                                            |
| 2026-11-22               | Claude (attempted)     | Disable versions 4–6: refused by the session's safety classifier. The owner did it instead                                                                                     | —                                                          |
| 2026-11-22               | Claude, owner-approved | **Created six live annual prices** (table below). Each create used an idempotency key `regroup-annual-<houseType>-<tier>-2026-11-22`                                           | Archive: `stripe prices update <id> --live --active=false` |
| 2026-11-22               | Claude, owner-approved | **Archived the 12 duplicate monthly prices** (F6, list below)                                                                                                                  | `stripe prices update <id> --live --active=true`           |
| 2026-11-22               | Claude (attempted)     | Add the three missing events to `we_1UNgxzKsstp3aqoPyxhYJkuY`: refused by the session's safety classifier, so nothing changed                                                  | —                                                          |
| 2026-11-22               | Claude                 | `regroup/scripts/stripe-prices.env`: the annual block now holds the live IDs. `regroup/scripts/stripe-product-values.md`: both tables now hold the live monthly and annual IDs | git                                                        |

### Annual prices created (live, `recurring.interval=year`, USD, tax behaviour unspecified as on the monthly prices, no trial)

| Env var                                 | Price ID                         | Amount    | Product               | Nickname                           |
| --------------------------------------- | -------------------------------- | --------- | --------------------- | ---------------------------------- |
| `STRIPE_PRICE_TRAD_STARTER_ANNUAL`      | `price_1UeYjFKsstp3aqoPpBAgvcE1` | $690.00   | `prod_UhV6sgrWbOgsyg` | starter tier annual                |
| `STRIPE_PRICE_TRAD_PROFESSIONAL_ANNUAL` | `price_1UeYjGKsstp3aqoPROh0Gi5J` | $1,290.00 | `prod_UhV6sgrWbOgsyg` | professional tier annual           |
| `STRIPE_PRICE_TRAD_ENTERPRISE_ANNUAL`   | `price_1UeYjGKsstp3aqoPeoGZhm1k` | $2,490.00 | `prod_UhV6sgrWbOgsyg` | enterprise tier annual             |
| `STRIPE_PRICE_OXFORD_STANDARD_ANNUAL`   | `price_1UeYjHKsstp3aqoPaVufbFN9` | $490.00   | `prod_UhV71tzKC4XToy` | standard tier annual               |
| `STRIPE_PRICE_OXFORD_PLUS_ANNUAL`       | `price_1UeYjIKsstp3aqoP9FsbGXOd` | $890.00   | `prod_UhV71tzKC4XToy` | plus tier annual                   |
| `STRIPE_PRICE_OXFORD_NETWORK_ANNUAL`    | `price_1UeYjJKsstp3aqoPWvnA26Gu` | $2,990.00 | `prod_UhV71tzKC4XToy` | network tier annual (not for sale) |

Metadata `houseType` and `tier` match the monthly prices.

### Duplicate monthly prices archived

`price_1TkbHWKsstp3aqoPd6vkaIZK`, `price_1TkbHVKsstp3aqoPkZ45XnKb`, `price_1TkbHVKsstp3aqoPNNNJYCii`,
`price_1TkbHUKsstp3aqoPZeqE9spP`, `price_1TkbHUKsstp3aqoPw4uCl0JW`, `price_1TkbHTKsstp3aqoPQuzePlUE`,
`price_1Ti682Ksstp3aqoP2VgfA3ur`, `price_1Ti67tKsstp3aqoPZ0Rw2bsR`, `price_1Ti67hKsstp3aqoPvgB6UiEy`,
`price_1Ti67UKsstp3aqoPobIBxzYp`, `price_1Ti67MKsstp3aqoPaOtHiINu`, `price_1Ti67BKsstp3aqoPT412YjPL`.

The six deployed monthly prices (`price_1TkbS*`) and the legacy `plan_HFk*` plans are kept.

## Still to do

### Owner, in the Stripe Dashboard (live mode, regroup-app.com)

1. **Webhook events (F8):** Developers → Webhooks → the `stripeEvents` endpoint
   (`…/phoenix-cleanhouse.cloudfunctions.net/stripeEvents`) → Update details → add
   `customer.subscription.created`, `customer.subscription.trial_will_end` and
   `invoice.payment_action_required`. Keep the existing 11.
2. **Customer Portal (F9):** Settings → Billing → Customer portal → configure and **Save**. Allow
   updating the payment method, invoice history and cancelling. If plan switching is on, limit it
   to the six monthly and six annual tier prices above.
3. **Publishable keys:** confirm that the web `pk_live_…` in `regroup/web/src/environments/environment.prod.ts:5`
   and the mobile release build's publishable key are Regroup's (Developers → API keys). The old
   secret key belonged to another account, so check that these keys aren't from it too.

### Before production takes any of this

- Production only picks up `STRIPE_SECRET_KEY` version 7 and the new annual IDs on a functions
  redeploy, or a configuration-only update of each function. The deployed functions are pinned to
  `@3` and the old env values. Production is also missing `CONNECT_BASE_URL`, and its hosting has no
  `/connect` rewrites. See `docs/launch-readiness/plan-regroup-recovery-api-2026-11-21.md` for the
  deploy order. The launch roadmap's freeze means the owner decides when.
- After the redeploy, re-run the read-only check that every deployed `STRIPE_PRICE_*` retrieves on
  the account the deployed key authenticates as.
