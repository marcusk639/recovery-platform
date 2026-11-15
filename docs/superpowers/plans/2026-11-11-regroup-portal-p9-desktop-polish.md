# Regroup Portal P9: Desktop Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the reused phone screens comfortable at a desk, without changing any phone code or write. Type and spacing should come out at phone sizes, forms and lists should stay at a readable width, and nothing should run past the right edge. One mapping mistake the survey found is also fixed: the resident's `/edit` URL opens the signed-in person's own profile editor.

**Architecture:** Every fix is in the portal's adapters and frame, so it reaches every reused screen at once:

- a `react-native-size-matters` replacement, pinned to a phone-sized frame;
- a width limit, with horizontal clipping, around reused screens in `ScreenFrame`;
- the `react-native` adapter's window size reporting the screen frame's width;
- `EditUserInfo` taken off the resident's URLs and the navigator.

**Tech Stack:** react-native-web, the portal's esbuild bundle (`tools/bundle.mjs`), Vitest, and Playwright on the offset-port emulators (`scripts/e2e.sh`).

**Spec:** `docs/superpowers/specs/2026-11-08-regroup-operator-portal-design.md` (§5 "Reuse or rebuild", §8 step 8)

## Global Constraints

- "Reuse a phone screen by default … Keep its data hooks and service calls either way, so writes stay identical." (§5)
- "Rebuild its layout only when the phone layout gets in the way at a desk: long lists that need columns, sorting or filtering, or forms stretched past a readable width." (§5) This plan rebuilds no layout; it constrains and rescales.
- "Silent failure. A button that does nothing, or an error nobody sees, is failure." (§2)
- No rules change, and no edit to `regroup/mobile/src` or `regroup/functions`. Any phone defect found goes to the owner as an issue.
- No deploys. Don't touch phoenix-cleanhouse or regroup-e2e. Offset ports only.
- New files must be 300 lines or fewer. Commit scope is `regroup-portal`. Use `git -C`. Never `--no-verify`. Commits stay local until the owner says push.
- No resident data in logs.

## What the survey found (2026-11-11)

A throwaway Playwright pass opened all 28 reused screens at 1440×900 and 1024×900 as the seed's manager. Its screenshots are in the session scratchpad, and it was not committed.

| Finding                                                                                                                     | Cause                                                                                                                                                                                           | Screens                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Text and spacing come out about 1.8 times phone size: body text 25px, headings 30–39px. The portal's own pages are 13–14px. | `theme.tsx` sizes everything through `size-matters` `moderateScale`, which scales from the window's short side (900px) against a 350px phone, once at load. There are 1,449 calls in 164 files. | All reused screens, including ComplianceBreakdown on the record (the roadmap's P9 note)   |
| Buttons 600px wide, inputs 1,220px wide, text lines across 1,280px                                                          | Reused screens fill all of `main`                                                                                                                                                               | All reused screens; worst on Intake, the Activity feed and Payments                 |
| Intake runs 160px past the right edge, and its last step, Legal, is cut off                                                 | `rats-step-indicator` sizes each step as window width ÷ steps                                                                                                                                   | Intake (the roadmap's P9 note)                                                            |
| Notes and the shift log run 21px past the edge                                                                              | `CARD_NO_ELEVATION` is `width: '100%'` plus a margin. The phone clips it at the screen edge.                                                                                                    | Staff notes, Shift log                                                                    |
| Charts are sized from the window, not the screen                                                                            | `StatSummaryScreen` and `rats-bar-graph` read `Dimensions`                                                                                                                                      | The resident's five summaries                                                             |
| `/houses/…/residents/<id>/edit` shows "My Profile" under the resident's breadcrumb, and saving changes the **signed-in staff member's** own user, guest and admin docs | `EditUserInfoForm` edits `state.user.user`, `userAsGuest` and `userAsAdmin`. On the phone only `Personal.tsx`, the user's own screen, opens it. P3 mapped it as a resident screen. Nothing in the portal links to it, so only a typed URL reaches it. | Task 4. Its date fields also show "not available on the web yet: react-native-date-picker"; with the route gone, no reused screen needs a date picker (the Activity filter's date field is commented out on the phone) |
| A blank blue button under "No notes for this resident yet."                                                                 | `EmptyScreen` always renders its button, and `StaffNotesFeed` passes no title. The phone does the same.                                                                                         | Staff notes, Shift log; phone issue, Task 5                                               |

Not found: no crashes, and no horizontal overflow elsewhere.

## Review Focus

1. **A window resized after load.** `size-matters` and `theme.tsx` compute sizes once, at import. After Task 1, the sizes must not depend on the window at all, so a narrow window at load and a wide one later give the same type.
2. **Screens a reused screen opens as a modal or sheet** (react-native-modal, Alert). They render outside the frame, so the width limit doesn't reach them, but Task 3's width does. A modal must still fill its overlay rather than shrink to the frame.
3. **A bookmarked or shared `/edit` URL** after Task 4. It must land on a visible not-found or "use the phone" message, never a blank page and never the self-editor.
4. **Very narrow windows (under 1,024px) and browser zoom at 150%.** The frame width shrinks below 960. Nothing should overflow, and Task 3's width must follow the resize.
5. **The portal's own pages** (Home, the house overview, the resident list and record) must stay full width and keep their own sizes. Their tables need the width.

---

### Task 1: Phone type and spacing at phone sizes

**Files:**

- Create: `regroup/portal/src/adapter/size-matters.ts`
- Modify: `regroup/portal/tools/replacements.mjs` (move `react-native-size-matters` from REAL to REPLACE)
- Test: `regroup/portal/tests/size-matters.test.ts`, `regroup/portal/tests/replacements.test.ts`, `regroup/portal/e2e/desktop.spec.ts` (new)

**Interfaces:**

- Produces: `scale`, `verticalScale`, `moderateScale`, `moderateVerticalScale` and the aliases `s`, `vs`, `ms`, `mvs`, with the package's signatures, computed against a fixed 390×844 frame (a common phone). They never read `Dimensions`.

- [ ] **Step 1: Write the failing tests**
  - `size-matters.test.ts`: `moderateScale(14)` is `14 + (14 * 390 / 350 - 14) * 0.5` (≈14.78); `scale(10)` is `10 * 390 / 350`; `verticalScale(10)` is `10 * 844 / 680`; `moderateScale(14, 0)` is `14`. The same results come with `window.innerWidth` set to 2560 before the import (`vi.resetModules`).
  - `replacements.test.ts`: `react-native-size-matters` resolves to `src/adapter/size-matters.ts`.
  - `desktop.spec.ts`, "reused screens use phone type at a desk": at 1440×900, as the manager, the Activity feed's first resident name (`Bob Rivera`) has a computed `font-size` of 18px or less, and the record's "Requirements not met" is 18px or less.
- [ ] **Step 2: Run them, and watch them fail**
      Run: `npx vitest run tests/size-matters.test.ts tests/replacements.test.ts` and `scripts/e2e.sh desktop.spec.ts`.
      Expected: the module is not found; the replacement is still REAL; the e2e reads about 25px and 34px.
- [ ] **Step 3: Implement `src/adapter/size-matters.ts`, and move the entry to REPLACE** with a one-line reason: "scaled against the browser window, phone sizes come out about 1.8 times as big".
- [ ] **Step 4: Run Step 2's commands, and watch them pass.** Then run the whole unit suite and `npm run typecheck`.
- [ ] **Step 5: Run the full e2e suite** (`scripts/e2e.sh`). Expected: everything passes except the existing `test.fail`. A layout-dependent locator that breaks is fixed in the test, with a ledger ruling naming it.
- [ ] **Step 6: Commit** `feat(regroup-portal): reused screens use phone type sizes at a desk`

### Task 2: A readable width for reused screens

**Files:**

- Modify: `regroup/portal/src/app/ScreenFrame.tsx`, `regroup/portal/src/app/urls.ts`
- Test: `regroup/portal/tests/urls.test.ts`, `regroup/portal/e2e/desktop.spec.ts`

**Interfaces:**

- Produces: `PORTAL_PAGE_ROUTES: ReadonlySet<string>` in `urls.ts`: `HOME_ROUTE`, `NOT_FOUND_ROUTE`, `Routes.HouseList`, `Routes.HouseSummary`, `Routes.GuestList`, `Routes.GuestOverview`. Also `isPortalPage(routeName: string): boolean`.
- Produces: in `ScreenFrame`, a reused screen's boundary renders inside `<div data-testid="reused-screen" style={{ maxWidth: 960, width: '100%', overflowX: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>`, left-aligned under the tabs. Portal pages render as today.

- [ ] **Step 1: Write the failing tests**
  - `urls.test.ts`: `isPortalPage` is true for the six routes and false for `Routes.Activities`, `Routes.EditUserInfo` and `Routes.ResidentIntake`.
  - `desktop.spec.ts`, "reused screens keep a readable width": at 1440×900, the Activity feed's VERIFY button is 480px wide or less; every input on intake's first step is 960px wide or less; on Staff notes and the shift log, `document.documentElement.scrollWidth` equals the window width.
  - `desktop.spec.ts`, "the portal's own pages keep the full width": the resident table on `/houses/test-house-123/residents` is wider than 1,100px.
- [ ] **Step 2: Run them, and watch them fail.** Expected: `isPortalPage` is missing; VERIFY is about 597px; the inputs are about 1,226px; notes overflow by 21px.
- [ ] **Step 3: Implement** `PORTAL_PAGE_ROUTES`, `isPortalPage`, and the wrapper in `ScreenFrame`.
- [ ] **Step 4: Run Step 2's tests, and watch them pass.** Then run the unit suite, typecheck and the full e2e suite.
- [ ] **Step 5: Commit** `feat(regroup-portal): reused screens keep a readable width`

### Task 3: Screens sized from the window size from their frame

**Files:**

- Create: `regroup/portal/src/app/frame-width.ts`
- Modify: `regroup/portal/src/adapter/react-native.ts`, `regroup/portal/src/app/ScreenFrame.tsx`
- Test: `regroup/portal/tests/frame-width.test.ts`, `regroup/portal/tests/browser-adapters.test.tsx`, `regroup/portal/e2e/desktop.spec.ts`

**Interfaces:**

- Produces: `frame-width.ts` exports `getFrameWidth(): number | null`, `setFrameWidth(width: number): void` and `subscribeFrameWidth(listener: () => void): () => void`. `ScreenFrame` calls `setFrameWidth` from a `ResizeObserver` on the reused-screen wrapper, rounded to whole pixels, and only when the value changes.
- Produces: in the adapter, `Dimensions.get('window' | 'screen')` returns the window's values with `width` replaced by `getFrameWidth() ?? window width`. `useWindowDimensions()` does the same and re-renders on a frame-width change (`useSyncExternalStore`). Height stays the window's.

- [ ] **Step 1: Write the failing tests**
  - `frame-width.test.ts`: `getFrameWidth()` is null before any set; a set notifies subscribers once; the same value set twice notifies once; an unsubscribed listener isn't called.
  - `browser-adapters.test.tsx`: with `setFrameWidth(700)`, `Dimensions.get('window').width` and `Dimensions.get('screen').width` are 700, and height is `window.innerHeight`. A component using `useWindowDimensions` re-renders with 500 after `setFrameWidth(500)`.
  - `desktop.spec.ts`, "intake's steps fit the screen": at 1440×900 and at 1024×900, intake (opened through `__portalTest.open('ResidentIntake', { houseId })`) has no page overflow, and the text "Legal" ends inside the reused-screen wrapper.
  - `desktop.spec.ts`, "a resident's summary chart fits its screen": on `/houses/test-house-123/residents/guest-a/meetings`, the chart's `svg` is no wider than the reused-screen wrapper.
- [ ] **Step 2: Run them, and watch them fail.** Expected: the module is missing; `Dimensions` reports 1440; Legal ends near 1,437px against a 960px wrapper.
- [ ] **Step 3: Implement** `frame-width.ts`, the adapter change, and the observer in `ScreenFrame`.
- [ ] **Step 4: Check Review Focus 2.** Open a reused screen's react-native-modal (the Activity feed's filter) and confirm its sheet still spans the overlay. If it shrinks, record a ruling and keep the modal on the window's width.
- [ ] **Step 5: Run Step 2's tests, and watch them pass.** Then run the unit suite, typecheck and the full e2e suite.
- [ ] **Step 6: Commit** `feat(regroup-portal): screens that size from the window fit their frame`

### Task 4: The self-profile editor leaves the resident's URLs

**Files:**
- Modify: `regroup/portal/src/app/urls.ts` (drop `Routes.EditUserInfo` from `RESIDENT_ROUTE_PATHS`), `regroup/portal/src/app/routes.tsx` (unregister it and its import)
- Test: `regroup/portal/tests/urls.test.ts`, `regroup/portal/e2e/residents.spec.ts`

**Interfaces:**
- Produces: `RESIDENT_ROUTE_PATHS` without `EditUserInfo`. An unregistered route gets the navigator's existing visible "use the phone" alert, as `PhaseCustomization` does.

- [ ] **Step 1: Write the failing tests**
  - `urls.test.ts`: `RESIDENT_ROUTE_PATHS[Routes.EditUserInfo]` is undefined, and `sectionForRoute(Routes.EditUserInfo)` is null.
  - `residents.spec.ts`, "a resident's edit URL edits no one": as the manager, going to `/houses/test-house-123/residents/guest-a/edit` shows the portal's not-found message, with no "My Profile" and no APPLY. `__portalTest.open('EditUserInfo')` shows the "use the phone" alertdialog.
  - Two existing tests open `EditUserInfo` and must be retargeted, not deleted, because the test-tamper gate counts tests:
    - "text is translated, not raw keys" opens `GuestInfo` and checks one of its translated labels, chosen at execution;
    - "a deferred feature reached from a button fails visibly" becomes "a screen the portal doesn't offer, reached from a button, says so": on `GuestInfo`, CHANGE PHASE opens `PhaseCustomization`, which is unregistered, and the alertdialog says so.

    Both changes are named in the PR description.
- [ ] **Step 2: Run them, and watch them fail.** Expected: the path exists; the URL opens "My Profile".
- [ ] **Step 3: Implement** both removals.
- [ ] **Step 4: Run Step 2's tests, and watch them pass.** Then run the unit suite, typecheck and the full e2e suite.
- [ ] **Step 5: Commit** `fix(regroup-portal): a resident's URL never opens the signed-in person's own profile editor`

### Task 5: Prove it, and record it

**Files:**

- Modify: `docs/superpowers/plans/2026-11-08-regroup-portal-roadmap.md`

- [ ] **Step 1: Rerun the throwaway survey** from the scratchpad, copied in and deleted afterwards, at both widths. Expected: the largest reused text is 30px or less, no screen has page overflow, and `/edit` lands on the not-found message. Compare the screenshots with the first run.
- [ ] **Step 2: Draft the phone issue** for the blank Staff notes button: `EmptyScreen` with no `buttonTitle` renders an empty button that does nothing. It is public-safe: a layout defect with no data or security angle. The owner files it, or says to.
- [ ] **Step 3: Update the roadmap.** P9 becomes "Done (lands with P8)", with one notes line on the four fixes and the phone issue.
- [ ] **Step 4: Commit** `docs(regroup-portal): P9 done`

## Execution notes

- Work on a local `p9-integration` branch cut from `p8-integration`, which carries the phone fixes the e2e suite needs (#250). Rebuild clean `regroup-portal` commits onto `feat/regroup-operator-portal` for #210 at the end, as P8 did.
- One fresh whole-branch review at the end, as in P8.
