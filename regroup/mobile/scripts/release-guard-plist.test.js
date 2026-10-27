const { Buffer } = require('buffer');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'release-guard.js');

// The binary plist reader must fail closed on a damaged file: the build's
// GoogleService-Info.plist is binary, and a misread project id must never pass.
describe('malformed binary plists', () => {
  const binaryFixture = fs.readFileSync(
    path.join(__dirname, '__fixtures__', 'GoogleService-Info.phoenix-cleanhouse.binary.plist'),
  );

  const runWith = (bytes) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'release-guard-'));
    const config = path.join(cwd, 'GoogleService-Info.plist');
    fs.writeFileSync(config, bytes);
    const env = { ...process.env, STRIPE_PUBLISHABLE_KEY: 'pk_live_dummy' };
    delete env.E2E_VARIANT;
    return spawnSync(process.execPath, [SCRIPT, '--config', config], {
      cwd,
      env,
      encoding: 'utf8',
    });
  };

  it.each([8, 40, binaryFixture.length - 1])('fails a bplist00 truncated to %i bytes', (size) => {
    const result = runWith(binaryFixture.subarray(0, size));
    expect(result.status).toBe(1);
  });

  it('rejects a dictionary count larger than the file can hold', () => {
    const { readBinaryPlistTopLevelStrings } = require('./release-guard');
    const bytes = Buffer.from(binaryFixture);
    const trailer = bytes.length - 32;
    const top = Number(bytes.readBigUInt64BE(trailer + 16));
    const table = Number(bytes.readBigUInt64BE(trailer + 24));
    const offsetSize = bytes[trailer + 6];
    let at = 0;
    for (let i = 0; i < offsetSize; i++) {
      at = at * 256 + bytes[table + top * offsetSize + i];
    }
    // Dict marker 0xDF: the count follows as an int object, set huge.
    bytes[at] = 0xdf;
    bytes[at + 1] = 0x12;
    bytes.writeUInt32BE(0x7fffffff, at + 2);
    expect(() => readBinaryPlistTopLevelStrings(bytes)).toThrow(/count/);
  });
});
