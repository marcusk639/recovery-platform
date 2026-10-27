#!/bin/bash
# Deploys the functions listed below in batches of five. It does NOT cover
# every exported function (see docs/launch-readiness/plan-regroup-functions-
# 2026-10-19.md, item 7): for a full deploy use `firebase deploy --only
# functions` from regroup/. Stops at the first failed batch and exits non-zero.
set -euo pipefail

# Navigate to project root (parent of scripts/) so firebase.json is found
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

ALL_FUNCTIONS=(
  stripeEvents handleStripeConnectWebhook
  addGuestAuthorization addAdminAuthorization deleteAdminAuthorization
  promoteGuestsToAdmin removePrivilegesForGuests verifyUserEmail
  givePotentialSuperAdminPrivilege
  findMeetings userIsAtMeeting
  createPaymentIntent listPayments listHousePayments
  getPaymentMethod updatePaymentInfo
  connectStripeAccount disconnectStripeAccount getStripeAccountStatus
  createOperatorSubscription reactivateOperatorSubscription cancelUserSubscription
  updateSubscriptionGuests updateSubscriptionHouses
  sendConfirmationEmail
  stripeConnectReauth stripeConnectReturn universal
  notify notifyNewHouseCreated sendContactEmail sendSubscriptionUpdateEmail
  reportBug submitFeedback
  onGuestWrite onActivityWritten onGuestLinkedRestamp onHouseDeleted
  updateDisputes warmWebsite officerTermReminder weeklyTransfers
)

BATCH_SIZE=5
TOTAL=${#ALL_FUNCTIONS[@]}
BATCH_NUM=0
TOTAL_BATCHES=$(( (TOTAL + BATCH_SIZE - 1) / BATCH_SIZE ))

for ((i=0; i<TOTAL; i+=BATCH_SIZE)); do
  BATCH_NUM=$((BATCH_NUM + 1))
  batch=("${ALL_FUNCTIONS[@]:$i:$BATCH_SIZE}")
  only_arg=$(printf "functions:%s," "${batch[@]}")
  only_arg="${only_arg%,}"

  echo ""
  echo "=== Batch $BATCH_NUM / $TOTAL_BATCHES: ${batch[*]} ==="
  if ! firebase deploy --only "$only_arg"; then
    echo "✖  Batch $BATCH_NUM / $TOTAL_BATCHES failed: ${batch[*]}" >&2
    echo "   Later batches were NOT deployed. Fix the error and re-run." >&2
    exit 1
  fi
  echo "=== Batch $BATCH_NUM complete ==="
  sleep 2
done

echo ""
echo "All $TOTAL_BATCHES batches deployed."
