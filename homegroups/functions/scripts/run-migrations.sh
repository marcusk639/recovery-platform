#!/usr/bin/env bash

# Script to run migrations for the Firebase project
# Usage: ./scripts/run-migrations.sh [migration-name] [options]
# 
# Options:
#   --production : Run against production environment
#   --dry-run    : Show what would be updated without making changes
#   --debug      : Show debug logs
#   --batch=N    : Set batch size (default: 500)

set -e

# Check if we're in the functions directory
if [ ! -f "package.json" ] || ! grep -q '"name": "functions"' package.json; then
  echo "Error: Must run from the functions directory"
  echo "Usage: cd functions && ./scripts/run-migrations.sh [migration-name] [options]"
  exit 1
fi

# Default environment
ENVIRONMENT="development"
DRY_RUN=""
DEBUG=""
BATCH_SIZE=""

# Parse arguments
MIGRATION=""
PASS_THROUGH_ARGS=""

for arg in "$@"; do
  case "$arg" in
    "--production")
      ENVIRONMENT="production"
      PASS_THROUGH_ARGS="$PASS_THROUGH_ARGS --production"
      ;;
    "--dry-run")
      DRY_RUN="true"
      PASS_THROUGH_ARGS="$PASS_THROUGH_ARGS --dry-run"
      ;;
    "--debug")
      DEBUG="true"
      PASS_THROUGH_ARGS="$PASS_THROUGH_ARGS --debug"
      ;;
    --batch=*)
      BATCH_SIZE="${arg#*=}"
      PASS_THROUGH_ARGS="$PASS_THROUGH_ARGS $arg"
      ;;
    *)
      if [ -z "$MIGRATION" ]; then
        MIGRATION="$arg"
      else
        echo "Warning: Ignoring unknown argument: $arg"
      fi
      ;;
  esac
done

# Validate migration name
case "$MIGRATION" in
  "geohashes")
    MIGRATION_SCRIPT="scripts/migrateGroupGeohashes.ts"
    ;;
  "meeting-instances")
    MIGRATION_SCRIPT="../../scripts/migrateMeetingInstances.ts"
    ;;
  "")
    echo "Error: No migration specified"
    echo "Available migrations:"
    echo "  geohashes - Add geohashes to all groups for location-based queries"
    echo "  meeting-instances - Generate meeting instances for all existing meetings"
    echo ""
    echo "Usage: ./scripts/run-migrations.sh [migration-name] [options]"
    echo ""
    echo "Options:"
    echo "  --production  Run against production environment"
    echo "  --dry-run     Show what would be updated without making changes"
    echo "  --debug       Show debug logs"
    echo "  --batch=N     Set batch size (default: 500)"
    exit 1
    ;;
  *)
    echo "Error: Unknown migration '$MIGRATION'"
    echo "Available migrations:"
    echo "  geohashes - Add geohashes to all groups for location-based queries"
    echo "  meeting-instances - Generate meeting instances for all existing meetings"
    echo ""
    echo "Usage: ./scripts/run-migrations.sh [migration-name] [options]"
    exit 1
    ;;
esac

# Check if we have the required service account file
SERVICE_ACCOUNT_FILE="service-account-dev.json"
if [ "$ENVIRONMENT" == "production" ]; then
  SERVICE_ACCOUNT_FILE="service-account-prod.json"
fi

if [ ! -f "$SERVICE_ACCOUNT_FILE" ]; then
  echo "Error: Missing service account file: $SERVICE_ACCOUNT_FILE"
  echo ""
  echo "You need to download the service account JSON file from Firebase console:"
  echo "1. Go to Project Settings > Service accounts"
  echo "2. Click 'Generate new private key'"
  echo "3. Save the file as '$SERVICE_ACCOUNT_FILE' in the functions directory"
  exit 1
fi

# Run the migration
echo "Running migration: $MIGRATION"
echo "Environment: $ENVIRONMENT"
if [ -n "$DRY_RUN" ]; then
  echo "Mode: DRY RUN (no changes will be made)"
else
  echo "Mode: LIVE RUN"
fi
if [ -n "$DEBUG" ]; then
  echo "Logging: DEBUG"
else
  echo "Logging: INFO"
fi
if [ -n "$BATCH_SIZE" ]; then
  echo "Batch size: $BATCH_SIZE"
fi
echo "================================================================="

npx ts-node "$MIGRATION_SCRIPT" $PASS_THROUGH_ARGS

echo "================================================================="
echo "Migration complete!" 