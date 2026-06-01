---
name: monorepo-run-check
description: Pre-flight check before starting any Firebase emulator in the recovery-platform monorepo. Checks which emulator ports are in use, which product owns them, and warns about conflicts. Run before starting homegroups, regroup, or detox-recovery emulators — port conflicts cause silent failures.
disable-model-invocation: true
---

Run these commands before starting any product's Firebase emulators:

## Step 1: Check active emulator ports

```bash
echo "=== Firestore :8080 ===" && \
  lsof -iTCP:8080 -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print "  PID " $2 " — " $1}' || echo "  (free)"

echo "=== Functions :5001 ===" && \
  lsof -iTCP:5001 -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print "  PID " $2 " — " $1}' || echo "  (free)"

echo "=== Auth :9099 ===" && \
  lsof -iTCP:9099 -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print "  PID " $2 " — " $1}' || echo "  (free)"
```

## Port Ownership Reference

| Port | Service   | Products that use it                |
| ---- | --------- | ----------------------------------- |
| 8080 | Firestore | homegroups, regroup, detox-recovery |
| 5001 | Functions | homegroups, regroup                 |
| 9099 | Auth      | homegroups, regroup, detox-recovery |

⚠️ **Run only ONE product's emulators at a time.** All products share the same default ports.

## Step 2: Kill conflicting process (if needed)

```bash
kill <PID>   # replace <PID> with the process ID from Step 1 output
```

Verify it stopped:

```bash
lsof -iTCP:8080 -sTCP:LISTEN 2>/dev/null || echo "port 8080 is free"
```

## Step 3: Start the product you need

```bash
# homegroups
cd /Users/marcus/dev/recovery-platform/homegroups && firebase emulators:start

# regroup
cd /Users/marcus/dev/recovery-platform/regroup && firebase emulators:start

# detox-recovery
cd /Users/marcus/dev/recovery-platform/detox-recovery && firebase emulators:start

# recovery-api (no Firebase emulator — runs as Hono.js HTTP server)
cd /Users/marcus/dev/recovery-platform/recovery-api && npm run dev
```
