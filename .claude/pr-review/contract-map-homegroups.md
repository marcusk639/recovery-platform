# Contract map: homegroups (and the Firebase-internal links it owns)

The map is guidance, not truth. Confirm every link by grep or read before reporting on it.
When a PR adds or moves a link listed here, add a "map maintenance" note naming the entry.

## Which file owns which link type

Each `routing.json` link type has its section in exactly one map. Sections that span products
carry `### homegroups` and `### regroup` subsections.

| File                                | Link types                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `contract-map-homegroups.md` (here) | callable, firestore-rules, firestore-indexes, firestore-trigger, storage, claims |
| `contract-map-regroup.md`           | push, deep-link, origins-config, http-export, shared-literals                    |
| `contract-map-cross-product.md`     | recovery-api, twin-helper, config-coupling, logging, tests, review-config        |

## How homegroups links are expressed

- No package imports another. Functions, mobile and web share nothing at compile time.
- Callable names are bare strings: `httpsCallable('name')` on the client, an exported `onCall` on the server.
- Client response types are local generics or `result.data as {...}` casts. Document types are
  duplicated between `homegroups/mobile/src/types/schema.ts` (which also holds `COLLECTION_PATHS`)
  and `homegroups/functions/src/entities/`.
- Collection names, field names, push `type` values, storage paths and URLs are string literals.
- Mobile Jest mocks Firebase (`homegroups/mobile/jest.setup.js`), and `homegroups/web/src/` is untyped JS,
  so client tests and builds do not catch a server-side rename. The reviewer has to open the other side.

## callable

### homegroups

Server: `homegroups/functions/src/callable/` (all v2 `onCall`), exported from `homegroups/functions/src/index.ts`.
Clients: `homegroups/mobile/src/` (models, redux slices, screens), `homegroups/mobile/App.tsx`, `homegroups/web/src/`.

| If this changes                                                  | Check                                                                                                                                      | Why                                                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Export name in `index.ts`, or a callable removed                 | grep `'<name>'` in `homegroups/mobile/src`, `homegroups/web/src`, `homegroups/mobile/App.tsx`                                              | String-only link. A rename compiles and passes tests on both sides, then fails at runtime.           |
| `region` on a callable, or `setGlobalOptions` in `index.ts`      | Every client call site. Mobile uses the default region unless it calls `.functions('<region>')`. Web uses `getFunctions` with the default. | Clients call `us-central1`. See class 6 and `homegroups/functions/CLAUDE.md` (v1 vs v2 region trap). |
| Request schema (`validateData` Zod schema)                       | The payload literal at each call site                                                                                                      | Missing or renamed keys fail validation. Extra client keys are ignored.                              |
| Response keys                                                    | `result.data as {...}` casts and generics at call sites, and the matching type in `homegroups/mobile/src/types/schema.ts`                  | No shared type. A renamed key reads as `undefined` on the client.                                    |
| Money callables (`createStripePaymentIntent`, subscription ones) | Amount units at both mobile and web call sites                                                                                             | The unit is part of the contract. See class 3.                                                       |
| A callable that accepts several request shapes                   | Each client's shape (mobile and web may send different keys for the same callable)                                                         | The server union must keep accepting every shape a shipped client sends.                             |
| Auth wrapper (`requireAuth`) removed or a callable made public   | `false-positives.md` for the known public callables                                                                                        | Anything else that drops `requireAuth` needs a reason.                                               |
| Client call site added or payload changed (reverse direction)    | The callable's schema and its `index.ts` export                                                                                            | A client may call a name that is not exported, or send keys the schema doesn't read.                 |

Group subscriptions are flat rate (`quantity: 1`). The group document's `stripePriceIdGroup` and `stripeProductIdGroup`
are set by several callables: `homegroups/functions/src/callable/createGroupSubscription.ts`,
`homegroups/functions/src/callable/createGroupWithSubscription.ts`,
`homegroups/functions/src/callable/reactivateGroupSubscription.ts` and
`homegroups/functions/src/callable/createStripeCheckoutSession.ts`. A change to one must be made in all of them,
or a group ends up on the wrong product or with a per-member quantity.

### regroup

Server: `regroup/functions/src/callable/` (v2 `onCall`), exported from `regroup/functions/src/index.ts`.
Clients: mobile service wrappers in `regroup/mobile/src/services/`, web wrappers in
`regroup/web/src/app/services/functions/cloud-function.service.ts`.

| If this changes                                                           | Check                                                                                                                                                                              | Why                                                                                                                                              |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Export name, or a callable removed                                        | grep the name in `regroup/mobile/src/services/`, `regroup/web/src/app/services/`                                                                                                   | String-only link.                                                                                                                                |
| `setGlobalOptions` in `regroup/functions/src/init.ts`                     | `regroup/mobile/firebase-setup.ts`, `regroup/web/src/app/app.module.ts`, and the `region` pins in `regroup/web/firebase.json` rewrites                                             | No region is set, so everything is `us-central1`. A region change breaks every client and the hosting rewrites.                                  |
| A zod schema used through `parseInput`                                    | The client payload for that callable                                                                                                                                               | `parseInput` (`regroup/functions/src/validation/index.ts`) strips unknown keys without error. A one-sided rename is silently dropped.            |
| `createHouses` input (`regroup/functions/src/houses/houseInput.ts`)       | `regroup/mobile/src/services/subscription.ts` and the payload key list in `regroup/mobile/src/services/setup-wizard.ts`                                                            | Same silent-strip risk, plus the `requestKey` format the server validates.                                                                       |
| Error message constants a client matches on                               | `regroup/functions/src/callable/account.ts` ↔ `regroup/mobile/src/services/account.ts`; `regroup/functions/src/callable/oxford.ts` ↔ `regroup/mobile/src/services/oxford/votes.ts` | Message strings act as protocol here. Rewording one side changes client behaviour.                                                               |
| Payment callables (`regroup/functions/src/callable/payments.ts`)          | `regroup/mobile/src/services/payments.ts`                                                                                                                                          | Confirm units per endpoint, both in and out. The idempotency key is built on both sides and must keep the same granularity. See classes 2 and 3. |
| Invitation callables (`regroup/functions/src/callable/invitations.ts`)    | `regroup/mobile/src/services/invitations.ts`                                                                                                                                       | Role list duplicated on the client.                                                                                                              |
| Subscription and tier callables (`subscriptions.ts`, `getTierCatalog.ts`) | `regroup/web/src/app/services/functions/cloud-function.service.ts`, `regroup/web/src/app/entities/TierCatalog.ts`                                                                  | Response type and tier literals are hand-copied in web.                                                                                          |
| Billing portal / return URLs sent by web                                  | `ALLOWED_RETURN_ORIGINS` (see origins-config in `contract-map-regroup.md`)                                                                                                         | Web sends its own location as the return URL.                                                                                                    |
| Client payload or call site changed (reverse direction)                   | The zod schema and the `regroup/functions/src/index.ts` export                                                                                                                     | A key the schema lacks is stripped silently; a name not exported fails at runtime.                                                               |

Mobile tests mock callables (`regroup/mobile/jest.setup.js`), so they don't catch drift either.

## firestore-rules

Rules are not filters: a list query must be provably restricted by its `where` clauses to documents the
caller may read, or the whole query is denied. Check the query and the rule together.

### homegroups

Rules: `homegroups/firestore.rules`. Tests: `homegroups/functions/src/tests/security-rules.test.ts` (hand-written fixtures).

| If this changes                                 | Check                                                                                                          | Why                                                                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| A rules `match` block or predicate              | Every mobile and web read/write on that path, plus server writers in `homegroups/functions/src/`               | A tightened predicate silently breaks a client path. Clients usually catch and log, so nothing fails loudly. |
| A new client collection or subcollection path   | A matching rules block in the same PR                                                                          | The file ends in a catch-all deny, so an unmatched path is denied.                                           |
| A client update's field set                     | The rule's `affectedKeys()` / `hasOnly` list for that path                                                     | A new field on the client fails an allow-list predicate.                                                     |
| Member document id format (`${groupId}_${uid}`) | The rules, mobile writers in `homegroups/mobile/src/models/GroupModel.ts`, and functions that build it by hand | Three hand-built copies of one id format.                                                                    |
| Rules that read claims                          | claims section below. Rules fall back to member docs when claims are absent.                                   | Claim shape and rules must change together.                                                                  |
| Server-only paths (written only by functions)   | Clients must not gain write access, and callers must go through the callable                                   | See class 7.                                                                                                 |
| The rules test fixtures                         | That fixtures match what production code writes (field names, doc ids)                                         | Fixtures production never produces make tests that can't fail. See class 10.                                 |

### regroup

Rules: `regroup/mobile/firebase/firestore.rules`. Tests: `regroup/mobile/firebase/__tests__/firestore.rules.test.ts`.
Deployed from `regroup/mobile/firebase/firebase.json`. regroup/web has no rules file (see `false-positives.md`).

| If this changes                                                  | Check                                                                                                                                | Why                                                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| A rule predicate that reads a document field                     | Every writer of that document: mobile services, callables, the webhook (`regroup/functions/src/webhooks/stripeWebhook.ts`), triggers | A rule keyed on a field that no writer sets denies every read.                                             |
| A new client collection                                          | A rules block in the same PR                                                                                                         | Default deny.                                                                                              |
| A client batch that spans collections                            | The rule on every document in the batch, for every role that runs it                                                                 | One denied write fails the whole batch.                                                                    |
| House / financial / ownership fields                             | Which role may write them (superAdmin vs admin vs guest)                                                                             | Prior fix restricted these writes to superAdmin.                                                           |
| Rules tests                                                      | Whether CI runs them (`.github/workflows/ci.yml`). If not, say the change is unverified by CI.                                       | Don't claim coverage the pipeline doesn't run.                                                             |
| Caller or target rank (`callerRank`, `targetRank`, `recordRank`) | `tierAndRank` in `regroup/functions/src/util/houseRoles.ts`                                                                          | The rules' caller rank must equal the server's, or a rule allows what a callable refuses (or the reverse). |
| Reads of `house-roles`, `admission-tickets`, `guest-flags`       | That no rule allows a client read or write (only `get()` inside rules)                                                               | Server-only by design: the Admin SDK writes them.                                                          |

## firestore-indexes

Files: `homegroups/firestore.indexes.json`, `regroup/mobile/firebase/firestore.indexes.json`, `recovery-api/firestore.indexes.json`.

| If this changes                                                     | Check                                                                                   | Why                                                                                                 |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| A new query with two or more `where` fields, or `where` + `orderBy` | A matching composite index (field order and direction) in the same PR                   | Without it the query fails at runtime with `FAILED_PRECONDITION`. Tests against mocks don't notice. |
| An index removed or a field renamed                                 | grep the collection and field in `*/mobile/src`, `*/web/src`, `*/functions/src`         | A rename leaves the old index and breaks the query. regroup had a prior break from a field rename.  |
| An index whose collection no code queries any more                  | Note it as dead, low severity                                                           | Writers that stopped writing a field leave unused indexes behind.                                   |
| regroup indexes                                                     | Deploy path: `regroup/functions/CLAUDE.md` (indexes deploy separately from rules)       | A rules-only deploy does not ship the index.                                                        |
| Index edits made in the console                                     | The JSON file is the source of truth. A query relying on a console-only index is drift. | Evidence for class 5.                                                                               |

## firestore-trigger

### homegroups

Triggers: `homegroups/functions/src/triggers/firestore/` (mostly v1, kept deliberately; see `conventions.md`),
scheduled jobs in `homegroups/functions/src/triggers/pubsub/` and `homegroups/functions/src/triggers/scheduled/`,
auth trigger `homegroups/functions/src/triggers/auth/onUserCreated.ts`.

| Trigger                                                                                         | Fields it reads                                                                  | Writers to check                                                         |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `onMemberWrite.ts`                                                                              | `userId`, `groupId`, `isAdmin`, `isTreasurer`, `roles` (→ custom claims)         | `homegroups/mobile/src/models/GroupModel.ts`, member callables           |
| `onMeetingCreate.ts` / `onMeetingUpdate.ts` / `onMeetingDelete.ts`                              | `groupId`, `timezone`, `day`, `time`, address, online fields, `overriddenFields` | `homegroups/mobile/src/models/MeetingModel.ts` (maps client field names) |
| `onTransactionWrite.ts`                                                                         | `amount`, `groupId`, `type` (`income` / `expense`)                               | Treasury screens and slices in `homegroups/mobile/src/`                  |
| `onAnnouncementCreate.ts`                                                                       | `status` (`published` / `scheduled`), `scheduledFor`                             | Announcement slices; `scheduledAnnouncementPublisher.ts`                 |
| `onGroupCreate.ts`                                                                              | location and name fields                                                         | Group creation callables and mobile                                      |
| `onMemberCreate.ts`, `onAdminRequestCreate.ts`, `onDirectMessageCreate.ts`, `onReportCreate.ts` | notification settings and ids on the new doc                                     | Corresponding mobile writers                                             |

`onTransactionWrite.ts` owns `treasury_overviews/{groupId}` (a separate collection, not part of the group document).
Rules block client creates. The client only updates the prudent reserve, range $0–10,000 with a default of $600, and
that range is checked in both `homegroups/mobile/src/models/TreasuryModel.ts` and
`homegroups/mobile/src/screens/homegroup/GroupEditDetailsScreen.tsx`. A change that recomputes treasury totals
on the client, or moves them into the group document, diverges from the trigger.

If a writer renames or stops setting a field, the trigger reads `undefined` and usually returns early without an error.
If a trigger starts reading a new field, check that every writer sets it. Entities in
`homegroups/functions/src/entities/` are the server's view; `homegroups/mobile/src/types/schema.ts` is the client's.

### regroup

Triggers: `regroup/functions/src/triggers/firestore/index.ts`, `regroup/functions/src/triggers/firestore/houseTombstone.ts`.
Schedules: `regroup/functions/src/scheduled/`.

| Trigger                            | Reads                                                         | Writers / counterparts                                                                              |
| ---------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| notify (notifications collection)  | `userId`, `message`, `subject`; device tokens on the user doc | `regroup/mobile/src/services/notifications.tsx`, `regroup/mobile/src/services/dispute.tsx`          |
| onGuestWrite                       | `userId`, `houseId` (claims cleanup), `status`, `moveOutDate` | `regroup/mobile/src/services/guest.tsx`, status literals in `regroup/mobile/src/entities/Guest.tsx` |
| setHouseSubscriptionStatusOnCreate | `superAdminId` / `ownerId` → `subscriptionMetadata.status`    | House creation (`regroup/functions/src/callable/houses.ts`)                                         |
| house deletion tombstone           | house id and owner fields                                     | Account and house deletion paths                                                                    |

onGuestWrite branches on guest `status` and `moveOutDate`. A new status literal, or a discharge path that
stops setting `moveOutDate`, changes what it does. If a scheduled job reads a field, check that a writer sets it.

## storage

### homegroups

Rules: `homegroups/storage.rules`. Test: `homegroups/functions/src/tests/security-rules-storage.test.ts`.

| If this changes                                   | Check                                                                        | Why                                                                        |
| ------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| A client upload or download path (`ref(...)`)     | A matching `match` in `homegroups/storage.rules`, in the same PR             | Unmatched paths are denied. The client error is usually caught and logged. |
| A storage rule path                               | grep the path segments in `homegroups/mobile/src` and `homegroups/web/src`   | A rule nothing writes to is dead, and a moved rule breaks uploads.         |
| Storage rules that read claims                    | claims section. Storage rules use claims only, with no Firestore fallback.   | A claim shape change hits storage directly.                                |
| Resource document fields (`source`, `storageRef`) | Mobile writer and `homegroups/functions/src/callable/deleteGroupResource.ts` | The doc points at the file. Delete has to find it.                         |
| Server-side uploads                               | Admin SDK bypasses rules. Check signed-URL scope and expiry instead.         | Rules don't protect server-written paths.                                  |

### regroup

Rules: `regroup/mobile/firebase/storage.rules`. Test: `regroup/mobile/firebase/__tests__/storage.rules.test.ts`.
Client paths: `regroup/mobile/src/services/storage.tsx`, `regroup/mobile/src/services/documents.ts`.

| If this changes                     | Check                                                   | Why                                                                   |
| ----------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| A client storage path               | A matching rule (path and segment names) in the same PR | Default deny.                                                         |
| A storage rule path                 | The client code that writes it                          | A rule path nothing writes is dead, and a renamed one breaks uploads. |
| Rules reading house or guest claims | claims section                                          | Claim keys are house ids.                                             |

## claims

### homegroups

| Side    | Files                                                                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Writers | `homegroups/functions/src/triggers/firestore/onMemberWrite.ts`, `homegroups/functions/src/callable/syncUserClaims.ts`, `homegroups/functions/src/utils/claims.ts` |
| Readers | `homegroups/firestore.rules` (with member-doc fallback), `homegroups/storage.rules` (claims only), `homegroups/mobile/src/models/UserModel.ts`                    |
| Refresh | `homegroups/mobile/src/services/firebase/auth.ts` calls `syncUserClaims`. The client must force-refresh its ID token after a change.                              |

- The `CustomClaims` type is defined in more than one functions file. Change them together.
- Custom claims are capped at 1000 bytes (`homegroups/functions/CLAUDE.md`). A per-group map grows with membership.
- A new role or flag must reach rules, storage rules and the mobile reader in the same PR.

### regroup

Shape: `{ admin | superAdmin | guest: { [houseId]: true }, potentialSuperAdmin }`.

| Side    | Files                                                                                                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Writers | `regroup/functions/src/util/claims.ts`, `regroup/functions/src/util/superAdminClaim.ts`, `regroup/functions/src/callable/auth.ts`, `regroup/functions/src/callable/invitations.ts`, onGuestWrite in `regroup/functions/src/triggers/firestore/index.ts` |
| Readers | `regroup/mobile/firebase/firestore.rules`, `regroup/mobile/firebase/storage.rules`, `regroup/mobile/src/components/auth/auth.tsx`, `regroup/mobile/src/services/users.tsx`, `regroup/web/src/app/services/auth/auth-service.service.ts`                 |

- A claim written by one writer and cleared by another (for example, a trigger cleaning up on guest move-out) must use the same key path.
- Role promotion and removal callables must be authorised server-side on the caller's own claims, never on a client-sent role. See class 1.
- Server-only role records `house-roles/{houseId}_{uid}` (`tier`: owner, manager, peerLeader, resident; `primary` for the house's primary owner) sit beside the claims. Writers: `regroup/functions/src/util/houseRoleStore.ts` (`recordRoleGrant`, `recordRoleRevoke`), `regroup/functions/src/callable/auth.ts`, `regroup/functions/src/callable/invitations.ts`, `regroup/functions/src/util/admission.ts`, `regroup/functions/src/houses/createHousesTx.ts`, onGuestWrite, and the operator scripts `backfillHouseRoles` / `promoteManager`. Readers: `regroup/functions/src/util/houseRoles.ts` (`tierAndRank`) and the rules (`get()` only). A tier counts only while a matching live claim backs it (primary excepted), on the server and in the rules alike; a grant that changes claims must also write the record.
