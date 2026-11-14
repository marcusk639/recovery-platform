const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SCRIPT = fs.readFileSync(path.join(__dirname, '../maestro-js/read-user-by-email.js'), 'utf8');
const RUN_QUERY =
  'http://127.0.0.1:8080/v1/projects/demo-regroup-e2e/databases/(default)/documents:runQuery';

// Runs the script the way Maestro does: env vars and http/json/output as globals.
function run(responseRows) {
  const posts = [];
  const output = {};
  vm.runInNewContext(SCRIPT, {
    EMAIL: 'e2e-signup@rats-e2e.com',
    output,
    json: JSON.parse,
    http: {
      post: (url, req) => {
        posts.push({ url, req, body: JSON.parse(req.body) });
        return { ok: true, status: 200, body: JSON.stringify(responseRows) };
      },
    },
  });
  return { posts, output };
}

describe('read-user-by-email.js', () => {
  it('queries the emulator users collection by the given email', () => {
    const { posts } = run([]);
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe(RUN_QUERY);
    expect(posts[0].body.structuredQuery).toEqual({
      from: [{ collectionId: 'users' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'email' },
          op: 'EQUAL',
          value: { stringValue: 'e2e-signup@rats-e2e.com' },
        },
      },
    });
  });

  it('reports the written profile fields', () => {
    const { output } = run([
      {
        document: {
          fields: {
            firstName: { stringValue: 'Emma' },
            termsOfService: { booleanValue: true },
          },
        },
      },
    ]);
    expect(output).toEqual({ userDocCount: 1, userFirstName: 'Emma', userTermsOfService: true });
  });

  it('reports no doc when the query finds none, as when signup never wrote it', () => {
    // runQuery answers a no-match query with one row holding only readTime.
    const { output } = run([{ readTime: '2026-11-14T00:00:00Z' }]);
    expect(output).toEqual({ userDocCount: 0, userFirstName: '', userTermsOfService: false });
  });
});
