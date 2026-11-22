# After the RN 0.88 merge: portal and review follow-ups

> **Date:** 2026-11-14
> **Author:** Claude Code (review before following)
> **Estimated time:** about 2 hours, plus the device pass
> **Risk level:** Medium (production deploys and an IAM change)

## Context

These PRs are merged on `main`:

- #160, the React Native 0.88 upgrade;
- #231, launch fixes for crashes, the health score and refused queries;
- #267, the failed-payment banner and Mark Resolved (#238);
- #268, #160's review follow-ups;
- #210, the operator portal.

That merged code is not yet on staging or production, and a few items are still open. Until the deploy and IAM steps are done:

- documents can't be opened;
- Mark Resolved doesn't work;
- the new Storage rule isn't enforced.

The rest is deleting a superseded branch, two portal follow-ups, and reinstalling the git hooks #210 changed. #244, the last open phone bug here, was fixed by #270.

Status was checked on 2026-11-14 against `main` at `ebbff7a3`, and steps 9 and 10 against `1c87c78d`. Re-check each item before acting.

## Status, 2026-11-21

| Step                    | State                                                                                                                                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Signing grant        | **Done on `regroup-e2e`.** **Still open on `phoenix-cleanhouse`:** its functions run as `155667333239-compute@developer.gserviceaccount.com`, which has the API but no grant. The owner runs the step 1 commands with `P=phoenix-cleanhouse`. |
| 2. Functions on staging | **Done** from `main` at `2de821e5`: 65 functions, including `getDocumentLink` and `resolveFailedPaymentOffline`.                                                                                                                              |
| 3. Rules on staging     | **Done**: Firestore and Storage rules plus the indexes. Five committed indexes were missing on staging (two `chat`, two house-scoped `drug-tests`, one `guests`), and no index existed only on staging.                                       |
| 4. Production           | **Open.** These are launch-runbook deploys (P8, after the P7 staging release candidate), so they wait for that sequence.                                                                                                                      |
| 5. F-a97437 sign-off    | **Done**: the owner's `review: F-a97437 👍` is on #160.                                                                                                                                                                                       |
| 6. Simulator checks     | **Done** on an iOS 26 simulator, with the E2EEmulator build of `main` at `2de821e5`. **The chore flow passes:** it sees "1 of 1", logs the chore, then sees "2 of 1". The first attempt failed because the cold-start tap on SIGN IN didn't register; the rerun passed. **The Keychain reset works:** after signing in and reinstalling, the app opened still signed in without the reset and signed out with it. The script as a whole couldn't pass here: the only older E2EEmulator build (2026-10-30, before #160 merged) can't sign in against today's seed. |
| 7. Device pass          | **Open**, pre-launch, on real phones.                                                                                                                                                                                                         |
| 8. Superseded branch    | **Open**: `fix/regroup-portal-visible-defects` is still on the remote. Deleting it was refused by the session's permission rules, so the owner runs the step 8 command.                                                                       |
| 9. Portal follow-ups    | **In PR #282**: the Mark Resolved journey and the corrected comment. The journey also found that `resolveFailedPaymentOffline` failed on the emulator, and that peer leaders saw a Mark Resolved that always fails; #282 fixes both.          |
| 10. Git hooks           | **Done**: installed from `main`, and all three match `scripts/git-hooks/`.                                                                                                                                                                    |

A staging smoke test on 2026-11-21 checked steps 1 to 3 end to end, with a temporary house admin, house, document and failed payment, all deleted afterwards:

- `getDocumentLink` returned 200, and its signed link downloads.
- A direct Storage read of the document path got 403.
- `resolveFailedPaymentOffline` set the record to `resolved_offline`.

## Prerequisites

- [ ] `gcloud` and `firebase` are signed in as the owner (`gcloud auth list`, `firebase login:list`).
- [ ] A clean worktree at the current `origin/main`. The main checkout is often on a stale branch.
- [ ] For production steps: the deploy freeze is over and launch allows it. Production deploys wait for the owner's go.

## Steps

### Owner

#### 1. Let the functions account sign document links

**Where:** a terminal. Do this for `regroup-e2e` now, and for `phoenix-cleanhouse` before production documents are used.

`getDocumentLink` signs its URLs through the IAM Credentials API. The functions' runtime account needs the Token Creator role on itself; Editor doesn't include it. On 2026-11-14, `regroup-e2e` had the API enabled but no grant. `phoenix-cleanhouse` has not been checked.

```bash
P=regroup-e2e   # then phoenix-cleanhouse
N=$(gcloud projects describe $P --format='value(projectNumber)')
SA="$N-compute@developer.gserviceaccount.com"
gcloud services enable iamcredentials.googleapis.com --project $P
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --member="serviceAccount:$SA" --role=roles/iam.serviceAccountTokenCreator --project $P
```

**Expected result:** `gcloud iam service-accounts get-iam-policy "$SA" --project $P` lists `roles/iam.serviceAccountTokenCreator` for the account itself.

---

#### 2. Deploy the functions to staging

**Where:** `regroup/` in the clean worktree.

This brings staging up to `main`, including `resolveFailedPaymentOffline` (#267, which Mark Resolved calls) and #231's server changes. First compare `firebase functions:list --project regroup-e2e` with `ALL_FUNCTIONS` in `scripts/deploy-batched.sh`. Decide beforehand what to answer if the deploy offers to delete a function that's no longer exported.

```bash
npm --prefix functions ci && npm --prefix functions run build
firebase deploy --only functions --project regroup-e2e
```

**Expected result:** every function deploys, and the billing preflight passes.

---

#### 3. Deploy the rules to staging

**Where:** `regroup/mobile`.

#268's Storage rule takes effect only once it's deployed: document files then open only through their signed link. The rules deploy replaces the whole Firestore and Storage rulesets. The `deploy:rules` scripts name `phoenix-cleanhouse`, so pass staging explicitly.

```bash
cd firebase && firebase deploy --only firestore:rules,storage --project regroup-e2e --dry-run
firebase deploy --only firestore:rules,storage --project regroup-e2e
```

**Expected result:** both rulesets release. On a staging phone, a house admin can upload a document and open it.

---

#### 4. Production: steps 1 to 3 for `phoenix-cleanhouse`

> **Warning:** these are production deploys. Run them only after launch allows it and you've said go. Use `npm run deploy:rules:dry`, then `npm run deploy:rules`, from `regroup/mobile`.

**Expected result:** the same as on staging.

---

#### 5. Close the High review finding on #160 (optional)

**Where:** a comment on https://github.com/marcusk639/recovery-platform/pull/160

You signed off on F-a97437 in a session, but the review bot only records it from your own comment:

```
review: F-a97437 👍
```

**Expected result:** the bot's summary stops listing it as open on its next run.

---

#### 6. Run the two changed Maestro checks on a simulator

**Where:** the iOS simulator, with the `E2EEmulator` build and seeded emulators (`regroup/mobile/maestro/README.md`).

#268 changed both of these, and neither has run on a device yet.

```bash
maestro test -e APP_ID=com.rats.dev.e2e.emu maestro/flows/guest-log-chore.yaml
maestro/scripts/upgrade-in-place.sh --old <old rats.app> --new <new rats.app>
```

**Expected result:**

- The chore flow sees "1 of 1" before logging, then "2 of 1".
- A second run of the upgrade script also starts signed out.

---

#### 7. Device pass, before launch

**Where:** `regroup/docs/operations/manual-tasks/2026-11-06-rn-0.88-merge-device-pass.md`. You moved it to pre-launch on 2026-11-14.

It now includes opening a document (§4), which needs step 1 on the project you test against.

**Expected result:** every row is recorded in decision record §7.3.

---

### Development (Claude can do these on request)

#### 8. Delete the superseded portal-defects branch

**Where:** GitHub, branch `fix/regroup-portal-visible-defects`.

> **Warning:** deleting a remote branch can't be undone from GitHub's side.

All four bugs that branch fixes are fixed on `main` by other PRs:

- #257 and #249, by commits pushed to #160;
- #238, by #267;
- #244, by #270 (merged 2026-11-15).

It has no open PR. Delete it with `git push origin --delete fix/regroup-portal-visible-defects`, and remove the local worktree `rp-portal-defects`.

**Expected result:** the branch no longer appears in `git ls-remote --heads origin`.

---

#### 9. Portal follow-ups after #210

**Where:** a new branch from `origin/main`, in `regroup/portal`.

#210 was squash-merged on 2026-11-14 (`d0411cfa`), so it no longer needs bringing up to `main`, and its `test.fail` pins are gone. Two items are still open:

- Add a browser journey for Mark Resolved:
  - a manager resolves a seeded `failed` record, which `resolveFailedPaymentOffline` sets to `resolved_offline`, and the banner empties;
  - a peer leader sees no button.
- `e2e/payments.spec.ts:10` says "only the failed-payment banner calls Stripe". That is no longer true; the banner reads payment records.

Run `scripts/e2e.sh` before opening the PR, after checking with `lsof` that ports 14400, 18080 and 5199 are free.

**Expected result:** a PR with the new journey and the corrected comment, and `regroup/portal — browser tests` green on it.

---

#### 10. Reinstall the git hooks from current `main`

**Where:** any checkout of current `origin/main`, once per clone: `./scripts/install-git-hooks.sh`.

#210 changed `scripts/git-hooks/pre-push`, which now runs the portal's tests when a push changes the phone app, so clones still run the old hook until this is done. A clone's worktrees share one hooks directory, so one run covers all of them. Install from `main`, not from a feature branch's worktree, or every checkout gets that branch's hooks.

**Expected result:** `scripts/session-check.sh` no longer warns that an installed hook differs from `origin/main`.

---

## Verification

- [x] On staging, a house admin opens an uploaded document: the signed link works (steps 1 to 3). Smoke test, 2026-11-21.
- [x] On staging, Mark Resolved on a failed payment clears the banner, and the record reads `resolved_offline` (step 2). Smoke test through the callable, 2026-11-21.
- [x] As a house admin, a direct Storage download of a document path is refused (step 3; covered by `documentUploads.rules.test.ts`). It got 403 on staging, 2026-11-21.
- [ ] `fix/regroup-portal-visible-defects` is gone from the remote (step 8).
- [ ] The Mark Resolved journey passes in `regroup/portal — browser tests` (step 9).
- [x] Session start shows no hook drift warning (step 10).

## Rollback

- **IAM grant:** remove it with `gcloud iam service-accounts remove-iam-policy-binding` and the same arguments.
- **Functions and rules:** redeploy from the previous `main` commit.

> **Warning:** a rules deploy replaces the whole ruleset. Roll back from a commit whose rules you have checked, never from a stale checkout.

## Notes & Gotchas

- The emulator can't sign links, so opening a document only works against staging or production.
- `npm run deploy` in `regroup/functions` doesn't build. Always build first (`regroup/functions/CLAUDE.md`).
- Indexes aren't part of `deploy:rules`. Nothing listed here needs a new index.
- The production steps also wait on the deploy freeze in the launch roadmap.
