---
name: homegroups-run-functions
description: Run, start, test, build, or drive the homegroups Firebase Cloud Functions locally. Use when asked to launch the homegroups functions emulator, curl or smoke-test a callable, verify a callable change, or run the homegroups functions test suite.
---

> **Unit:** `homegroups/` — all relative paths below resolve from there. From the repo root:
> `cd "${CLAUDE_PROJECT_DIR:-$(pwd)}/homegroups"` first.
# Run: homegroups Cloud Functions

**All paths below are relative to `homegroups/`** (the directory holding `firebase.json`),
not to `homegroups/functions/`. This trips people constantly — see Gotchas.

The agent path is `${CLAUDE_PROJECT_DIR}/.claude/skills/homegroups-run-functions/driver.sh`, a curl-based
smoke driver run through `firebase emulators:exec`.

## Prerequisites

This machine needs Java (Firestore/Auth/Storage emulators) and Node 22 (`engines.node: "22"`,
`firebase.json` `runtime: nodejs22`). **Both are already set up here** — `~/.zshrc` exports the
keg-only paths and `JAVA_HOME`, and `~/.local/bin/firebase` pins the CLI to Node 22.

Verify in one shot; all three must hold before anything below will work:

```bash
node --version                                    # v22.x  (NOT v26.x)
java -version                                     # 21.x
firebase --debug --version | grep "Node Version"  # v22.x  (NOT v26.x)
```

On a fresh machine, reproduce that setup with:

```bash
brew install openjdk@21 node@22   # both KEG-ONLY: brew will NOT put them on PATH
# then add to ~/.zshrc:
#   export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/opt/openjdk@21/bin:$PATH"
#   export JAVA_HOME="/opt/homebrew/opt/openjdk@21"
# and create the CLI wrapper described in Gotchas.
```

Cache the Firestore emulator jar once (it is not bundled):

```bash
firebase setup:emulators:firestore
```

## Build

```bash
cd functions && npm ci && npm run build   # tsc -> functions/lib/
```

`npm ci` succeeds on Node 26 despite `engines.node: "22"` — the mismatch is not enforced at
install time. The emulator runtime is where 22 actually matters.

## Run (agent path)

From `homegroups/`:

```bash
firebase emulators:exec --only functions,firestore --project recovery-connect-cad4b \
  "${CLAUDE_PROJECT_DIR}/.claude/skills/homegroups-run-functions/driver.sh"
```

`emulators:exec` (not `emulators:start`) is deliberate: it boots, runs the driver, tears down,
and exits with the driver's status — so it works unattended and as a CI gate.

The driver seeds two fixtures into the Firestore emulator, then asserts five behaviours of
`getPublicGroupProfile` (chosen because it is one of only two unauthenticated callables, so it
needs no ID token):

| Input | Expected |
|---|---|
| `{}` | `INVALID_ARGUMENT` |
| unknown groupId | `NOT_FOUND` |
| seeded group | profile with `name` |
| `isClaimed: true` | `description` exposed |
| `publicProfileEnabled: false` | `NOT_FOUND` |

Exit code is 0 only if all five pass. To drive a different callable, add a `call` line —
authenticated ones need an emulator ID token in an `Authorization: Bearer` header.

> ### ⚠️ Driver status: NOT YET VERIFIED END-TO-END
> The driver's assertions were written against the real handler source and the emulator REST
> API, but **it has never completed a successful run.** On this machine every
> `firebase emulators:exec` / `emulators:start` invocation dies instantly with
> `Killed: 9` (SIGKILL, exit 137) and **zero bytes of output**.
>
> Ruled out — do not re-test these. **It fails identically in a plain interactive terminal
> with no agent harness involved** (user-confirmed 2026-09-04:
> `zsh: killed  firebase emulators:exec ...`), so this is machine-level, not tooling.
>
> Also ruled out: the Claude Bash sandbox (fails with it disabled); Node version (22 and 26);
> missing Java (21 installed, and it runs the emulator jar standalone fine — `java -jar
> cloud-firestore-emulator-v1.22.0.jar --help` exits 0); un-cached jar (downloaded via
> `setup:emulators:firestore`); unset `JAVA_HOME` (now exported); memory (80% free, address
> space unlimited); the unusually high `ulimit -n` of 1048576 (retested at 4096 — same kill);
> port conflicts (all free); architecture mismatch (all arm64 on an arm64 host); Gatekeeper
> quarantine (only `com.apple.provenance`, no `com.apple.quarantine`); and process detachment
> (`nohup` dies in ~2s too).
>
> Non-emulator firebase commands all work while authenticated — `--version`, `projects:list`,
> `setup:emulators:firestore`. Only `emulators:*` dies, always with zero bytes of output.
>
> Untried leads, in order of promise: capture `log stream --predicate 'eventMessage CONTAINS
> "firebase"'` (or Console.app) at the moment of the kill; downgrade with
> `npm i -g firebase-tools@14` to test whether this is a 15.x regression; check whether an
> endpoint-security/EDR agent on this Mac kills processes that spawn JVMs.

## Test (verified working)

```bash
cd functions && npm test                       # jest --detectOpenHandles
cd functions && npx tsc --noEmit               # typecheck
```

`npm run build` and `npx tsc --noEmit` were both confirmed clean on Node 22 in this repo.
Rules tests (`npm run test:rules`, `test:rules:storage`) shell out to the emulator and so are
blocked by the same SIGKILL issue.

## Gotchas

- **`brew install` puts neither Node 22 nor Java on your PATH.** Both formulae are keg-only.
  `java -version` reports "Unable to locate a Java Runtime" and `node --version` reports v26
  until you prepend `/opt/homebrew/opt/node@22/bin` and `/opt/homebrew/opt/openjdk@21/bin`.
- **PATH alone does not change which Node the `firebase` CLI uses.** Homebrew's
  `/opt/homebrew/bin/firebase` hardcodes `#!/opt/homebrew/opt/node/bin/node` in its shebang,
  so it runs on the default Node (26.x) regardless of PATH. This is **already fixed on this
  machine** by a wrapper at `~/.local/bin/firebase` (earlier on PATH) that re-execs the CLI
  under `node@22` via the version-independent `/opt/homebrew/opt/firebase-cli` symlink.
  Confirm with `firebase --debug --version | grep "Node Version"` → expect `v22.x`.
  If it reports v26, the wrapper is missing — recreate it or call the entrypoint directly.
- **`firebase.json` lives at `homegroups/`, not `homegroups/functions/`.** Run every emulator
  and deploy command from `homegroups/`. The npm scripts live in `functions/package.json`, so
  those run from `functions/`. The two have different working directories.
- **There is no `emulators` block in `firebase.json`,** so default ports apply
  (4000 UI, 5001 functions, 8080 Firestore, 9099 Auth). Per the root CLAUDE.md, never run
  homegroups and regroup emulators at once — they collide on all four.
- **`timeout` does not exist on macOS.** Scripts using it fail with `command not found` and a
  misleading exit 127. Use a bounded polling loop instead (the driver does).
- **`getPublicGroupProfile` is rate limited** to 30 requests / 60s per caller via a Firestore
  `_rateLimits` doc. The driver makes 6 calls, well under — but a retry loop can trip it and
  surface as `RESOURCE_EXHAUSTED`, not a logic bug.
- **Groups are public by default.** The handler reads `publicProfileEnabled ?? true`; only an
  explicit `false` hides a group. Do not "fix" this to `=== true` — it would hide every
  pre-seeded scraped group.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Killed: 9`, exit 137, no output | Unresolved; see the driver-status box above. |
| `Unable to locate a Java Runtime` | Keg-only Java not on PATH — prepend `/opt/homebrew/opt/openjdk@21/bin`. |
| `firebase --debug --version` reports Node 26 | The `~/.local/bin/firebase` wrapper is missing or shadowed. Recreate it, or call the entrypoint under `node@22` directly. |
| `command not found: timeout` | macOS has no `timeout`; use a polling loop or `brew install coreutils` for `gtimeout`. |
| `Error: Cannot find module ... lib/index.js` | `functions/lib/` missing — run `cd functions && npm run build`. |
| Callable returns `RESOURCE_EXHAUSTED` | Rate limiter tripped; wait 60s or clear the emulator's `_rateLimits` collection. |
