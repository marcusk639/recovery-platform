# Claims and Roles Migration Script

This script backfills member documents and syncs custom claims for all users to enable the new Firestore security rules.

## Prerequisites

1. **Node.js 18+** installed
2. **Service account file** at `scripts/recovery-connect.json`
3. **Cloud Functions deployed** (the claims sync functions must be deployed first)

## Getting the Service Account

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Go to Project Settings → Service Accounts
4. Click "Generate new private key"
5. Save the file as `scripts/recovery-connect.json`

**Important**: This file contains sensitive credentials. It's already in `.gitignore` but never commit it to version control.

## Installation

```bash
cd scripts
npm install
```

## Usage

### Dry Run (Preview Changes)

Always run in dry-run mode first to see what changes will be made:

```bash
npx ts-node migrateClaimsAndRoles.ts --dry-run
```

With verbose output:

```bash
npx ts-node migrateClaimsAndRoles.ts --dry-run --verbose
```

### Full Migration

```bash
npx ts-node migrateClaimsAndRoles.ts
```

### Command Line Options

| Option            | Description                                      |
| ----------------- | ------------------------------------------------ |
| `-d, --dry-run`   | Preview changes without applying them            |
| `-v, --verbose`   | Show detailed output for each document           |
| `--users-only`    | Only sync claims, skip member document updates   |
| `--members-only`  | Only update member documents, skip claims sync   |
| `--batch-size N`  | Number of users to process per batch (default: 50) |
| `--delay N`       | Delay in ms between batches (default: 1000)      |

### Examples

```bash
# Preview all changes
npx ts-node migrateClaimsAndRoles.ts --dry-run --verbose

# Run full migration
npx ts-node migrateClaimsAndRoles.ts

# Only fix member documents (if claims sync is already done)
npx ts-node migrateClaimsAndRoles.ts --members-only

# Only sync claims (if member docs are already correct)
npx ts-node migrateClaimsAndRoles.ts --users-only

# Slower migration for rate limit avoidance
npx ts-node migrateClaimsAndRoles.ts --batch-size 25 --delay 2000
```

## What the Script Does

### Step 1: Backfill Member Documents

For each document in the `members` collection:

1. Extracts `groupId` and `userId` from document ID (format: `{groupId}_{userId}`)
2. Validates the document ID format
3. Adds/updates the following fields:
   - `userId`: The user's Firebase Auth UID
   - `groupId`: The group's document ID
   - `isTreasurer`: Denormalized treasurer status (from group's `treasurers` array)
   - `roles`: Array of roles (e.g., `["admin", "member"]`)

### Step 2: Sync Custom Claims

For each user in the `users` collection:

1. Queries all their member documents
2. Builds custom claims object:
   - `memberGroups`: All groups user is a member of
   - `adminGroups`: Groups where user is an admin
   - `treasurerGroups`: Groups where user is a treasurer
   - `superAdmin`: Preserved from existing claims if present
3. Checks claims size (warns at 800 bytes, truncates at 1000 bytes)
4. Sets custom claims via Firebase Admin Auth

## Output

### During Migration

```
📋 Step 1: Backfilling member documents...

Found 1234 member documents to process
✓ Member group1_user1 already up to date
Would update group2_user2: userId=user2, isTreasurer=true, roles=member,treasurer
...

✅ Member document backfill complete
   Processed: 1234
   Updated: 1100
   Malformed IDs: 3

🔐 Step 2: Syncing custom claims for all users...

Found 500 users to process
Processing users 1-50/500
✓ Set claims for user1: memberGroups=3, adminGroups=1, treasurerGroups=0
⚠️  User user2 claims 850 bytes - approaching limit
...

✅ Claims sync complete
   Users processed: 500
   Claims updated: 495
   Claims exceeded limit: 2
```

### Results File

A JSON file is saved with full migration results:

```
claims-migration-results-2024-01-15T10-30-00-000Z.json
```

Contents:

```json
{
  "timestamp": "2024-01-15T10:35:00.000Z",
  "dryRun": false,
  "duration": "45.23s",
  "stats": {
    "membersProcessed": 1234,
    "membersUpdated": 1100,
    "membersWithMalformedIds": 3,
    "usersProcessed": 500,
    "claimsUpdated": 495,
    "claimsExceededLimit": 2,
    "errors": ["Error for user xyz: ..."]
  }
}
```

## Handling Errors

### Malformed Member IDs

If member documents have IDs that don't match the `{groupId}_{userId}` format:

1. The script logs them as errors
2. They are skipped during migration
3. Review the results file to identify problematic documents
4. Fix manually or delete if they're orphaned

### Claims Size Exceeded

If a user is in too many groups (>25):

1. The script logs a warning
2. `memberGroups` is truncated while preserving `adminGroups` and `treasurerGroups`
3. These users will rely on document-based fallback rules

### Rate Limiting

If you see rate limit errors:

```bash
# Use smaller batches with longer delays
npx ts-node migrateClaimsAndRoles.ts --batch-size 25 --delay 2000
```

## Verifying Migration Success

### Check Claims in Firebase Console

1. Go to Firebase Console → Authentication → Users
2. Select a user who should have claims
3. Scroll to "Custom claims" section
4. Verify the claims match expected groups

### Check Claims Programmatically

```typescript
import * as admin from "firebase-admin";

async function checkUserClaims(userId: string) {
  const user = await admin.auth().getUser(userId);
  console.log("Claims:", user.customClaims);
}
```

### Test Security Rules

After migration, test that rules work correctly:

```bash
# In functions directory
npm run test:rules
```

## Rollback

The migration does not have a built-in rollback mechanism because:

1. Member document changes are additive (new fields only)
2. Claims can be re-synced at any time

To reset claims for a user:

```typescript
await admin.auth().setCustomUserClaims(userId, {});
```

To re-run migration:

```bash
npx ts-node migrateClaimsAndRoles.ts
```

## Troubleshooting

### "Cannot find module 'commander'"

```bash
cd scripts && npm install
```

### "Error: Invalid service account"

1. Check that `recovery-connect.json` exists in the `scripts` folder
2. Verify it's valid JSON
3. Ensure it's for the correct Firebase project

### "No member documents found"

1. Verify the `members` collection exists
2. Check that member documents have the expected structure
3. Try running with `--verbose` to see more details

### "Claims not appearing"

1. Wait for Cloud Functions to process (check logs)
2. User must refresh their ID token to see new claims
3. Check for errors in migration results file

## Related Documentation

- [Security Rules Documentation](../docs/SECURITY_RULES.md)
- [Cloud Functions for Claims Sync](../functions/src/triggers/firestore/)
- [Mobile App Token Refresh](../mobile/src/services/firebase/auth.ts)

