# Regroup Portal P8: Beds, Drug Tests, Documents, Issues, Complaints, Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every action the six later areas offer an operator must work in the portal through the phone's own code. Each write must be proven against the real rules, including refusals, and the resident compliance export must be reachable with the phone's exact content.

**Architecture:** The six areas are already routed and on the tabs (`LATER_SCREENS` in `src/app/routes.tsx`, `SHOW_LATER_AREAS = true` in `src/app/houses/areas.ts`), using the phone's screens unchanged. The screen survey only shows that they render.

This plan adds:

- browser journeys for each write, with refusals and roles;
- one portal replacement: `react-native-html-to-pdf`, which today is deferred, becomes a print view;
- one portal action: "Export compliance report" on the resident record. It calls the phone's `exportWeeklyReportPDF` with the inputs the phone's GuestHome passes.

Phone defects found here go to the owner.

**Tech Stack:** React 19, react-native-web 0.21, esbuild with the explicit replacement list (`tools/replacements.mjs`), Vitest, and Playwright on the emulators on the offset ports (firestore 18080, auth 19099, functions 15001, storage 19199, hub 14400, logging 14500, portal 5199).

**Spec:** `docs/superpowers/specs/2026-11-08-regroup-operator-portal-design.md`: §2 anti-goals, §5 table rows Beds / Drug tests / Issues and complaints / Documents / Reports, §5 "Who sees what", §7 "Native features" and "PDF export", and §8 slice 7.

## Global Constraints

- "Reuse a phone screen by default … Keep its data hooks and service calls either way, so writes stay identical." (§5)
- "Silent failure. A button that does nothing, or an error nobody sees, is failure." (§2)
- "The compliance export is used for court purposes, so its content must match the phone's. The method on the web is left to the builder." (§7)
- Peer leaders get no Reports, including by URL, and no legal fields (owner, 2026-11-09). The compliance export counts as Reports (§5 table), so it is for owners and managers only. Beds, drug tests, documents, issues and complaints are open to peer leaders, as on the phone.
- No rules change, and no edit to `regroup/mobile/src` or `regroup/functions` in this plan. The phone fixes the owner approved live on `fix/regroup-silent-house-writes`. Any new phone or server defect goes to the owner, and its test is marked `test.fail` with the issue link until a fix lands.
- No deploys. Don't touch phoenix-cleanhouse or regroup-e2e. Offset ports only.
- New files must be 300 lines or fewer. Commit scope is `regroup-portal`. Use `git -C`. Never `--no-verify`. Commits stay local until the owner says push.
- No resident data in logs.

## Owner decisions (2026-11-11: "resolve the 3 issues listed")

**Q1, the phone's silent failures:** fixed on the phone in `fix/regroup-silent-house-writes` (local; its own PR, stacked on #160 like the launch fixes).

- Beds: a failed assignment shows "Assignment Failed", not "Bed Assigned". Failed room, bed and remove-resident writes show a 'fail' notice.
- Complaints: removal shows "Removal Failed" on error.

`p8-integration` merges that branch, so the portal's refusal tests are ordinary tests with no `test.fail`.

**Q2, the export method:** a print view of the phone's own HTML (Task 5).

**Q3, the stale copies and the long press:** fixed in the same phone branch.

- **No second copies to keep in step:** residents add issues and complaints only to the house's maps (`Personal.tsx:170,202`), and nothing creates `issues/{id}` or `complaints/{id}`. The rules refuse reading or deleting a record that doesn't exist (pinned by the branch's `houseIssueRecords.rules.test.ts`).
- **Resolve, dismiss and complaint removal** write only the house maps.
- **Removing an issue** writes the house map first, then deletes any record an older build left. The old batch failed whenever there was no record, so Remove never worked.
- **Dismiss** has a visible button on open issues, `dismiss-issue-button-<id>`, and long press still works.

## Review Focus

1. **Resident text inside the export.** A resident's name or note that contains HTML must not run in the print view. Pinned by Task 5, `a name with markup doesn't run in the print view`.
2. **Refusals show something.** Any write the rules refuse in these areas must show an error, not a success. Pinned per area in Tasks 1 to 4, against the phone fix branch.
3. **Peer leaders.** They may use beds, drug tests, issues, complaints and documents, but not Reports or the compliance export, including by URL. Pinned in Tasks 1 and 5.
4. **Missing week data.** Exporting with no week summary shows the phone's "Unable to generate report: missing guest or week data." and opens no print view. Pinned in Task 5.
5. **Deleting a document** removes both the record and the stored file, and a refused delete removes neither. Pinned in Task 4.

Not covered, by decision: whether a browser blocks the document-open window after the link callable returns. Chrome and Firefox allow it while the click's activation lasts. Safari may block it, and the emulator can't sign links. Check on staging, as the roadmap already notes.

## Files

- Create: `regroup/portal/src/adapter/html-to-pdf.ts`, the print-view replacement.
- Modify: `regroup/portal/tools/replacements.mjs`, so `react-native-html-to-pdf` maps to the replacement instead of being deferred. `tests/replacements.test.ts` is updated to match.
- Create: `regroup/portal/src/app/residents/ComplianceExport.tsx`, the record's export action, and `compliance-text.ts`, which gives the report plain text and real numbers (added in execution).
- Modify: `regroup/portal/src/app/residents/RecordActions.tsx` (or `ResidentRecord.tsx`), to place it.
- Create: `regroup/portal/tests/html-to-pdf.test.ts`.
- Create: `regroup/portal/e2e/beds.spec.ts`, `drug-tests.spec.ts`, `issues-complaints.spec.ts`, `reports.spec.ts` and `later-fixtures.ts`.
- Modify: `regroup/portal/e2e/documents.spec.ts`, adding the delete journeys.
- Modify: the roadmap (P8 Done) and the ledger.

---

### Task 0: Integration branch

- [ ] Create `p8-integration` from `p6-integration`, merge in `fix/regroup-silent-house-writes`, and confirm the portal and docs trees equal `feat/regroup-operator-portal`:
      `git -C ~/dev/rp-regroup-portal switch -c p8-integration p6-integration && git -C ~/dev/rp-regroup-portal diff feat/regroup-operator-portal --stat -- regroup/portal docs`
      Expected: an empty diff.
- [ ] Baseline: `scratchpad/e2e-run.sh e2e/survey.spec.ts e2e/documents.spec.ts`. Expected: all pass.

Work is committed on `p8-integration` and cherry-picked onto `feat/regroup-operator-portal`, as in P5 and P6.

### Task 1: Beds

**Files:** Create `e2e/later-fixtures.ts` and `e2e/beds.spec.ts`.

**Interfaces:**

- Produces, in `later-fixtures.ts`:
  - `houseData(houseId = 'test-house-123'): Promise<DocumentData>`.
  - `putIssues(map: object)`, which writes `houses/{h}.issues` only, as residents do.
  - `putComplaints(map: object)`, which writes `houses/{h}.complaints` only.
  - `drugTests(guestId: string): Promise<DocumentData[]>`.
  - Reused from `fixtures.ts`: `setRooms` and `twoBedsOneFilled`.

- [ ] **Step 1: Write the tests.** All run as the owner (`signInAs(page, 'manager')`) on the Beds tab (`#nav-beds`), after `setRooms('test-house-123', twoBedsOneFilled)`.
  - `assigning a resident to an empty bed writes the phone's rooms shape`: assign guest-b to `2A/b2` through the phone's assign form. Expected:
    - `houseData().rooms['2A'].beds.b2.guestId === 'guest-b'`, and `b1` is unchanged;
    - the success notice "Bed Assigned" shows;
    - reloading shows guest-b in `2A/b2`.
  - `removing a resident frees the bed`: remove guest-a from `2A/b1`. Expected: `guestId` is `null`, and the bed shows as free.
  - `adding a room and a bed`: use the phone's Add Room, then add a bed to it. Expected: `houseData().rooms` gains the room with one bed.
  - `an invited peer leader assigns a bed`: as `addInvitedPeerLeader(browser)`, assign guest-b to `b2`. Expected: written.
  - `a refused assignment says so`: open the assign form, call `revokeClaimsAndRefresh(page, 'manager')`, and submit. Expected:
    - an error is visible, and "Bed Assigned" is not;
    - `rooms` is unchanged.

    Before the phone fix, the phone showed "Bed Assigned" here.

  - `a refused room delete says so`: the same pattern on room delete. Expected: "Room Not Removed" is visible, and the room is still there.
- [ ] **Step 2: Run them.** `scratchpad/e2e-run.sh e2e/beds.spec.ts`. Expected: all pass (the refusal rows depend on the merged phone fix). Proven against the fix: on `p6-integration`, without it, the two refusal rows fail. Any other failure is a finding. Ledger whether each passed first time.
- [ ] **Step 3: Prove the suite can fail.** Expect `guest-a` in `b2`, see the test fail, then revert.
- [ ] **Step 4: Commit:** `test(regroup-portal): beds through the real rules`.

### Task 2: Drug tests

**Files:** Create `e2e/drug-tests.spec.ts`.

**Interfaces:** Consumes `drugTests(guestId)` from Task 1.

- [ ] **Step 1: Write the tests.** They run as the owner from the Drug tests tab, using the phone's `DrugTestForm` for guest-a.
  - `adding a result writes the phone's record`: fill the result `negative`, the test type and a note, then submit. Expected: one `drug-tests` doc with `guestId: 'guest-a'`, `houseId: 'test-house-123'`, `result: 'negative'`, `observedBy: 'e2e-manager'`, and `testDate` and `createdAt` set. The doc has exactly the field set `DrugTestForm.tsx:86-110` builds, compared by key list. It also appears in `DrugTestHistory`.
  - `a positive result with substances is recorded`: `result: 'positive'` with one substance selected. Expected: `substancesDetected` contains it.
  - `a refused result shows an error and saves nothing`: revoke claims while the form is open, then submit. Expected: the phone's Alert is visible, and `drugTests('guest-a')` is unchanged.
  - `an invited peer leader adds a result`: expected `observedBy` is their uid.
  - `history shows only this resident's tests`: add one result each for guest-a and guest-b. Expected: guest-a's history lists one.
- [ ] **Step 2: Run them.** `scratchpad/e2e-run.sh e2e/drug-tests.spec.ts`. Expected: pass. This is the first proof of the drug-test create rule, which has no rules test, so ledger that.
- [ ] **Step 3: Prove the suite can fail.** Expect `observedBy: 'someone-else'`, see it fail, then revert.
- [ ] **Step 4: Commit:** `test(regroup-portal): drug tests through the real rules`.

### Task 3: Issues and complaints

**Files:** Create `e2e/issues-complaints.spec.ts`.

**Interfaces:** Consumes `putIssues`, `putComplaints` and `houseData` from Task 1.

- [ ] **Step 1: Write the tests.** They run as the owner, with one open issue (`p8-issue-1`, reported by guest-b) and one complaint (`p8-complaint-1`), each in the shape `services/issues.ts` and `Complaints.tsx` read.
  - `resolving an issue records the resolution`: RESOLVE with the text `Fixed the sink`. Expected: `houseData().issues['p8-issue-1']` has `status` resolved and `resolution: 'Fixed the sink'`.
  - `removing a closed issue`: resolve it first, then Remove and confirm. Expected: the house map entry is gone and "Issue Removed" shows. Before the phone fix this always failed.
  - `dismissing an issue`: click `dismiss-issue-button-p8-issue-1`, then confirm. Expected: the house entry has `invalid: true` and status dismissed.
  - `replying to a complaint`: Expected: `houseData().complaints['p8-complaint-1'].reply` is the text, and `updatedAt` is set.
  - `removing a complaint`: Expected: the map entry is gone.
  - `a refused issue resolve shows an error`: revoke claims, then RESOLVE. Expected: the phone's error notice, and the issue unchanged.
  - `a refused complaint removal shows an error`: revoke claims, then remove. Expected: "Removal Failed" is visible, and the entry is still there.
  - `an invited peer leader replies to a complaint`: Expected: written.
- [ ] **Step 2: Run them.** `scratchpad/e2e-run.sh e2e/issues-complaints.spec.ts`. Expected: pass.
- [ ] **Step 3: Prove the suite can fail.** Expect the wrong reply text, see it fail, then revert.
- [ ] **Step 4: Commit:** `test(regroup-portal): issues and complaints through the real rules`.

### Task 4: Documents: delete

**Files:** Modify `e2e/documents.spec.ts`. Keep it at 300 lines or fewer; if it would pass that, create `e2e/documents-delete.spec.ts` instead.

- [ ] **Step 1: Write the tests.** Each uploads a PDF through the phone's flow first (reuse the spec's upload helper), then:
  - `deleting a document removes its record and its file`: Delete, then confirm. Expected:
    - the `documents/{id}` doc is gone;
    - the Storage object at its `storagePath` is gone, checked with the Admin SDK `file.exists()`;
    - the row is gone from the list.
  - `a refused delete removes neither`: revoke claims, then Delete. Expected: a visible error, and both the doc and the file still there.
  - `cancelling delete keeps it`: Expected: both still there.
- [ ] **Step 2: Run them.** Expected: pass. If the phone's `Promise.all` deletes the file but not the doc on refusal (or the reverse), that is a finding (Q1 rule).
- [ ] **Step 3: Prove the suite can fail.** Expect the file to still exist after an allowed delete, see the test fail, then revert.
- [ ] **Step 4: Commit:** `test(regroup-portal): deleting documents`.

### Task 5: Reports and the compliance export

**Files:**

- Create: `src/adapter/html-to-pdf.ts` and `tests/html-to-pdf.test.ts`.
- Modify: `tools/replacements.mjs` and `tests/replacements.test.ts`.
- Create: `src/app/residents/ComplianceExport.tsx`.
- Modify: `src/app/residents/RecordActions.tsx`.
- Create: `e2e/reports.spec.ts`.

**Interfaces:**

- Produces: `generatePDF(options: { html: string; fileName: string; directory?: string }): Promise<{ filePath: string }>` in `src/adapter/html-to-pdf.ts`. It's the module `react-native-html-to-pdf` now resolves to.
  - It appends a hidden `<iframe data-testid="print-view" sandbox="allow-scripts allow-modals">`. It has no `allow-same-origin`, so the content runs in an opaque origin and can't reach the portal.
  - Its `srcdoc` is the phone's `html`, with two things injected at the start of `<head>`: a `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'nonce-<random>'">`, and `<title>` = `fileName`.
  - It adds one `<script nonce="<random>">` that calls `print()` on load. Nothing in the report can run, because the CSP allows only the nonce script.
  - It resolves `{ filePath: `${fileName}.pdf` }` once the frame has loaded, and removes the frame 60 s later or when `generatePDF` is next called.
- Produces: `ComplianceExport({ guest, house }: { guest: any; house: any }): JSX.Element | null` in `ComplianceExport.tsx` (planned as `{ houseId, guestId }`; the record already holds both objects).
  - It renders a button, `testID="export-compliance-report"` with the text `Export compliance report`, only when `useHouseAccess(houseId)` is `'full'`.
  - On press it gathers exactly what GuestHome passes (`GuestHome.tsx:237-277`): `startDate` from `useCurrentWeek(house.timezone)`, `summary` from `useWeekSummary(guestId, startDate, enabled)`, and `phaseRules` = `house.phases[String(guest.phase)].rules`.
  - It then calls `exportWeeklyReportPDF(guest, summary.stats, startDate, phaseRules)` from `@mobile/services/reportExport`.
  - With any input missing, it shows the phone's Alert, "Export Error" / "Unable to generate report: missing guest or week data.". On a throw, it shows "Export Failed" with the error message.
  - It doesn't call Share; the print view is the output.

- [ ] **Step 1: Write the unit test `tests/html-to-pdf.test.ts`** (jsdom). Cases:
  - `generatePDF renders the given HTML in a sandboxed print view`: after the call, one `[data-testid=print-view]` iframe exists. Its `sandbox` contains `allow-scripts` and `allow-modals` and not `allow-same-origin`. Its `srcdoc` contains the input's body verbatim, the CSP meta with a nonce, and `<title>compliance_guest-a_2026-11-09</title>`. The result is `{ filePath: 'compliance_guest-a_2026-11-09.pdf' }`.
  - `a second call replaces the first print view`: one iframe remains.
- [ ] **Step 2: Run it.** `npm --prefix regroup/portal test -- html-to-pdf`. Expected: FAIL, the module doesn't exist.
- [ ] **Step 3: Implement `html-to-pdf.ts` and switch the replacement.** In `replacements.mjs`, move `react-native-html-to-pdf` from the deferred list to a replacement pointing at the new file, with the reason "the browser's print dialog saves the phone's own HTML as a PDF". Update `tests/replacements.test.ts`'s expectation to match.
- [ ] **Step 4: Run** `npm --prefix regroup/portal test`. Expected: all pass.
- [ ] **Step 5: Write `e2e/reports.spec.ts`.** All rows except the peer leader's run as the owner.
  - `the admin report shows the house's numbers`: open the Reports tab. Expected: occupancy reads "<active residents> / 10", active residents over the house's `maximumCapacity`, as `AdminReportScreen.tsx` computes it (planned as beds, "1 / 2"). The 4-week compliance figures come from `setWeekStats` rows written for guest-a. Discharges show 0.
  - `a peer leader gets neither the report nor the export`: `makePeerLeader('manager')`. `/houses/test-house-123/reports` shows "This page isn't available for your role.", and the resident record has no `export-compliance-report` button.
  - `exporting a resident's compliance report opens the phone's report to print`: on guest-a's record, after `setWeekStats` for this week (meetings, chores and work hours that pass one rule and fail another):
    - click `export-compliance-report`;
    - read the `print-view` frame's content (`page.frameLocator('[data-testid=print-view]')`);
    - expect it to contain guest-a's name, the week start, and, for each rule in guest-a's phase, its row with the stat value and PASS or FAIL as `setWeekStats`' numbers imply;
    - don't count `print()` calls. Headless Chromium returns from it at once, and the frame's content is the evidence.
  - `with no week data the export says so`: no `setWeekStats`, and the summary doc deleted. Expected: the Alert "Unable to generate report: missing guest or week data.", and no print-view frame.
  - `a name with markup doesn't run in the print view`: set guest-a's `firstName` to `<img src=x onerror="parent.__xss=1">`, then export. Expected: `await page.evaluate(() => (window as any).__xss)` is `undefined`, no page error, and no request leaves loopback (the fixture already fails on one).
- [ ] **Step 6: Run them.** `scratchpad/e2e-run.sh e2e/reports.spec.ts`. Expected: FAIL before Step 7, because no export button exists yet.
- [ ] **Step 7: Implement `ComplianceExport.tsx`, and place it in the record's actions.**
- [ ] **Step 8: Run them again.** Expected: pass. Then run `npm test`, `npm run typecheck`, `npm run build` and `node tools/check-bundle.mjs`. Expected: all pass, with 0 hooks in the normal build. The survey's deferred list no longer names `react-native-html-to-pdf`.
- [ ] **Step 9: Prove the suite can fail.** In the replacement, add `allow-same-origin` to the sandbox and see the unit test fail; remove the export's text escaping and see the markup test fail. Revert both.
- [ ] **Step 10: Commit:** `feat(regroup-portal): the compliance export, printed from the phone's report`, plus the test commit if it is separate.

### Task 6: Full run, roadmap

- [ ] Run `scratchpad/fresh-p8.sh` (a copy of `fresh-p6.sh`) on `p8-integration`. Expected: unit, typecheck, production build, check-bundle with 0 hooks, and the whole e2e suite all pass. Ledger the counts.
- [ ] Roadmap: P8 becomes `Done (lands after #231, #232, #233)`. Its note says the phone fixes are on `fix/regroup-silent-house-writes` (so P8 also lands after that PR), and that the compliance export prints the phone's own HTML.
- [ ] Commit `docs(regroup-portal): P8 done`. Cherry-pick every P8 commit onto `feat/regroup-operator-portal`. Expected: the portal and docs trees are identical.

### Final review

A fresh reviewer on the most capable model reviews the range with this plan, the spec and the Review Focus list verbatim. A security pass on `html-to-pdf.ts` is part of it: the sandbox, the CSP, and resident text.
