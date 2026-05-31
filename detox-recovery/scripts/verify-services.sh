#!/usr/bin/env bash
# Verifies connectivity and credentials for all external services.
# Loads values from .env.local and makes lightweight API calls to confirm each key is valid.
# Usage: bash scripts/verify-services.sh

set -euo pipefail

ENV_FILE=".env.local"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No $ENV_FILE found. Run: bash scripts/setup-env.sh" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Load .env.local into the current shell (skip comments and blank lines)
# ---------------------------------------------------------------------------
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
  export "$line" 2>/dev/null || true
done < "$ENV_FILE"

pass=0
fail=0

check() {
  local label="$1"
  local ok="$2"   # "true" or "false"
  local detail="$3"
  if [[ "$ok" == "true" ]]; then
    echo "  ✓ $label"
    (( pass++ )) || true
  else
    echo "  ✗ $label — $detail"
    (( fail++ )) || true
  fi
}

# ---------------------------------------------------------------------------
# Resend
# ---------------------------------------------------------------------------
echo ""
echo "Resend (contact form)"

if [[ -z "${RESEND_API_KEY:-}" ]]; then
  check "API key set" "false" "RESEND_API_KEY is empty"
else
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $RESEND_API_KEY" \
    https://api.resend.com/domains)
  if [[ "$status" == "200" ]]; then
    check "API key valid" "true" ""
  else
    check "API key valid" "false" "Got HTTP $status — check RESEND_API_KEY"
  fi
fi

if [[ -z "${RESEND_TO_EMAIL:-}" ]]; then
  check "Recipient email set" "false" "RESEND_TO_EMAIL is empty"
else
  check "Recipient email set" "true" ""
fi

# ---------------------------------------------------------------------------
# MailerLite
# ---------------------------------------------------------------------------
echo ""
echo "MailerLite (newsletter + lead magnets)"

if [[ -z "${MAILERLITE_API_KEY:-}" ]]; then
  check "API key set" "false" "MAILERLITE_API_KEY is empty"
else
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $MAILERLITE_API_KEY" \
    "https://connect.mailerlite.com/api/subscribers?limit=1")
  if [[ "$status" == "200" ]]; then
    check "API key valid" "true" ""
  else
    check "API key valid" "false" "Got HTTP $status — check MAILERLITE_API_KEY"
  fi
fi

for var in MAILERLITE_GROUP_ID_NEWSLETTER MAILERLITE_GROUP_ID_LEAD_MAGNET_UNSAFE \
           MAILERLITE_GROUP_ID_LEAD_MAGNET_FAMILY MAILERLITE_GROUP_ID_B2B; do
  val="${!var:-}"
  if [[ -z "$val" ]]; then
    check "$var" "false" "is empty — create the group in MailerLite and add its ID"
  else
    # Verify the group ID exists
    if [[ -n "${MAILERLITE_API_KEY:-}" ]]; then
      status=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer $MAILERLITE_API_KEY" \
        "https://connect.mailerlite.com/api/groups/$val")
      if [[ "$status" == "200" ]]; then
        check "$var ($val)" "true" ""
      else
        check "$var ($val)" "false" "Group ID not found (HTTP $status) — verify in MailerLite dashboard"
      fi
    else
      check "$var" "true" "(key missing, skipped group lookup)"
    fi
  fi
done

# ---------------------------------------------------------------------------
# Calendly
# ---------------------------------------------------------------------------
echo ""
echo "Calendly (booking links)"

for var in NEXT_PUBLIC_CALENDLY_FIT_CHECK_URL NEXT_PUBLIC_CALENDLY_SUPPORT_CALL_URL; do
  val="${!var:-}"
  if [[ -z "$val" ]]; then
    check "$var" "false" "is empty — add your Calendly event URL"
  elif [[ "$val" != https://calendly.com/* ]]; then
    check "$var" "false" "value doesn't look like a Calendly URL: $val"
  else
    check "$var" "true" ""
  fi
done

# ---------------------------------------------------------------------------
# Stripe
# ---------------------------------------------------------------------------
echo ""
echo "Stripe (payment links)"

STRIPE_VARS=(
  NEXT_PUBLIC_STRIPE_SUPPORT_CALL_URL
  NEXT_PUBLIC_STRIPE_DONATION_URL
)

for var in "${STRIPE_VARS[@]}"; do
  val="${!var:-}"
  if [[ -z "$val" ]]; then
    check "$var" "false" "is empty"
  elif [[ "$val" != https://buy.stripe.com/* ]]; then
    check "$var" "false" "doesn't look like a Stripe payment link: $val"
  else
    # Confirm the link is reachable (200 or 303 redirect = valid)
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$val" || echo "000")
    if [[ "$status" == "200" || "$status" == "303" || "$status" == "301" || "$status" == "302" ]]; then
      check "$var" "true" ""
    else
      check "$var" "false" "URL returned HTTP $status — may be inactive in Stripe"
    fi
  fi
done

# ---------------------------------------------------------------------------
# Lemon Squeezy (PDF payment links)
# ---------------------------------------------------------------------------
echo ""
echo "Lemon Squeezy (PDF payment links)"

LEMONSQUEEZY_VARS=(
  NEXT_PUBLIC_LEMONSQUEEZY_FAMILY_GUIDE_URL
  NEXT_PUBLIC_LEMONSQUEEZY_APPOINTMENT_PREP_URL
  NEXT_PUBLIC_LEMONSQUEEZY_SAFETY_CHECKLIST_URL
  NEXT_PUBLIC_LEMONSQUEEZY_TREATMENT_COMPARISON_URL
  NEXT_PUBLIC_LEMONSQUEEZY_RELAPSE_PREVENTION_URL
)

for var in "${LEMONSQUEEZY_VARS[@]}"; do
  val="${!var:-}"
  if [[ -z "$val" ]]; then
    check "$var" "false" "is empty"
  elif [[ "$val" != https://nextsteprecovery.lemonsqueezy.com/buy/* ]]; then
    check "$var" "false" "doesn't look like a Lemon Squeezy payment link: $val"
  else
    # Confirm the link is reachable (200 or 303 redirect = valid)
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$val" || echo "000")
    if [[ "$status" == "200" || "$status" == "303" || "$status" == "301" || "$status" == "302" ]]; then
      check "$var" "true" ""
    else
      check "$var" "false" "URL returned HTTP $status — may be inactive in Lemon Squeezy"
    fi
  fi
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "──────────────────────────────────────"
total=$(( pass + fail ))
echo "Results: $pass/$total checks passed"

if [[ $fail -gt 0 ]]; then
  echo ""
  echo "$fail check(s) failed. See docs/manual-tasks/2026-05-21-external-service-setup.md"
  exit 1
else
  echo "All services verified. The site is ready to handle live traffic."
fi
