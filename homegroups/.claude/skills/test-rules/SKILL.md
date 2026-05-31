---
name: test-rules
description: Start Firebase emulator if needed and run Firestore security rules tests
disable-model-invocation: true
---

# Test Firestore Security Rules

Run Firestore security rules tests, ensuring the Firebase emulator is running first.

## Steps

1. **Check if emulator is running**:

   ```bash
   curl -s http://localhost:8080 > /dev/null 2>&1 && echo "RUNNING" || echo "NOT_RUNNING"
   ```

2. **If not running, start emulators in background**:

   ```bash
   cd /Users/marcusklein/dev/RecoveryConnect && firebase emulators:start --only firestore &
   ```

   Wait a few seconds for the emulator to be ready, then verify:

   ```bash
   curl -s http://localhost:8080 > /dev/null 2>&1 && echo "READY" || echo "FAILED"
   ```

3. **Run security rules tests**:

   ```bash
   cd functions && npm run test:rules
   ```

4. **Report results**: Show test pass/fail counts and any failures.

## Notes

- The emulator must be running on port 8080 (Firestore default)
- Emulator UI is available at http://localhost:4000 if started with full `firebase emulators:start`
- If the emulator was already running, do NOT restart it
- Security rules tests are in `functions/` and use `@firebase/rules-unit-testing`
