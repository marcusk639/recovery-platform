# Security & Firebase Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Script-automate deletion of 4 E2E test accounts from production Firebase (Auth + Firestore), and provide exact gcloud CLI commands for rotating 3 leaked service account keys + BFG git history purge.

**Architecture:** Two scripts in `scripts/` — one Node.js Firebase Admin script targeting the 4 known E2E emails, one bash script for gcloud key rotation. BFG purge is manual (requires force-push coordination) but all commands are provided verbatim.

**Tech Stack:** Node.js 18, Firebase Admin SDK 11, `gcloud` CLI, BFG Repo Cleaner

---

> **⚠️ WARNING — Read before running anything:**
>
> - Task 1 (E2E cleanup) permanently deletes Firebase Auth accounts. Verify emails before running.
> - Task 2 (key rotation) deletes GCP service account keys. Old keys stop working immediately.
> - Task 3 (BFG purge) rewrites git history. Coordinate with all team members first.
> - Run Task 2 before Task 3 — rotating keys first means the history purge removes already-invalidated credentials.

---

## File Structure

| Action | Path                              | Responsibility                                          |
| ------ | --------------------------------- | ------------------------------------------------------- |
| Create | `scripts/cleanup-e2e-accounts.js` | Delete 4 E2E Auth accounts + their Firestore data       |
| Create | `scripts/rotate-service-keys.sh`  | gcloud CLI key rotation for all leaked service accounts |

---

## Task 1: Delete E2E Test Accounts from Production Firebase

The 4 E2E test accounts are known by email. This script deletes them from Auth and removes all associated `guests` and `houses` documents from Firestore.

**Files:**

- Create: `scripts/cleanup-e2e-accounts.js`

- [ ] **Step 1: Write the script**

Create `scripts/cleanup-e2e-accounts.js`:

```js
#!/usr/bin/env node
/**
 * Deletes 4 known E2E test accounts from production Firebase Auth + Firestore.
 * Safe: targets only the specific emails below. Does NOT touch any other accounts.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-key.json node scripts/cleanup-e2e-accounts.js
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-key.json node scripts/cleanup-e2e-accounts.js --dry-run
 */

const admin = require('firebase-admin');

const DRY_RUN = process.argv.includes('--dry-run');

const E2E_EMAILS = [
  'test-guest-a@rats-e2e.com',
  'test-guest-b@rats-e2e.com',
  'test-manager@rats-e2e.com',
  'test-multi-house@rats-e2e.com',
];

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    'ERROR: Set GOOGLE_APPLICATION_CREDENTIALS to your service key path.',
  );
  console.error(
    'Example: GOOGLE_APPLICATION_CREDENTIALS=~/.secrets/regroup-key.json node scripts/cleanup-e2e-accounts.js',
  );
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const auth = admin.auth();
const db = admin.firestore();

async function deleteFirestoreDataForUid(uid) {
  // Delete guest documents
  const guestsSnap = await db
    .collection('guests')
    .where('userId', '==', uid)
    .get();
  for (const doc of guestsSnap.docs) {
    console.log(`  [firestore] deleting guests/${doc.id}`);
    if (!DRY_RUN) await doc.ref.delete();
  }

  // Delete house documents where createdBy matches uid
  const housesSnap = await db
    .collection('houses')
    .where('superAdminId', '==', uid)
    .get();
  for (const doc of housesSnap.docs) {
    console.log(
      `  [firestore] deleting houses/${doc.id} (name: ${doc.data().name})`,
    );
    if (!DRY_RUN) await doc.ref.delete();
  }
}

async function main() {
  if (DRY_RUN) {
    console.log('DRY RUN — no data will be deleted.\n');
  }

  for (const email of E2E_EMAILS) {
    console.log(`\nProcessing: ${email}`);
    let uid;

    try {
      const user = await auth.getUserByEmail(email);
      uid = user.uid;
      console.log(`  [auth] found uid: ${uid}`);
      if (!DRY_RUN) {
        await auth.deleteUser(uid);
        console.log(`  [auth] deleted`);
      } else {
        console.log(`  [auth] would delete uid: ${uid}`);
      }
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        console.log(`  [auth] not found — skipping`);
        continue;
      }
      throw err;
    }

    await deleteFirestoreDataForUid(uid);
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Run in dry-run mode first**

```bash
GOOGLE_APPLICATION_CREDENTIALS=~/.secrets/regroup-key.json \
  node scripts/cleanup-e2e-accounts.js --dry-run
```

Expected output:

```
DRY RUN — no data will be deleted.

Processing: test-guest-a@rats-e2e.com
  [auth] found uid: <some-uid>
  [auth] would delete uid: <some-uid>
  [firestore] deleting guests/<doc-id>

Processing: test-guest-b@rats-e2e.com
  ...

Done.
```

If any email shows "not found", that account doesn't exist in production — expected if it was already cleaned up.

**If the script errors with `auth/insufficient-permission`:** your service key doesn't have `firebaseauth.users.delete` permission. Use the Firebase Admin service account (not a restricted key).

- [ ] **Step 3: Run for real**

```bash
GOOGLE_APPLICATION_CREDENTIALS=~/.secrets/regroup-key.json \
  node scripts/cleanup-e2e-accounts.js
```

Expected output: Same as dry-run but with `[auth] deleted` instead of `would delete`.

- [ ] **Step 4: Verify in Firebase Console**

1. Open [Firebase Console → Authentication → Users](https://console.firebase.google.com)
2. Search for each of the 4 emails
3. Confirm none appear

**Expected result:** Zero results for all 4 emails.

- [ ] **Step 5: Commit the script**

```bash
git add scripts/cleanup-e2e-accounts.js
git commit -m "chore(scripts): add E2E account cleanup script for production Firebase"
```

---

## Task 2: Rotate Leaked Service Account Keys

The 3 leaked service account keys need to be rotated in GCP before the git history is purged. Rotating first means any attacker who already cloned the repo gets keys that no longer work.

**Files:**

- Create: `scripts/rotate-service-keys.sh`

> **Note:** This script discovers the service accounts from the leaked JSON files in git history. You must know the file paths of the 3 leaked key files. Run Step 1 first to find them.

- [ ] **Step 1: Find leaked key files in git history**

```bash
# Find all .json files that look like service account keys committed at any point
git log --all --full-history --name-only --pretty=format: -- "**/*service-account*.json" "**/*firebase-adminsdk*.json" "**/*credentials*.json" "**/*key*.json" | grep "\.json$" | sort -u
```

Also check the scripts directory directly (may still be on disk even if gitignored):

```bash
ls scripts/*.json
```

Note every filename. You need the `client_email` and `private_key_id` fields from each to know which GCP key to revoke.

- [ ] **Step 2: Extract key IDs from leaked files**

For each leaked JSON file found, run:

```bash
# Replace with actual file path
cat scripts/service-key.json | python3 -c "
import json, sys
data = json.load(sys.stdin)
if isinstance(data, dict):
    for name, key in data.items():
        print(f'Account: {name}')
        print(f'  client_email: {key.get(\"client_email\", \"N/A\")}')
        print(f'  private_key_id: {key.get(\"private_key_id\", \"N/A\")}')
else:
    print(f'client_email: {data.get(\"client_email\")}')
    print(f'private_key_id: {data.get(\"private_key_id\")}')
"
```

Write down: service account email + private_key_id for each leaked key.

- [ ] **Step 3: Write the rotation script**

Create `scripts/rotate-service-keys.sh`:

```bash
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
```

```bash
chmod +x scripts/rotate-service-keys.sh
```

- [ ] **Step 4: Authenticate gcloud**

```bash
gcloud auth login
gcloud config set project phoenix-cleanhouse
```

Expected: browser opens for auth. After login, `gcloud config get project` returns `phoenix-cleanhouse`.

- [ ] **Step 5: Run for each leaked key**

Run once per service account email + leaked key ID you found in Step 2:

```bash
# Example — replace with your actual values from Step 2
./scripts/rotate-service-keys.sh \
  "firebase-adminsdk-xxxxx@phoenix-cleanhouse.iam.gserviceaccount.com" \
  "abc123def456abc123"
```

Repeat for all 3 leaked keys.

**Expected result:** `gcloud iam service-accounts keys list --iam-account=<email>` no longer shows the deleted key ID.

- [ ] **Step 6: Update running services with new keys**

For each new key created at `~/.secrets/`:

1. Upload to Cloud Functions config:
   ```bash
   firebase functions:config:set admin.key="$(cat ~/.secrets/<new-key-file>.json | base64)"
   ```
2. Or if used directly on a server: copy to the server's secure credentials location.

Test that Cloud Functions still deploy and run:

```bash
firebase deploy --only functions
```

- [ ] **Step 7: Commit the rotation script (not the keys)**

```bash
git add scripts/rotate-service-keys.sh
git commit -m "chore(scripts): add service account key rotation script"
```

---

## Task 3: BFG Git History Purge (Manual — Must Be Done By a Human)

> **⚠️ This step rewrites git history for every commit. All team members must re-clone after this step. It cannot be undone after force-push.**

BFG cannot be scripted to run autonomously — the force-push to shared history must be a deliberate human action. All commands are provided verbatim.

**Prerequisites:**

- BFG installed: `brew install bfg` (or download JAR from https://rtyley.github.io/bfg-repo-cleaner/)
- All team members warned and ready to re-clone
- Task 2 (key rotation) complete — old keys already invalidated

- [ ] **Step 1: Make a fresh mirror clone**

```bash
cd /tmp
git clone --mirror git@github.com:<your-org>/rats-v2.git rats-v2-mirror
```

> Do NOT run BFG on your working copy. Always use a mirror clone.

- [ ] **Step 2: Identify leaked filenames**

From Task 2 Step 1, you have the list. Common names are:

- `service-key.json`
- `credentials.json`
- `firebase-adminsdk-*.json`

- [ ] **Step 3: Run BFG**

```bash
cd /tmp/rats-v2-mirror

# Delete specific files from all history
bfg --delete-files service-key.json
bfg --delete-files "firebase-adminsdk-*.json"

# BFG will report how many commits were rewritten.
# Review the output before proceeding.
```

- [ ] **Step 4: Clean up and force-push**

```bash
cd /tmp/rats-v2-mirror
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force
```

**Expected result:** Remote history no longer contains the key files.

- [ ] **Step 5: Verify**

```bash
# In your local working copy (after re-fetching)
git fetch --all
git log --all --full-history -- "service-key.json" "**/*firebase-adminsdk*.json"
```

Expected: no output (no matching commits).

- [ ] **Step 6: All team members re-clone**

```bash
# Each team member runs:
cd ~  # or wherever you keep projects
rm -rf dev/rats-v2
git clone git@github.com:<your-org>/rats-v2.git dev/rats-v2
cd dev/rats-v2
npm install
```

---

## Self-Review

### Spec Coverage

| Requirement                              | Covered by                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| Delete 4 E2E accounts from Firebase Auth | Task 1 — `cleanup-e2e-accounts.js` targets exact emails                |
| Remove associated Firestore data         | Task 1 — deletes `guests` + `houses` docs by `userId` / `superAdminId` |
| Rotate 3 leaked service account keys     | Task 2 — `rotate-service-keys.sh` deletes old key, creates new one     |
| Purge key files from git history         | Task 3 — BFG commands provided verbatim                                |
| New keys saved outside repo              | Task 2 — saved to `~/.secrets/`, not committed                         |
| Force-push coordination                  | Task 3 — manual section with explicit warning                          |

### Gaps Intentionally Excluded

- **Gitignore update** — add `scripts/service-key.json` and `scripts/credentials.json` to `.gitignore` after the purge so they can't be accidentally committed again. Do this immediately after Task 3.
- **Automatic key distribution** — new keys should be managed via a secrets manager (GCP Secret Manager, 1Password, etc.). That infrastructure is out of scope here.

### Acceptance Criteria

- [ ] `git log --all --full-history -- "service-key.json"` returns nothing after BFG purge
- [ ] Firebase Console shows 0 accounts for all 4 E2E emails
- [ ] Cloud Functions deploy succeeds with new service account key
- [ ] `gcloud iam service-accounts keys list --iam-account=<email>` does not show the leaked `private_key_id`
