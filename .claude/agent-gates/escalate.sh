#!/usr/bin/env bash
# agent-gates/escalate.sh — the escape hatch.
#
# Usage:
#   escalate.sh <reason> [evidence] [blast_radius: low|medium|high] [reversible: yes|no]
#
# Appends a structured entry to .agent/assumptions.yaml and exits non-zero with a
# distinct status so the run's caller can tell "escalated" from "failed".
#
# Why this exists: an escalation channel plus an anti-hacking policy was measured
# to cut reward hacking from 23.6% to 5.3% (OR 9.2, p<1e-12) across 8 frontier
# models with no measured performance cost (arXiv 2608.29460). Escalation and
# hacking are near-mutually-exclusive — an agent with a legitimate way to report
# failure largely stops faking success.
#
# IMPORTANT: treat an escalation as a SUCCESSFUL outcome in your metrics. If
# escalating is penalised, the incentive to fake is rebuilt.
set -euo pipefail

ESCALATION_EXIT=17

REASON="${1:-unspecified}"
EVIDENCE="${2:-none}"
BLAST="${3:-unknown}"
REVERSIBLE="${4:-unknown}"

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
LEDGER_DIR="$REPO_ROOT/.agent"
LEDGER="$LEDGER_DIR/assumptions.yaml"
mkdir -p "$LEDGER_DIR"

if [ ! -f "$LEDGER" ]; then
  printf '# Assumption / escalation ledger. Appended by agents, reviewed by a human.\n# Read this FIRST in review — it is where a plausible-but-wrong reading hides.\n' > "$LEDGER"
fi

ID="E$(date +%Y%m%d%H%M%S)"
{
  printf -- '- id: %s\n' "$ID"
  printf -- '  kind: escalation\n'
  printf -- '  at: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  printf -- '  reason: %s\n' "$(printf '%s' "$REASON" | tr '\n' ' ')"
  printf -- '  evidence: %s\n' "$(printf '%s' "$EVIDENCE" | tr '\n' ' ')"
  printf -- '  blast_radius: %s\n' "$BLAST"
  printf -- '  reversible: %s\n' "$REVERSIBLE"
  printf -- '  resolved: false\n'
} >> "$LEDGER"

printf 'ESCALATED (%s): %s\n' "$ID" "$REASON" >&2
printf 'Recorded in %s. Exiting %d so the caller can distinguish escalation from failure.\n' "$LEDGER" "$ESCALATION_EXIT" >&2

exit "$ESCALATION_EXIT"
