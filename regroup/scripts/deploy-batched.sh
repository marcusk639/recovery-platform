#!/bin/bash
# Deploys every exported Cloud Function in batches of 5 (for large changesets
# that hit deploy quotas). The default deploy is `npm --prefix functions run
# build && firebase deploy --only functions` from regroup/, which always
# deploys every export; use this script only when that fails on quotas.
# ALL_FUNCTIONS must list every deployable export of functions/src/index.ts
# (functions/src/__tests__/deployList.test.ts checks it): a function left off
# is silently never deployed. A failed batch stops the script with a non-zero
# exit.
#
# Usage: npm run deploy:batched -- --project <firebase project id>
# The project is required (no .firebaserc default, which is production), and the
# script builds functions/ first so it never ships a stale or missing lib/.
set -euo pipefail

PROJECT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT="${2:-}"; shift; [[ $# -gt 0 ]] && shift ;;
    --project=*) PROJECT="${1#--project=}"; shift ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done
if [[ -z "$PROJECT" ]]; then
  echo "usage: deploy-batched.sh --project <firebase project id> (required; there is no default)" >&2
  exit 1
fi

# Navigate to project root (parent of scripts/) so firebase.json is found
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

npm --prefix functions run build

ALL_FUNCTIONS=(
  stripeEvents handleStripeConnectWebhook
  addGuestAuthorization addAdminAuthorization deleteAdminAuthorization
  promoteGuestsToAdmin removePrivilegesForGuests verifyUserEmail
  givePotentialSuperAdminPrivilege
  createHouses finishOperatorSetup
  createInvitation peekInvitation redeemInvitation
  findMeetings userIsAtMeeting
  createPaymentIntent listPayments listHousePayments resolveFailedPaymentOffline previewRentCharges
  getPaymentMethod updatePaymentInfo
  connectStripeAccount disconnectStripeAccount getStripeAccountStatus
  createOperatorSubscription reactivateOperatorSubscription cancelUserSubscription
  updateSubscriptionGuests updateSubscriptionHouses
  createBillingPortalSession applyBundleDiscount getTierCatalog getAppConfig myHouseTiers
  getDocumentLink
  setOxfordEnabled castOxfordVote complianceExport rentRoiMetrics
  deleteAccount
  sendConfirmationEmail
  stripeConnectReauth stripeConnectReturn universal
  notify notifyNewHouseCreated notifyOperatorOnApplication
  sendContactEmail sendSubscriptionUpdateEmail
  reportBug submitFeedback
  onGuestWrite onHouseDeleted setHouseSubscriptionStatusOnCreate
  onActivityWritten onGuestLinkedRestamp onHouseRentSettingsWrite onHouseListingSync
  onUserAdminProfileSync
  updateDisputes warmWebsite officerTermReminder weeklyTransfers
  overdueRentNotification scheduledRentCollection rentCharges houseListingGraceSweep
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
  if ! firebase deploy --project "$PROJECT" --only "$only_arg"; then
    echo "✗ Batch $BATCH_NUM failed; stopping. Re-run after fixing (deploys are idempotent)." >&2
    exit 1
  fi
  echo "=== Batch $BATCH_NUM complete ==="
  sleep 2
done

echo ""
echo "All $TOTAL_BATCHES batches deployed."
