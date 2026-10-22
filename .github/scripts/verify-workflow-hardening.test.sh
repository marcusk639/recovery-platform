#!/usr/bin/env bash
# Mutation self-test for the workflow hardening checker.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
npm install --silent --no-audit --no-fund --prefix "$tmp" yaml@2.9.1 >/dev/null
NODE_PATH="$tmp/node_modules" node "$here/verify-workflow-hardening.test.js"
