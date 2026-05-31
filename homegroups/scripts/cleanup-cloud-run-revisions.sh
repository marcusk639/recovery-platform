#!/bin/bash

# Script to delete Cloud Run revisions older than 30 days
# SAFETY: Will never delete the last remaining revision for any service
# Usage: ./cleanup-cloud-run-revisions.sh [project-id] [region] [days]

PROJECT_ID="${1:-recovery-connect-cad4b}"
REGION="${2:-us-central1}"
DAYS_OLD="${3:-30}"

echo "================================================"
echo "Cloud Run Revision Cleanup Script"
echo "================================================"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Deleting revisions older than: $DAYS_OLD days"
echo "SAFETY: Will keep at least 1 revision per service"
echo "================================================"
echo ""

# Calculate cutoff date
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  CUTOFF_DATE=$(date -v-${DAYS_OLD}d +%Y-%m-%dT%H:%M:%S)
else
  # Linux
  CUTOFF_DATE=$(date -d "$DAYS_OLD days ago" +%Y-%m-%dT%H:%M:%S)
fi

echo "Cutoff date: $CUTOFF_DATE"
echo ""

# Get all revisions
echo "Fetching revisions..."
REVISIONS=$(gcloud run revisions list \
  --platform managed \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --format="csv[no-heading](name,status.conditions[0].lastTransitionTime,SERVICE)" \
  2>/dev/null)

if [ -z "$REVISIONS" ]; then
  echo "No revisions found or error fetching revisions."
  echo "Make sure you have the correct project and region."
  exit 1
fi

# PASS 1: Count total revisions per service
declare -A TOTAL_REVISIONS_PER_SERVICE
while IFS=',' read -r name timestamp service; do
  if [ -n "$service" ] && [ -n "$name" ]; then
    TOTAL_REVISIONS_PER_SERVICE[$service]=$((${TOTAL_REVISIONS_PER_SERVICE[$service]:-0} + 1))
  fi
done <<< "$REVISIONS"

echo ""
echo "Services found:"
for service in "${!TOTAL_REVISIONS_PER_SERVICE[@]}"; do
  echo "  - $service: ${TOTAL_REVISIONS_PER_SERVICE[$service]} revision(s)"
done
echo ""

# PASS 2: Identify old revisions, keeping track of how many we'd delete per service
declare -A DELETABLE_COUNT_PER_SERVICE
declare -a OLD_REVISIONS=()

while IFS=',' read -r name timestamp service; do
  if [ -z "$name" ] || [ -z "$timestamp" ] || [ -z "$service" ]; then
    continue
  fi

  # Clean up timestamp (remove timezone suffix if present)
  CLEAN_TIMESTAMP=$(echo "$timestamp" | sed 's/Z$//' | cut -d'+' -f1)
  
  # Check if revision is old
  if [[ "$CLEAN_TIMESTAMP" < "$CUTOFF_DATE" ]]; then
    OLD_REVISIONS+=("$name,$service,$CLEAN_TIMESTAMP")
    DELETABLE_COUNT_PER_SERVICE[$service]=$((${DELETABLE_COUNT_PER_SERVICE[$service]:-0} + 1))
  fi
done <<< "$REVISIONS"

# PASS 3: Determine which revisions to actually delete (ensuring at least 1 remains)
REVISIONS_TO_DELETE=()
PROTECTED_COUNT=0
declare -A WILL_DELETE_COUNT_PER_SERVICE

echo "Analyzing revisions..."
echo ""

for entry in "${OLD_REVISIONS[@]}"; do
  IFS=',' read -r name service timestamp <<< "$entry"
  
  TOTAL=${TOTAL_REVISIONS_PER_SERVICE[$service]:-0}
  ALREADY_MARKED=${WILL_DELETE_COUNT_PER_SERVICE[$service]:-0}
  REMAINING_AFTER_DELETE=$((TOTAL - ALREADY_MARKED - 1))
  
  if [ "$REMAINING_AFTER_DELETE" -ge 1 ]; then
    # Safe to delete - at least 1 revision will remain
    echo "  TO DELETE: $name (service: $service, created: $timestamp)"
    REVISIONS_TO_DELETE+=("$name")
    WILL_DELETE_COUNT_PER_SERVICE[$service]=$((ALREADY_MARKED + 1))
  else
    # Cannot delete - would leave service with 0 revisions
    echo "  PROTECTED: $name (service: $service) - last remaining revision"
    ((PROTECTED_COUNT++))
  fi
done

# Count skipped (newer revisions)
TOTAL_REVISIONS=$(echo "$REVISIONS" | grep -c .)
SKIPPED_COUNT=$((TOTAL_REVISIONS - ${#OLD_REVISIONS[@]}))

echo ""
echo "================================================"
echo "Summary:"
echo "  Total revisions found: $TOTAL_REVISIONS"
echo "  Revisions to delete: ${#REVISIONS_TO_DELETE[@]}"
echo "  Revisions skipped (newer than $DAYS_OLD days): $SKIPPED_COUNT"
echo "  Revisions protected (last for service): $PROTECTED_COUNT"
echo "================================================"
echo ""

# Show post-deletion state
echo "After cleanup, each service will have:"
for service in "${!TOTAL_REVISIONS_PER_SERVICE[@]}"; do
  TOTAL=${TOTAL_REVISIONS_PER_SERVICE[$service]}
  DELETING=${WILL_DELETE_COUNT_PER_SERVICE[$service]:-0}
  REMAINING=$((TOTAL - DELETING))
  echo "  - $service: $REMAINING revision(s) (deleting $DELETING)"
done
echo ""

if [ ${#REVISIONS_TO_DELETE[@]} -eq 0 ]; then
  echo "No revisions to delete."
  exit 0
fi

# Confirm before deletion
read -p "Do you want to proceed with deletion? (y/N): " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "Deleting revisions..."
echo ""

DELETED_COUNT=0
FAILED_COUNT=0

for revision in "${REVISIONS_TO_DELETE[@]}"; do
  echo -n "  Deleting $revision... "
  if gcloud run revisions delete "$revision" \
    --platform managed \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --quiet 2>/dev/null; then
    echo "OK"
    ((DELETED_COUNT++))
  else
    echo "FAILED"
    ((FAILED_COUNT++))
  fi
  
  # Small delay to avoid rate limiting
  sleep 1
done

echo ""
echo "================================================"
echo "Cleanup complete!"
echo "  Successfully deleted: $DELETED_COUNT"
echo "  Failed: $FAILED_COUNT"
echo "================================================"
