#!/usr/bin/env node
/**
 * Post-flow Firestore assertion helper for Maestro E2E.
 *
 * Maestro is black-box (no JS bridge), so it cannot read Redux/Firestore state
 * directly. This helper closes that gap: after a flow runs, assert that a
 * document in the *emulator* has the expected field values. This is how we
 * cover persistence-class bugs (e.g. the P0-5 guest-edit data loss) that a
 * pure UI assertion would miss.
 *
 * It talks to the Firestore emulator only (FIRESTORE_EMULATOR_HOST), never prod.
 *
 * Usage:
 *   node maestro/scripts/assert-firestore.js <docPath> <field=value> [field=value ...]
 *
 * Examples:
 *   # Confirm the seeded house exists with the expected name
 *   node maestro/scripts/assert-firestore.js houses/test-house-123 id=test-house-123
 *
 *   # Confirm a guest profile edit persisted AND sibling fields were not lost
 *   node maestro/scripts/assert-firestore.js guests/<uid> phone=555-9999 firstName=Test
 *
 * Value parsing: `true`/`false`/numeric strings are coerced; everything else is
 * compared as a string. Nested fields use dot paths (e.g. phase.current=2).
 *
 * Exit code 0 = all assertions passed; 1 = mismatch or missing doc.
 */
const admin = require('firebase-admin');

// Point firebase-admin at the emulator. Match the ports in regroup/firebase.json.
process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'phoenix-cleanhouse';

function coerce(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw !== '' && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}

function getNested(obj, dotPath) {
  return dotPath.split('.').reduce((acc, key) => {
    return acc == null ? undefined : acc[key];
  }, obj);
}

async function main() {
  const [docPath, ...assertions] = process.argv.slice(2);

  if (!docPath || assertions.length === 0) {
    console.error(
      'Usage: node assert-firestore.js <docPath> <field=value> [field=value ...]',
    );
    process.exit(2);
  }

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: PROJECT_ID });
  }
  const db = admin.firestore();

  const snap = await db.doc(docPath).get();
  if (!snap.exists) {
    console.error(`✗ Document not found: ${docPath}`);
    process.exit(1);
  }

  const data = snap.data();
  let failures = 0;

  for (const assertion of assertions) {
    const eqIndex = assertion.indexOf('=');
    if (eqIndex === -1) {
      console.error(
        `✗ Malformed assertion (expected field=value): ${assertion}`,
      );
      failures += 1;
      continue;
    }
    const field = assertion.slice(0, eqIndex);
    const expected = coerce(assertion.slice(eqIndex + 1));
    const actual = getNested(data, field);

    if (actual === expected) {
      console.log(`✓ ${docPath}.${field} === ${JSON.stringify(expected)}`);
    } else {
      console.error(
        `✗ ${docPath}.${field}: expected ${JSON.stringify(
          expected,
        )}, got ${JSON.stringify(actual)}`,
      );
      failures += 1;
    }
  }

  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('✗ assert-firestore failed:', err.message);
  process.exit(1);
});
