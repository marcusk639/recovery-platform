#!/usr/bin/env bash
# Creates .env.local from template if it doesn't exist, then shows which vars still need values.
# Usage: bash scripts/setup-env.sh

set -euo pipefail

ENV_FILE=".env.local"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

# ---------------------------------------------------------------------------
# Create .env.local if missing
# ---------------------------------------------------------------------------
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Creating $ENV_FILE..."
  cat > "$ENV_FILE" << 'EOF'
# Resend — contact form email delivery
RESEND_API_KEY=
RESEND_TO_EMAIL=

# MailerLite — newsletter + lead magnet subscriptions
MAILERLITE_API_KEY=
MAILERLITE_GROUP_ID_NEWSLETTER=
MAILERLITE_GROUP_ID_LEAD_MAGNET_UNSAFE=
MAILERLITE_GROUP_ID_LEAD_MAGNET_FAMILY=
MAILERLITE_GROUP_ID_B2B=

# Calendly — booking links (public, exposed to browser)
NEXT_PUBLIC_CALENDLY_FIT_CHECK_URL=
NEXT_PUBLIC_CALENDLY_SUPPORT_CALL_URL=

# Stripe — payment links (live mode, public, exposed to browser)
NEXT_PUBLIC_STRIPE_SUPPORT_CALL_URL=https://buy.stripe.com/14AeVffF2gmCeFI6wi3Nm00
# Lemon Squeezy — paid PDF products (copy buy links from lemonsqueezy.com)
NEXT_PUBLIC_LEMONSQUEEZY_FAMILY_GUIDE_URL=
NEXT_PUBLIC_LEMONSQUEEZY_APPOINTMENT_PREP_URL=
NEXT_PUBLIC_LEMONSQUEEZY_SAFETY_CHECKLIST_URL=
NEXT_PUBLIC_LEMONSQUEEZY_TREATMENT_COMPARISON_URL=
NEXT_PUBLIC_LEMONSQUEEZY_RELAPSE_PREVENTION_URL=
NEXT_PUBLIC_STRIPE_DONATION_URL=https://buy.stripe.com/eVq6oJ50odaqcxAf2O3Nm06
EOF
  echo "  Created $ENV_FILE with Stripe URLs pre-filled."
  echo ""
else
  echo "$ENV_FILE already exists — skipping creation."
  echo ""
fi

# ---------------------------------------------------------------------------
# Check which vars are missing or empty
# ---------------------------------------------------------------------------
REQUIRED_VARS=(
  RESEND_API_KEY
  RESEND_TO_EMAIL
  MAILERLITE_API_KEY
  MAILERLITE_GROUP_ID_NEWSLETTER
  MAILERLITE_GROUP_ID_LEAD_MAGNET_UNSAFE
  MAILERLITE_GROUP_ID_LEAD_MAGNET_FAMILY
  MAILERLITE_GROUP_ID_B2B
  NEXT_PUBLIC_CALENDLY_FIT_CHECK_URL
  NEXT_PUBLIC_CALENDLY_SUPPORT_CALL_URL
  NEXT_PUBLIC_STRIPE_SUPPORT_CALL_URL
  NEXT_PUBLIC_LEMONSQUEEZY_FAMILY_GUIDE_URL
  NEXT_PUBLIC_LEMONSQUEEZY_APPOINTMENT_PREP_URL
  NEXT_PUBLIC_LEMONSQUEEZY_SAFETY_CHECKLIST_URL
  NEXT_PUBLIC_LEMONSQUEEZY_TREATMENT_COMPARISON_URL
  NEXT_PUBLIC_LEMONSQUEEZY_RELAPSE_PREVENTION_URL
  NEXT_PUBLIC_STRIPE_DONATION_URL
)

missing=()
set_vars=()

for var in "${REQUIRED_VARS[@]}"; do
  # Read value from .env.local (handles KEY=value and KEY= lines)
  value=$(grep -E "^${var}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)
  if [[ -z "$value" ]]; then
    missing+=("$var")
  else
    set_vars+=("$var")
  fi
done

echo "Status of $ENV_FILE:"
echo ""

for var in "${set_vars[@]}"; do
  echo "  ✓ $var"
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo ""
  for var in "${missing[@]}"; do
    echo "  ✗ $var  (needs a value)"
  done
  echo ""
  echo "$(( ${#missing[@]} )) var(s) still need values."
  echo "See docs/manual-tasks/2026-05-21-external-service-setup.md for instructions."
  exit 1
else
  echo ""
  echo "All ${#REQUIRED_VARS[@]} variables are set."
  echo "Run: npm run dev  (restart required after editing .env.local)"
fi
