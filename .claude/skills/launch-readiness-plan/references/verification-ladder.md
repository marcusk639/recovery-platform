# Verification ladder

Every ledger row and backlog item records the highest level at which it was verified. A verdict
must never claim more than its level supports.

## Contents

- [Levels](#levels)
- [What each level can and can't settle](#what-each-level-can-and-cant-settle)
- [Confidence](#confidence)
- [When to ask the user](#when-to-ask-the-user)
- [Recipes](#recipes)

## Levels

| Level | Name               | What was done                                                                                                                  |
| ----- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| L1    | Static read        | Read the code, config or git history                                                                                           |
| L2    | Tests              | Ran the relevant tests and typecheck, and checked the fixtures model reality                                                   |
| L3    | Emulator           | Exercised it against a local Firebase emulator                                                                                 |
| L4    | Test-mode external | Made a real call against the external service in test mode (e.g. Stripe test mode on the real platform account)                |
| L5    | Live state         | Observed deployed or console state: deployed functions, live rules and indexes, registered webhooks, live Stripe configuration |

## What each level can and can't settle

- **L1** settles what the code _says_. It can't settle what happens at runtime or what is
  deployed. To trace a field on the money path, find both its writers and its readers; one side
  alone isn't enough.
- **L2** settles behaviour _as modelled_. Tests can ratify defects: this repo has had green
  suites whose fixtures described states production never produces (fields the app never
  populates, a status Stripe never sends). Before you trust a green run, check that the fixtures
  match the real shape: the SDK typings, or a real response.
- **L3** settles security rules, triggers and query and index shapes against Firebase semantics.
  It can't settle what is deployed.
- **L4** settles whether an external service accepts the integration as written. Mocks can't.
  The Stripe Accounts v2 rollout passed 978 tests and failed its first real create.
- **L5** settles what is actually live: committed rules and indexes vs deployed, the functions
  source upload, the registered webhooks.

For external integrations (Stripe, Firebase deploy state, app stores, email providers), a claim
verified only at L1 or L2 can't be `IMPLEMENTED` with high confidence. Use `UNVERIFIABLE-HERE` or
medium confidence, and name the L4/L5 check that would settle it.

## Confidence

| Confidence | Requires                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| high       | Verified at the level that actually settles the claim (usually L4/L5 for external, L2/L3 for internal logic) |
| medium     | Verified one level short, with nothing pointing the other way                                                |
| low        | L1 only for a runtime or external claim, or the evidence conflicts                                           |

## When to ask the user

| Action                                                                                                                          | Ask first?                         | Why                                                |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------- |
| Reading code, git history, CI results                                                                                           | no                                 | No side effects                                    |
| Running tests, typecheck, build, local emulator                                                                                 | no                                 | Local only                                         |
| Read-only deploy state (`gcloud functions list`, `firebase firestore:indexes`, rules release, Stripe _read_ calls in test mode) | no                                 | Read-only                                          |
| Any Stripe call that creates, updates or deletes, even in test mode                                                             | **yes**                            | Creates real objects on a real account             |
| Any read or write of production data                                                                                            | **yes**                            | Live customer data, possibly PII                   |
| Deploys, migrations, Secret Manager writes, webhook endpoint changes                                                            | **yes, and normally out of scope** | This skill reviews; it doesn't change live systems |

When approval isn't given, record the item at the level reached and say which check would settle
it.

## Recipes

Read-only unless marked. Paths assume the regroup product; adapt per target.

**Is it on `main`?** Use `git show origin/main:<path>` or the two-dot check from the root
`CLAUDE.md`. GitHub's "merged" label isn't enough, because a stacked PR can merge into a dead
branch.

**Deployed functions vs committed exports (L5):**
`gcloud functions list --project phoenix-cleanhouse --format='value(name,updateTime)'`, compared
with the exports in `regroup/functions/src/index.ts`. A function updated before a relevant merge
is still running the old code.

**Indexes and rules (L5):** `firebase firestore:indexes --project phoenix-cleanhouse` compared
with `regroup/mobile/firebase/firestore.indexes.json`. For rules, compare the latest release in
the Firebase console or REST API with `regroup/mobile/firebase/firestore.rules`.

**What a functions deploy uploads (L1/L5):** Check `functions.ignore` in the product's
`firebase.json`. Without it, the Firebase CLI uploads everything except `node_modules` and
`.git`, including `*.local` secrets and service-account keys.

**Stripe test mode on the real platform (L4, ask first for writes):** read the key with
`gcloud secrets versions access latest --secret=STRIPE_TEST_SECRET_KEY --project=phoenix-cleanhouse`
straight into an environment variable for a node script, using the package's own `stripe`
dependency at the pinned API version. Refuse to run unless the key starts with `sk_test_` or
`rk_test_`. Never print it. Clean up anything the check created (delete test accounts) and say so
in the plan.

**Gen2 function logs (L5):** see `regroup/functions/CLAUDE.md`, "Live reads". Use
`resource.type="cloud_run_revision"` with a lowercased `service_name`. Retention is about 30 days.
