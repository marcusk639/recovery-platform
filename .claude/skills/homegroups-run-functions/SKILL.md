---
name: homegroups-run-functions
description: Run, start, test, build, or drive the homegroups Firebase Cloud Functions locally. Use when asked to launch the homegroups functions emulator, curl or smoke-test a callable, verify a callable change, or run the homegroups functions test suite.
---

# Run: homegroups Cloud Functions

**Commands run from `homegroups/`** — the directory holding `firebase.json`, not
`homegroups/functions/`. The npm scripts live in `functions/package.json`, so those run
from `functions/`. The two have different working directories; this trips people constantly.

Agent path is `.claude/skills/homegroups-run-functions/driver.sh` (path from the repo root),
a curl smoke driver run through `firebase emulators:exec`.

## Prerequisites

Node 22 (`engines.node: "22"`, `firebase.json` `runtime: nodejs22`) and Java (Firestore
emulator). Both are already configured on this machine via `~/.zshrc`.

```bash
node --version   # v22.x, NOT v26.x
java -version    # 21.x
firebase --version
```

**`firebase-tools` must come from npm, never Homebrew** — see Gotchas, this is not a
preference. Reproduce on a fresh machine with:

```bash
brew install openjdk@21 node@22       # keg-only: brew will NOT put them on PATH
# add to ~/.zshrc:
#   export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/opt/openjdk@21/bin:$PATH"
#   export JAVA_HOME="/opt/homebrew/opt/openjdk@21"
npm install -g firebase-tools         # NOT `brew install firebase-cli`
firebase setup:emulators:firestore    # cache the emulator jar once
```

## Build

```bash
cd functions && npm ci && npm run build   # tsc -> functions/lib/
```

## Run (agent path) — verified

From `homegroups/`:

```bash
firebase emulators:exec --only functions,firestore --project recovery-connect-cad4b \
  '../.claude/skills/homegroups-run-functions/driver.sh'
```

`emulators:exec` (not `emulators:start`) is deliberate: it boots, runs the driver, tears
down, and exits with the driver's status — so it works unattended and as a CI gate.

The driver seeds two fixtures into the Firestore emulator, then asserts five behaviours of
`getPublicGroupProfile` — chosen because it is one of only two unauthenticated callables, so
it needs no ID token.

| Check | Expected |
|---|---|
| seed `driver-test-group` | write accepted |
| seed `driver-hidden-group` | write accepted |
| `{}` | `INVALID_ARGUMENT` |
| unknown groupId | `NOT_FOUND` |
| seeded group | profile with `name` |
| `isClaimed: true` | `description` exposed |
| `publicProfileEnabled: false` | `NOT_FOUND` |

**Last verified 2026-09-04: 7 passed, 0 failed, exit 0.** Exit is 0 only if every check
passes. The two seed assertions are load-bearing — without them a failed seed makes the
`NOT_FOUND` cases pass for the wrong reason and the run looks healthier than it is.

To drive a different callable, add a `call` line. Authenticated callables need an emulator
ID token in an `Authorization: Bearer` header.

## Test

```bash
cd functions && npm test          # jest --detectOpenHandles — 70 suites, 787 tests
cd functions && npx tsc --noEmit  # typecheck
```

Both confirmed clean on Node 22.

## Gotchas

- **Never install `firebase-tools` via Homebrew.** The brew formula ships a `fsevents.node`
  whose ad-hoc code signature does not match its contents (`codesign -v` reports "code or
  signature have been modified"). The kernel refuses to map the page and SIGKILLs the
  process *before it writes any output* — you get `Killed: 9`, exit 137, and a completely
  empty log, in any shell, sandboxed or not. Only `emulators:*` triggers it, because only
  the emulator loads the file watcher; `--version` and `projects:list` work fine, which
  makes it look like an emulator bug rather than a signing one. The npm build does not
  bundle `fsevents` at all. Diagnose with:
  `/usr/bin/log show --last 2m --predicate 'eventMessage CONTAINS "CODE SIGNING"'`
- **`log` is a zsh builtin** and shadows `/usr/bin/log`. `log show ...` returns
  `too many arguments` and no output, which reads like "the logging system is empty."
  Always use the absolute path `/usr/bin/log`.
- **The Firestore emulator REST API rejects unauthenticated writes.** Seeding needs
  `-H 'Authorization: Bearer owner'` (`owner` is the emulator's magic token). Without it the
  write fails and every subsequent lookup returns `NOT_FOUND` — which silently *passes* any
  negative assertion. Always assert the seed itself.
- **`brew install` puts neither Node 22 nor Java on PATH.** Both formulae are keg-only;
  `java -version` reports "Unable to locate a Java Runtime" until you prepend them.
- **`.zshrc` does not pin Node for non-interactive shells.** npm's `firebase` entrypoint has a
  `#!/usr/bin/env node` shebang, so it takes whatever `node` PATH resolves first — and hooks,
  cron, and driver scripts never source `.zshrc`, where the `node@22` prepend lives. There,
  bare `node -v` is v26. A wrapper at `~/.local/bin/firebase` (earlier on PATH) closes the gap
  by re-execing `/opt/homebrew/opt/node@22/bin/node` against
  `/opt/homebrew/lib/node_modules/firebase-tools/lib/bin/firebase.js`. It falls back to the
  unpinned launcher if either path moves — so after any `firebase-tools` reinstall, re-verify
  with `sh -x ~/.local/bin/firebase --version | grep '^+ exec'` and confirm it names `node@22`.
- **Secret Manager 403s at startup are expected and harmless.** The emulator prints
  `This API method requires billing to be enabled` for `STRIPE_SECRET_KEY`, `SENDGRID_API_KEY`
  and friends, then continues. Provide overrides in `functions/.secret.local` if a callable
  under test actually needs one.
- **`--only functions,firestore` leaves the Auth emulator down,** and the emulator warns that
  auth calls will hit **production**. Add `,auth` before testing anything that touches Firebase
  Auth.
- **No `emulators` block in `firebase.json`,** so defaults apply (4000 UI, 5001 functions,
  8080 Firestore, 9099 Auth). Per the root CLAUDE.md, never run homegroups and regroup
  emulators at once — they collide on all four.
- **`timeout` does not exist on macOS.** Scripts using it fail with `command not found` and a
  misleading exit 127. Use a bounded polling loop (the driver does).
- **`getPublicGroupProfile` is rate limited** to 30 requests/60s per caller via a Firestore
  `_rateLimits` doc. The driver makes 7 calls. A retry loop can trip it and surface as
  `RESOURCE_EXHAUSTED`, which is not a logic bug.
- **Groups are public by default.** The handler reads `publicProfileEnabled ?? true`; only an
  explicit `false` hides a group. Do not "fix" this to `=== true` — it would hide every
  pre-seeded scraped group.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Killed: 9`, exit 137, zero output | Homebrew `firebase-cli`'s tainted `fsevents.node`. `brew uninstall firebase-cli && npm install -g firebase-tools`. |
| `Script ... exited with code 127` | Driver path wrong. From `homegroups/` it is `../.claude/skills/homegroups-run-functions/driver.sh`. |
| Seeds pass but lookups `NOT_FOUND` | Missing `Authorization: Bearer owner` on the seeding write. |
| `/usr/bin/log` returns nothing useful | You used bare `log` (zsh builtin). Use the absolute path. |
| `Unable to locate a Java Runtime` | Keg-only Java not on PATH — prepend `/opt/homebrew/opt/openjdk@21/bin`. |
| `Cannot find module ... lib/index.js` | `functions/lib/` missing — `cd functions && npm run build`. |
| Callable returns `RESOURCE_EXHAUSTED` | Rate limiter tripped; wait 60s or clear `_rateLimits` in the emulator. |
