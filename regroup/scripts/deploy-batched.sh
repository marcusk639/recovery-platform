#!/bin/bash
# Deploys every exported Cloud Function in batches of 5 (for large changesets
# that hit deploy quotas). The default deploy is `firebase deploy --only
# functions` from regroup/, which always deploys every export; use this script
# only when that fails on quotas. ALL_FUNCTIONS must list every deployable
# export of functions/src/index.ts: a function left off is silently never
# deployed. A failed batch stops the script with a non-zero exit.
set -euo pipefail

# Navigate to project root (parent of scripts/) so firebase.json is found
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

ALL_FUNCTIONS=(
  stripeEvents handleStripeConnectWebhook
  addGuestAuthorization addAdminAuthorization deleteAdminAuthorization
  promoteGuestsToAdmin removePrivilegesForGuests verifyUserEmail
  givePotentialSuperAdminPrivilege
  createHouses finishOperatorSetup
  createInvitation peekInvitation redeemInvitation
  findMeetings userIsAtMeeting
  createPaymentIntent listPayments listHousePayments
  getPaymentMethod updatePaymentInfo
  connectStripeAccount disconnectStripeAccount getStripeAccountStatus
  createOperatorSubscription reactivateOperatorSubscription cancelUserSubscription
  updateSubscriptionGuests updateSubscriptionHouses
  createBillingPortalSession applyBundleDiscount getTierCatalog
  setOxfordEnabled castOxfordVote complianceExport rentRoiMetrics
  deleteAccount
  sendConfirmationEmail
  stripeConnectReauth stripeConnectReturn universal
  notify notifyNewHouseCreated notifyOperatorOnApplication
  sendContactEmail sendSubscriptionUpdateEmail
  reportBug submitFeedback
  onGuestWrite onHouseDeleted setHouseSubscriptionStatusOnCreate
  updateDisputes warmWebsite officerTermReminder weeklyTransfers
  overdueRentNotification scheduledRentCollection
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
    echo "✗ Batch $BATCH_NUM failed; stopping. Re-run after fixing (deploys are idempotent)." >&2
    exit 1
  fi
  echo "=== Batch $BATCH_NUM complete ==="
  sleep 2
done

echo ""
echo "All $TOTAL_BATCHES batches deployed."
