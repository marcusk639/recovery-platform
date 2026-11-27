# L2 identity-access-and-roles

Prefixes: `mobile/` = `regroup/mobile/`, `functions/` = `regroup/functions/`, `portal/` = `regroup/portal/`, `web/` = `regroup/web/`.

## Role model

Clients see token claims `guest`, `admin` and `superAdmin`, each a map of the form `{houseId: true}`. Two distinctions exist only in the server-only record `house-roles/{houseId}_{uid}` (`functions/src/util/houseRoleStore.ts:22-32`): manager versus peer leader, and primary owner versus co-owner. The server's tier comes from `tierAndRank` (`functions/src/util/houseRoles.ts:92-101`), which combines live claims (`getUser`) with that record.

## Path (i): invite, redeem, role visible

```mermaid
flowchart TD
  A["createInvitation client<br/>mobile/src/services/invitations.ts:35"] --> B["createInvitation callable<br/>functions/src/callable/invitations.ts:87"]
  B --> B1["isPrimaryOwner or token admin/superAdmin<br/>functions/src/callable/invitations.ts:109-121"]
  B1 --> B2["houseTierOf + assertTierMayGrant<br/>functions/src/util/houseRoles.ts:109"]
  B2 --> B3["assertInviteeMayBeInvited<br/>functions/src/util/invitationChecks.ts:22"]
  B3 --> B4["enforceHouseEntitlement + assertSlotForRole<br/>functions/src/callable/invitations.ts:145-149"]
  B4 --> B5["set invitations/token<br/>functions/src/callable/invitations.ts:166"]
  B5 --> B6["sendOneInviteEmail SendGrid<br/>functions/src/callable/invitations.ts:173"]
  B6 --> C["deep link with token<br/>mobile/src/services/native-deep-links.ts:128"]
  C --> D["peekInvitation<br/>mobile/src/screens/SignUp/SignUp.tsx:193"]
  D --> D1["peekInvitation callable, unauthenticated<br/>functions/src/callable/invitations.ts:195"]
  D1 --> E["SignUpForm: createUser then redeem<br/>mobile/src/screens/SignUp/SignUpForm.tsx:102-120"]
  E --> F["redeemInvitation callable<br/>functions/src/callable/invitations.ts:233"]
  F --> F1["email match + inviter still may issue + redeemer may accept<br/>functions/src/callable/invitations.ts:249-261"]
  F1 --> G["consumeInvitation txn: redeemedAt, grantPending, admission-tickets<br/>functions/src/util/admission.ts:90-141"]
  G --> H["addHouseRoles setCustomUserClaims<br/>functions/src/util/claims.ts:162"]
  H -->|"fail"| H1["releaseInvitation<br/>functions/src/util/admission.ts:183"]
  H --> I["completeGrant: grantCompletedAt + house-roles<br/>functions/src/util/admission.ts:148"]
  I --> J["recordSlotTaken<br/>functions/src/callable/invitations.ts:292"]
  J --> K["getAuthUser true, forced token refresh<br/>mobile/src/services/users.tsx:236"]
  K --> L["createGuest client write, needs unused ticket<br/>mobile/src/screens/SignUp/SignUpForm.tsx:146"]
  L --> M["onGuestWrite settleTicket<br/>functions/src/util/admission.ts:228"]
  K --> N["getRolesFromClaims<br/>mobile/src/util/roles.ts:26"]
  N --> O["Auth provider role map<br/>mobile/src/components/auth/auth.tsx:90"]
```

## Path (ii): login, hydrate, role gate (phone and portal)

The portal reuses the phone's `login` and `autoLogin` thunks (`portal/src/app/session.ts:4,53`) and `getRolesFromClaims` (`portal/src/app/useRoles.ts:2`). Only the session lifecycle is its own.

```mermaid
flowchart TD
  A["login thunk<br/>mobile/src/state/slices/userSlice.ts:73"] --> B["signInWithEmail<br/>mobile/src/services/users.tsx:106"]
  B --> C["getUserFinishingSetup, finishOperatorSetup if needed<br/>mobile/src/services/users.tsx:176"]
  C --> D["getAuthUser true<br/>mobile/src/services/users.tsx:236"]
  D --> E["user + token stored<br/>mobile/src/state/slices/userSlice.ts:84-85"]
  F["autoLogin<br/>mobile/src/state/slices/userSlice.ts:102"] --> C
  E --> G["Auth connect reads state.user.token<br/>mobile/src/components/auth/auth.tsx:101-107"]
  G --> H["getRolesFromClaims<br/>mobile/src/util/roles.ts:26"]
  H --> J["Can by role and action<br/>mobile/src/components/auth/can.ts:33"]
  H --> K["useMayEditRentMoney: myHouseTiers query<br/>mobile/src/state/queries/houseTierQueries.ts:16"]
  K --> L["myHouseTiers callable, live claims + record<br/>functions/src/callable/myHouseTiers.ts:21"]
  PS["portal SignIn<br/>portal/src/app/SignIn.tsx:20"] --> PA["useSignIn dispatches mobile login thunk<br/>portal/src/app/session.ts:48-53"]
  PA --> A
  PA --> PB["accessFor: operator, setup-incomplete, resident, none<br/>portal/src/app/access.ts:30"]
  PB --> PC["AccessGate<br/>portal/src/app/AccessGate.tsx:20"]
  PC --> PD["useHouseAccess calls myHouseTiers<br/>portal/src/app/useHouseAccess.ts:13"]
  PC --> PE["useClaimsRefresh every 10 min<br/>portal/src/app/useClaimsRefresh.ts:14"]
  PC --> PF["useIdleSignOut 15 min<br/>portal/src/app/useIdleSignOut.ts:8"]
  WA["web AuthGuard, only my-account<br/>web/src/app/guards/auth.guard.ts:16"] --> WB["Angular AuthService.doAutoLogin, user-doc flags not claims<br/>web/src/app/services/auth/auth-service.service.ts:61"]
```

## Path (iii): deleteAccount (resumable)

```mermaid
flowchart TD
  A["deleteMyAccount: reauth + refresh<br/>mobile/src/services/account.ts:84-98"] --> B["deleteAccount callable<br/>functions/src/callable/account.ts:27"]
  W["web deleteAccount wrapper<br/>web/src/app/services/auth/auth-service.service.ts:266"] --> B
  B --> B1["auth_time at most 300s; demo refused<br/>functions/src/callable/account.ts:33-45"]
  B1 --> C["runAccountDeletion, accountDeletions/uid<br/>functions/src/accountDeletion/index.ts:159"]
  C --> S1["closeOperatorAccount<br/>functions/src/accountDeletion/operatorRecords.ts:30"]
  S1 --> S1a["Stripe subscriptions.cancel + customers.del<br/>functions/src/api/stripeDeletion.ts:48"]
  S1 --> S2["members: guest customer, discharge, scrub, staff removal<br/>functions/src/accountDeletion/index.ts:113-124"]
  S2 --> S3["deletePersonalData<br/>functions/src/accountDeletion/personalData.ts:57"]
  S3 --> S4["delete users/uid<br/>functions/src/accountDeletion/index.ts:133"]
  S4 --> S5["auth deleteUser last<br/>functions/src/accountDeletion/index.ts:135-136"]
```

## Side effects

| Flow                          | Firestore                                                                                                                                    | Claims                                                                            | Other                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------- |
| createInvitation              | `invitations/{token}`                                                                                                                        | none                                                                              | SendGrid invite                   |
| redeemInvitation              | `invitations/{token}` (`redeemedAt`, `grantPending`, `grantCompletedAt`), `admission-tickets/{uid}_{houseId}`, `house-roles/{houseId}_{uid}` | `addHouseRoles`                                                                   | slot occupancy                    |
| legacy grant/revoke callables | `house-roles` record before and after; `houses.adminIds` / `superAdminIds` arrayRemove                                                       | `createClaims`, `deleteClaim`                                                     | none                              |
| deleteAccount                 | `accountDeletions/{uid}`, owned houses, `guests` scrubbed into `guest-archive`, many personal collections, `users/{uid}`                     | none (Auth user deleted last)                                                     | Stripe cancel and customer delete |
| operator signup               | none                                                                                                                                         | `potentialSuperAdmin` (from `createOperatorSubscription`, `subscriptions.ts:152`) | none                              |

## Server authority sources (lead b)

| Callable or check                                                                                                                                                           | Authority                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createInvitation`, legacy grant/revoke callables (`functions/src/util/authGuard.ts:70-75`)                                                                                 | Outer gate: the primary-owner record, or the caller's **token** claims, which may be stale. Inner gate: live claims plus record (`assertMayGrantTier`, `assertMayRevokeAll`). |
| `myHouseTiers`, `redeemInvitation` (inviter check)                                                                                                                          | Live claims plus record                                                                                                                                                       |
| `isHouseMoneyStaff` (`functions/src/util/houseAuth.ts:46-54`): `listHousePayments` (`payments.ts:374`), `resolveFailedPayment.ts:43`, `analytics.ts:152`, `payments.ts:183` | **House-doc fields** `adminId`, `adminIds`, `superAdminIds` and `ownerId`, or a `house-roles` tier of owner or manager                                                        |
| `assertHouseAdmin` (`payments.ts:634,808`)                                                                                                                                  | House-doc fields only                                                                                                                                                         |
| `assertHouseMemberFromClaims` (`payments.ts:339,430`)                                                                                                                       | Token claims only                                                                                                                                                             |
| `checkIsMember` (`payments.ts:919`)                                                                                                                                         | House-doc fields, falling back to a `guests` query                                                                                                                            |
| `subscriptions.ts:639`                                                                                                                                                      | `isPrimaryOwner` record                                                                                                                                                       |
| `guestWrite.ts:177`                                                                                                                                                         | `readRoleTier` (record)                                                                                                                                                       |

House-doc fields are the weakest source: a superAdmin can write them, and invited managers are never added to `adminIds`.

## Within-lane duplication found

- **Dead `authSlice`.** `mobile/src/state/slices/authSlice.ts:41` is registered at `mobile/src/state/store.ts:36` and whitelisted at `:56`. Nothing reads `state.auth`, and nothing dispatches `loginSuccess` or `setInvitation`. `userSlice` holds the same `invitation`, `token`, `loggedIn` and `anonymous` state.
- **Two grant orders.**
  - Legacy `auth.ts` writes record, then claims, then record. The sequence is copied three times: `auth.ts:97-106`, `:179-202` and `:325-329`.
  - `redeemInvitation` writes claims, then record (`invitations.ts:285-290`).
  - The legacy `addGuestAuthorization` and `addAdminAuthorization` are reached only from the token-less deep-link branch (`SignUpForm.tsx:121-125,184-187`, `native-deep-links.ts:154-172`), which is marked "kept until Phase F".
- **Two claim-write styles.** `deleteClaim` then `setCustomUserClaims` (`auth.ts:248-257,389-395`) does the same job as `addHouseRoles` / `revokeHouseRoles` (`claims.ts:128,162`). Both are non-atomic read-modify-write.
- **Group-by-house loop** written twice: `auth.ts:280-285` and `auth.ts:359-364`.
- **Invitation role tables** in four places: server `ROLES` (`invitations.ts:57`), `INVITATION_TIER` (`houseRoles.ts:85`), the switch at `invitations.ts:282`, and the client's `InvitationRole` (`mobile/src/services/invitations.ts:4`) together with `SignUpForm.tsx:65-71`.
- **Staff predicate** in two places: `isStaffRole` (`portal/src/app/access.ts:13`) is the same predicate as `isAdmin` (`mobile/src/util/roles.ts:35`).
- **Two admin-removal screens:** `AdminManagement.tsx:133` and `ManagerSettings.tsx:155` both call `removeAdminPrivileges`.
- **Callables with no caller:**
  - `givePotentialSuperAdminPrivilege`: the wrapper at `mobile/src/services/setup-wizard.ts:45-47` is never invoked.
  - `verifyUserEmail`: only a web wrapper exists. It sets `emailVerified` without an inbox check.
- **Orphan `EnhancedAuthService.ts`:** it has no non-test importer, but `architecture.md:78` still lists it as a live service.
- **Separate web login:** the Angular `AuthService` (`auth-service.service.ts:36,61,85,284`) is its own login, signup and session implementation, and it gates on user-doc flags rather than claims.

## External dependencies

- L7: entitlement and slot capacity gate grants. `createOperatorSubscription` grants `potentialSuperAdmin`. Account deletion cancels billing.
- L1: `createHouses` and `finishOperatorSetup` write the primary-owner record and claims.
- L3: `onGuestWrite` settles tickets and revokes claims on departure.
- L6: `isHouseMoneyStaff` and `assertHouseAdmin`.
- L9: SendGrid invites.

## Gaps

- `firestore.rules` was not read.
- Read only partly or not at all: `inviteCapacity.ts`, `entitlement.ts`, the `accountDeletion/*` internals, `EnhancedAuthService.ts`, and the web `AuthService` beyond grep.
- I did not confirm whether `isHouseAdmin` at `syncWeekSummary.ts:137` is the `houseAuth.ts` helper. The signatures differ.
