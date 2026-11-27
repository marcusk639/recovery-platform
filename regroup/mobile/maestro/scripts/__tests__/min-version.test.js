const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SCRIPT = fs.readFileSync(path.join(__dirname, '../maestro-js/min-version.js'), 'utf8');
const COMMIT =
  'http://127.0.0.1:8080/v1/projects/demo-regroup-e2e/databases/(default)/documents:commit';
const DOC = 'projects/demo-regroup-e2e/databases/(default)/documents/config/app';

// Runs the script the way Maestro does: env vars and http as globals.
function run(env, { ok = true } = {}) {
  const posts = [];
  vm.runInNewContext(SCRIPT, {
    ...env,
    http: {
      post: (url, req) => {
        posts.push({ url, req, body: JSON.parse(req.body) });
        return ok ? { ok: true, status: 200, body: '{}' } : { ok: false, status: 403, body: 'no' };
      },
    },
  });
  return posts;
}

describe('min-version', () => {
  it('sets the same minimum for both platforms on the emulator', () => {
    const posts = run({ ACTION: 'set', VALUE: '99.0' });
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe(COMMIT);
    expect(posts[0].req.headers.Authorization).toBe('Bearer owner');
    expect(posts[0].body.writes).toEqual([
      {
        update: {
          name: DOC,
          fields: {
            minVersion: {
              mapValue: {
                fields: { ios: { stringValue: '99.0' }, android: { stringValue: '99.0' } },
              },
            },
          },
        },
      },
    ]);
  });

  it('clears it by deleting config/app', () => {
    expect(run({ ACTION: 'clear' })[0].body.writes).toEqual([{ delete: DOC }]);
  });

  it('refuses a value getAppConfig would ignore', () => {
    expect(() => run({ ACTION: 'set', VALUE: 'latest' })).toThrow(/x\.y/);
  });

  it('refuses an unknown action', () => {
    expect(() => run({ ACTION: 'bump' })).toThrow(/ACTION/);
  });

  it('fails the flow when the emulator refuses the write', () => {
    expect(() => run({ ACTION: 'clear' }, { ok: false })).toThrow(/403/);
  });
});
