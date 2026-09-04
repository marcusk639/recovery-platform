---
name: worktree-dispatch-safety
description: Use before, during, and after dispatching a subagent (or parallel agents) into a git worktree in this repo — creating a worktree, verifying a subagent's commit actually landed, tearing a worktree down, or recovering after a bad `git worktree remove`. In this repo subagents have TWICE committed to `main` instead of their worktree, once nearly destroying work via a bad worktree removal. Trigger on worktree, dispatch subagent, parallel agents, EnterWorktree/ExitWorktree, verify commit landed, remove worktree, worktree-agent merge.
---

# Worktree Dispatch Safety

Purely procedural failure mode, purely procedural fix. Every rule below exists because
a plausible-looking check gave the wrong answer in this repo. `git log --all --grep`
confirms the pattern is real and current — main carries a long run of
`Merge branch 'worktree-agent-<hash>'` commits (11 as of 2026-09), so this workflow
runs often, not once.

Read this in full before dispatching an agent into a worktree, and again before
tearing one down. Do not skip the post-dispatch section because the dispatch prose
said the agent was scoped to the worktree — that prose has been wrong twice.

## Pre-dispatch: create and bootstrap the worktree correctly

1. **Create it.** `EnterWorktree` (or `git worktree add`) as normal. Note the exact
   `path` and branch name it reports — you will need both for every check below.

2. **Check the base ref immediately — don't assume it's local `main`.**
   `EnterWorktree`'s base ref is governed by `worktree.baseRef`: the default,
   `fresh`, branches from **`origin/main`**, not your local `main`. This repo has no
   override in `.claude/settings.json`, so the stale-default risk is live.

   ```bash
   git -C <worktree> rev-parse HEAD
   git rev-parse main
   ```

   If they differ, the worktree is missing local commits the subagent needs to see.
   Fix before dispatching, not after:

   ```bash
   git -C <worktree> reset --hard main
   ```

   Any package whose `node_modules` was installed against the stale base may now
   have a different dependency graph than what `main` expects — re-run `npm ci` in
   the affected package after the reset (see step 4).

3. **Install git hooks — they do not come with the worktree.**
   `scripts/install-git-hooks.sh` installs the pre-commit secret scanner and
   300-line ratchet into `.git/hooks/`. Hooks live under `.git/hooks/` of the
   **main working copy**, and a linked worktree shares that `.git` directory — so
   run this once per fresh clone, but never assume a worktree inherited hooks that
   were installed after the clone was made, and never assume "I installed hooks
   earlier today" covers a worktree created from a different checkout. Confirm:

   ```bash
   ls -la .git/hooks/pre-commit .git/hooks/pre-push
   ```

   If missing: `./scripts/install-git-hooks.sh`.

4. **Install dependencies for the package being worked on.** `node_modules` is not
   checked in; every fresh worktree needs `npm ci` in whichever package the
   subagent will touch. `homegroups/mobile` and `regroup/mobile` run `pod install`
   in postinstall, which fails without a correctly-pointed Xcode. For JS-only work:

   ```bash
   npm ci --ignore-scripts
   ```

5. **`regroup/mobile` and `regroup/functions` bootstrap trap: gitignored JS
   tooling files.** Both `regroup/.gitignore` and `regroup/functions/.gitignore`
   contain a blanket `**/*.js` rule (compiled-output convention) with narrow
   negations (`!scripts/*.js`, `!maestro/scripts/*.js`). This has already bitten
   this repo once for real — see `git show ea3ad4d` and `git show d0092fe`, where
   Jest tooling and a test shim went missing because they matched the pattern and
   were never force-added, and had to be restored with `git add -f`:

   - `regroup/mobile/babel.config.js`
   - `regroup/mobile/jest.config.js`
   - `regroup/mobile/jest.setup.js`
   - `regroup/mobile/.eslintrc.js`
   - `regroup/functions/test-shims/buffer-equal-constant-time.js`

   **Current state (verified 2026-09-03):** all five are now tracked in git (they
   were force-committed in the fixes above), so a fresh worktree checkout — which
   comes from the commit tree, not the working directory — already contains them
   correctly. `git worktree add` is unaffected by `.gitignore` for files already in
   the index. **The live risk is forward, not backward:** if a subagent creates a
   _new_ `.js` file anywhere under `regroup/mobile` or `regroup/functions` (a new
   jest config variant, a new shim, a new preset), `git add` on it will silently
   no-op — no error, the file just never stages. Symptom in Jest: it hangs
   indefinitely, or throws `Preset react-native not found`, and it looks like a
   flaky test infra bug rather than a gitignore problem. Before debugging that
   symptom as anything else, check whether the file is ignored:

   ```bash
   git check-ignore -v <path/to/the/new/file.js>
   ```

   If it prints a match, `git add -f <file>` (and consider adding a narrow `!`
   negation to the relevant `.gitignore` if the file is source, not build output —
   that's a deliberate decision for the user, not something to do silently).

## Post-dispatch verification (the core of this skill)

Do this after every subagent claims to have committed inside a worktree, before
you rely on that commit for anything — a merge, a review, marking the task done.

1. **Never trust the dispatch prose.** "Work from: `<path>`" in the prompt does not
   guarantee the agent operated there. Verify directly, inside the worktree path
   itself:

   ```bash
   git -C <worktree> branch --show-current
   git -C <worktree> status
   ```

   Confirm the branch name matches what you expect for that worktree, and that
   `status` shows the changes you expect (staged/committed, not untracked).

2. **Verify the commit landed in the worktree branch — use `merge-base`, never
   `log --all`.** This is the single most important rule in this skill. See the
   "commands that LIE to you" section below for why. The correct check:

   ```bash
   git merge-base --is-ancestor <sha> <worktree-branch>
   echo $?   # 0 = yes, it's an ancestor (good); non-zero = it is NOT
   ```

   Run this for every commit the subagent reports making, against the branch it
   was supposed to land on. Do not stop at "the SHA exists somewhere in the repo."

3. **Diff cherry-picked paths against current `main`, not just pre-cherry-pick
   `main`.** A dangling or duplicate commit can be reachable from `main` too — that
   is exactly how a duplicate/orphan commit caused a real merge conflict here. Before
   trusting a cherry-pick or merge, confirm the file paths you're about to bring in
   aren't already present on `main` from an earlier, forgotten landing:

   ```bash
   git diff main -- <changed-paths>
   git log main -- <changed-paths>   # look for a commit you didn't expect
   ```

## Teardown: safe removal sequence

1. **Before removing anything, independently confirm every commit made in the
   worktree is reachable from somewhere you intend to keep** (its own branch, a
   PR branch, or `main` after a real merge) — using `merge-base --is-ancestor`,
   per commit, not a visual scan of `git log`.

2. **Treat "Discarded N commits" as a STOP signal, not a status line**, for any
   N > 0. `ExitWorktree --action remove` refuses by default when the worktree has
   uncommitted files or commits not reachable from elsewhere, and only proceeds if
   you pass `discard_changes: true`. That means seeing a discard message at all
   means you (or the calling agent) explicitly overrode a safety check — stop and
   re-verify step 1 before confirming the removal, don't read it as routine cleanup
   output.

3. **If it already happened** — a worktree was removed and commits are gone from
   view — they are usually still recoverable, because `git worktree remove` deletes
   the working directory and branch ref, not the objects:

   ```bash
   git fsck --lost-found --unreachable
   git reflog                       # look for the pre-removal branch tip
   git reflog --all | grep <partial-sha-if-known>
   ```

   Any dangling commit `fsck` finds can be re-attached with
   `git branch recovered-work <dangling-sha>` for inspection before deciding what
   to do with it.

## Commands that LIE to you

| Situation                                                                  | The check that looks right (and lies)                                                        | The check that's actually right                                                                                                                                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Did the subagent's commit land in its worktree branch?"                   | `git log --all \| grep <sha>` — finds it, declares victory                                   | `git merge-base --is-ancestor <sha> <branch>; echo $?` — a hit in `--all` only proves the commit is reachable from _some_ ref, which includes `main` if the agent committed to the wrong place |
| "Is the subagent working in the worktree?"                                 | Trusting "Work from: `<path>`" in the dispatch prompt                                        | `git -C <worktree> branch --show-current` and `git -C <worktree> status`, checked directly against the path                                                                                    |
| "Is the worktree based on current `main`?"                                 | Assuming `EnterWorktree` branched from local `main`                                          | `git -C <worktree> rev-parse HEAD` vs `git rev-parse main` — default `baseRef` is `origin/main`, which can be behind                                                                           |
| "Is it safe to remove the worktree?"                                       | Reading "Discarded N commits" as normal teardown chatter                                     | Treating any N > 0 as a signal that a safety check was just overridden, and re-running the merge-base check before proceeding                                                                  |
| "Is this file part of the diff I'm about to merge?"                        | Diffing only against pre-cherry-pick `main`                                                  | Diffing the same paths against current `main` — a duplicate commit can already be reachable from `main`                                                                                        |
| "Will `jest.config.js` / a new `.js` shim be tracked in a fresh worktree?" | Assuming any file that survives on disk in the main checkout will follow into a new worktree | Checking `git ls-files <path>` — only tracked files travel via checkout; a new untracked `.js` file under `regroup/mobile` or `regroup/functions` matches `**/*.js` and needs `git add -f`     |
