import fs from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { EMULATOR_HOST, EMULATOR_PORTS } from '../src/adapter/firebase/emulator-config';

// firebase.portal.json starts the emulators; the app, the e2e helpers (which import
// emulator-config) and the seed script must point at the same ports.
const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../firebase.portal.json'), 'utf8'),
);
const seed = fs.readFileSync(path.join(__dirname, '../scripts/seed.sh'), 'utf8');

test.each(Object.entries(EMULATOR_PORTS))(
  'the app reaches the %s emulator where firebase.portal.json starts it',
  (name, port) => {
    expect(config.emulators[name]).toEqual(expect.objectContaining({ host: EMULATOR_HOST, port }));
  },
);

test('the seed script writes to the same Firestore and Auth emulators', () => {
  expect(seed).toContain(`FIRESTORE_EMULATOR_HOST=${EMULATOR_HOST}:${EMULATOR_PORTS.firestore}`);
  expect(seed).toContain(`FIREBASE_AUTH_EMULATOR_HOST=${EMULATOR_HOST}:${EMULATOR_PORTS.auth}`);
});
