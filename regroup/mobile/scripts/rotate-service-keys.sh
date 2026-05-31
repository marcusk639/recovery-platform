#!/usr/bin/env bash
# Rotates GCP service account keys. Requires gcloud CLI authenticated as an Owner.
# Usage: ./scripts/rotate-service-keys.sh <service-account-email> <leaked-key-id>
#
# Run once per leaked key. Example:
#   ./scripts/rotate-service-keys.sh firebase-adminsdk-abc@phoenix-cleanhouse.iam.gserviceaccount.com abc123def456

set -euo pipefail

SA_EMAIL="${1:?Usage: $0 <service-account-email> <leaked-key-id>}"
LEAKED_KEY_ID="${2:?Usage: $0 <service-account-email> <leaked-key-id>}"
OUTPUT_DIR="${HOME}/.secrets"
mkdir -p "$OUTPUT_DIR"

echo "=== Rotating key for: $SA_EMAIL ==="
echo "    Deleting leaked key ID: $LEAKED_KEY_ID"

# Delete the leaked key
gcloud iam service-accounts keys delete "$LEAKED_KEY_ID" \
  --iam-account="$SA_EMAIL" \
  --quiet

echo "    Leaked key deleted."

# Create a new key, saved outside the repo
NEW_KEY_FILE="${OUTPUT_DIR}/${SA_EMAIL%%@*}-$(date +%Y%m%d).json"
gcloud iam service-accounts keys create "$NEW_KEY_FILE" \
  --iam-account="$SA_EMAIL"

echo "    New key saved to: $NEW_KEY_FILE"
echo "    Store this securely. Do NOT commit it to git."
echo "=== Done ==="
