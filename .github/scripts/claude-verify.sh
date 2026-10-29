#!/usr/bin/env bash
# Runs CI's install, typecheck and test steps for one package, so the @claude
# workflow (claude.yml) can verify a change before committing it to a PR.
# Usage: bash .github/scripts/claude-verify.sh <package>
# Keep each case in step with that package's job in .github/workflows/ci.yml.
# Not covered (CI still runs them): Firestore/Storage rules tests (need Java and
# the Firebase emulators), Android builds, Maestro.
set -euo pipefail

usage() {
  echo "usage: $0 <package>" >&2
  echo "packages: recovery-api detox-recovery homegroups/functions regroup/functions" >&2
  echo "          homegroups/web regroup/web homegroups/mobile regroup/mobile regroup/e2e" >&2
  exit 2
}

[ $# -eq 1 ] || usage
pkg="$1"
root="$(git rev-parse --show-toplevel)"

# The workflow's GitHub token is in the environment for gh and git push. Test
# code from the PR has no need for it, so it never sees it.
unset GH_TOKEN GITHUB_TOKEN

run() {
  echo "::group::$pkg: $*"
  (cd "$root/$pkg" && "$@")
  echo "::endgroup::"
}

case "$pkg" in
  recovery-api | detox-recovery | homegroups/functions | regroup/functions)
    run npm ci
    run npx tsc --noEmit
    run npm test -- --forceExit
    ;;
  homegroups/web)
    run npm ci
    run env CI=true npm test -- --watchAll=false
    ;;
  regroup/web)
    run npm ci
    run npx tsc --noEmit -p tsconfig.spec.json
    ;;
  homegroups/mobile)
    run npm ci
    run npm test -- --ci
    ;;
  regroup/mobile)
    run npm ci --ignore-scripts
    run npx patch-package
    run npm run typecheck:ratchet
    run npm test -- --ci
    ;;
  regroup/e2e)
    [ -f "$root/regroup/e2e/package.json" ] || { echo "regroup/e2e not present; nothing to verify"; exit 0; }
    run npm ci
    run npx jest
    ;;
  *) usage ;;
esac

echo "PASS: $pkg"
