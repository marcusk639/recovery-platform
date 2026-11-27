# L8 oxford-and-compliance

Prefixes: `mobile/` = `regroup/mobile/`, `functions/` = `regroup/functions/`, `portal/` = `regroup/portal/`. A "house meeting" is an Oxford business meeting, not a 12-step meeting.

## (i) Oxford onboarding → enabled → vote cast → result

```mermaid
flowchart TD
  A["OxfordDashboard redirect guard<br/>mobile/src/screens/Oxford/OxfordDashboard.tsx:112"]
  B["OxfordOnboardingWizard route<br/>mobile/src/navigation/navigators.tsx:431"]
  C["handleFinish<br/>mobile/src/screens/Oxford/OxfordOnboardingWizard.tsx:104"]
  D["completeOxfordOnboarding writeBatch<br/>mobile/src/state/mutations/oxfordOnboardingMutations.ts:24"]
  E["houseOxfordActive rule needs house.oxfordEnabled<br/>regroup/mobile/firebase/firestore.rules:95"]
  F["officers and business-meetings rules<br/>regroup/mobile/firebase/firestore.rules:606"]
  H["onSuccess cache patch<br/>mobile/src/state/mutations/oxfordOnboardingMutations.ts:76"]
  J["setOxfordEnabled: no client caller<br/>functions/src/callable/oxford.ts:45"]
  K["createVote client setDoc<br/>mobile/src/services/oxford/votes.ts:17"]
  L["votes create rule; update false<br/>regroup/mobile/firebase/firestore.rules:619"]
  N["castVote httpsCallable<br/>mobile/src/services/oxford/votes.ts:66"]
  O["castOxfordVote: houseType and entitlement<br/>functions/src/callable/oxford.ts:194"]
  Q["transaction: results, individualVotes, voterIds<br/>functions/src/callable/oxford.ts:246"]
  R["calculateResult needs closedAt, which nothing writes<br/>mobile/src/services/oxford/votes.ts:92"]
  S["charter democratic check filters closedAt<br/>mobile/src/services/oxford/charterCompliance.ts:38"]
  A -->|"enabled, not onboarded"| B --> C --> D
  D --> E
  D --> F
  E -->|"denied if field unset"| C
  D -->|"commit ok"| H
  J -.->|"never called"| E
  H --> K --> L
  L --> N --> O --> Q --> R --> S
```

## (ii) EES and treasury → balance

```mermaid
flowchart TD
  A["EESTracker<br/>mobile/src/screens/Oxford/EESTracker.tsx:37"]
  B["handleCreateRecords, manual totalExpenses<br/>mobile/src/screens/Oxford/EESTracker.tsx:88"]
  C["createEESRecords: amount in dollars<br/>mobile/src/services/oxford/ees.ts:109"]
  D["ees-records rules, admin write<br/>regroup/mobile/firebase/firestore.rules:1201"]
  F["resplitEES skips records without totalExpenses<br/>functions/src/triggers/firestore/guestWrite.ts:243"]
  G["getEESIncomeForWeek sums paid and unpaid<br/>mobile/src/services/treasury.ts:171"]
  H["FinancialRecordForm treats the sum as cents<br/>mobile/src/screens/Treasury/FinancialRecordForm.tsx:197"]
  I["createFinancialRecord houses/id/financial-records<br/>mobile/src/services/treasury.ts:51"]
  J["submitForApproval then approveRecord<br/>mobile/src/services/treasury.ts:79"]
  L["useTreasuryRole gates buttons only; compares adminIds to uid<br/>mobile/src/hooks/useTreasuryRole.ts:35"]
  M["getCurrentWeekRecord<br/>mobile/src/services/treasury.ts:127"]
  N["TreasuryDashboard balance<br/>mobile/src/screens/Treasury/TreasuryDashboard.tsx:77"]
  A --> B --> C --> D
  C -.->|"no-op for app records"| F
  D --> G --> H --> I
  L --> J
  I --> M --> N
```

## (iii) Compliance export: two unrelated paths

```mermaid
flowchart TD
  A["complianceExport onCall, no UI caller<br/>functions/src/callable/compliance.ts:373"]
  B["owner only: superAdminId equals uid<br/>functions/src/callable/compliance.ts:390"]
  C["tierAllows complianceExport<br/>functions/src/callable/compliance.ts:414"]
  G["getDrugTestsForGuest by guestId, no house filter<br/>functions/src/api/firestore.ts:320"]
  H["getMeetingActivitiesForGuest<br/>functions/src/api/firestore.ts:334"]
  I["meetingRowsFor: trust filter, counting, dispute label<br/>functions/src/callable/complianceMeetings.ts:101"]
  K["renderCsv or renderPdf<br/>functions/src/callable/compliance.ts:181"]
  A --> B --> C --> G
  C --> H --> I --> K
  G --> K
  X["GuestHome handleExportPDF, admin UI gate<br/>mobile/src/screens/Profile/GuestHome.tsx:381"]
  Y["portal ComplianceExport, view full gate<br/>portal/src/app/residents/ComplianceExport.tsx:36"]
  Z["exportWeeklyReportPDF<br/>mobile/src/services/reportExport.ts:26"]
  Z2["buildWeeklyReportHtml: PASS/FAIL from week-summaries; no drug tests or disputes<br/>mobile/src/services/weeklyReportHtml.ts:13"]
  X --> Z
  Y --> Z
  Z --> Z2
```

## (iv) Drug tests

```mermaid
flowchart TD
  A["logDrugTest setDoc drug-tests<br/>mobile/src/services/drugTests.ts:17"] --> B["rules: admin create, immutable<br/>regroup/mobile/firebase/firestore.rules:1209"]
  B --> C["useHouseDrugTests, charter zero-tolerance<br/>mobile/src/services/oxford/charterCompliance.ts:197"]
  B --> D["server export reads by guestId<br/>functions/src/api/firestore.ts:320"]
  B -.->|"never read"| E["client weekly PDF<br/>mobile/src/services/weeklyReportHtml.ts:13"]
```

The documents flow is clean. Bytes are read only through `getDocumentLink`, which returns a v4 URL valid for 15 minutes (`functions/src/callable/documentLinks.ts:26`); the storage rules deny direct reads.

## Findings beyond duplication (unverified against live data)

1. **The Oxford rules gate may be dead.** `houseOxfordActive()` (`firestore.rules:95-99`) requires `houses/{id}.oxfordEnabled`. No production code writes that field:
   - `createHousesTx.ts:167` writes `houseType`.
   - `setOxfordEnabled` writes `houseType` and `users.subscriptionMetadata.oxfordEnabled`.
   - `houseInput.ts:24` strips the field.
   - Only Maestro seeds write it.

   If this holds, the onboarding batch and every officer, house-meeting and vote write are denied for a real house.

2. **Votes never close.** Nothing writes `votes.closedAt` or `passed`, and the rules deny client updates (`firestore.rules:631`). As a result, `calculateResult` is always "pending" and the charter "democratic" condition is always `insufficient_data`.
3. **EES is fed into treasury in the wrong unit.**
   - `ees-records.amount` is in dollars (`mobile/src/services/oxford/ees.ts:27-35`).
   - `getEESIncomeForWeek` sums it, unpaid records included (`treasury.ts:171-188`).
   - `FinancialRecordForm.tsx:197,312` then treats the sum as cents, so a $37.50 share displays as about $0.38.
4. **Treasury role gating compares admin-record ids to uids** (`useTreasuryRole.ts:35-38`). Onboarded officers also have no `userId`. Separation of duties exists only in the UI; the rules require nothing beyond `isAdmin` (`firestore.rules:636-643`).
5. **`officerTermReminder` skips onboarded officers**, because it needs `userId` and `termEndDate` (`functions/src/scheduled/officerTermReminder.ts:60`).
6. **`resplitEES` does nothing for records the app created**, because `createEESRecords` never sets `totalExpenses`.
7. **Court-facing export is unreachable.** The tier-gated server export has no UI caller. The client report has no tier gate and contains different data.
8. **The server export can include tests from another house.** It reads drug tests by `guestId` only, so a resident who moved houses carries their tests from the other house into the export.

## Within-lane duplication found

- **Financial-record CRUD on the same subcollection, twice:** `mobile/src/services/oxford/index.ts:391,413` and `mobile/src/services/treasury.ts:21,51`. Both are still wired up (`oxfordQueries.ts:488,502`).
- **`ees-records` queried by three code paths:** `ees.ts:37,109`, `oxford/index.ts:355,375` and `treasury.ts:171`.
  - It is described by two shapes: `EESTransaction` (`entities/oxford/EESTransaction.ts`) and the `EESRecord` interface (`ees.ts:16`).
  - `reportExport.ts:92` defines a third `EESRecord`.
- **The EES per-resident split exists in three places:** `calculateEES` (`ees.ts:27`), the server `resplitEES` (`guestWrite.ts:289`) and an inline copy at `EESTracker.tsx:65,101`.
- **The week-start rule exists in three places:** `startOfISOWeek` (`EESTracker.tsx:45`), a UTC Monday (`ees.ts:80-90`), and a local Monday sliced to a UTC date (`treasury.ts:127-135`).
- **Compliance thresholds are defined in three ways:**
  - `reportingService.ts:139-140` uses a fixed threshold of `>= 3` meetings and `> 0` chores.
  - `weeklyReportHtml.ts:19-27` uses the per-phase rules.
  - `charterCompliance.ts:197-247` has its own rules.
- **Report builders, four of them:** the weekly PDF, the payment CSV, the EES CSV (`reportExport.ts`), and `treasuryReport.ts`. Separately, `reportingService.ts` does the analytics.
- **Officer creation, two paths:**
  - The wizard (`oxfordOnboardingMutations.ts:41-48`) uses the role as the doc id and sets no `userId`.
  - `createOfficer` (`oxford/index.ts:74-110`) uses an auto id and deactivates the prior holder.
  - If onboarding is re-run, one role can end up with two active docs.
- **`officerTermReminder` re-implements FCM sending and stale-token pruning** (`officerTermReminder.ts:83,96-122`). The shared copy is in `functions/src/util/notifications.ts:65-107`. See L9.

## External dependencies

- L7: entitlement and `tierAllows`
- L2: claims
- L4: `activityTrust`, `weekSummaryMath` and the dispute log
- L3: `onGuestWrite` EES re-split
- L9: FCM
- Portal: Oxford remains phone-only (`portal/src/app/houses/areas.ts:52`)

## Gaps

- Screen bodies not read: Officer, BusinessMeetings, CharterCompliance and TreasuryDashboard.
- The rules tests were not read.
- No live data was read. Findings 1 and 4 in particular need a live check.
