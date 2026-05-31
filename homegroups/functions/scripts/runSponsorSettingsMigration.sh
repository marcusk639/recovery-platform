#!/bin/bash

# Migration script for syncing sponsorSettings from user docs to member docs
# 
# Usage:
#   ./runSponsorSettingsMigration.sh              # Run migration for real
#   ./runSponsorSettingsMigration.sh --dry-run    # Preview changes without applying
#   ./runSponsorSettingsMigration.sh -d -v        # Dry run with verbose output

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR"

echo "🚀 Running sponsorSettings migration..."
echo ""

npx ts-node migrateSponsorSettings.ts "$@"

