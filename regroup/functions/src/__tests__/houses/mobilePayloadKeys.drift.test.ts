// Drift guard: the mobile setup wizard whitelists which house fields it sends
// to createHouses (HOUSE_PAYLOAD_KEYS in regroup/mobile/src/services/
// setup-wizard.ts). A schema field missing there is silently dropped (this is
// how the wizard's `certified` answer was lost).
//
// Why here and by parsing source: importing the mobile module into this jest
// run would pull in React Native / @react-native-firebase, and importing this
// zod schema into the mobile jest run would cross package boundaries. Both
// live in this repo, so the functions suite reads the mobile file as text and
// parses the string-literal array.
import * as fs from 'fs';
import * as path from 'path';
import { createHouseInputSchema } from '../../houses/houseInput';

const MOBILE_FILE = path.resolve(__dirname, '../../../../mobile/src/services/setup-wizard.ts');

// Keys the client builds separately rather than copying from the house.
const CLIENT_BUILT_KEYS = ['requestKey'];

const parseMobileKeys = (source: string): string[] => {
  const match = source.match(/HOUSE_PAYLOAD_KEYS\s*=\s*\[([^\]]*)\]/);
  if (!match) throw new Error('HOUSE_PAYLOAD_KEYS array literal not found');
  const body = match[1].replace(/\/\/.*$/gm, '');
  const keys = Array.from(body.matchAll(/["']([^"']+)["']/g), (m) => m[1]);
  // Anything other than string literals, commas and whitespace means the
  // array is no longer a plain literal and this parser cannot be trusted.
  const leftover = body.replace(/["'][^"']+["']/g, '').replace(/[\s,]/g, '');
  if (leftover) throw new Error(`HOUSE_PAYLOAD_KEYS is not a plain literal: ${leftover}`);
  return keys;
};

describe('mobile createHouses payload keys', () => {
  const mobileKeys = parseMobileKeys(fs.readFileSync(MOBILE_FILE, 'utf8'));

  it('match the server createHouseInputSchema keys minus client-built ones', () => {
    const schemaKeys = Object.keys(createHouseInputSchema.shape).filter(
      (k) => !CLIENT_BUILT_KEYS.includes(k),
    );
    expect([...mobileKeys].sort()).toEqual([...schemaKeys].sort());
  });

  it('has no duplicates and includes certified', () => {
    expect(new Set(mobileKeys).size).toBe(mobileKeys.length);
    expect(mobileKeys).toContain('certified');
  });
});
