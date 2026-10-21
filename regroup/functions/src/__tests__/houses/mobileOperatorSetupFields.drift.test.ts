// Drift guard: after a completed setup recovery, the mobile app merges
// OPERATOR_SETUP_FIELDS (regroup/mobile/src/services/operator-setup.ts) into
// the user when the reload lags, so it must be exactly the set of flags
// writeOperatorSetupFlags writes here. A missing field would route a
// just-recovered operator wrong; an extra one would invent state.
//
// Parsed as text for the same reason as mobilePayloadKeys.drift.test.ts:
// importing the mobile module would pull in React Native / Firebase.
jest.mock('../../api/firestore', () => ({ userCollection: {} }));

import * as fs from 'fs';
import * as path from 'path';
import { OPERATOR_SETUP_FIELDS } from '../../houses/operatorSetup';

const MOBILE_FILE = path.resolve(__dirname, '../../../../mobile/src/services/operator-setup.ts');

const parseMobileFields = (source: string): Record<string, boolean> => {
  const match = source.match(/OPERATOR_SETUP_FIELDS\s*=\s*\{([^}]*)\}/);
  if (!match) throw new Error('OPERATOR_SETUP_FIELDS object literal not found');
  const body = match[1].replace(/\/\/.*$/gm, '');
  const entries = Array.from(body.matchAll(/(\w+)\s*:\s*(true|false)/g), (m) => [
    m[1],
    m[2] === 'true',
  ]);
  // Anything other than `key: boolean` pairs, commas and whitespace means the
  // object is no longer a plain literal and this parser cannot be trusted.
  const leftover = body.replace(/\w+\s*:\s*(true|false)/g, '').replace(/[\s,]/g, '');
  if (leftover) throw new Error(`OPERATOR_SETUP_FIELDS is not a plain literal: ${leftover}`);
  return Object.fromEntries(entries);
};

describe('mobile OPERATOR_SETUP_FIELDS', () => {
  it('matches the server OPERATOR_SETUP_FIELDS exactly', () => {
    const mobileFields = parseMobileFields(fs.readFileSync(MOBILE_FILE, 'utf8'));
    expect(mobileFields).toEqual({ ...OPERATOR_SETUP_FIELDS });
  });
});
