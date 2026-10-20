# Regroup Invitation Signup Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A resident or senior peer who signs up from an invitation link finishes on the New Account screen with a guest doc and a user doc. They don't get "Failed to create guest account".

**Architecture:** Delete the client's `updateSubscriptionGuests` call from the guest signup branch. It always fails:

- `ownerUserId` is `''` on the token flow, and the server needs `min(1)`;
- the server also requires `ownerUserId === request.auth.uid`, which is never true for a resident.

It's also redundant, because `redeemInvitation` already records occupancy server-side (`callable/invitations.ts:250-262`, `recordResidentAccepted`).

**Tech Stack:** React Native, Formik (`withFormik`), Jest with `@testing-library/react-native`.

**Spec:** `docs/launch-readiness/plan-regroup-recovery-api-2026-10-19.md`, item B2, with evidence REV-A1.

## Global Constraints

- Work in a worktree off `origin/main`. Commit scope: `regroup-mobile`.
- Never log PII. Error text shown to the user stays generic.
- Mobile tests: `cd regroup/mobile && npx jest <path>`.
- Out of scope, tracked separately: the legacy no-token branches (S4) and `email_verified` on redeem (S3). Don't change them here.

## Review Focus

1. **Senior-peer invitations** take the same guest branch (`invitation.type === "senior-peer"`) and must also complete without the callable. (Task 1: `"senior-peer token signup completes"`.)
2. **Admin invitations** must be untouched. The admin branch never called `updateSubscriptionGuests`. (Task 1: `"admin token signup is unchanged"`.)
3. **`createGuest` failing after a successful redeem** must still show "Failed to create guest account" and must not navigate. (Task 1: `"a createGuest failure still surfaces an error"`.)
4. **Occupancy still counts the resident.** That's covered by the existing server tests for `redeemInvitation` → `recordResidentAccepted` in `functions/src/__tests__/callable/invitations.test.ts`. Run them; no change.
5. **No other caller.** `updateSubscriptionGuests` in `services/subscription.ts` has no remaining mobile caller after this change. Leave the wrapper; the server callable is still exported.

---

### Task 1: Remove the failing occupancy call from guest signup

**Files:**

- Modify: `regroup/mobile/src/screens/SignUp/SignUpForm.tsx:34` (the import) and `:146-158` (the `Promise.all` in the guest branch)
- Test: `regroup/mobile/src/screens/SignUp/__tests__/SignUpForm.test.tsx`

**Interfaces:**

- Consumes: the existing test harness in `SignUpForm.test.tsx`. The mocked `SignUpFormView` captures props; drive the submit through `capturedProps.submitForm()` (supplied by Formik), and set `invitation` through the mocked `useAppSelector` state.

- [ ] **Step 1: Write the failing tests.** Mock `../../../services/invitations` `redeemInvitation` to resolve, `../../../services/subscription` `updateSubscriptionGuests` as a `jest.fn()`, and `../../../services/users` `getAuthUser` to resolve. Use `jest.useFakeTimers()` to skip the 1000 ms delay.

```ts
it('guest token signup completes without calling updateSubscriptionGuests', async () => {
  // invitation: { type: "guest", token: "t1", houseId: "h1", ownerId: "", email: "r@x.com" }
  await act(() => capturedProps.submitForm());
  expect(mockRedeemInvitation).toHaveBeenCalledWith('t1');
  expect(mockUpdateSubscriptionGuests).not.toHaveBeenCalled();
  expect(mockCreateGuest).toHaveBeenCalled();
  expect(mockNavigate).toHaveBeenCalledWith(Routes.NewAccount);
  expect(mockSetError).not.toHaveBeenCalled();
});
it('senior-peer token signup completes', async () => {
  /* type "senior-peer" — same expectations, createGuest arg has isAdmin true */
});
it('admin token signup is unchanged', async () => {
  /* type "admin" — createAdmin + updateUser called, navigate NewAccount */
});
it('a createGuest failure still surfaces an error', async () => {
  /* createGuest rejects → setError("…") called, navigate not called */
});
```

- [ ] **Step 2: Run the tests and confirm the first one fails.**

Run: `cd regroup/mobile && npx jest src/screens/SignUp/__tests__/SignUpForm.test.tsx`
Expected: the first test FAILs, because `updateSubscriptionGuests` was called.

- [ ] **Step 3: Delete the call and its import.** `Promise.all` keeps `createGuest(newGuest)` and `updateUser(...)`. Add a one-line comment saying occupancy is recorded by `redeemInvitation`.

- [ ] **Step 4: Run the mobile and server suites.**

Run: `cd regroup/mobile && npx jest src/screens/SignUp && cd ../functions && npx jest src/__tests__/callable/invitations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add regroup/mobile/src/screens/SignUp/SignUpForm.tsx regroup/mobile/src/screens/SignUp/__tests__/SignUpForm.test.tsx
git commit -m "fix(regroup-mobile): invitation signup no longer calls updateSubscriptionGuests"
```

### Task 2: Emulator check of the whole invite path

**Files:** none committed, unless a bug is found.

- [ ] **Step 1:** With the regroup emulators running, seed:
  - a house `h1` with `ownerId: "op1"` and `subscriptionStatus: "trialing"`;
  - operator `op1` with tier metadata;
  - an invitation created by calling `createInvitation` as `op1` for `r@example.com`, role `guest`.
- [ ] **Step 2:** Sign up `r@example.com` in the app (or drive `SignUpForm` against the emulator) using the token link. Expected:
  - it lands on New Account;
  - `guests/*` has `userId` equal to the new uid and `houseId: "h1"`;
  - `users/op1.subscriptionMetadata.houses.h1.numberOfGuests` went up by 1;
  - the new user's claims include `guest.h1`.
