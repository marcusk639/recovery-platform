/**
 * The app's link registrations agree with regroup/app-links.json, the source the
 * web serves the AASA and assetlinks.json from (launch P5 Tasks 5 and 7):
 * - iOS associated domains per build (production builds: the production domain;
 *   E2EStaging: the staging domain);
 * - Android's verified https intent filter: host from the appLinkHost manifest
 *   placeholder (production default, staging for e2eStaging) and exactly the
 *   claimed paths.
 * Also pins what stays until the release after launch (spec §4.2): the old
 * Dynamic Links domain and the `example` URL scheme.
 */
const fs = require('fs');
const path = require('path');

const MOBILE = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(MOBILE, rel), 'utf8');
const source = JSON.parse(fs.readFileSync(path.resolve(MOBILE, '../app-links.json'), 'utf8'));
const PROD = source.environments['phoenix-cleanhouse'].domain;
const STAGING = source.environments['regroup-e2e'].domain;

const applinks = (entitlementsFile) =>
  [...read(entitlementsFile).matchAll(/<string>applinks:([^<]+)<\/string>/g)].map((m) => m[1]);

/** buildSettings of every XCBuildConfiguration named `name` that sets entitlements. */
const entitlementsFor = (name) => {
  const pbx = read('ios/rats.xcodeproj/project.pbxproj');
  const blocks = pbx
    .split(/\n\t\t[0-9A-F]{24} \/\* [^*]+ \*\/ = \{\n\t\t\tisa = XCBuildConfiguration;/)
    .slice(1);
  return blocks
    .filter((b) => new RegExp(`\\n\\t\\t\\tname = ${name};`).test(b))
    .map((b) => (b.match(/CODE_SIGN_ENTITLEMENTS = ([^;]+);/) || [])[1])
    .filter(Boolean);
};

/** <data> attributes of the manifest's autoVerify https filter. */
const verifiedFilterData = () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  const filter = manifest.match(
    /<intent-filter android:autoVerify="true">([\s\S]*?)<\/intent-filter>/,
  );
  expect(filter).not.toBeNull();
  return [...filter[1].matchAll(/<data([^>]*)\/>/g)].map((m) =>
    Object.fromEntries([...m[1].matchAll(/android:(\w+)="([^"]*)"/g)].map((a) => [a[1], a[2]])),
  );
};

/** The Android path entries a claimed path maps to. */
const androidPathFor = (claimed) =>
  claimed.endsWith('/*') ? { pathPrefix: claimed.slice(0, -1) } : { path: claimed };

describe('iOS associated domains', () => {
  it.each(['ios/rats/rats.entitlements', 'ios/rats/ratsDebug.entitlements'])(
    '%s claims the production domain',
    (file) => {
      expect(applinks(file)).toContain(PROD);
      expect(applinks(file)).not.toContain(STAGING);
    },
  );

  it('the staging entitlements claim the staging domain, not production', () => {
    expect(applinks('ios/rats/ratsE2EStaging.entitlements')).toContain(STAGING);
    expect(applinks('ios/rats/ratsE2EStaging.entitlements')).not.toContain(PROD);
  });

  it('every E2EStaging build that signs with entitlements uses the staging file', () => {
    const files = entitlementsFor('E2EStaging');
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(f).toBe('rats/ratsE2EStaging.entitlements');
  });

  it('Release keeps the production entitlements', () => {
    expect(entitlementsFor('Release')).toContain('rats/rats.entitlements');
  });

  // Removed the release after launch (spec §4.2); this pins today's state.
  it('keeps the old Dynamic Links domain and the example URL scheme for now', () => {
    expect(applinks('ios/rats/rats.entitlements')).toContain('cleanhouse.page.link');
    expect(read('ios/rats/Info.plist')).toMatch(/<string>example<\/string>/);
  });
});

describe('Android App Links', () => {
  it('the verified https filter takes its host from the appLinkHost placeholder', () => {
    const data = verifiedFilterData();
    expect(data.filter((d) => d.scheme === 'https')).toHaveLength(1);
    expect(data.filter((d) => d.host)).toEqual([{ host: '${appLinkHost}' }]);
  });

  it('claims exactly the paths in app-links.json', () => {
    const paths = verifiedFilterData()
      .filter((d) => d.path || d.pathPrefix)
      .map((d) => (d.path ? { path: d.path } : { pathPrefix: d.pathPrefix }));
    expect(paths).toEqual(source.paths.map(androidPathFor));
  });

  it('appLinkHost is the production domain by default and the staging domain for e2eStaging', () => {
    const gradle = read('android/app/build.gradle');
    const defaultConfig = gradle.match(/defaultConfig \{([\s\S]*?)\n    \}/)[1];
    expect(defaultConfig).toContain(`manifestPlaceholders = [appLinkHost: '${PROD}']`);
    const e2eStaging = gradle.match(/e2eStaging \{([\s\S]*?)\n        \}/)[1];
    expect(e2eStaging).toContain(`manifestPlaceholders = [appLinkHost: '${STAGING}']`);
  });
});
