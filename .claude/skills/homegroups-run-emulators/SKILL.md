---
name: homegroups-run-emulators
description: Start Firebase emulators (Firestore, Functions, Auth, Hosting) if not already running and report status
disable-model-invocation: true
---

> **Unit:** `homegroups/` — all relative paths below resolve from there. From the repo root:
> `cd "${CLAUDE_PROJECT_DIR:-$(pwd)}/homegroups"` first.
# Start Firebase Emulators

Start Firebase emulators for local development, or report status if already running.

All paths are relative to `homegroups/` (this skill's unit — the directory containing `firebase.json` and `.firebaserc`). If your shell is elsewhere, `cd` there first, e.g. `cd "${CLAUDE_PROJECT_DIR}/homegroups"`.

**Project id:** `homegroups/.firebaserc` defines `default` = `recovery-connect-cad4b` and an `e2e` alias = `homegroups-e2e`. Always pass `--project` explicitly so emulators can't silently target the wrong one — do not rely on the implicit default.

## Steps

1. **Check if emulators are already running**:

   ```bash
   curl -s http://localhost:4000 > /dev/null 2>&1 && echo "EMULATOR_UI_RUNNING" || echo "NOT_RUNNING"
   ```

   Also check individual services:

   ```bash
   curl -s http://localhost:8080 > /dev/null 2>&1 && echo "FIRESTORE: UP" || echo "FIRESTORE: DOWN"
   curl -s http://localhost:5001 > /dev/null 2>&1 && echo "FUNCTIONS: UP" || echo "FUNCTIONS: DOWN"
   curl -s http://localhost:9099 > /dev/null 2>&1 && echo "AUTH: UP" || echo "AUTH: DOWN"
   curl -s http://localhost:5000 > /dev/null 2>&1 && echo "HOSTING: UP" || echo "HOSTING: DOWN"
   ```

2. **If all services are running**, report status and stop. Do not restart.

3. **If not running, start emulators in background** (run from `homegroups/`):

   ```bash
   firebase emulators:start --project recovery-connect-cad4b &
   ```

   Use `--project homegroups-e2e` instead when running against the e2e alias.

   Wait up to 15 seconds for the Emulator UI to respond:

   ```bash
   for i in $(seq 1 15); do curl -s http://localhost:4000 > /dev/null 2>&1 && echo "READY" && break || sleep 1; done
   ```

4. **Verify all services** by re-running the port checks from step 1.

5. **Report results**:
   - Which services are running and on which ports
   - Emulator UI URL: http://localhost:4000
   - Any services that failed to start

## Ports

| Service   | Port |
| --------- | ---- |
| Hosting   | 5000 |
| Functions | 5001 |
| Firestore | 8080 |
| Auth      | 9099 |
| UI        | 4000 |

## Notes

- Never restart emulators that are already running
- If a specific service fails, check `firebase-debug.log` in the project root
- Functions emulator requires `functions/lib/` to exist — run `cd functions && npm run build` first if missing
