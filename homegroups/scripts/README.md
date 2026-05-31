# RecoveryConnect Utility Scripts

This directory contains utility scripts for database migrations and testing in the RecoveryConnect application.

## Quick Links

- [Claims & Roles Migration](#claims-and-roles-migration-script) - **Required for Security Rules**
- [Member Migration](#member-migration-script)
- [Chat Testing](#chat-functionality-test-script)

---

## Claims and Roles Migration Script

**File**: `migrateClaimsAndRoles.ts`

This script is **required** before deploying the new Firestore security rules. It backfills member documents with required fields and syncs custom claims for all users.

### Why This Migration is Needed

The security rules use Firebase Custom Claims for zero-read permission checks. This migration:

1. Adds `userId`, `isTreasurer`, and `roles` fields to all member documents
2. Syncs custom claims (`memberGroups`, `adminGroups`, `treasurerGroups`) to all users

### Prerequisites

1. Cloud Functions must be deployed first (they handle ongoing claims sync)
2. Service account file at `scripts/recovery-connect.json`

### Usage

```bash
# Always do a dry run first
npx ts-node migrateClaimsAndRoles.ts --dry-run --verbose

# Run the actual migration
npx ts-node migrateClaimsAndRoles.ts

# See all options
npx ts-node migrateClaimsAndRoles.ts --help
```

### Options

| Option           | Description                                |
| ---------------- | ------------------------------------------ |
| `--dry-run, -d`  | Preview changes without applying           |
| `--verbose, -v`  | Show detailed output                       |
| `--users-only`   | Only sync claims (skip member updates)     |
| `--members-only` | Only update members (skip claims sync)     |
| `--batch-size N` | Users per batch (default: 50)              |
| `--delay N`      | Ms between batches (default: 1000)         |

### Full Documentation

See [README-migration.md](./README-migration.md) for complete documentation.

---

## Chat Functionality Test Script

The `testChatFunctionality.ts` script tests the chat functionality using Firestore with the same collection structure as used in the app's ChatModel.

### Setup

1. Install dependencies:

```bash
npm install
```

2. Make sure you have Firebase Admin SDK credentials:
   - Save your Firebase service account key as `recovery-connect.json` in this directory
   - You can download this from Firebase Console:
     - Go to Project Settings > Service Accounts
     - Click "Generate new private key"
     - Save the JSON file as `recovery-connect.json` in this scripts directory

### Usage

Run the chat testing script:

```bash
npm run test-chat
```

Or directly with ts-node:

```bash
npx ts-node testChatFunctionality.ts
```

### What It Tests

The script tests various chat functionality:

1. Initializing a group chat
2. Sending regular user messages
3. Sending system messages
4. Retrieving recent messages
5. Adding reactions to messages
6. Marking messages as read
7. Real-time message reception using Firestore listeners

### Collection Structure

The script uses the same Firestore collection paths as the app's ChatModel:

- `group_chats`: Collection of all group chats
- `group_chats/{groupId}/messages`: Subcollection of messages for each group

### Configuration

The script is configured to use the group with ID `VkIApNXMxkTsx1nHELBH`. If you want to test with a different group, edit the `GROUP_ID` constant in the script.

## Member Migration Script

The `migrateMembers.js` script migrates group members from subcollections to a top-level members collection in Firestore.

### Setup

1. Install dependencies:

```bash
npm install
```

2. Make the script executable (Unix/Linux/macOS):

```bash
chmod +x migrateMembers.js
```

3. Make sure you have Firebase Admin SDK credentials. You can:
   - Use application default credentials if running in a Google Cloud environment
   - Download a service account key from Firebase Console:
     - Go to Project Settings > Service Accounts
     - Click "Generate new private key"
     - Save the JSON file in a secure location

### Usage

#### Running a Dry Run

To see what would be migrated without making any changes:

```bash
npm run migrate-dry-run
```

Or with a service account:

```bash
node migrateMembers.js --migrate --dry-run --service-account=/path/to/serviceAccountKey.json
```

#### Performing the Migration

To run the actual migration:

```bash
npm run migrate
```

Or with a service account:

```bash
node migrateMembers.js --migrate --service-account=/path/to/serviceAccountKey.json
```

#### Cleaning Up Old Data

After verifying that the migration was successful, you can clean up the old subcollection data:

```bash
npm run cleanup
```

Or with a service account:

```bash
node migrateMembers.js --cleanup --service-account=/path/to/serviceAccountKey.json
```

⚠️ **WARNING**: The cleanup process is irreversible and will permanently delete all member subcollections. Make sure the migration has been successful before proceeding.

### Output

The script generates JSON files with the results of migrations and cleanups:

- `migration-results-[timestamp].json`
- `cleanup-results-[timestamp].json`

These files contain information about the processed groups, migrated members, and any failures.

## Troubleshooting

- If you encounter authentication errors, make sure your service account has the necessary permissions.
- For large databases, the script might take some time to complete. Consider running it in a stable environment.
- If the migration fails for specific groups or members, check the output logs and the results JSON for details.
