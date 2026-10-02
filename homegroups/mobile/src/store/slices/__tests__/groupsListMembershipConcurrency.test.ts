/**
 * Concurrency half of the groups-list membership oracle.
 *
 * AC1-AC4 (in groupsListMembership.test.ts) pin the single-request contract.
 * These pin what happens when membership work OVERLAPS: a mutation issued by
 * one user settling under another, two mutations in flight at once, and the
 * bookkeeping that tracks them. Every case here was written against a real
 * defect found in review.
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

describe('AC5: a membership mutation only adds to the signed-in user\'s list', () => {
  // fetchUserGroups is guarded, but createGroup/joinGroup also write
  // memberGroups. A mutation issued by the previous user must not land in the
  // next user's list when it resolves late.
  it('does not leak a group to B when A\'s in-flight join resolves after the switch', () => {
    const store = buildStore();

    signInAs(store, USER_A);
    loadMembership(store, 'req-a', USER_A, [A1]);
    store.dispatch(joinGroup.pending('req-join-a', 'group-a2'));

    signInAs(store, USER_B);
    loadMembership(store, 'req-b', USER_B, [B1]);
    expect(renderedGroupIds(store).sort()).toEqual(['group-b1']);

    store.dispatch(joinGroup.fulfilled(A2 as any, 'req-join-a', 'group-a2'));

    expect(renderedGroupIds(store).sort()).toEqual(['group-b1']);
  });

  it('does not leak a group to B when A\'s in-flight create resolves after the switch', () => {
    const store = buildStore();

    signInAs(store, USER_A);
    loadMembership(store, 'req-a', USER_A, [A1]);
    store.dispatch(createGroup.pending('req-create-a', A2 as any));

    signInAs(store, USER_B);
    loadMembership(store, 'req-b', USER_B, [B1]);

    store.dispatch(createGroup.fulfilled(A2 as any, 'req-create-a', A2 as any));

    expect(renderedGroupIds(store).sort()).toEqual(['group-b1']);
  });
});

describe('membership request bookkeeping', () => {
  // Every tracked request must be consumed exactly once. A pending entry that
  // outlives its thunk grows Redux state for the life of the session and keeps
  // a uid around after it stops meaning anything.
  it('does not retain a tracked request after a join or create fails', () => {
    const store = buildStore();
    signInAs(store, USER_A);

    store.dispatch(joinGroup.pending('req-join-fail', 'group-a2'));
    store.dispatch(
      joinGroup.rejected(new Error('network'), 'req-join-fail', 'group-a2'),
    );

    store.dispatch(createGroup.pending('req-create-fail', A2 as any));
    store.dispatch(
      createGroup.rejected(new Error('network'), 'req-create-fail', A2 as any),
    );

    expect(store.getState().groups.membershipRequests).toEqual({});
    expect(store.getState().groups.membershipMutations).toEqual({});
  });

  // joinGroup's thunk returns GroupModel.getById(...), typed HomeGroup | null,
  // so a read-after-write miss resolves the thunk with a null payload. The
  // tracked request must still be consumed.
  it('does not retain a tracked request when a join resolves with no group', () => {
    const store = buildStore();
    signInAs(store, USER_A);

    store.dispatch(joinGroup.pending('req-join-null', 'group-a2'));
    store.dispatch(joinGroup.fulfilled(null as any, 'req-join-null', 'group-a2'));

    expect(store.getState().groups.membershipMutations).toEqual({});
  });
});


describe('AC6: concurrent same-user membership operations', () => {
  it('keeps both groups when one user joins two groups concurrently', () => {
    const store = buildStore();
    signInAs(store, USER_A);
    loadMembership(store, 'req-a', USER_A, [A1]);

    store.dispatch(joinGroup.pending('join-1', 'group-a2'));
    store.dispatch(joinGroup.pending('join-2', 'group-b2'));
    store.dispatch(joinGroup.fulfilled(A2 as any, 'join-1', 'group-a2'));
    store.dispatch(joinGroup.fulfilled(B2 as any, 'join-2', 'group-b2'));

    expect(renderedGroupIds(store).sort()).toEqual([
      'group-a1', 'group-a2', 'group-b2',
    ]);
  });

  it('does not discard a fetch that was issued after a join resolved', () => {
    const store = buildStore();
    signInAs(store, USER_A);

    store.dispatch(joinGroup.pending('join-1', 'group-a2'));
    store.dispatch(joinGroup.fulfilled(A2 as any, 'join-1', 'group-a2'));
    // Fetch issued AFTER the join settled, so it already includes the group.
    loadMembership(store, 'req-after', USER_A, [A1, A2]);

    expect(renderedGroupIds(store).sort()).toEqual(['group-a1', 'group-a2']);
  });

  // The reason a join invalidates in-flight READS: a membership fetch issued
  // before the join cannot know about it, so applying it afterwards would drop
  // the group the user just joined. This is what stops the fix for concurrent
  // joins from simply deleting the invalidation.
  it('does not let a pre-join membership read erase the joined group', () => {
    const store = buildStore();
    signInAs(store, USER_A);

    // Read issued first, so its payload predates the join.
    startMembershipFetch(store, 'req-stale');
    store.dispatch(joinGroup.pending('join-1', 'group-a2'));
    store.dispatch(joinGroup.fulfilled(A2 as any, 'join-1', 'group-a2'));
    resolveMembershipFetch(store, 'req-stale', USER_A, [A1]);

    expect(renderedGroupIds(store).sort()).toContain('group-a2');
  });
});

describe('AC7: leaving one group does not cancel work on another', () => {
  it('keeps a join of a different group that was in flight during a leave', () => {
    const store = buildStore();
    signInAs(store, USER_A);
    loadMembership(store, 'req-a', USER_A, [A1, B2]);

    // Joining A2 while leaving an unrelated group (B2).
    store.dispatch(joinGroup.pending('join-x', 'group-a2'));
    store.dispatch(leaveGroup.fulfilled('group-b2', 'leave-1', 'group-b2'));
    store.dispatch(joinGroup.fulfilled(A2 as any, 'join-x', 'group-a2'));

    expect(renderedGroupIds(store).sort()).toEqual(['group-a1', 'group-a2']);
  });
});

