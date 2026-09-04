#!/usr/bin/env bash
# Drives homegroups Cloud Functions callables against the local emulator.
#
# Run it THROUGH firebase emulators:exec (from homegroups/, where firebase.json is):
#   PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/opt/openjdk@21/bin:$PATH" \
#   firebase emulators:exec --only functions,firestore --project recovery-connect-cad4b \
#     "${CLAUDE_PROJECT_DIR}/.claude/skills/homegroups-run-functions/driver.sh"
#
# Exits non-zero if any assertion fails, so it works as a smoke gate.
set -uo pipefail

PROJECT="${FB_PROJECT:-recovery-connect-cad4b}"
REGION="${FB_REGION:-us-central1}"
FN="http://127.0.0.1:${FUNCTIONS_PORT:-5001}/${PROJECT}/${REGION}"
FS="http://127.0.0.1:${FIRESTORE_PORT:-8080}/v1/projects/${PROJECT}/databases/(default)/documents"

PASS=0; FAIL=0
ok(){ printf '  \033[32mPASS\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
no(){ printf '  \033[31mFAIL\033[0m %s\n       got: %s\n' "$1" "$2" >&2; FAIL=$((FAIL+1)); }

call(){ curl -s -X POST "$FN/$1" -H 'Content-Type: application/json' -d "$2"; }

echo "==> waiting for functions emulator at $FN"
for i in $(seq 1 90); do
  R=$(call getPublicGroupProfile '{"data":{}}' 2>/dev/null)
  [ -n "$R" ] && { echo "    up after ${i}s"; break; }
  sleep 1
done
[ -z "${R:-}" ] && { echo "functions emulator never answered" >&2; exit 1; }

echo "==> seeding fixtures into firestore emulator"
curl -s -o /dev/null -X POST "$FS/groups?documentId=driver-test-group" \
  -H 'Content-Type: application/json' \
  -d '{"fields":{"name":{"stringValue":"Verified Test Group"},"type":{"stringValue":"AA"},"isClaimed":{"booleanValue":true},"description":{"stringValue":"visible when claimed"},"city":{"stringValue":"Portland"}}}'
curl -s -o /dev/null -X POST "$FS/groups?documentId=driver-hidden-group" \
  -H 'Content-Type: application/json' \
  -d '{"fields":{"name":{"stringValue":"Hidden"},"type":{"stringValue":"AA"},"publicProfileEnabled":{"booleanValue":false}}}'

echo "==> getPublicGroupProfile"

R=$(call getPublicGroupProfile '{"data":{}}')
echo "$R" | grep -q 'INVALID_ARGUMENT' \
  && ok "missing groupId -> INVALID_ARGUMENT" || no "missing groupId -> INVALID_ARGUMENT" "$R"

R=$(call getPublicGroupProfile '{"data":{"groupId":"no-such-group-xyz"}}')
echo "$R" | grep -q 'NOT_FOUND' \
  && ok "unknown groupId -> NOT_FOUND" || no "unknown groupId -> NOT_FOUND" "$R"

R=$(call getPublicGroupProfile '{"data":{"groupId":"driver-test-group"}}')
echo "$R" | grep -q '"name":"Verified Test Group"' \
  && ok "seeded group -> returns profile" || no "seeded group -> returns profile" "$R"
echo "$R" | grep -q '"description":"visible when claimed"' \
  && ok "isClaimed=true -> description exposed" || no "isClaimed=true -> description exposed" "$R"

R=$(call getPublicGroupProfile '{"data":{"groupId":"driver-hidden-group"}}')
echo "$R" | grep -q 'NOT_FOUND' \
  && ok "publicProfileEnabled=false -> NOT_FOUND" || no "publicProfileEnabled=false -> NOT_FOUND" "$R"

echo
echo "==> $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
