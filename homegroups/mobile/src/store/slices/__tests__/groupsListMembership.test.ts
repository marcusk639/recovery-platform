/**
 * Oracle for hg-groups-list-membership:
 * "Groups list must show exactly the groups the signed-in user belongs to."
 *
 * The groups list renders `selectMemberGroups`. These tests pin the contract
 * that selector must satisfy over the LIFETIME of a session, not just on a
 * single happy-path fetch:
 *
 *   a group may appear in the groups list only if the membership record that
 *   put it there was loaded for the *currently authenticated* uid.
 *
 * Everything is driven through the REAL groups reducer, the REAL auth reducer
 * and the REAL selectors. No module under test is mocked; only the native
 * Firebase/model boundaries are stubbed so the slices can be imported.
 *
 * Authentication changes are expressed the way the app expresses them
 * (`authSlice.setUser`, dispatched from `onAuthStateChanged` in
 * src/navigation/AppNavigator.tsx) AND by moving `auth().currentUser`, so an
 * implementation may read the signed-in uid from either source.
 */


import {
  fetchUserGroups,
  fetchGroupById,
  searchGroups,
  searchGroupsByLocation,
  leaveGroup,
  joinGroup,
  createGroup,
  USER_A,
  USER_B,
  A1,
  A2,
  B1,
  B2,
  buildStore,
  signInAs,
  startMembershipFetch,
  resolveMembershipFetch,
  loadMembership,
  renderedGroupIds,
  makeGroup,
  resetMembershipHarness,
} from './membershipHarness';

beforeEach(() => {
  resetMembershipHarness();
});

// ─── AC1 ──────────────────────────────────────────────────────────────────────

describe('AC1: a new authenticated user never sees the previous user\'s groups', () => {
  it('drops user A\'s groups from the list the moment user B becomes the authenticated user', () => {
    const store = buildStore();

    signInAs(store, USER_A);
    loadMembership(store, 'req-a', USER_A, [A1, A2]);
    expect(renderedGroupIds(store).sort()).toEqual(['group-a1', 'group-a2']);

    signInAs(store, USER_B);

    expect(renderedGroupIds(store)).not.toContain('group-a1');
    expect(renderedGroupIds(store)).not.toContain('group-a2');
  });

  it('renders an empty list for user B until B\'s own membership has loaded, so A\'s groups cannot flash', () => {
    const store = buildStore();

    signInAs(store, USER_A);
    loadMembership(store, 'req-a', USER_A, [A1, A2]);

    signInAs(store, USER_B);
    startMembershipFetch(store, 'req-b');

    expect(renderedGroupIds(store)).toEqual([]);
  });

  it('renders an empty list after sign-out, when nobody is authenticated', () => {
    const store = buildStore();

    signInAs(store, USER_A);
    loadMembership(store, 'req-a', USER_A, [A1, A2]);

    signInAs(store, null);

    expect(renderedGroupIds(store)).toEqual([]);
  });
});

// ─── AC2 ──────────────────────────────────────────────────────────────────────

describe('AC2: the list is exactly the signed-in user\'s set of groups', () => {
  it('ignores a membership payload loaded for a different uid than the signed-in user', () => {
    const store = buildStore();

    signInAs(store, USER_B);
    // A membership read that completed for user A — e.g. a request issued
    // before the auth switch — must contribute nothing to B's list.
    loadMembership(store, 'req-a', USER_A, [A1, A2]);

    expect(renderedGroupIds(store)).toEqual([]);
  });

  it('keeps exactly B\'s groups when A\'s in-flight membership read resolves after the switch', () => {
    const store = buildStore();

    signInAs(store, USER_A);
    const staleRequest = startMembershipFetch(store, 'req-a-inflight');

    signInAs(store, USER_B);
    loadMembership(store, 'req-b', USER_B, [B1, B2]);
    expect(renderedGroupIds(store).sort()).toEqual(['group-b1', 'group-b2']);

    // A's request now resolves, long after A stopped being the current user.
    resolveMembershipFetch(store, staleRequest, USER_A, [A1, A2]);

    expect(renderedGroupIds(store).sort()).toEqual(['group-b1', 'group-b2']);
  });
});

// ─── AC3 ──────────────────────────────────────────────────────────────────────

describe('AC3: groups cached by search, nearby or detail views are not membership', () => {
  it('never lists a searched, nearby or viewed group that only another user belongs to', () => {
    const store = buildStore();
    const cached = makeGroup('group-cached', 'Echo Group');
    const nearby = makeGroup('group-nearby', 'Foxtrot Group');
    const viewed = makeGroup('group-viewed', 'Golf Group');

    signInAs(store, USER_B);
    loadMembership(store, 'req-b', USER_B, [B1]);

    // B searched, browsed nearby groups and opened a group detail screen.
    store.dispatch(searchGroups.fulfilled([cached] as any, 'req-s', {} as any));
    store.dispatch(
      searchGroupsByLocation.fulfilled([nearby] as any, 'req-n', {
        latitude: 0,
        longitude: 0,
      } as any),
    );
    store.dispatch(
      fetchGroupById.fulfilled(viewed as any, 'req-v', 'group-viewed'),
    );
    expect(renderedGroupIds(store)).toEqual(['group-b1']);

    // A membership read for user A names one of those cached documents.
    // It is still not B's group.
    loadMembership(store, 'req-a', USER_A, [cached]);

    const rendered = renderedGroupIds(store);
    expect(rendered).not.toContain('group-cached');
    expect(rendered).not.toContain('group-nearby');
    expect(rendered).not.toContain('group-viewed');
    expect(rendered).toEqual(['group-b1']);
  });

  it('does not list groups cached during the previous user\'s session, before or after B\'s membership loads', () => {
    const store = buildStore();
    const cached = makeGroup('group-cached', 'Echo Group');

    signInAs(store, USER_A);
    loadMembership(store, 'req-a', USER_A, [A1]);
    store.dispatch(searchGroups.fulfilled([cached] as any, 'req-s', {} as any));

    signInAs(store, USER_B);
    // The list renders on mount, while B's own membership read is still in
    // flight: nothing cached from A's session may be shown.
    startMembershipFetch(store, 'req-b');
    expect(renderedGroupIds(store)).toEqual([]);

    resolveMembershipFetch(store, 'req-b', USER_B, [B1]);
    expect(renderedGroupIds(store)).toEqual(['group-b1']);
  });
});

// ─── AC4 ──────────────────────────────────────────────────────────────────────

describe('AC4: leaving a group removes it from the list for the rest of the session', () => {
  it('removes the left group immediately and does not resurrect it when a pre-leave membership read resolves', () => {
    const store = buildStore();

    signInAs(store, USER_A);
    loadMembership(store, 'req-a', USER_A, [A1, A2]);

    // A refresh is already in flight when the user leaves the group.
    const inFlight = startMembershipFetch(store, 'req-a-refresh');

    store.dispatch(leaveGroup.fulfilled('group-a1', 'req-leave', 'group-a1'));
    expect(renderedGroupIds(store)).toEqual(['group-a2']);

    // The refresh resolves carrying pre-leave data.
    resolveMembershipFetch(store, inFlight, USER_A, [A1, A2]);

    expect(renderedGroupIds(store)).toEqual(['group-a2']);
  });

  it('does not show a group to the next user that the previous user left', () => {
    const store = buildStore();

    signInAs(store, USER_A);
    loadMembership(store, 'req-a', USER_A, [A1, A2]);
    store.dispatch(leaveGroup.fulfilled('group-a1', 'req-leave', 'group-a1'));

    signInAs(store, USER_B);

    expect(renderedGroupIds(store)).toEqual([]);
  });
});
