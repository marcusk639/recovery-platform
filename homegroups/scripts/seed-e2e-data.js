/**
 * Data + Firestore-value helpers for seed-e2e.js. Exports buildWrites(uids, base) which returns
 * the array of Firestore REST `commit` writes for the 4 E2E personas and their group/meeting/
 * role/invite state. Keep the persona/group shapes here; keep orchestration in seed-e2e.js.
 */
const EMAILS = {
  admin: 'test-admin@homegroups-e2e.com',
  unclaimed: 'test-unclaimed-member@homegroups-e2e.com',
  treasurer: 'test-treasurer@homegroups-e2e.com',
  filler: 'test-filler@homegroups-e2e.com',
};

// JS value -> Firestore REST typed Value. Timestamps are wrapped as {__ts: isoString}.
function V(v) {
  if (v === null) return { nullValue: 'NULL_VALUE' };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number')
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v && v.__ts) return { timestampValue: v.__ts };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(V) } };
  const fields = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, V(x)]));
  return { mapValue: { fields } };
}
const TS = (iso) => ({ __ts: iso });
const toFields = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, V(v)]));

function buildWrites(uids, base) {
  const { admin: ADMIN, unclaimed: UNCLAIMED, treasurer: TREASURER, filler: FILLER } = uids;
  const now = new Date().toISOString();
  const yearOut = new Date(Date.now() + 365 * 864e5).toISOString();
  const weekOut = new Date(Date.now() + 7 * 864e5).toISOString();

  const grp = (name, admins, extra) => ({
    name,
    description: 'Seeded for Maestro E2E',
    location: 'Springfield, IL',
    type: 'AA',
    memberCount: admins.length ? 2 : 1,
    admins,
    adminUids: [],
    isClaimed: admins.length > 0,
    pendingAdminRequests: [],
    treasurers: [],
    createdAt: TS(now),
    updatedAt: TS(now),
    ...(extra || {}),
  });
  const sub = { subscriptionStatus: 'active', subscriptionExpiresAt: TS(yearOut) };
  const usr = (uid, email, name, homeGroups, adminGroups) => ({
    id: uid,
    uid,
    email,
    displayName: name,
    photoUrl: null,
    role: 'user',
    createdAt: TS(now),
    updatedAt: TS(now),
    lastLogin: TS(now),
    homeGroups,
    ...(adminGroups ? { adminGroups } : {}),
  });
  const mem = (gid, uid, name, isAdmin, isTreasurer, roles) => ({
    id: `${gid}_${uid}`,
    groupId: gid,
    userId: uid,
    displayName: name,
    showPhoneNumber: false,
    joinedAt: TS(now),
    isAdmin,
    isTreasurer,
    roles,
    showSobrietyDate: false,
  });

  // eslint-disable-next-line prettier/prettier
  const DOCS = [
    ['users', ADMIN, usr(ADMIN, EMAILS.admin, 'Test Admin', ['e2e-admin-group'])],
    [
      'users',
      UNCLAIMED,
      usr(UNCLAIMED, EMAILS.unclaimed, 'Test Unclaimed Member', ['e2e-unclaimed-group']),
    ],
    [
      'users',
      TREASURER,
      usr(TREASURER, EMAILS.treasurer, 'Test Treasurer', ['e2e-treasurer-group']),
    ],
    [
      'users',
      FILLER,
      usr(
        FILLER,
        EMAILS.filler,
        'Test Filler',
        ['e2e-treasurer-group', 'e2e-invite-target-group'],
        ['e2e-treasurer-group', 'e2e-invite-target-group'],
      ),
    ],
    ['groups', 'e2e-admin-group', grp('E2E Admin Group', [ADMIN], sub)],
    ['groups', 'e2e-unclaimed-group', grp('E2E Unclaimed Group', [])],
    ['groups', 'e2e-treasurer-group', grp('E2E Treasurer Group', [FILLER], sub)],
    ['groups', 'e2e-invite-target-group', grp('ZZZ E2E Invite Target Group', [FILLER], sub)],
    [
      'members',
      `e2e-admin-group_${ADMIN}`,
      mem('e2e-admin-group', ADMIN, 'Test Admin', true, false, ['admin', 'member']),
    ],
    [
      'members',
      `e2e-unclaimed-group_${UNCLAIMED}`,
      mem('e2e-unclaimed-group', UNCLAIMED, 'Test Unclaimed Member', false, false, ['member']),
    ],
    [
      'members',
      `e2e-treasurer-group_${TREASURER}`,
      mem('e2e-treasurer-group', TREASURER, 'Test Treasurer', false, true, ['member', 'treasurer']),
    ],
    [
      'members',
      `e2e-treasurer-group_${FILLER}`,
      mem('e2e-treasurer-group', FILLER, 'Test Filler', true, false, ['admin', 'member']),
    ],
    [
      'members',
      `e2e-invite-target-group_${FILLER}`,
      mem('e2e-invite-target-group', FILLER, 'Test Filler', true, false, ['admin', 'member']),
    ],
    [
      'meetings',
      'e2e-admin-meeting-1',
      {
        groupId: 'e2e-admin-group',
        name: 'E2E Weekly Meeting',
        type: 'AA',
        day: 'wednesday',
        time: '19:00',
        isOnline: false,
        location: 'Community Center',
        address: '123 Main St, Springfield, IL',
        verified: true,
        createdAt: TS(now),
        updatedAt: TS(now),
      },
    ],
    [
      'groups/e2e-treasurer-group/servicePositions',
      'e2e-treasurer-position',
      {
        groupId: 'e2e-treasurer-group',
        name: 'Treasurer',
        description: '',
        currentHolderId: TREASURER,
        currentHolderName: 'Test Treasurer',
        termStartDate: null,
        termEndDate: null,
        createdAt: TS(now),
        updatedAt: TS(now),
      },
    ],
    [
      'groupInvites',
      'e2e-invite-doc-1',
      {
        code: 'ABC123',
        groupId: 'e2e-invite-target-group',
        groupName: 'ZZZ E2E Invite Target Group',
        inviterUid: FILLER,
        status: 'pending',
        createdAt: TS(now),
        expiresAt: TS(weekOut),
        shareCount: 0,
        viewCount: 0,
        joinCount: 0,
        shareMethods: {},
      },
    ],
  ];

  return DOCS.map(([col, id, obj]) => ({
    update: { name: `${base}/${col}/${id}`, fields: toFields(obj) },
  }));
}

module.exports = { EMAILS, buildWrites };
