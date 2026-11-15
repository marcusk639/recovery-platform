/**
 * linking.ts prefixes vs the URL schemes the native apps register (#183 item
 * 18). linking.ts accepted `regroup://`, which neither platform registers, and
 * not `regroup-app://`, the canonical scheme (launch spec §4.2) that iOS and
 * Android register and invitations are minted with.
 */
import * as fs from 'fs';
import * as path from 'path';
import { linkingConfig } from '../linking';

const root = path.resolve(__dirname, '../../..');
const infoPlist = fs.readFileSync(path.join(root, 'ios/rats/Info.plist'), 'utf8');
const manifest = fs.readFileSync(
  path.join(root, 'android/app/src/main/AndroidManifest.xml'),
  'utf8',
);

const customSchemes = linkingConfig.prefixes
  .filter((prefix) => !prefix.startsWith('https://'))
  .map((prefix) => prefix.replace('://', ''));

describe('linkingConfig prefixes', () => {
  it('accepts the canonical regroup-app:// scheme', () => {
    expect(linkingConfig.prefixes).toContain('regroup-app://');
  });

  it('no longer accepts the unregistered regroup:// scheme', () => {
    expect(linkingConfig.prefixes).not.toContain('regroup://');
  });

  it.each(customSchemes)('%s is registered by iOS and Android', (scheme) => {
    expect(infoPlist).toContain(`<string>${scheme}</string>`);
    expect(manifest).toContain(`android:scheme="${scheme}"`);
  });
});
