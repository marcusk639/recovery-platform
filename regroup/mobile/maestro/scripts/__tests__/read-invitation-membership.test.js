const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SCRIPT = fs.readFileSync(
  path.join(__dirname, '../maestro-js/read-invitation-membership.js'),
  'utf8',
);
const DOCS = 'http://127.0.0.1:8080/v1/projects/demo-regroup-e2e/databases/(default)/documents/';

// Runs the script the way Maestro does: env vars and http/json/output as globals.
function run(docs) {
  const gets = [];
  const output = {};
  vm.runInNewContext(SCRIPT, {
    UID: 'e2e-guest-b',
    TOKEN: 'e2e-invite-token-accept',
    output,
    json: JSON.parse,
    http: {
      get: (url, req) => {
        gets.push({ url, req });
        const doc = docs[url.slice(DOCS.length)];
        return doc
          ? { ok: true, status: 200, body: JSON.stringify({ fields: doc }) }
          : { ok: false, status: 404, body: JSON.stringify({ error: { code: 404 } }) };
      },
    },
  });
  return { gets, output };
}

describe('read-invitation-membership.js', () => {
  it('reads the user, its admins record and the invitation, as the emulator owner', () => {
    const { gets, output } = run({
      'users/e2e-guest-b': {
        isAdmin: { booleanValue: true },
        isGuest: { booleanValue: true },
        adminId: { stringValue: 'admin-9' },
      },
      'admins/admin-9': {
        userId: { stringValue: 'e2e-guest-b' },
        houseIds: { arrayValue: { values: [{ stringValue: 'test-house-123' }] } },
      },
      'invitations/e2e-invite-token-accept': { redeemedByUid: { stringValue: 'e2e-guest-b' } },
    });
    expect(gets.map((g) => g.url.slice(DOCS.length))).toEqual([
      'users/e2e-guest-b',
      'admins/admin-9',
      'invitations/e2e-invite-token-accept',
    ]);
    expect(gets.every((g) => g.req.headers.Authorization === 'Bearer owner')).toBe(true);
    expect(output).toEqual({
      userIsAdmin: true,
      userIsGuest: true,
      adminUserId: 'e2e-guest-b',
      adminHouseIds: 'test-house-123',
      invitationRedeemedBy: 'e2e-guest-b',
    });
  });

  it('reports a half-member: no admins record, flags unset', () => {
    const { gets, output } = run({
      'users/e2e-guest-b': { isGuest: { booleanValue: true } },
      'invitations/e2e-invite-token-accept': { redeemedByUid: { stringValue: 'e2e-guest-b' } },
    });
    expect(gets).toHaveLength(2);
    expect(output).toEqual({
      userIsAdmin: false,
      userIsGuest: true,
      adminUserId: '',
      adminHouseIds: '',
      invitationRedeemedBy: 'e2e-guest-b',
    });
  });
});
