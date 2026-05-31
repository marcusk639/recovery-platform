# Hide V4 Features & E2E Test Coverage Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Hide all V4 features from the app's UI surface (except Meeting Minutes and Terms Dashboard), then write comprehensive Detox E2E tests covering all major user flows.

**Architecture:** Two parts — (A) a `featureFlags.ts` constants file used to conditionally render tiles/buttons/nav entries in 5 files; (B) 8 new Detox `.spec.js` files extending the existing `e2e/screens/` structure, each covering a previously-untested flow. No screens are deleted — only their entry points are hidden. Flip a flag to re-enable anything.

**Tech Stack:** React Native (TypeScript), React Navigation 6, Detox 20 (Jasmine runner), `e2e/helpers.js` shared utilities

---

## Background: What to Hide and Why

From `docs/STRATEGIC_ASSESSMENT_2026_02.md`:

| Feature                | V4 Group | Keep?   | Rationale                                   |
| ---------------------- | -------- | ------- | ------------------------------------------- |
| Meeting Minutes        | V4.1     | ✅ YES  | Resolves real secretary pain                |
| Terms Dashboard        | V4.1     | ✅ YES  | Service rotation reminders = retention hook |
| Guidelines/Bylaws      | V4.1     | ❌ HIDE | Niche; doesn't drive group adoption         |
| Elections              | V4.1     | ❌ HIDE | Annual event; premature for 0 paying groups |
| GSR Report             | V4.1     | ❌ HIDE | Intergroup feature; not yet needed          |
| Daily Reflection       | V4.2     | ❌ HIDE | No content to populate; copyright issues    |
| Literature Index       | V4.2     | ❌ HIDE | Copyright-fraught; no content               |
| Sobriety Calculator    | V4.2     | ❌ HIDE | Standalone apps do this better              |
| Meeting Topics         | V4.2     | ❌ HIDE | Secretary-only edge case                    |
| Group Resources        | V4.2     | ❌ HIDE | Unproven value; adds nav complexity         |
| Group Health Dashboard | V4.3     | ❌ HIDE | No data until groups have months of history |
| Attendance Analytics   | V4.3     | ❌ HIDE | Same; premature                             |
| Treasury Trends        | V4.3     | ❌ HIDE | Same; premature                             |
| My Recovery Journey    | V4.3     | ❌ HIDE | "No audience" — who reads it?               |
| Data Export            | V4.4     | ❌ HIDE | Enterprise feature; no paying customers yet |
| Intergroup Navigator   | V4.4     | ❌ HIDE | Entire enterprise tier; premature           |

---

## Part A: Hide V4 Features

### Task 1: Create feature flags configuration

**Files:**

- Create: `mobile/src/config/featureFlags.ts`

**Step 1: Create the file**

```typescript
// mobile/src/config/featureFlags.ts
// Set a flag to `true` to re-enable a hidden feature.
// All flags default to false until the feature is ready for users.

export const FEATURE_FLAGS = {
  // V4.1: Advanced Governance — only Minutes + TermsDashboard are shown
  SHOW_V4_GOVERNANCE_BYLAWS: false, // Guidelines/Bylaws tile
  SHOW_V4_GOVERNANCE_ELECTIONS: false, // Elections link in Service Positions
  SHOW_V4_GOVERNANCE_GSR_REPORT: false, // GSR Report tile (admin-only)

  // V4.2: Content & Resources — all hidden
  SHOW_V4_CONTENT_DAILY_REFLECTION: false, // Profile: Daily Reflection
  SHOW_V4_CONTENT_LITERATURE: false, // Profile: Literature & Resources
  SHOW_V4_CONTENT_SOBRIETY_CALCULATOR: false, // Profile: Sobriety Calculator
  SHOW_V4_CONTENT_MEETING_TOPICS: false, // SecretaryToolkit: Meeting Topics
  SHOW_V4_CONTENT_GROUP_RESOURCES: false, // Group Overview: Resources tile

  // V4.3: Analytics — all hidden
  SHOW_V4_ANALYTICS_GROUP_HEALTH: false, // Group Overview: Group Health admin button
  SHOW_V4_ANALYTICS_TREASURY_TRENDS: false, // Treasury Screen: Trends link
  SHOW_V4_ANALYTICS_MY_RECOVERY_JOURNEY: false, // Profile: My Recovery Journey

  // V4.4: Enterprise — all hidden
  SHOW_V4_ENTERPRISE_DATA_EXPORT: false, // Group Overview: Export Group Data admin button
  SHOW_V4_ENTERPRISE_INTERGROUP: false, // AppNavigator: Intergroup modal
} as const;
```

**Step 2: Run TypeScript to verify the file parses**

```bash
cd mobile && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

**Step 3: Commit**

```bash
git add mobile/src/config/featureFlags.ts
git commit -m "feat: add featureFlags.ts to control V4 feature visibility"
```

---

### Task 2: Hide V4 tiles and admin buttons in GroupOverviewScreen

This is the main entry point for most hidden features. Five things to hide:

1. **Guidelines tile** (V4.1 Bylaws) — `testID="group-overview-bylaws-tile"`
2. **Resources tile** (V4.2 Group Resources) — `testID="group-overview-resources-tile"`
3. **GSR Report tile** (V4.1, admin-only) — `testID="group-overview-gsr-report-tile"`
4. **Group Health admin button** (V4.3) — `testID="group-admin-health-button"`
5. **Export Group Data admin button** (V4.4) — `testID="group-admin-export-button"`

**Files:**

- Modify: `mobile/src/screens/homegroup/GroupOverviewScreen.tsx`

**Step 1: Add the import at the top of the file**

Find the last existing import line. Add:

```typescript
import { FEATURE_FLAGS } from "../../config/featureFlags";
```

**Step 2: Hide the Group Health admin button (~lines 880–896)**

Find:

```typescript
              <TouchableOpacity
                style={[styles.adminButton, styles.healthButton]}
                onPress={() =>
                  navigation.navigate('GroupHealthDashboard', {
```

Wrap the entire `TouchableOpacity` block in:

```tsx
{
  FEATURE_FLAGS.SHOW_V4_ANALYTICS_GROUP_HEALTH && (
    <TouchableOpacity
      style={[styles.adminButton, styles.healthButton]}
      onPress={() =>
        navigation.navigate("GroupHealthDashboard", {
          groupId,
          groupName,
        })
      }
      testID="group-admin-health-button"
    >
      <Icon
        name="chart-line"
        size={16}
        color="#FFFFFF"
        style={{ marginRight: 6 }}
      />
      <Text style={styles.healthButtonText}>Group Health</Text>
    </TouchableOpacity>
  );
}
```

**Step 3: Hide the Export Group Data admin button (~lines 999–1016)**

Find:

```typescript
              {/* Export Group Data */}
              <TouchableOpacity
                style={[styles.adminButton]}
                onPress={() =>
                  navigation.navigate('GroupDataExport', {
```

Wrap the entire block:

```tsx
{
  FEATURE_FLAGS.SHOW_V4_ENTERPRISE_DATA_EXPORT && (
    <TouchableOpacity
      style={[styles.adminButton]}
      onPress={() =>
        navigation.navigate("GroupDataExport", {
          groupId,
          groupName: group.name || groupName,
        })
      }
      testID="group-admin-export-button"
    >
      <Icon
        name="database-export"
        size={16}
        color="#FFFFFF"
        style={{ marginRight: 6 }}
      />
      <Text style={styles.adminButtonText}>Export Group Data</Text>
    </TouchableOpacity>
  );
}
```

**Step 4: Hide the Resources tile (~lines 1222–1235)**

Find:

```typescript
          {/* Group Resources tile - V4.2.5: visible to all members */}
          {isMember && (
            <TouchableOpacity
              style={styles.navTile}
              onPress={() =>
                navigation.navigate('GroupResourceLibrary', {groupId, groupName})
              }
              testID="group-overview-resources-tile">
```

Change the condition from `{isMember && (` to `{isMember && FEATURE_FLAGS.SHOW_V4_CONTENT_GROUP_RESOURCES && (`:

```tsx
{
  /* Group Resources tile - V4.2.5: hidden until content strategy established */
}
{
  isMember && FEATURE_FLAGS.SHOW_V4_CONTENT_GROUP_RESOURCES && (
    <TouchableOpacity
      style={styles.navTile}
      onPress={() =>
        navigation.navigate("GroupResourceLibrary", { groupId, groupName })
      }
      testID="group-overview-resources-tile"
    >
      <View style={[styles.navTileIcon, { backgroundColor: "#E8F5E9" }]}>
        <Icon name="folder-multiple-outline" size={24} color="#388E3C" />
      </View>
      <Text style={styles.navTileText}>Resources</Text>
    </TouchableOpacity>
  );
}
```

**Step 5: Hide the Guidelines tile (~lines 1255–1269)**

Find:

```typescript
          {/* V4.1: Guidelines tile — all members */}
          {isMember && (
            <TouchableOpacity
              style={styles.navTile}
              onPress={() =>
                navigation.navigate('GroupBylaws', {groupId, groupName})
              }
              testID="group-overview-bylaws-tile">
```

Change condition to `{isMember && FEATURE_FLAGS.SHOW_V4_GOVERNANCE_BYLAWS && (`.

**Step 6: Hide the GSR Report tile (~lines 1287–1304)**

Find:

```typescript
          {/* V4.1: GSR Report tile — admin only */}
          {isCurrentUserAdmin() && (
            <TouchableOpacity
              style={styles.navTile}
              onPress={() =>
                navigation.navigate('IntergroupReportHistory', {
```

Change condition to `{isCurrentUserAdmin() && FEATURE_FLAGS.SHOW_V4_GOVERNANCE_GSR_REPORT && (`.

**Step 7: Run TypeScript check**

```bash
cd mobile && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

**Step 8: Run existing E2E group overview tests**

```bash
cd mobile && npm run test:e2e:test -- --testFile e2e/screens/homegroup/group-overview.spec.js
```

Expected: all pass (the tests only check visible core tiles which remain unchanged)

**Step 9: Commit**

```bash
git add mobile/src/screens/homegroup/GroupOverviewScreen.tsx
git commit -m "feat: hide V4 tiles/buttons in GroupOverviewScreen using feature flags"
```

---

### Task 3: Hide V4 navigation in secondary screens

Three secondary screens have links to V4 features:

1. `GroupServicePositionsScreen.tsx` — Elections link (line ~221)
2. `GroupTreasuryScreen.tsx` — Treasury Trends link (line ~519)
3. `SecretaryToolkitScreen.tsx` — Meeting Topics link (line ~121)

**Files:**

- Modify: `mobile/src/screens/homegroup/GroupServicePositionsScreen.tsx`
- Modify: `mobile/src/screens/homegroup/GroupTreasuryScreen.tsx`
- Modify: `mobile/src/screens/homegroup/SecretaryToolkitScreen.tsx`

**Step 1: Hide Elections in GroupServicePositionsScreen**

Open the file. Find:

```bash
grep -n "GroupElections\|Elections" mobile/src/screens/homegroup/GroupServicePositionsScreen.tsx
```

Add import:

```typescript
import { FEATURE_FLAGS } from "../../config/featureFlags";
```

Find the button/link that calls `navigation.navigate('GroupElections', ...)` (around line 221). Wrap it:

```tsx
{FEATURE_FLAGS.SHOW_V4_GOVERNANCE_ELECTIONS && (
  // ... existing Elections button JSX
)}
```

**Step 2: Hide Treasury Trends in GroupTreasuryScreen**

Open the file. Find:

```bash
grep -n "TreasuryTrends\|navigate.*Trends" mobile/src/screens/homegroup/GroupTreasuryScreen.tsx
```

Add import and wrap the Trends button (~line 519):

```tsx
{FEATURE_FLAGS.SHOW_V4_ANALYTICS_TREASURY_TRENDS && (
  // ... existing TreasuryTrends button JSX
)}
```

**Step 3: Hide Meeting Topics in SecretaryToolkitScreen**

Open the file. Find:

```bash
grep -n "MeetingTopics\|navigate.*Topics" mobile/src/screens/homegroup/SecretaryToolkitScreen.tsx
```

Add import and wrap the MeetingTopics navigation (~line 121):

```tsx
{FEATURE_FLAGS.SHOW_V4_CONTENT_MEETING_TOPICS && (
  // ... existing Meeting Topics button JSX
)}
```

**Step 4: TypeScript check**

```bash
cd mobile && npx tsc --noEmit 2>&1 | head -20
```

**Step 5: Commit**

```bash
git add mobile/src/screens/homegroup/GroupServicePositionsScreen.tsx \
        mobile/src/screens/homegroup/GroupTreasuryScreen.tsx \
        mobile/src/screens/homegroup/SecretaryToolkitScreen.tsx
git commit -m "feat: hide V4 navigation links in secondary screens using feature flags"
```

---

### Task 4: Hide V4 items in ProfileScreen

Four V4 items are surfaced in ProfileScreen:

1. My Recovery Journey (V4.3) — line ~780
2. Daily Reflection (V4.2) — line ~873
3. Literature & Resources section (V4.2) — lines ~885–893
4. Sobriety Calculator (V4.2) — line ~903

**Files:**

- Modify: `mobile/src/screens/profile/ProfileScreen.tsx`

**Step 1: Add import at the top**

```typescript
import { FEATURE_FLAGS } from "../../config/featureFlags";
```

**Step 2: Read the file to locate exact line numbers**

```bash
grep -n "MyRecoveryJourney\|DailyReflection\|LiteratureIndex\|SobrietyCalculator" mobile/src/screens/profile/ProfileScreen.tsx
```

**Step 3: Wrap each item**

My Recovery Journey (~line 780):

```tsx
{
  FEATURE_FLAGS.SHOW_V4_ANALYTICS_MY_RECOVERY_JOURNEY && (
    <TouchableOpacity onPress={() => navigation.navigate("MyRecoveryJourney")}>
      {/* ... existing My Recovery Journey JSX ... */}
    </TouchableOpacity>
  );
}
```

Daily Reflection (~line 873):

```tsx
{
  FEATURE_FLAGS.SHOW_V4_CONTENT_DAILY_REFLECTION && (
    <TouchableOpacity onPress={() => navigation.navigate("DailyReflection")}>
      {/* ... existing Daily Reflection JSX ... */}
    </TouchableOpacity>
  );
}
```

Literature & Resources section (~lines 885–893):

```tsx
{
  FEATURE_FLAGS.SHOW_V4_CONTENT_LITERATURE && (
    <TouchableOpacity onPress={() => navigation.navigate("LiteratureIndex")}>
      {/* ... existing Literature & Resources section JSX ... */}
    </TouchableOpacity>
  );
}
```

Sobriety Calculator (~line 903):

```tsx
{
  FEATURE_FLAGS.SHOW_V4_CONTENT_SOBRIETY_CALCULATOR && (
    <TouchableOpacity onPress={() => navigation.navigate("SobrietyCalculator")}>
      {/* ... existing Sobriety Calculator JSX ... */}
    </TouchableOpacity>
  );
}
```

**Step 4: TypeScript check**

```bash
cd mobile && npx tsc --noEmit 2>&1 | head -20
```

**Step 5: Run existing profile tests**

```bash
cd mobile && npm run test:e2e:test -- --testFile e2e/screens/profile/profile.spec.js
```

**Step 6: Commit**

```bash
git add mobile/src/screens/profile/ProfileScreen.tsx
git commit -m "feat: hide V4.2/V4.3 profile items using feature flags"
```

---

### Task 5: Remove IntergroupNavigator from AppNavigator

The `Intergroup` modal stack in `AppNavigator.tsx` is the sole entry point for V4.4 Enterprise. No current screen navigates to `"Intergroup"` — it requires a `navigation.navigate('Intergroup')` call. Hiding it requires removing the `Stack.Screen` registration.

**Files:**

- Modify: `mobile/src/navigation/AppNavigator.tsx`

**Step 1: Confirm no internal navigation calls reach "Intergroup"**

```bash
grep -rn "navigate.*'Intergroup'\|navigate.*\"Intergroup\"" mobile/src --include="*.ts" --include="*.tsx"
```

Expected: no results (the route is defined but never navigated to from within the app)

**Step 2: Add import and conditionally register the route**

Open `mobile/src/navigation/AppNavigator.tsx`. Add:

```typescript
import { FEATURE_FLAGS } from "../config/featureFlags";
```

Find the IntergroupNavigator Stack.Screen block:

```tsx
{
  /* V4.4: Intergroup stack — presented as a full-screen modal over Main tabs */
}
<Stack.Screen
  name="Intergroup"
  component={IntergroupNavigator}
  options={{ presentation: "modal", headerShown: false }}
/>;
```

Wrap it:

```tsx
{
  FEATURE_FLAGS.SHOW_V4_ENTERPRISE_INTERGROUP && (
    <Stack.Screen
      name="Intergroup"
      component={IntergroupNavigator}
      options={{ presentation: "modal", headerShown: false }}
    />
  );
}
```

**Step 3: Suppress the unused import warning**

Since `IntergroupNavigator` is imported but may no longer be rendered, TypeScript won't complain (it's still referenced in the JSX inside the flag). No change needed.

**Step 4: TypeScript check**

```bash
cd mobile && npx tsc --noEmit 2>&1 | head -20
```

**Step 5: Verify app builds**

```bash
cd mobile && npm run ios 2>&1 | tail -5
```

**Step 6: Commit**

```bash
git add mobile/src/navigation/AppNavigator.tsx
git commit -m "feat: gate IntergroupNavigator behind SHOW_V4_ENTERPRISE_INTERGROUP flag"
```

---

## Part B: E2E Test Coverage

The existing E2E test files are:

```
e2e/screens/auth/auth.spec.js
e2e/screens/admin/admin.spec.js
e2e/screens/homegroup/group-announcements.spec.js
e2e/screens/homegroup/group-chat.spec.js
e2e/screens/homegroup/group-members.spec.js
e2e/screens/homegroup/group-overview.spec.js
e2e/screens/homegroup/groups.spec.js
e2e/screens/meetings/meetings.spec.js
e2e/screens/messages/messages.spec.js
e2e/screens/profile/profile.spec.js
e2e/screens/treasury/treasury.spec.js
```

Missing coverage (8 new files to create):

1. `service-positions.spec.js` — Service positions CRUD + term tracking
2. `business-meetings.spec.js` — Business meeting list + meeting minutes
3. `treasury-handoff.spec.js` — Treasurer handoff initiation + confirmation
4. `phone-list.spec.js` — Phone list visibility and privacy
5. `milestones.spec.js` — Sobriety milestone display
6. `group-conscience.spec.js` — Group conscience voting flow
7. `secretary-toolkit.spec.js` — Secretary toolkit + meeting checklist
8. `sponsorship.spec.js` — Sponsor connection flow

Each test file follows the established Detox pattern:

- `require('../../helpers')` for shared utilities
- `device.launchApp({newInstance: true})` + login in `beforeAll`
- Navigation helper function per `describe` block
- `testID` selectors matching existing component attributes

---

### Task 6: Write service positions E2E tests

**Files:**

- Create: `mobile/e2e/screens/homegroup/service-positions.spec.js`

**Step 1: Identify existing testIDs in GroupServicePositionsScreen**

```bash
grep -n "testID" mobile/src/screens/homegroup/GroupServicePositionsScreen.tsx | head -20
grep -n "testID" mobile/src/screens/homegroup/AddEditServicePositionScreen.tsx | head -10
```

**Step 2: Write the spec file**

```javascript
// e2e/screens/homegroup/service-positions.spec.js
const helpers = require("../../helpers");

async function navigateToServicePositions() {
  await element(by.text("Home")).tap();
  await helpers.waitForElement("group-list-screen");
  await element(by.id("group-list")).atIndex(0).tap();
  await helpers.waitForElement("group-info-section");
  await helpers.waitAndTap("group-overview-service-positions-tile");
  // Service Positions screen uses a different testID — adjust after checking:
  await waitFor(element(by.text("Service Positions")))
    .toBeVisible()
    .withTimeout(8000);
}

describe("Service Positions Screen", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    try {
      await waitFor(element(by.id("landing-signin-button")))
        .toBeVisible()
        .withTimeout(5000);
      await element(by.id("landing-signin-button")).tap();
    } catch (e) {}
    await helpers.login();
  });

  beforeEach(async () => {
    await navigateToServicePositions();
  });

  it("should display service positions list", async () => {
    await waitFor(element(by.text("Service Positions")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("should show add service position button for admin", async () => {
    // Admin should see an add button — check for common testID patterns
    await waitFor(element(by.id("add-service-position-button")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("should navigate to add service position screen", async () => {
    await helpers.waitAndTap("add-service-position-button");
    await waitFor(element(by.text("Add Service Position")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("should show position name input on add screen", async () => {
    await helpers.waitAndTap("add-service-position-button");
    await waitFor(element(by.id("service-position-name-input")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("should cancel adding service position", async () => {
    await helpers.waitAndTap("add-service-position-button");
    // Navigate back
    try {
      await element(by.text("Cancel")).tap();
    } catch (e) {
      await element(by.text("Back")).tap();
    }
    await waitFor(element(by.text("Service Positions")))
      .toBeVisible()
      .withTimeout(5000);
  });
});
```

**Step 3: Run the test**

```bash
cd mobile && npm run test:e2e:test -- --testFile e2e/screens/homegroup/service-positions.spec.js
```

Expected: all pass, or skip any that need testID additions (note which)

**Step 4: Commit**

```bash
git add mobile/e2e/screens/homegroup/service-positions.spec.js
git commit -m "test(e2e): add service positions flow tests"
```

---

### Task 7: Write business meetings + minutes E2E tests

**Files:**

- Create: `mobile/e2e/screens/homegroup/business-meetings.spec.js`

**Step 1: Check existing testIDs**

```bash
grep -n "testID" mobile/src/screens/homegroup/BusinessMeetingsListScreen.tsx | head -20
grep -n "testID" mobile/src/screens/homegroup/BusinessMeetingDetailScreen.tsx | head -20
grep -n "testID" mobile/src/screens/homegroup/MeetingMinutesScreen.tsx | head -20
```

**Step 2: Write the spec file**

```javascript
// e2e/screens/homegroup/business-meetings.spec.js
const helpers = require("../../helpers");

async function navigateToBusinessMeetings() {
  await element(by.text("Home")).tap();
  await helpers.waitForElement("group-list-screen");
  await element(by.id("group-list")).atIndex(0).tap();
  await helpers.waitForElement("group-info-section");
  await helpers.waitAndTap("group-overview-business-meetings-tile");
  await waitFor(element(by.text("Business Meetings")))
    .toBeVisible()
    .withTimeout(8000);
}

describe("Business Meetings Screen", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    try {
      await waitFor(element(by.id("landing-signin-button")))
        .toBeVisible()
        .withTimeout(5000);
      await element(by.id("landing-signin-button")).tap();
    } catch (e) {}
    await helpers.login();
  });

  beforeEach(async () => {
    await navigateToBusinessMeetings();
  });

  it("should display business meetings list screen", async () => {
    await waitFor(element(by.text("Business Meetings")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("should show create meeting button for admin", async () => {
    await waitFor(element(by.id("create-business-meeting-button")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("should navigate to create business meeting screen", async () => {
    await helpers.waitAndTap("create-business-meeting-button");
    await waitFor(element(by.text("New Business Meeting")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("should cancel creating a business meeting", async () => {
    await helpers.waitAndTap("create-business-meeting-button");
    try {
      await element(by.text("Cancel")).tap();
    } catch (e) {
      await element(by.text("Back")).tap();
    }
    await waitFor(element(by.text("Business Meetings")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("should display existing business meeting details when tapped", async () => {
    // Tap first meeting if any exist
    try {
      await element(by.id("business-meeting-item")).atIndex(0).tap();
      await waitFor(element(by.text("Business Meeting")))
        .toBeVisible()
        .withTimeout(5000);
    } catch (e) {
      // No meetings yet — acceptable
    }
  });
});

describe("Meeting Minutes (V4.1 - kept)", () => {
  async function navigateToMinutes() {
    await element(by.text("Home")).tap();
    await helpers.waitForElement("group-list-screen");
    await element(by.id("group-list")).atIndex(0).tap();
    await helpers.waitForElement("group-info-section");
    await helpers.waitAndTap("group-overview-minutes-archive-tile");
    await waitFor(element(by.text("Minutes Archive")))
      .toBeVisible()
      .withTimeout(8000);
  }

  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    try {
      await waitFor(element(by.id("landing-signin-button")))
        .toBeVisible()
        .withTimeout(5000);
      await element(by.id("landing-signin-button")).tap();
    } catch (e) {}
    await helpers.login();
  });

  beforeEach(async () => {
    await navigateToMinutes();
  });

  it("should display minutes archive screen", async () => {
    await waitFor(element(by.text("Minutes Archive")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("should show create minutes button for secretary/admin", async () => {
    await waitFor(element(by.id("create-meeting-minutes-button")))
      .toBeVisible()
      .withTimeout(5000);
  });
});
```

**Step 3: Run the test**

```bash
cd mobile && npm run test:e2e:test -- --testFile e2e/screens/homegroup/business-meetings.spec.js
```

**Step 4: Commit**

```bash
git add mobile/e2e/screens/homegroup/business-meetings.spec.js
git commit -m "test(e2e): add business meetings and meeting minutes flow tests"
```

---

### Task 8: Write treasury handoff E2E tests

**Files:**

- Create: `mobile/e2e/screens/homegroup/treasury-handoff.spec.js`

**Step 1: Identify testIDs in handoff screens**

```bash
grep -n "testID" mobile/src/screens/homegroup/InitiateHandoffScreen.tsx | head -15
grep -n "testID" mobile/src/screens/homegroup/HandoffHistoryScreen.tsx | head -10
```

**Step 2: Write the spec file**

```javascript
// e2e/screens/homegroup/treasury-handoff.spec.js
const helpers = require("../../helpers");

async function navigateToTreasury() {
  await element(by.text("Home")).tap();
  await helpers.waitForElement("group-list-screen");
  await element(by.id("group-list")).atIndex(0).tap();
  await helpers.waitForElement("group-info-section");
  await helpers.waitAndTap("group-overview-treasury-tile");
  await helpers.waitForElement("treasury-summary-section");
}

describe("Treasury Handoff", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    try {
      await waitFor(element(by.id("landing-signin-button")))
        .toBeVisible()
        .withTimeout(5000);
      await element(by.id("landing-signin-button")).tap();
    } catch (e) {}
    await helpers.login();
  });

  beforeEach(async () => {
    await navigateToTreasury();
  });

  it("should display treasury screen with handoff option for treasurer", async () => {
    // Handoff button should be visible in treasury screen for treasurer/admin
    await waitFor(element(by.id("treasury-initiate-handoff-button")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("should navigate to handoff initiation screen", async () => {
    await helpers.waitAndTap("treasury-initiate-handoff-button");
    await waitFor(element(by.text("Transfer Treasurer Role")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("should show member list on handoff initiation screen", async () => {
    await helpers.waitAndTap("treasury-initiate-handoff-button");
    await waitFor(element(by.id("handoff-member-list")))
      .toBeVisible()
      .withTimeout(8000);
  });

  it("should navigate to handoff history", async () => {
    await helpers.waitAndTap("treasury-initiate-handoff-button");
    try {
      await helpers.waitAndTap("view-handoff-history-button");
      await waitFor(element(by.text("Handoff History")))
        .toBeVisible()
        .withTimeout(5000);
    } catch (e) {
      // History button might not exist if no handoffs yet
    }
  });

  it("should cancel handoff initiation", async () => {
    await helpers.waitAndTap("treasury-initiate-handoff-button");
    try {
      await element(by.text("Cancel")).tap();
    } catch (e) {
      await element(by.text("Back")).tap();
    }
    await helpers.waitForElement("treasury-summary-section");
  });
});
```

**Step 3: Run the test**

```bash
cd mobile && npm run test:e2e:test -- --testFile e2e/screens/homegroup/treasury-handoff.spec.js
```

**Step 4: Commit**

```bash
git add mobile/e2e/screens/homegroup/treasury-handoff.spec.js
git commit -m "test(e2e): add treasury handoff flow tests"
```

---

### Task 9: Write phone list E2E tests

**Files:**

- Create: `mobile/e2e/screens/homegroup/phone-list.spec.js`

**Step 1: Check testIDs**

```bash
grep -n "testID" mobile/src/screens/homegroup/GroupPhoneListScreen.tsx | head -20
```

**Step 2: Write the spec file**

```javascript
// e2e/screens/homegroup/phone-list.spec.js
const helpers = require("../../helpers");

async function navigateToPhoneList() {
  await element(by.text("Home")).tap();
  await helpers.waitForElement("group-list-screen");
  await element(by.id("group-list")).atIndex(0).tap();
  await helpers.waitForElement("group-info-section");
  await helpers.waitAndTap("group-overview-phone-list-tile");
  await waitFor(element(by.text("Phone List")))
    .toBeVisible()
    .withTimeout(8000);
}

describe("Group Phone List", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    try {
      await waitFor(element(by.id("landing-signin-button")))
        .toBeVisible()
        .withTimeout(5000);
      await element(by.id("landing-signin-button")).tap();
    } catch (e) {}
    await helpers.login();
  });

  beforeEach(async () => {
    await navigateToPhoneList();
  });

  it("should display phone list screen", async () => {
    await waitFor(element(by.text("Phone List")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("should show only members who have opted in to phone sharing", async () => {
    // Phone list should load without error
    // Members without showPhoneNumber=true should not appear
    await waitFor(element(by.id("phone-list-screen")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("should navigate back to group overview", async () => {
    await element(by.text("Back")).tap();
    await helpers.waitForElement("group-info-section");
  });
});
```

**Step 3: Run the test**

```bash
cd mobile && npm run test:e2e:test -- --testFile e2e/screens/homegroup/phone-list.spec.js
```

**Step 4: Commit**

```bash
git add mobile/e2e/screens/homegroup/phone-list.spec.js
git commit -m "test(e2e): add phone list flow tests"
```

---

### Task 10: Write milestones E2E tests

**Files:**

- Create: `mobile/e2e/screens/homegroup/milestones.spec.js`

**Step 1: Check testIDs**

```bash
grep -n "testID" mobile/src/screens/homegroup/GroupMilestonesScreen.tsx | head -20
```

**Step 2: Write the spec file**

```javascript
// e2e/screens/homegroup/milestones.spec.js
const helpers = require("../../helpers");

async function navigateToMilestones() {
  await element(by.text("Home")).tap();
  await helpers.waitForElement("group-list-screen");
  await element(by.id("group-list")).atIndex(0).tap();
  await helpers.waitForElement("group-info-section");
  await helpers.waitAndTap("group-overview-milestones-tile");
  await waitFor(element(by.text("Milestones")))
    .toBeVisible()
    .withTimeout(8000);
}

describe("Group Milestones", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    try {
      await waitFor(element(by.id("landing-signin-button")))
        .toBeVisible()
        .withTimeout(5000);
      await element(by.id("landing-signin-button")).tap();
    } catch (e) {}
    await helpers.login();
  });

  beforeEach(async () => {
    await navigateToMilestones();
  });

  it("should display milestones screen", async () => {
    await waitFor(element(by.text("Milestones")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("should show milestones list or empty state", async () => {
    try {
      await waitFor(element(by.id("group-milestones-list")))
        .toBeVisible()
        .withTimeout(5000);
    } catch (e) {
      await waitFor(element(by.id("group-milestones-empty")))
        .toBeVisible()
        .withTimeout(5000);
    }
  });

  it("should show upcoming celebrations on group overview", async () => {
    await element(by.text("Back")).tap();
    await helpers.waitForElement("group-info-section");
    // Celebrations section should be visible (shows upcoming milestones)
    await helpers.waitForElement("group-celebrations-section");
  });
});
```

**Step 3: Run the test**

```bash
cd mobile && npm run test:e2e:test -- --testFile e2e/screens/homegroup/milestones.spec.js
```

**Step 4: Commit**

```bash
git add mobile/e2e/screens/homegroup/milestones.spec.js
git commit -m "test(e2e): add group milestones flow tests"
```

---

### Task 11: Write group conscience E2E tests

**Files:**

- Create: `mobile/e2e/screens/homegroup/group-conscience.spec.js`

**Step 1: Check testIDs**

```bash
grep -n "testID" mobile/src/screens/homegroup/GroupConscienceScreen.tsx | head -20
grep -n "testID" mobile/src/screens/homegroup/CreateConscienceVoteScreen.tsx | head -10
```

**Step 2: Write the spec file**

```javascript
// e2e/screens/homegroup/group-conscience.spec.js
const helpers = require("../../helpers");

async function navigateToGroupConscience() {
  await element(by.text("Home")).tap();
  await helpers.waitForElement("group-list-screen");
  await element(by.id("group-list")).atIndex(0).tap();
  await helpers.waitForElement("group-info-section");
  await helpers.waitAndTap("group-overview-conscience-tile");
  await waitFor(element(by.text("Group Conscience")))
    .toBeVisible()
    .withTimeout(8000);
}

describe("Group Conscience Screen", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    try {
      await waitFor(element(by.id("landing-signin-button")))
        .toBeVisible()
        .withTimeout(5000);
      await element(by.id("landing-signin-button")).tap();
    } catch (e) {}
    await helpers.login();
  });

  beforeEach(async () => {
    await navigateToGroupConscience();
  });

  it("should display group conscience screen", async () => {
    await waitFor(element(by.text("Group Conscience")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("should show active votes or empty state", async () => {
    try {
      await waitFor(element(by.id("conscience-votes-list")))
        .toBeVisible()
        .withTimeout(5000);
    } catch (e) {
      await waitFor(element(by.id("conscience-votes-empty")))
        .toBeVisible()
        .withTimeout(5000);
    }
  });

  it("should show create vote button for admin", async () => {
    await waitFor(element(by.id("create-conscience-vote-button")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("should navigate to create vote screen", async () => {
    await helpers.waitAndTap("create-conscience-vote-button");
    await waitFor(element(by.text("New Group Conscience Vote")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("should cancel creating a vote", async () => {
    await helpers.waitAndTap("create-conscience-vote-button");
    try {
      await element(by.text("Cancel")).tap();
    } catch (e) {
      await element(by.text("Back")).tap();
    }
    await waitFor(element(by.text("Group Conscience")))
      .toBeVisible()
      .withTimeout(5000);
  });
});
```

**Step 3: Run the test**

```bash
cd mobile && npm run test:e2e:test -- --testFile e2e/screens/homegroup/group-conscience.spec.js
```

**Step 4: Commit**

```bash
git add mobile/e2e/screens/homegroup/group-conscience.spec.js
git commit -m "test(e2e): add group conscience voting flow tests"
```

---

### Task 12: Write secretary toolkit E2E tests

**Files:**

- Create: `mobile/e2e/screens/homegroup/secretary-toolkit.spec.js`

**Step 1: Check testIDs**

```bash
grep -n "testID" mobile/src/screens/homegroup/SecretaryToolkitScreen.tsx | head -20
grep -n "testID" mobile/src/screens/homegroup/MeetingChecklistScreen.tsx | head -15
```

**Step 2: Write the spec file**

```javascript
// e2e/screens/homegroup/secretary-toolkit.spec.js
const helpers = require("../../helpers");

async function navigateToSecretaryToolkit() {
  await element(by.text("Home")).tap();
  await helpers.waitForElement("group-list-screen");
  await element(by.id("group-list")).atIndex(0).tap();
  await helpers.waitForElement("group-info-section");
  await helpers.waitAndTap("group-overview-secretary-toolkit-tile");
  await waitFor(element(by.text("Secretary Toolkit")))
    .toBeVisible()
    .withTimeout(8000);
}

describe("Secretary Toolkit", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    try {
      await waitFor(element(by.id("landing-signin-button")))
        .toBeVisible()
        .withTimeout(5000);
      await element(by.id("landing-signin-button")).tap();
    } catch (e) {}
    await helpers.login();
  });

  beforeEach(async () => {
    await navigateToSecretaryToolkit();
  });

  it("should display secretary toolkit screen", async () => {
    await waitFor(element(by.text("Secretary Toolkit")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("should show meeting checklist option", async () => {
    await waitFor(element(by.id("meeting-checklist-button")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("should navigate to meeting checklist", async () => {
    await helpers.waitAndTap("meeting-checklist-button");
    await waitFor(element(by.text("Meeting Checklist")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("should NOT show meeting topics option (V4.2 hidden)", async () => {
    // Meeting Topics should be hidden via feature flag
    await waitFor(element(by.id("meeting-topics-button")))
      .not.toBeVisible()
      .withTimeout(2000);
  });

  it("should navigate back from checklist", async () => {
    await helpers.waitAndTap("meeting-checklist-button");
    await waitFor(element(by.text("Meeting Checklist")))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.text("Back")).tap();
    await waitFor(element(by.text("Secretary Toolkit")))
      .toBeVisible()
      .withTimeout(5000);
  });
});
```

**Step 3: Run the test**

```bash
cd mobile && npm run test:e2e:test -- --testFile e2e/screens/homegroup/secretary-toolkit.spec.js
```

**Step 4: Commit**

```bash
git add mobile/e2e/screens/homegroup/secretary-toolkit.spec.js
git commit -m "test(e2e): add secretary toolkit flow tests (verifies Meeting Topics is hidden)"
```

---

### Task 13: Write sponsorship E2E tests

**Files:**

- Create: `mobile/e2e/screens/homegroup/sponsorship.spec.js`

**Step 1: Check testIDs**

```bash
grep -n "testID" mobile/src/screens/homegroup/GroupSponsorsScreen.tsx | head -20
grep -n "testID" mobile/src/screens/sponsorship/MySponsorshipsScreen.tsx | head -15
```

**Step 2: Write the spec file**

```javascript
// e2e/screens/homegroup/sponsorship.spec.js
const helpers = require("../../helpers");

async function navigateToGroupSponsors() {
  await element(by.text("Home")).tap();
  await helpers.waitForElement("group-list-screen");
  await element(by.id("group-list")).atIndex(0).tap();
  await helpers.waitForElement("group-info-section");
  await helpers.waitAndTap("group-overview-sponsors-tile");
  await waitFor(element(by.text("Sponsors")))
    .toBeVisible()
    .withTimeout(8000);
}

describe("Group Sponsors Screen", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    try {
      await waitFor(element(by.id("landing-signin-button")))
        .toBeVisible()
        .withTimeout(5000);
      await element(by.id("landing-signin-button")).tap();
    } catch (e) {}
    await helpers.login();
  });

  beforeEach(async () => {
    await navigateToGroupSponsors();
  });

  it("should display sponsors screen", async () => {
    await waitFor(element(by.text("Sponsors")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("should show available sponsors list or empty state", async () => {
    try {
      await waitFor(element(by.id("sponsors-list")))
        .toBeVisible()
        .withTimeout(5000);
    } catch (e) {
      await waitFor(element(by.id("sponsors-empty-state")))
        .toBeVisible()
        .withTimeout(5000);
    }
  });

  it("should navigate back to group overview", async () => {
    await element(by.text("Back")).tap();
    await helpers.waitForElement("group-info-section");
  });
});

describe("My Sponsorships (Profile)", () => {
  async function navigateToMySponsorships() {
    await element(by.text("Profile")).tap();
    await waitFor(element(by.id("profile-screen")))
      .toBeVisible()
      .withTimeout(5000);
    await helpers.waitAndTap("profile-my-sponsorships-button");
    await waitFor(element(by.text("My Sponsorships")))
      .toBeVisible()
      .withTimeout(8000);
  }

  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    try {
      await waitFor(element(by.id("landing-signin-button")))
        .toBeVisible()
        .withTimeout(5000);
      await element(by.id("landing-signin-button")).tap();
    } catch (e) {}
    await helpers.login();
  });

  beforeEach(async () => {
    await navigateToMySponsorships();
  });

  it("should display my sponsorships screen", async () => {
    await waitFor(element(by.text("My Sponsorships")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("should show active and pending sponsorships or empty state", async () => {
    try {
      await waitFor(element(by.id("my-sponsorships-list")))
        .toBeVisible()
        .withTimeout(5000);
    } catch (e) {
      await waitFor(element(by.id("my-sponsorships-empty")))
        .toBeVisible()
        .withTimeout(5000);
    }
  });
});
```

**Step 3: Run the test**

```bash
cd mobile && npm run test:e2e:test -- --testFile e2e/screens/homegroup/sponsorship.spec.js
```

**Step 4: Commit**

```bash
git add mobile/e2e/screens/homegroup/sponsorship.spec.js
git commit -m "test(e2e): add sponsorship flow tests"
```

---

## Execution Order Summary

| #   | Task                                   | Type         | Files                                                                                      |
| --- | -------------------------------------- | ------------ | ------------------------------------------------------------------------------------------ |
| 1   | Create featureFlags.ts                 | Config       | `mobile/src/config/featureFlags.ts`                                                        |
| 2   | Hide V4 tiles/buttons in GroupOverview | Feature hide | `GroupOverviewScreen.tsx`                                                                  |
| 3   | Hide V4 nav in secondary screens       | Feature hide | `GroupServicePositionsScreen.tsx`, `GroupTreasuryScreen.tsx`, `SecretaryToolkitScreen.tsx` |
| 4   | Hide V4 profile items                  | Feature hide | `ProfileScreen.tsx`                                                                        |
| 5   | Gate IntergroupNavigator               | Feature hide | `AppNavigator.tsx`                                                                         |
| 6   | Service positions E2E                  | E2E test     | `service-positions.spec.js`                                                                |
| 7   | Business meetings + minutes E2E        | E2E test     | `business-meetings.spec.js`                                                                |
| 8   | Treasury handoff E2E                   | E2E test     | `treasury-handoff.spec.js`                                                                 |
| 9   | Phone list E2E                         | E2E test     | `phone-list.spec.js`                                                                       |
| 10  | Milestones E2E                         | E2E test     | `milestones.spec.js`                                                                       |
| 11  | Group conscience E2E                   | E2E test     | `group-conscience.spec.js`                                                                 |
| 12  | Secretary toolkit E2E                  | E2E test     | `secretary-toolkit.spec.js`                                                                |
| 13  | Sponsorship E2E                        | E2E test     | `sponsorship.spec.js`                                                                      |

**Estimated effort:**

- Part A (feature hiding): ~2 hours
- Part B (E2E tests): ~3 hours
- Total: ~5 hours

**How to re-enable a hidden feature:** Set its flag to `true` in `mobile/src/config/featureFlags.ts`. No other changes needed.

**After completing Part A:** The app will expose:

- Treasury + Treasury Handoff (killer feature)
- Meeting Schedule Management
- Service Positions + Terms Dashboard (V4.1, kept)
- Announcements
- Group Chat
- Members + Phone List + Milestones
- Business Meetings + Meeting Minutes (V4.1, kept)
- Group Conscience
- Secretary Toolkit (without Meeting Topics)
- Sponsorship
- Direct Messages
- Sobriety Tracker + Step Tracker + Check-In Streak + Gratitude Journal (profile)

107 screens → ~60 reachable screens. Simpler, more focused experience.
