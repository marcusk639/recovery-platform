---
name: firebase-deploy-preflight
description: Ordered pre-deploy gate for any recovery-platform Firebase product (homegroups, regroup, recovery-api, detox-recovery). Run before `firebase deploy`, before shipping Cloud Functions/callables, before pushing Firestore/storage rules or indexes, or whenever asked to "check before deploy", "preflight", or "is it safe to deploy". Catches the two failure classes that have already caused production outages here — callable region/client mismatches and rules/index drift between the committed config and what's actually live — plus a secret-hygiene pass. Composes with each product's own deploy scripts; does not replace them.
---

# Firebase Deploy Preflight

Two real production outages in this monorepo came from mechanically-checkable causes:

1. **Region mismatch** — `joinGroupByInviteCode` deployed to `us-west1`, `sendGroupInviteEmail` to `us-east1`, while the mobile client called the default `us-central1`. Invite-join was 100% broken. (Fixed 2026-08-01 by removing both region pins — see `homegroups/functions/CLAUDE.md`.)
2. **Rules/index drift** — a `group_conscience_votes` composite index existed only via manual Console creation and was never committed; a fresh deploy (e.g. provisioning a new environment) threw `failed-precondition`. Separately, a `members` Firestore rule broke `getUserGroups` for every user because the rule couldn't be satisfied by the `list` query's own constraints.

This skill is a checklist, not a script. Run every numbered step in order for the product you're about to deploy. Any step marked **BLOCKER** must be resolved before deploying; do not talk yourself past one.

**Do not run `firebase deploy` as part of this skill** — it only gates the decision. Deploying is a separate, explicit action.

## Step 0 — which product, which directory

| Product        | Firebase project                                       | `.firebaserc` location     | Firestore/storage rules config                                                                                                                                                                  |
| -------------- | ------------------------------------------------------ | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| homegroups     | `recovery-connect-cad4b` (e2e alias: `homegroups-e2e`) | `homegroups/.firebaserc`   | `homegroups/firebase.json` (root of product)                                                                                                                                                    |
| regroup        | `phoenix-cleanhouse`                                   | `regroup/.firebaserc`      | `regroup/mobile/firebase/firebase.json` — **not** `regroup/firebase.json` (that one only has `functions.predeploy`) or `regroup/web/firebase.json` (hosting+functions only, no `firestore` key) |
| recovery-api   | `recovery-platform`                                    | `recovery-api/.firebaserc` | `recovery-api/firebase.json` (functions + indexes only, no rules — no user-facing Firestore)                                                                                                    |
| detox-recovery | `nextsteprecovery-1d5c2` (alias `nextstep-recovery`)   | **none**                   | `detox-recovery/firebase.json` (App Hosting only)                                                                                                                                               |

**Two gotchas found while writing this skill:**

- **detox-recovery has no `.firebaserc` at all** — nothing is pinned. `firebase use` there will not default to the right project; you must pass `--project nextsteprecovery-1d5c2` explicitly or it's a BLOCKER until someone runs `firebase use --add`.
- **`regroup/mobile/firebase/` also has no `.firebaserc`.** That directory holds the actual `firestore.rules`/`storage.rules`/`firestore.indexes.json` and their `firebase.json`, but the project pin lives two directories up in `regroup/.firebaserc`. If you `cd` into `regroup/mobile/firebase/` to run a rules-only deploy, confirm the active project explicitly — don't assume it inherits `phoenix-cleanhouse`.

**Check:**

```bash
cd <product-dir-you-will-actually-run-deploy-from> && firebase use
```

Pass: prints the project ID from the table above. Fail (wrong project, "no active project", or a stale alias): **BLOCKER** — fix with `firebase use <project-id>` before anything else. This step requires a live `firebase login`; label it as such if running in an environment without credentials.

## Step 1 — region audit (failure class 1)

Applies to `homegroups/functions/src/callable/` and `regroup/functions/src/callable/`.

1. Find every callable declaring a non-default region:

   ```bash
   grep -rnE "region:\s*[\"'][a-z0-9-]+[\"']" homegroups/functions/src/callable regroup/functions/src/callable --include="*.ts" | grep -v "us-central1"
   ```

   Also sanity-check the baseline (should currently be empty for non-`us-central1` values — both products' clients assume the SDK default region):

   ```bash
   grep -rn "region:" homegroups/functions/src/callable regroup/functions/src/callable --include="*.ts"
   ```

2. **Pass condition:** the first command returns nothing. Every callable is on the implicit default (`us-central1`), which is what both clients call without specifying a region.

3. **If it returns a match** (file, callable name, region `R`) — this is the exact shape of the incident above. For that callable name `<NAME>`, find every client call site:

   ```bash
   grep -rn "httpsCallable(['\"]<NAME>['\"]" homegroups/mobile/src homegroups/web/src --include="*.ts" --include="*.tsx"
   grep -rn "httpsCallable(['\"]<NAME>['\"]" regroup/mobile/src regroup/web/src --include="*.ts" --include="*.tsx"
   ```

   Then open each match and trace how the `functions` instance it's called on was constructed:
   - `functions()` (homegroups RN default) or bare `AngularFireFunctions` injection (regroup web) → implicit `us-central1`. **Mismatch with any `R != us-central1` → BLOCKER.**
   - `firestore().app.functions('<region>')` (homegroups RN — see `homegroups/mobile/src/models/GroupModel.ts:1051` for the existing pattern) or an equivalent explicit region argument → must equal `R` exactly. Any other value, or no client call site found at all for `<NAME>`, → **BLOCKER**.

4. Any callable with a declared region and _zero_ matching client call sites pinning that same region is a BLOCKER by definition — there is no way it can be reached in production.

This check is fully mechanical from source (no live Firebase state needed).

### 1b. The v1 `onCall` trap (silent, and the inverse failure)

Step 1 catches a region that IS honored. The v1 form fails the opposite way: it
**accepts a `region` and silently ignores it**, so the function lands in
`us-central1` no matter what the config says. A reviewer reading the source sees
`us-west1` and believes it.

```bash
grep -rn "functions\.https\.onCall" homegroups/functions/src regroup/functions/src --include="*.ts"
```

**Pass condition:** no matches outside `__tests__/`.

Current state (verified 2026-09-04): three matches, all in test files that exist
specifically to document this bug —
`homegroups/functions/src/__tests__/{joinGroupByInviteCode,adminRemoval,sendGroupInviteEmail}.test.ts`.
Those are intentional regression tests, not deployable code, so they pass.

**A match in non-test source is a BLOCKER**: migrate it to
`onCall` from `firebase-functions/v2/https` before deploying. Do not simply delete
the `region` key — first confirm which region the function is *actually* running in
(v1 ignored the key, so it is `us-central1`), then make sure every client call site
agrees with that reality rather than with the ignored config.

## Step 2 — rules and index drift (failure class 2)

Config lives only in the committed files; deployed state can silently diverge from them (see Step 0's `.firebaserc` gaps — both a symptom of nothing being pinned, and a way drift creeps in when the wrong project gets deployed to).

### 2a. Index drift

```bash
firebase firestore:indexes > /tmp/deployed-indexes.json   # requires live `firebase login` + correct `firebase use`
diff <(jq -S . <product>/firestore.indexes.json) <(jq -S . /tmp/deployed-indexes.json)
```

(homegroups: `homegroups/firestore.indexes.json`; regroup: `regroup/mobile/firebase/firestore.indexes.json`; recovery-api: `recovery-api/firestore.indexes.json`.)

- **Pass:** diff is empty.
- **Entries only in `/tmp/deployed-indexes.json`** (exist live, e.g. via Console, but not committed): **BLOCKER** — this is exactly the `group_conscience_votes` bug. Copy them into the committed `firestore.indexes.json` and commit before deploying anywhere else (including provisioning a fresh environment like `homegroups-e2e`), or a fresh deploy target will throw `failed-precondition` on the first query that needs them.
- **Entries only in the local file** (not yet deployed): not a blocker — they'll be created on the next `firebase deploy --only firestore:indexes`, which can take minutes; don't assume it's instant if a code path depends on it immediately after deploy.
- This step is **live-Firebase-only** — it cannot be done from source alone, since the whole point is checking for state that only exists in the deployed project.

### 2b. Rules drift

Preferred (works inside this repo — the `firebase` MCP server is configured in `.mcp.json`):

```
mcp__plugin_firebase_firebase__firebase_get_security_rules with type: "firestore" (and again with type: "storage")
```

Save the output and diff it textually against the committed file (`homegroups/firestore.rules` / `regroup/mobile/firebase/firestore.rules`, and the corresponding `storage.rules`). Pass: no diff. Any diff is a BLOCKER — someone edited rules directly in the Console and the committed file is not what's actually enforced; reconcile before deploying (a naive `firebase deploy --only firestore:rules` will silently overwrite the live Console-only version, which may have been an emergency hotfix).

If the MCP server isn't available in a given session, there is no equivalent plain `firebase` CLI subcommand that dumps the live ruleset as text — label this check **live-Firebase-MCP-only** and fall back to manually reading the ruleset in the Firebase Console.

### 2c. List-query rule review (semi-mechanical — needs judgment)

This is what broke `getUserGroups`: a `list`/collection query's `allow read`/`allow list` rule must be satisfiable using only the query's own `.where()` constraints (or `get()`/`exists()` lookups) — Firestore refuses the entire query if it can't prove the rule holds without executing it first.

1. Find every `.where()`-based query in the client model layer:
   ```bash
   grep -rn "\.where(" homegroups/mobile/src/models regroup/mobile/src/services --include="*.ts"
   ```
2. For each, find the matching `match /<collection>/{id}` block in the corresponding `firestore.rules` and confirm the `allow read`/`allow list` condition contains a direct field-equality clause matching the query's filter field(s) with `==` — not only a `get()`/`exists()` check keyed on a _different_ field.
3. Reference implementation of the fix: `homegroups/firestore.rules`, the `members/{memberId}` block — `resource.data.userId == request.auth.uid` was added specifically so `members.where('userId','==',uid)` (used by `GroupModel.getUserGroups`) is satisfiable; the pre-existing `isGroupMember(resource.data.groupId)` clause alone could not satisfy a userId-filtered list query. Any new `.where()` query added to a model should get the same treatment before its rules ship.
4. This step is source-only (no live state needed) but requires reading the query and the rule side by side — grep only locates candidates.

## Step 3 — typecheck + tests green (reuse existing scripts, don't duplicate them)

Authoritative commands are in `.github/workflows/ci.yml` (root) — Node 22, Java 21 for rules tests.

```bash
# homegroups/functions
cd homegroups/functions && npx tsc --noEmit && npm test -- --forceExit
npm run test:rules            # Firestore rules — needs the emulator + Java 21, starts/stops itself
npm run test:rules:storage    # Storage rules

# regroup/functions
cd regroup/functions && npx tsc --noEmit && npm test -- --forceExit

# recovery-api
cd recovery-api && npx tsc --noEmit && npm test -- --forceExit

# detox-recovery
cd detox-recovery && npx tsc --noEmit && npm test
```

**Caveat:** regroup/functions' _own_ `.github/workflows/ci.yml` pins Node **20**, while the root `.github/workflows/ci.yml` runs the same package on Node **22** (matching `package.json`'s `engines.node: "22"`). These disagree — a green run of one is not proof the other passes. Prefer Node 22 locally (matches `engines` and the root workflow) and don't treat regroup's own CI as fully authoritative until that's reconciled.

Do not run `npm ci`/`npm install` as part of this skill — `node_modules` may legitimately be absent; report which of the above commands can't run for that reason rather than installing.

For the actual deploy, compose with the product's own scripts rather than hand-rolling `firebase deploy`:

- homegroups: `npm run deploy:changed` (preferred) or the `/homegroups-deploy-functions` skill
- regroup: `/regroup-deploy-fn <name>` for targeted function deploys; `regroup/web` has its own `/regroup-web-deploy` skill for hosting+functions. Note `regroup/functions/package.json`'s `deploy` script and `regroup/firebase.json`'s `functions.predeploy` already run `scripts/preflight-billing.js` automatically — don't re-run it manually as a separate step, it's wired in.

## Step 4 — secret hygiene

```bash
# Nothing staged that looks like a live key or private key block
git diff --cached --diff-filter=ACM | grep -EI 'sk_live_[A-Za-z0-9]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AIza[0-9A-Za-z_-]{35}'

# No service-account/credential files sitting in the functions dir about to be uploaded
# (firebase deploy packages the local working tree, respecting the dir's .gitignore —
#  a file can ship even if it was never `git add`ed, so check the filesystem, not just git status)
find homegroups/functions regroup/functions -maxdepth 2 \
  \( -iname "*.env" -o -iname ".env.*" ! -iname ".env.example" -o -iname "*service-account*" -o -iname "*service-key*" \) \
  2>/dev/null | grep -v node_modules
```

Pass: both commands return nothing. `AIza` hits inside committed Firebase client-config files (e.g. `google-services.json`, `GoogleService-Info.plist`, web `firebaseConfig` objects) are expected and public-by-design — don't flag those; the pattern above is meant for the `git diff --cached` (staged changes) scope, not a full-repo scan, precisely to avoid that false positive. A hit in the `find` command (an actual `.env` or service-account file physically present in a functions directory) is a **BLOCKER** regardless of git status, since it would ship on deploy even if untracked.

## What this skill does NOT cover

- Emulator port conflicts — see `.claude/skills/monorepo-run-check` (repo root).
- Full build/test orchestration — see each product's `deploy-functions`/`deploy-fn`/`firebase-deploy` skill.
- Stripe/billing correctness — see `regroup/scripts/preflight-billing.js` (already wired into regroup's deploy).
