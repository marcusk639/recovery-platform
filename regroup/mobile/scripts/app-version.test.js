// The minimum-version gate compares the server's value with APP_VERSION
// (src/config/appVersion.ts). It must be the version the store shows, so it is
// kept equal to the native files: bump all three with every release.
const fs = require('fs');
const path = require('path');
const { APP_VERSION } = require('../src/config/appVersion');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('APP_VERSION matches the native version names', () => {
  it('iOS: Info.plist CFBundleShortVersionString', () => {
    const plist = read('ios/rats/Info.plist');
    const match = plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);
    expect(match).not.toBeNull();
    // Info.plist may defer to the build setting; then the build setting decides.
    if (match[1] !== '$(MARKETING_VERSION)') {
      expect(APP_VERSION.ios).toBe(match[1]);
    }
  });

  it('iOS: every MARKETING_VERSION in the Xcode project', () => {
    const versions = [
      ...read('ios/rats.xcodeproj/project.pbxproj').matchAll(/MARKETING_VERSION = ([^;]+);/g),
    ].map((m) => m[1].replace(/"/g, ''));
    expect(versions.length).toBeGreaterThan(0);
    expect(new Set(versions)).toEqual(new Set([APP_VERSION.ios]));
  });

  it('Android: build.gradle versionName', () => {
    const match = read('android/app/build.gradle').match(/versionName\s+"([^"]+)"/);
    expect(match).not.toBeNull();
    expect(APP_VERSION.android).toBe(match[1]);
  });

  it('both are x.y or x.y.z, the shape getAppConfig accepts', () => {
    expect(APP_VERSION.ios).toMatch(/^\d+\.\d+(\.\d+)?$/);
    expect(APP_VERSION.android).toMatch(/^\d+\.\d+(\.\d+)?$/);
  });
});
