---
name: monorepo-run-check
description: Pre-flight check before starting any Firebase emulator in the recovery-platform monorepo. Checks which emulator ports are in use, which product owns them, and warns about conflicts. Run before starting homegroups, regroup, or detox-recovery emulators — port conflicts cause silent failures.
---

Run these commands before starting any product's Firebase emulators:

## Step 1: Check active emulator ports

```bash
# NOTE: do not pipe lsof straight into awk and rely on `|| echo "(free)"` —
# awk exits 0 on empty input, so a free port would print nothing at all.
check_port() {
  local out
  out=$(lsof -iTCP:"$1" -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print "  PID " $2 " — " $1 " (" $3 ")"}')
  echo "=== $2 :$1 ==="
  if [ -n "$out" ]; then echo "$out"; else echo "  (free)"; fi
}

# shared defaults — homegroups / regroup / detox-recovery collide here
check_port 8080 Firestore
check_port 5001 Functions
check_port 9099 Auth
check_port 9199 Storage

# recovery-api pins its own offset ports so it can co-run with ONE other product
check_port 8082 "Firestore (recovery-api)"
check_port 5002 "Functions (recovery-api)"
check_port 9100 "Auth (recovery-api)"
```

`lsof` prints the owning USER in column 3, but not the working directory. To find out *which
product* owns a listener, resolve the PID's cwd:

```bash
lsof -a -p <PID> -d cwd -Fn | sed -n 's/^n//p'
```

## Port Ownership Reference

| Port | Service   | Products that use it                |
| ---- | --------- | ----------------------------------- |
| 8080 | Firestore | homegroups, regroup, detox-recovery |
| 5001 | Functions | homegroups, regroup                 |
| 9099 | Auth      | homegroups, regroup, detox-recovery |
| 9199 | Storage   | homegroups, regroup                 |
| 4000 | Emulator UI | homegroups, regroup, detox-recovery |
| 8082 | Firestore | **recovery-api only**               |
| 5002 | Functions | **recovery-api only**               |
| 9100 | Auth      | **recovery-api only**               |
| 4001 | Emulator UI | **recovery-api only**             |

⚠️ **Run only ONE of homegroups / regroup / detox-recovery at a time** — they share the same
default ports. `recovery-api` is the exception: it pins offset ports in its own `firebase.json`,
so it may run alongside exactly one of the other three.

## Step 2: Kill conflicting process (if needed)

```bash
kill <PID>   # replace <PID> with the process ID from Step 1 output
```

Verify it stopped:

```bash
lsof -iTCP:8080 -sTCP:LISTEN 2>/dev/null || echo "port 8080 is free"
```

## Step 3: Start the product you need

Always pass `--project` so an ambient `firebase use` alias cannot redirect you — `homegroups`
has an `e2e` alias (`homegroups-e2e`) that is easy to leave active.

```bash
# homegroups  (default: recovery-connect-cad4b | e2e alias: homegroups-e2e)
cd "${CLAUDE_PROJECT_DIR}"/homegroups && \
  firebase emulators:start --project recovery-connect-cad4b

# regroup
cd "${CLAUDE_PROJECT_DIR}"/regroup && \
  firebase emulators:start --project phoenix-cleanhouse

# detox-recovery  (no .firebaserc — the project MUST be passed explicitly)
cd "${CLAUDE_PROJECT_DIR}"/detox-recovery && \
  firebase emulators:start --project nextsteprecovery-1d5c2

# recovery-api — it DOES have a Firebase emulator (functions only), on the offset ports
# 8082/5002/9100. It is a Firebase Functions v2 codebase, not an HTTP server; there is no
# `dev` script in recovery-api/package.json.
cd "${CLAUDE_PROJECT_DIR}"/recovery-api && npm run serve
```
