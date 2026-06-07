# regroup (Regroup) — Core Residents/House Flowcharts

Product: Regroup — RN 0.72 mobile + Firebase Functions v2 (`onCall`).
Firebase project: `phoenix-cleanhouse`. All callables verified as `firebase-functions/v2/https` `onCall`.

> **Platform gap (recovery-api referral integration):** regroup has **NO** integration with the shared
> recovery-api referral service. Grep for `recovery-api|createReferral|X-Service-Key|getReferrals` across
> `mobile/src` and `functions/src` produced only:
>
> - `functions/src/scripts/scriptBootstrap.ts:8` — `require("../../service-key.json")["phoenix-cleanhouse"]`
>   (a Firebase **Admin SDK** service-account credential for migration scripts, unrelated to recovery-api).
> - `functions/src/callable/homegroups.ts:10` — a hardcoded direct call to
>   `https://us-central1-recovery-connect-prod.cloudfunctions.net/getMeetingAttendance` (fetched at
>   `homegroups.ts:105`), i.e. a point-to-point bridge to the homegroups product, **bypassing** recovery-api.
>
> No `createReferral` / `getReferrals` call, no `X-Service-Key`/`X-App-Id`/`X-User-Uid` headers anywhere.
> regroup does not create or consume cross-app referrals. **Flagged gap confirmed.**

---

## Authentication & Account Setup

Happy path: resident/operator signs in → email-verified Firebase session → operator authorizes a guest →
custom claims set server-side (the only path that can write `guest`/`admin` claims).

```mermaid
flowchart TD
  Login["LoginScreen route<br/>navigators.tsx:154"]
  Svc["EnhancedAuthService.signInWithEmail<br/>EnhancedAuthService.ts:27"]
  RL["checkRateLimit + validateEmail<br/>EnhancedAuthService.ts:33"]
  FbAuth["auth.signInWithEmailAndPassword<br/>EnhancedAuthService.ts:62"]
  Verif["emailVerified gate<br/>EnhancedAuthService.ts:75"]
  Ok["AuthResult success:true<br/>EnhancedAuthService.ts:83"]

  AddG["addGuestAuthorization onCall<br/>callable/auth.ts:51"]
  Guard["assertCanGrantClaimForHouses<br/>util/authGuard.ts (called auth.ts:65)"]
  MkClaims["createClaims(userId,[houseId],'guest')<br/>util/claims.ts:23"]
  SetClaims["auth().setCustomUserClaims<br/>callable/auth.ts:75"]
  Promote["promoteGuestsToAdmin onCall<br/>callable/auth.ts:196"]
  VerifyEmail["verifyUserEmail onCall<br/>callable/auth.ts:258"]

  Login --> Svc --> RL --> FbAuth --> Verif --> Ok
  Ok -.operator action.-> AddG --> Guard --> MkClaims --> SetClaims
  Ok -.bulk promote.-> Promote --> Guard
  Ok -.admin email verify.-> VerifyEmail
```

Side effects:

- Custom-claims write: `setCustomUserClaims` for `guest` and (if `isAdmin`) `admin` claim per house (`callable/auth.ts:75`, `:83`).
- `promoteGuestsToAdmin` layers `admin` claims across distinct houseIds (`callable/auth.ts:196`–`225`).
- `verifyUserEmail` flips Firebase Auth `emailVerified` via `_verifyUserEmail` (`callable/auth.ts:258`, `util/user.ts`).
- No Firestore write in the auth callables themselves (claims live in the Auth token).

External deps: `@react-native-firebase/auth` (client `auth` singleton), `firebase-admin` `auth()`, `firebase-functions/v2/https`, Zod (`parseInput`).

---

## House & Bed Management

Happy path: operator creates a house (batched write of house + admin docs) → later guest creation
increments `currentCapacity`; bed assignment lives in the `House.rooms` map mutated on guest create/delete.

```mermaid
flowchart TD
  Tab["House tab → HouseSummary<br/>navigators.tsx:244"]
  Coll["houseCollection = firestore.collection('houses')<br/>services/house.tsx:28"]
  CreateBatch["createHouseBatch(house, admins)<br/>services/house.tsx:164"]
  WriteAdmins["batch.set(adminDoc)<br/>services/house.tsx:170"]
  WriteHouse["batch.set(newHouseDoc)<br/>services/house.tsx:184"]
  Finalize["finalizeHouseSetup<br/>services/house.tsx:411"]
  Update["updateHouse / updateHouseBatch<br/>services/house.tsx:97 / :311"]
  Nearby["getNearbyHouses (geo lookup)<br/>services/house.tsx:78"]
  SrvHouse["getHouse helper (functions)<br/>functions/util/house.ts"]

  Tab --> Coll
  Coll --> CreateBatch --> WriteAdmins --> WriteHouse
  WriteHouse --> Finalize
  Coll --> Update
  Coll --> Nearby
```

Side effects:

- Firestore batch write: `houses` doc + `admins` docs (`services/house.tsx:170`, `:184`).
- `updateHouseBatch` fans out updates to `houses`, `guests`, `admins`, `guest-archive` (`services/house.tsx:383`–`392`).
- Bed capacity counter updated on guest create (`services/guest.tsx:213`–`214`).
- Server-side `getHouse` is reused by callables (`functions/src/util/house.ts`, `functions/src/entities/House.ts`).

External deps: `@react-native-firebase/firestore` (client), `firebase-admin` firestore (server util), Redux selectors (HouseSummary).

---

## Guest / Resident Management

Happy path: operator creates a guest → batched write adds the `guests` doc and bumps house
`currentCapacity` (bed slot) → over time the guest advances phases via `week-summaries` eligibility check.

```mermaid
flowchart TD
  Tab["Guest tab → GuestHome<br/>navigators.tsx:249"]
  GColl["guestCollection = firestore.collection('guests')<br/>services/guest.tsx:13"]
  Create["createGuest(newGuest)<br/>services/guest.tsx:210"]
  Bump["batch.update house currentCapacity+1<br/>services/guest.tsx:213"]
  SetGuest["batch.set(guestCollection.doc(id))<br/>services/guest.tsx:215"]
  Commit["batch.commit()<br/>services/guest.tsx:216"]
  Update["updateGuest (txn, optimistic lock)<br/>services/guest.tsx:69"]
  Phase["advanceGuestPhase<br/>services/phaseAdvancement.ts:138"]
  Elig["checkAdvancementEligibility (week-summaries)<br/>services/phaseAdvancement.ts:94"]
  Import["guest import<br/>services/guestImport.ts"]
  Discharge["dischargeGuest<br/>services/guest.tsx:292"]

  Tab --> GColl
  GColl --> Create --> Bump --> SetGuest --> Commit
  GColl --> Update
  Commit -.later.-> Elig --> Phase
  GColl --> Import
  GColl --> Discharge
```

Side effects:

- Firestore batch: write `guests` doc + update `houses.currentCapacity` (`services/guest.tsx:213`–`216`).
- `updateGuest` runs a Firestore transaction with optimistic-lock guard (`OptimisticLockError`, `services/guest.tsx:69`, `:101`).
- `advanceGuestPhase` updates `guests/{id}.phase` (`services/phaseAdvancement.ts:142`); eligibility reads `week-summaries` (`:57`).
- `deleteGuest` writes `guest-archive` + frees room bed in `house.rooms` (`services/guest.tsx:220`–`253`).
- Server phase helpers in `functions/src/util/guest.ts`, `functions/src/util/phase.ts`.

External deps: `@react-native-firebase/firestore`, lodash `cloneDeep` (bed mutation), Redux.

---

## Applications & Invitations

Happy path (invitation, the privilege boundary): admin issues an invitation (Firestore doc + email) →
invitee signs up → client calls `redeemInvitation` → server verifies email match → sets custom claims →
marks invitation redeemed.

```mermaid
flowchart TD
  Apply["Apply route → ApplyScreen<br/>navigators.tsx:76"]
  AppList["ApplicationListScreen<br/>navigators.tsx:78"]
  AppSvc["applications service<br/>services/applications.ts"]

  CreateCli["createInvitation (client)<br/>services/invitations.ts:34"]
  CreateFn["createInvitation onCall<br/>callable/invitations.ts:76"]
  AuthZ["owner/admin/superAdmin check<br/>callable/invitations.ts:97"]
  WriteInv["set invitations/{token}<br/>callable/invitations.ts:126"]
  Email["sendOneInviteEmail<br/>callable/invitations.ts:133 (util/inviteEmails.ts)"]

  Peek["peekInvitation onCall<br/>callable/invitations.ts:155"]
  RedeemCli["redeemInvitation (client)<br/>services/invitations.ts:62"]
  RedeemFn["redeemInvitation onCall<br/>callable/invitations.ts:189"]
  MatchEmail["invitedEmail == caller email<br/>callable/invitations.ts:202"]
  Claims["createClaims + setCustomUserClaims<br/>callable/invitations.ts:214"]
  Mark["update invitations redeemedAt<br/>callable/invitations.ts:223"]

  Apply --> AppSvc
  AppList --> AppSvc
  CreateCli --> CreateFn --> AuthZ --> WriteInv --> Email
  WriteInv -.signup uses.-> Peek
  RedeemCli --> RedeemFn --> MatchEmail --> Claims --> Mark
```

Side effects:

- Firestore write: `invitations/{token}` created (`callable/invitations.ts:126`), updated with `redeemedAt`/`redeemedByUid` on redeem (`:223`).
- Email send: `sendOneInviteEmail` (SendGrid via `functions/src/util/inviteEmails.ts`, `functions/src/util/invite.ts` for token/link).
- Custom-claims write: `guest` and/or `admin` claims for the house on redeem (`callable/invitations.ts:214`–`219`); `senior-peer` sets both.
- Token generation: `generateInvitationToken` / `buildInviteLink` (`util/invite.ts`).

External deps: `firebase-admin` firestore + auth, SendGrid (invite email), Zod, client `functions.httpsCallable`.

---

## Meetings (AA/NA attendance)

Happy path: client requests meetings near a location → `findMeetings` dispatches by type (AA/NA/Custom/CR)
→ external meeting sources filtered by geo distance → returns list. `userIsAtMeeting` geocodes + compares
distance for attendance verification.

```mermaid
flowchart TD
  Cli["searchForMeetings / addMeeting (client)<br/>services/meeting.ts:12 / :24"]
  Find["findMeetings onCall {GOOGLE_MAPS_API_KEY}<br/>callable/meetings.ts:79"]
  Branch["dispatch by filters.type<br/>callable/meetings.ts:92"]
  AA["getAlcoholicsAnonymousMeetings<br/>util/meetings.ts:307"]
  All12["getAll12StepMeetings<br/>util/meetings.ts:320"]
  NA["getNarcoticsAnoymousMeetings<br/>util/meetings.ts:259"]
  GeoRange["getGeohashRange / getDistance<br/>util/location.ts:89 / :42"]

  AtCli["userIsAtMeeting (client)<br/>services/meeting.ts:19"]
  AtFn["userIsAtMeeting onCall {GOOGLE_MAPS_API_KEY}<br/>callable/meetings.ts:147"]
  Geo["geocodeNAMeeting<br/>util/meetings.ts:343"]
  Dist["getDistance <= 200m<br/>callable/meetings.ts:175"]

  Oxford["setOxfordEnabled onCall<br/>callable/oxford.ts:39"]

  Cli --> Find --> Branch
  Branch --> AA --> GeoRange
  Branch --> All12 --> GeoRange
  Branch --> NA --> Geo
  AtCli --> AtFn --> Geo --> Dist
```

Side effects:

- Geo queries: geohash range + haversine distance filtering (`util/location.ts:42`, `:89`–`104`, uses `ngeohash`).
- External HTTP: Google Maps Geocoding API (`GOOGLE_MAPS_API_KEY` secret; `geocodeNAMeeting` `util/meetings.ts:343`) and external AA/NA/CR meeting feeds.
- No Firestore write in `findMeetings`/`userIsAtMeeting`; client `addMeeting` writes `meetings` collection (`services/meeting.ts:24`, collection `:10`).
- `userIsAtMeeting` returns boolean (200m threshold) used by attendance verification, no write here.

External deps: Google Maps Geocoding, `ngeohash`, `firebase-functions/v2/https` secrets, AA/NA/Celebrate-Recovery external sources.

---

## Chore / Work / Drug-Test Tracking

Happy path: operator logs a drug test for a guest → result auto-flags escalation (positive/refused) →
Firestore `drug-tests` doc written. Chore rotation order is set per house and advanced over time.

```mermaid
flowchart TD
  Screen["DrugTesting screens (DrugTestForm)<br/>navigators.tsx:72"]
  Log["logDrugTest<br/>services/drugTests.ts:7"]
  Flag["escalationTriggered = positive||refused<br/>services/drugTests.ts:15"]
  WriteDT["drug-tests doc set<br/>services/drugTests.ts:19"]
  Coll["drugTestCollection<br/>services/drugTests.ts:5"]
  Pos["getPositiveTestCount<br/>services/drugTests.ts:61"]

  RotColl["choreRotations collection<br/>services/choreRotation.ts:5"]
  SetRot["setRotationOrder<br/>services/choreRotation.ts:28"]
  AdvRot["advanceRotation<br/>services/choreRotation.ts:47"]
  Assignee["getCurrentAssignee<br/>services/choreRotation.ts:63"]

  Screen --> Log --> Flag --> WriteDT
  Coll --> Pos
  RotColl --> SetRot --> AdvRot --> Assignee
```

Side effects:

- Firestore write: `drug-tests/{id}` with computed `escalationTriggered` flag (`services/drugTests.ts:19`).
- Firestore write: `choreRotations/{houseId}` set on order assignment (`services/choreRotation.ts:40`) and update on advance (`:53`).
- Reads: positive-test aggregation (`services/drugTests.ts:61`), per-guest/per-house queries (`:27`, `:44`).
- Entities: `entities/Chore.tsx`, `entities/DrugTest.ts`, `entities/Job.ts`.

External deps: `@react-native-firebase/firestore`, `logException` util.

---

## Documents

Happy path: user picks a file → `uploadDocument` uploads binary to Cloud Storage → fetches download URL →
writes metadata doc to `documents` collection.

```mermaid
flowchart TD
  Screen["DocumentListScreen<br/>navigators.tsx:90"]
  Coll["getDocumentsCollection() 'documents'<br/>services/documents.ts:32"]
  Upload["uploadDocument(input)<br/>services/documents.ts:93"]
  GenId["pre-generate docId<br/>services/documents.ts:104"]
  PutFile["storage().ref(path).putFile<br/>services/documents.ts:112"]
  URL["getDownloadURL<br/>services/documents.ts:120"]
  WriteMeta["ref.set(record)<br/>services/documents.ts:136"]
  List["listDocuments<br/>services/documents.ts:148"]
  Del["deleteDocument (storage+firestore)<br/>services/documents.ts:182"]
  Expiring["getExpiringDocuments<br/>services/documents.ts:203"]

  Screen --> Coll
  Coll --> Upload --> GenId --> PutFile --> URL --> WriteMeta
  Coll --> List
  Coll --> Del
  Coll --> Expiring
```

Side effects:

- Cloud Storage upload: `putFile` to `houses/{houseId}/{docId}` path (`services/documents.ts:112`–`117`; path via `buildStoragePath`).
- Firestore write: `documents/{docId}` metadata incl. `storageUrl`, `uploadedBy`, `createdAt` (`services/documents.ts:136`).
- `deleteDocument` deletes both Storage object and Firestore doc (`services/documents.ts:191`).
- Generic storage helpers (avatars/photos) in `services/storage.tsx` (`uploadPhoto:42`, `uploadHousePhoto:90`).

External deps: `@react-native-firebase/storage`, `@react-native-firebase/firestore`, `logException`.

---

## Summary

- 7 features traced; all node labels carry verified `file:line` anchors.
- All listed callables confirmed as v2 `onCall` exports (auth.ts:51/94/196/258, invitations.ts:76/155/189, meetings.ts:79/147, oxford.ts:39).
- **recovery-api referral integration: ABSENT.** Only a same-product hardcoded Homegroups HTTP bridge
  (`homegroups.ts:10/105`) and an Admin-SDK service-account file (`scriptBootstrap.ts:8`) exist. No
  `createReferral`/`getReferrals`/`X-Service-Key` usage. Flagged platform gap confirmed.
