const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SCRIPT = fs.readFileSync(path.join(__dirname, '../maestro-js/dst-complaints.js'), 'utf8');
const COMMIT =
  'http://127.0.0.1:8080/v1/projects/demo-regroup-e2e/databases/(default)/documents:commit';
const HOUSE_DOC = 'projects/demo-regroup-e2e/databases/(default)/documents/houses/test-house-123';
const KEYS = ['e2eDst1', 'e2eDst2', 'e2eDst3', 'e2eDst4'];

// Runs the script the way Maestro does (env vars and http/json/output as
// globals) in a child process: the zone comes from TZ, which Jest's sandboxed
// process.env can't change for the test process.
const HARNESS = `
const vm = require('vm');
const { script, env, httpOk } = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const posts = [];
const output = {};
let error = null;
try {
  vm.runInNewContext(script, {
    ...env,
    output,
    json: JSON.parse,
    http: {
      post: (url, req) => {
        posts.push({ url, req, body: JSON.parse(req.body) });
        return httpOk ? { ok: true, status: 200, body: '{}' } : { ok: false, status: 403, body: 'denied' };
      },
    },
  });
} catch (e) {
  error = e.message;
}
process.stdout.write(JSON.stringify({ posts, output, error }));
`;

function run(tz, env, { httpOk = true } = {}) {
  const out = execFileSync(process.execPath, ['-e', HARNESS], {
    env: { ...process.env, TZ: tz },
    input: JSON.stringify({ script: SCRIPT, env, httpOk }),
  });
  return JSON.parse(out.toString());
}

const NOW = String(Date.parse('2026-11-11T20:00:00Z'));

describe('dst-complaints', () => {
  it('writes complaints 90 minutes either side of the last two DST changes', () => {
    const { posts, output } = run('America/Los_Angeles', { ACTION: 'add', NOW_MS: NOW });

    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe(COMMIT);
    expect(posts[0].req.headers.Authorization).toBe('Bearer owner');
    const [write] = posts[0].body.writes;
    expect(write.update.name).toBe(HOUSE_DOC);
    expect(write.currentDocument).toEqual({ exists: true });
    expect(write.updateMask.fieldPaths).toEqual(KEYS.map((k) => `complaints.${k}`));

    const complaints = write.update.fields.complaints.mapValue.fields;
    const createdAt = KEYS.map((k) => complaints[k].mapValue.fields.createdAt.stringValue);
    // Fall back 2026-11-01 02:00 PDT = 09:00Z; spring forward 2026-03-08 02:00 PST = 10:00Z.
    expect(createdAt).toEqual([
      '2026-11-01T07:30:00.000Z',
      '2026-11-01T10:30:00.000Z',
      '2026-03-08T08:30:00.000Z',
      '2026-03-08T11:30:00.000Z',
    ]);
    expect(complaints.e2eDst1.mapValue.fields.houseId.stringValue).toBe('test-house-123');
    expect(complaints.e2eDst1.mapValue.fields.plaintiffType.stringValue).toBe('anonymous');

    expect(output.dstFound).toBe(true);
    expect([output.expected1, output.expected2, output.expected3, output.expected4]).toEqual([
      'Sunday, November 1st 2026 12:30 AM',
      'Sunday, November 1st 2026 02:30 AM',
      'Sunday, March 8th 2026 12:30 AM',
      'Sunday, March 8th 2026 04:30 AM',
    ]);
  });

  it('works in a southern-hemisphere zone', () => {
    const { output } = run('Australia/Sydney', { ACTION: 'add', NOW_MS: NOW });

    expect(output.dstFound).toBe(true);
    // Forward 2026-10-04 02:00 AEST -> 03:00; back 2026-04-05 03:00 AEDT -> 02:00.
    expect([output.expected1, output.expected2, output.expected3, output.expected4]).toEqual([
      'Sunday, October 4th 2026 12:30 AM',
      'Sunday, October 4th 2026 04:30 AM',
      'Sunday, April 5th 2026 01:30 AM',
      'Sunday, April 5th 2026 03:30 AM',
    ]);
  });

  it('writes nothing in a zone without DST', () => {
    const { posts, output } = run('UTC', { ACTION: 'add', NOW_MS: NOW });

    expect(posts).toHaveLength(0);
    expect(output.dstFound).toBe(false);
  });

  it('removes the complaints it wrote', () => {
    const { posts } = run('America/Los_Angeles', { ACTION: 'remove', NOW_MS: NOW });

    expect(posts).toHaveLength(1);
    const [write] = posts[0].body.writes;
    expect(write.update).toEqual({ name: HOUSE_DOC, fields: {} });
    expect(write.updateMask.fieldPaths).toEqual(KEYS.map((k) => `complaints.${k}`));
  });

  it('throws when the emulator refuses the write', () => {
    const { error } = run('America/Los_Angeles', { ACTION: 'add', NOW_MS: NOW }, { httpOk: false });

    expect(error).toMatch(/403/);
  });
});
