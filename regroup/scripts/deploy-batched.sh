#!/bin/bash
set -e

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
  sendInviteEmails sendConfirmationEmail
  stripeConnectReauth stripeConnectReturn universal
  notify notifyNewHouseCreated sendContactEmail sendSubscriptionUpdateEmail
  reportBug submitFeedback
  onGuestWrite
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
  firebase deploy --only "$only_arg" && echo "=== Batch $BATCH_NUM complete ===" || echo "⚠  Batch $BATCH_NUM had errors — continuing"
  sleep 2
done

echo ""
echo "All batches attempted."
