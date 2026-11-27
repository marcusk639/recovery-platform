#!/usr/bin/env bash
# Tests for .claude/agent-gates/verify-diff.sh, focused on its merge-from-main
# exemption in --staged mode. Each case builds a throwaway git repo with a fake
# origin/main ref, runs the real script and checks its exit code and output.
#
# Run:  bash .claude/agent-gates/tests/verify-diff.test.sh
# Run against another copy of the gate (e.g. the old one, to see cases go red):
#       VERIFY_DIFF=/path/to/verify-diff.sh bash .claude/agent-gates/tests/verify-diff.test.sh
#
# Portable to macOS's bash 3.2 and BSD tools.
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
VD="${VERIFY_DIFF:-$here/../verify-diff.sh}"
VD="$(cd "$(dirname "$VD")" && pwd)/$(basename "$VD")"
ROOT="$(mktemp -d "${TMPDIR:-/tmp}/verify-diff-test.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT

# Keep the host's git config (hooks path, aliases, signing) out of the fixtures.
export HOME="$ROOT" XDG_CONFIG_HOME="$ROOT" GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.com
export GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.com

# cases N: a jest file with N test cases (no assert-true, so no HOLLOW-ASSERT).
cases() {
  local i
  printf "describe('x', () => {\n"
  for i in $(seq 1 "$1"); do
    printf "  it('case %s', () => { expect(sum(%s)).toBe(%s); });\n" "$i" "$i" "$i"
  done
  printf "});\n"
}

# new_repo NAME: base commit on main (src/a.test.ts with 3 cases, src/b.test.ts
# with 2, a snapshot), origin/main at base, and a feature branch one commit ahead.
new_repo() {
  mkdir -p "$ROOT/$1" && cd "$ROOT/$1"
  git init -q && git symbolic-ref HEAD refs/heads/main
  mkdir -p src/__snapshots__
  cases 3 > src/a.test.ts
  cases 2 > src/b.test.ts
  echo 'exports[`x 1`] = `"one"`;' > src/__snapshots__/a.test.ts.snap
  echo 'export const app = 1;' > src/app.ts
  git add -A && git commit -qm base
  git update-ref refs/remotes/origin/main HEAD
  git checkout -qb feature
  echo 'export const feature = 1;' > src/feature.ts
  git add -A && git commit -qm feature
}

# on BRANCH CMD...: commit CMD's changes on BRANCH (created from main if new),
# then return to feature. on_main also moves origin/main, as if the PR merged.
on() {
  local b="$1"; shift
  git checkout -q "$b" 2>/dev/null || git checkout -qb "$b" main
  "$@"
  git add -A && git commit -qm "change on $b"
  git checkout -q feature
}
on_main() { on main "$@" && git update-ref refs/remotes/origin/main main; }
merge() { git merge -q --no-ff --no-commit "$1" >/dev/null 2>&1; }

unrelated() { echo 'export const app = 2;' > src/app.ts; }
drop_a_case() { cases 2 > src/a.test.ts; }
add_skip() { echo "it.skip('later', () => {});" >> "$1"; }
rename_and_drop() { git mv src/a.test.ts src/a2.test.ts && cases 2 > src/a2.test.ts; }
touch_snap() { echo "// $1" >> src/__snapshots__/a.test.ts.snap; }

# expect NAME WANT_EXIT MUST_CONTAIN [gate args...]
expect() {
  local name="$1" want="$2" must="$3" out code=0
  shift 3
  out="$("$VD" "$@" 2>&1)" || code=$?
  if [ "$code" -ne "$want" ]; then
    printf 'not ok - %s: exit %s, want %s\n' "$name" "$code" "$want"
  elif [ -n "$must" ] && ! printf '%s' "$out" | grep -qF -- "$must"; then
    printf 'not ok - %s: output lacks "%s"\n' "$name" "$must"
  else
    printf 'ok - %s\n' "$name"
    return 0
  fi
  printf '%s\n' "$out" | sed 's/^/    | /'
  return 1
}

NOTE="matches origin/main's merged commit"

case_a() {
  new_repo a && on_main drop_a_case && merge main
  expect "(a) merge of main that removed test cases passes, with a note" 0 \
    "[TEST-COUNT-DROP] src/a.test.ts removes 1 more test case(s) than it adds — $NOTE" --staged
}
case_b() {
  new_repo b && on_main drop_a_case && merge main
  cases 1 > src/a.test.ts && git add src/a.test.ts
  expect "(b) merge of main whose resolution drops another case fails" 1 \
    "  [TEST-COUNT-DROP] src/a.test.ts removes 2 more" --staged
}
case_c() {
  new_repo c && on other drop_a_case && merge other
  expect "(c) merge of a branch not on origin/main that removed cases fails" 1 \
    "  [TEST-COUNT-DROP] src/a.test.ts" --staged
}
case_c2() {
  new_repo c2 && on_main drop_a_case && merge main
  git update-ref -d refs/remotes/origin/main
  expect "(c2) no origin/main ref: no exemption" 1 "  [TEST-COUNT-DROP] src/a.test.ts" --staged
}
case_d() {
  new_repo d && drop_a_case && git add src/a.test.ts
  expect "(d) plain commit that drops a case fails" 1 "  [TEST-COUNT-DROP] src/a.test.ts" --staged
}
case_e1() {
  new_repo e1 && on_main git rm -q src/b.test.ts && merge main
  expect "(e1) merge of main that deleted a test file passes" 0 \
    "[TEST-DELETED] src/b.test.ts — $NOTE" --staged
}
case_e2() {
  new_repo e2 && on_main unrelated && merge main
  git rm -q src/b.test.ts
  expect "(e2) test file deleted during a merge of main, not by main, fails" 1 \
    "  [TEST-DELETED] src/b.test.ts" --staged
}
case_e3() {
  new_repo e3 && cases 2 > src/c.test.ts && git add -A && git commit -qm "branch test"
  on_main unrelated && merge main
  git rm -q src/c.test.ts
  expect "(e3) merge deletes a test only the branch had (absent on main too) fails" 1 \
    "  [TEST-DELETED] src/c.test.ts" --staged
}
case_f1() {
  new_repo f1 && on_main add_skip src/a.test.ts && merge main
  expect "(f1) .skip added on main is exempt" 0 \
    "[TEST-DISABLED] src/a.test.ts introduces a skip/only/todo marker — $NOTE" --staged
}
case_f2() {
  new_repo f2 && on_main add_skip src/a.test.ts && merge main
  add_skip src/b.test.ts && git add src/b.test.ts
  expect "(f2) .skip added by the merge resolution fails" 1 \
    "  [TEST-DISABLED] src/b.test.ts introduces" --staged
}
# (g) The exemption is --staged only. Mid-merge, with the staged test identical to
# MERGE_HEAD (which is on origin/main), the other modes must still fail.
case_g1() {
  new_repo g1 && on_main drop_a_case && merge main
  expect "(g1) base-ref mode, as CI calls it, still fails during a merge" 1 \
    "  [TEST-COUNT-DROP] src/a.test.ts" "$(git merge-base HEAD MERGE_HEAD)"
}
case_g2() {
  new_repo g2 && on_main drop_a_case && merge main
  expect "(g2) <base> <head> mode still fails during a merge" 1 \
    "  [TEST-COUNT-DROP] src/a.test.ts" "$(git merge-base HEAD MERGE_HEAD)" MERGE_HEAD
}
case_g3() {
  new_repo g3 && on_main drop_a_case && merge main
  expect "(g3) working-tree mode still fails during a merge" 1 "  [TEST-COUNT-DROP] src/a.test.ts"
}
case_h1() {
  new_repo h1 && on_main git mv src/a.test.ts src/a.test.ts.bak && merge main
  expect "(h1) main renamed a test away: exempt" 0 \
    "[TEST-RENAMED-AWAY] src/a.test.ts -> src/a.test.ts.bak — $NOTE" --staged
}
case_h2() {
  new_repo h2 && on_main unrelated && merge main
  git mv src/b.test.ts src/b.ts.bak
  expect "(h2) merge resolution renames a test away: fails" 1 \
    "  [TEST-RENAMED-AWAY] src/b.test.ts -> src/b.ts.bak" --staged
}
case_h3() {
  new_repo h3 && on_main rename_and_drop && merge main
  expect "(h3) main renamed a test and dropped a case: exempt" 0 \
    "[TEST-COUNT-DROP] src/a2.test.ts removes 1 more test case(s) than it adds — $NOTE" --staged
}
case_h4() {
  # main adds a non-test copy of b.test.ts; the resolution deletes b.test.ts, so git
  # sees b.test.ts -> b.ts.bak. The new path matches main, the old path does not.
  new_repo h4 && on_main cp src/b.test.ts src/b.ts.bak && merge main
  git rm -q src/b.test.ts
  expect "(h4) rename whose new path matches main but old path does not: fails" 1 \
    "  [TEST-RENAMED-AWAY] src/b.test.ts -> src/b.ts.bak" --staged
}
case_h5() {
  # main adds a2.test.ts (a.test.ts minus a case) and keeps a.test.ts; the resolution
  # deletes a.test.ts, so git sees a rename with a dropped case. Old path is not main's.
  new_repo h5 && on_main sh -c 'head -3 src/a.test.ts > src/a2.test.ts && echo "});" >> src/a2.test.ts'
  merge main && git rm -q src/a.test.ts
  expect "(h5) renamed test with a dropped case, old path not as on main: fails" 1 \
    "  [TEST-COUNT-DROP] src/a2.test.ts removes 1 more" --staged
}
case_i1() {
  new_repo i1 && on_main touch_snap changed && merge main
  expect "(i1) snapshot changed on main is exempt" 0 \
    "[SNAPSHOT-CHURN] src/__snapshots__/a.test.ts.snap — $NOTE" --staged
}
case_i2() {
  new_repo i2 && on_main unrelated && merge main
  touch_snap blessed && git add -A
  expect "(i2) snapshot changed by the merge resolution fails" 1 \
    "  [SNAPSHOT-CHURN] 1 snapshot file(s) changed" --staged
}

PASSED=0 FAILED=0
for c in case_a case_b case_c case_c2 case_d case_e1 case_e2 case_e3 case_f1 case_f2 \
  case_g1 case_g2 case_g3 case_h1 case_h2 case_h3 case_h4 case_h5 case_i1 case_i2; do
  ( set -e; "$c" )
  if [ $? -eq 0 ]; then PASSED=$((PASSED + 1)); else FAILED=$((FAILED + 1)); fi
done
echo
echo "verify-diff tests: $PASSED passed, $FAILED failed (gate: $VD)"
[ "$FAILED" -eq 0 ]
