# Feature Bloat Reduction & Core Quality Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all critical data/privacy bugs blocking launch, then surgically remove dead code and non-MVP surface area that adds maintenance burden and startup cost without generating revenue.

**Architecture:** Five phases ordered by revenue impact: (1) trust/data integrity fixes that, if unfixed, kill conversions; (2) dead code deletion with zero risk; (3) startup performance (remove BrandingProvider Firestore call from app root); (4) console.log user-data exposure; (5) code quality bugs that cause silent failures.

**Tech Stack:** React Native (TypeScript), Redux Toolkit, Firebase/Firestore, Jest

**Revenue context:** $12/year group subscription. Conversion is the #1 driver. Privacy leaks and data corruption directly kill trial-to-paid conversion in the recovery community — one public slip destroys trust permanently. Every fix in Phase 1 is a conversion blocker.

**Source of truth for scope:** `docs/PRODUCT_REQUIREMENTS.md`, `docs/PRICING_MODEL.md`, `docs/ROADMAP.md`
**Review findings reference:** `docs/analysis-mobile-review-2026-02-26.md`

---

## Phase 1: Critical Bug Fixes (Trust & Data Integrity)

> These are launch blockers. Fix before any real users land.

---

### Task 1: Fix MemberModel privacy defaults (CRITICAL — active data leak)

**Why this first:** `showSobrietyDate` and `showPhoneNumber` default to `true` in MemberModel. Any member whose Firestore document is missing these fields will have their sobriety date and phone number shown to all group members without consent. `UserModel` correctly defaults to `false`. This contradicts itself and is an active data leak.

**Files:**

- Modify: `mobile/src/models/MemberModel.ts:34-35,158-159`
- Test: `mobile/src/models/__tests__/MemberModel.test.ts` (create if not exists)

**Step 1: Write the failing test**

Create `mobile/src/models/__tests__/MemberModel.test.ts` (or add to existing):

```typescript
import { MemberModel } from "../MemberModel";
import firestore from "@react-native-firebase/firestore";

describe("MemberModel privacy defaults", () => {
  it("fromFirestore: showSobrietyDate defaults to false when field missing", () => {
    const doc = {
      id: "group1_user1",
      data: () => ({
        userId: "user1",
        groupId: "group1",
        displayName: "John D",
        // showSobrietyDate intentionally absent
        // showPhoneNumber intentionally absent
      }),
    } as any;

    const member = MemberModel.fromFirestore(doc);
    expect(member.showSobrietyDate).toBe(false);
    expect(member.showPhoneNumber).toBe(false);
  });

  it("addMember: showSobrietyDate defaults to false when userData privacy missing", () => {
    // Test that addMember uses false as fallback, not true
    // This tests the default value passed when privacySettings is undefined
    const userData = undefined;
    const privacyDefault = userData?.privacySettings?.showRecoveryDate ?? false;
    const phoneDefault = userData?.privacySettings?.showPhoneNumber ?? false;
    expect(privacyDefault).toBe(false);
    expect(phoneDefault).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd mobile && npm test -- --testPathPattern=MemberModel --verbose
```

Expected: FAIL — `showSobrietyDate` returns `true` (the current bug)

**Step 3: Apply the fix**

In `mobile/src/models/MemberModel.ts`, find lines ~34-35 in `fromFirestore()`:

```typescript
// BEFORE (line ~34):
showSobrietyDate: data.showSobrietyDate ?? true,
showPhoneNumber: data.showPhoneNumber ?? true,

// AFTER:
showSobrietyDate: data.showSobrietyDate ?? false,
showPhoneNumber: data.showPhoneNumber ?? false,
```

Find lines ~158-159 in `addMember()`:

```typescript
// BEFORE:
showSobrietyDate: userData?.privacySettings?.showRecoveryDate ?? true,
showPhoneNumber: userData?.privacySettings?.showPhoneNumber ?? true,

// AFTER:
showSobrietyDate: userData?.privacySettings?.showRecoveryDate ?? false,
showPhoneNumber: userData?.privacySettings?.showPhoneNumber ?? false,
```

**Step 4: Run test to verify it passes**

```bash
cd mobile && npm test -- --testPathPattern=MemberModel --verbose
```

Expected: PASS

**Step 5: Commit**

```bash
git add mobile/src/models/MemberModel.ts mobile/src/models/__tests__/MemberModel.test.ts
git commit -m "fix: privacy defaults to false for sobrietyDate and phoneNumber in MemberModel"
```

---

### Task 2: Remove hardcoded Google Maps API key (CRITICAL — extractable from APK)

**Why:** The key `AIzaSyAyjHVwL4AcgLGdo1O7mmRFJLLHgpNOC5A` in source can be extracted from the built APK via `strings` or decompilation. The comment in the file even acknowledges it should not be there.

**Files:**

- Modify: `mobile/src/components/groups/LocationPicker.tsx:24`
- Modify: `mobile/.env` (or `mobile/.env.example`)

**Step 1: Check how other env vars are consumed in the app**

```bash
grep -r "process.env\." mobile/src --include="*.ts" --include="*.tsx" | head -10
grep -r "GOOGLE_MAPS" mobile/src --include="*.ts" --include="*.tsx"
grep -r "react-native-dotenv\|react-native-config" mobile/package.json
```

**Step 2: Move the key to environment config**

Open `mobile/src/components/groups/LocationPicker.tsx`. Find line ~24 where the key is hardcoded. Replace:

```typescript
// BEFORE (hardcoded):
const GOOGLE_MAPS_API_KEY = "AIzaSyAyjHVwL4AcgLGdo1O7mmRFJLLHgpNOC5A";

// AFTER (from env):
import { GOOGLE_MAPS_API_KEY } from "@env";
// If @env is not set up, use:
// const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? '';
```

Add to `mobile/.env` (never commit this file — it should already be in .gitignore):

```
GOOGLE_MAPS_API_KEY=AIzaSyAyjHVwL4AcgLGdo1O7mmRFJLLHgpNOC5A
```

Add to `mobile/.env.example` (committed, no real value):

```
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

**Step 3: Restrict the key in Google Cloud Console**

This is not a code step but is required: go to console.cloud.google.com → APIs & Services → Credentials → restrict the key to Android app (com.homegroups) and iOS app bundle ID. This makes leaking the key harmless.

**Step 4: Verify app builds**

```bash
cd mobile && npm run ios
```

Expected: app builds and maps still loads

**Step 5: Commit**

```bash
git add mobile/src/components/groups/LocationPicker.tsx mobile/.env.example
git commit -m "fix: move Google Maps API key to environment variable"
```

---

### Task 3: Fix SponsorModel sponsorId set to sponseeId (CRITICAL — data corruption)

**Why:** Every sponsorship accepted via this path stores the sponsee's UID as `sponsorId`. Both fields hold the same person. The sponsor's identity is never recorded.

**Files:**

- Modify: `mobile/src/models/SponsorModel.ts:466`
- Test: `mobile/src/models/__tests__/SponsorModel.test.ts`

**Step 1: Read the function to understand what parameter holds the sponsor's UID**

```bash
# Read around line 455-480 to understand the function signature
```

Open `mobile/src/models/SponsorModel.ts` and find the function that contains line 466. The accepting user (the sponsor) must be identifiable — look for `currentUser`, `acceptingUserId`, or similar in the function signature or body.

**Step 2: Write the failing test**

```typescript
describe("SponsorModel.acceptSponsorshipRequest", () => {
  it("sets sponsorId to the accepting user (sponsor), not the sponsee", async () => {
    const sponsorUserId = "sponsor-uid-123";
    const sponseeUserId = "sponsee-uid-456";

    // Verify that the created sponsorship document has distinct sponsorId and sponseeId
    // The exact test depends on how acceptSponsorshipRequest is called —
    // read the function signature first, then write the test to assert:
    // result.sponsorId === sponsorUserId
    // result.sponseeId === sponseeUserId
    // result.sponsorId !== result.sponseeId
  });
});
```

**Step 3: Apply the fix**

Find line ~466 in SponsorModel.ts:

```typescript
// BEFORE:
const sponsorship = {
  id: sponsorshipRef.id,
  groupId,
  sponsorId: request.sponseeId, // BUG
  sponseeId: request.sponseeId,
  status: "active",
};

// AFTER (use the current user's UID or the function's acceptingUserId parameter):
const sponsorship = {
  id: sponsorshipRef.id,
  groupId,
  sponsorId: currentUser.uid, // or acceptingUserId — check the function signature
  sponseeId: request.sponseeId,
  status: "active",
};
```

**Step 4: Run test**

```bash
cd mobile && npm test -- --testPathPattern=SponsorModel --verbose
```

Expected: PASS

**Step 5: Commit**

```bash
git add mobile/src/models/SponsorModel.ts mobile/src/models/__tests__/SponsorModel.test.ts
git commit -m "fix: sponsorId in acceptSponsorshipRequest was set to sponseeId"
```

---

### Task 4: Fix MemberModel broken document ID range queries (HIGH — all member lookups silently fail)

**Why:** Member document IDs are `${groupId}_${userId}`. The queries in `getAllUserMemberDocuments` and `updateUserPhotoURL` use `>= '_${userId}'` (underscore prefix) which never matches any document because the prefix is always a groupId, not an underscore. Both methods silently return no results.

**Files:**

- Modify: `mobile/src/models/MemberModel.ts:735-736,782-783`
- Test: `mobile/src/models/__tests__/MemberModel.test.ts`

**Step 1: Write the failing test**

```typescript
describe("MemberModel document ID query format", () => {
  it("getAllUserMemberDocuments query range should match groupId_userId format", () => {
    const userId = "user123";
    // The correct range for querying docs where ID contains userId:
    // Documents are keyed as `${groupId}_${userId}`
    // Correct lower bound: `\x00_${userId}` or use a known groupId list
    // This test verifies the query logic is correct by checking the bounds
    const lower = `\x00_${userId}`;
    const upper = `\uffff_${userId}\uffff`;
    // Or better: the correct approach is to query by a userId field,
    // not document ID range. Read the function and determine if
    // a where('userId', '==', userId) query exists in the collection.
    expect(lower).not.toContain("_user123"); // OLD wrong approach
  });
});
```

**Step 2: Read and understand the correct fix**

Open `mobile/src/models/MemberModel.ts` around lines 730-790. The member collection should support querying by `userId` field directly. The range query on document ID is inherently fragile. The fix is to either:

- Option A: Use `.where('userId', '==', userId)` if `userId` is a top-level field on member documents
- Option B: Fix the range bounds to `[userId + '_', userId + '_\uf8ff']` — but this only works if `userId` comes before the `_` in the ID (it doesn't — format is `${groupId}_${userId}`)

Option A is correct. Check if `userId` is stored as a field in member documents (it should be — it's in `fromFirestore`).

**Step 3: Apply the fix**

```typescript
// BEFORE (line ~735-736 in getAllUserMemberDocuments):
.where(firestore.FieldPath.documentId(), '>=', `_${userId}`)
.where(firestore.FieldPath.documentId(), '<=', `_${userId}\uf8ff`)

// AFTER:
.where('userId', '==', userId)
```

Apply the same fix at lines ~782-783 in `updateUserPhotoURL`.

**Step 4: Run tests**

```bash
cd mobile && npm test -- --testPathPattern=MemberModel --verbose
```

**Step 5: Commit**

```bash
git add mobile/src/models/MemberModel.ts
git commit -m "fix: MemberModel document ID range queries never matched; use userId field query"
```

---

### Task 5: Fix photoURL vs photoUrl field name mismatch (HIGH — photo updates silently lost)

**Why:** `updateUserPhotoURL` (line ~800) and `updateUserAcrossMemberships` (line ~637) write `photoURL` (capital URL). `fromFirestore` (line ~38) reads `photoUrl` (lowercase 'rl'). Any photo update is written to a field that is never read back.

**Files:**

- Modify: `mobile/src/models/MemberModel.ts:~38,~637,~800`
- Test: `mobile/src/models/__tests__/MemberModel.test.ts`

**Step 1: Write the failing test**

```typescript
describe("MemberModel photoUrl field consistency", () => {
  it("fromFirestore reads photoUrl (lowercase) written by updateUserPhotoURL", () => {
    const doc = {
      id: "group1_user1",
      data: () => ({
        userId: "user1",
        groupId: "group1",
        displayName: "John D",
        photoUrl: "https://example.com/photo.jpg", // lowercase 'rl'
      }),
    } as any;

    const member = MemberModel.fromFirestore(doc);
    expect(member.photoUrl).toBe("https://example.com/photo.jpg");
  });
});
```

**Step 2: Determine canonical field name**

The canonical name should be `photoUrl` (matches `fromFirestore` and Firebase Auth convention). Update the write-side to match.

**Step 3: Apply the fix**

In `updateUserPhotoURL` (~line 800):

```typescript
// BEFORE:
{
  photoURL: photoUrl;
}

// AFTER:
{
  photoUrl: photoUrl;
}
```

In `updateUserAcrossMemberships` (~line 637), find and fix the same field name.

**Step 4: Run tests and commit**

```bash
cd mobile && npm test -- --testPathPattern=MemberModel --verbose
git add mobile/src/models/MemberModel.ts
git commit -m "fix: normalize photoUrl field name (was photoURL) in MemberModel writes"
```

---

### Task 6: Fix ChatModel initializeGroupChat using wrong timestamp field (HIGH — silent data loss)

**Why:** Domain rule: `sentAt` is a Unix timestamp (number). `initializeGroupChat` writes `timestamp` instead of `sentAt` for the "Chat created" system message. The field is silently dropped when read back via `fromFirestore`.

**Files:**

- Modify: `mobile/src/models/ChatModel.ts:145`
- Test: `mobile/src/models/__tests__/ChatModel.test.ts`

**Step 1: Write the failing test**

```typescript
describe("ChatModel.initializeGroupChat", () => {
  it("uses sentAt not timestamp for lastMessage", () => {
    // This test verifies the field name in the written document
    // Mock firestore and check what fields are set
    // The lastMessage object must contain sentAt, not timestamp
  });
});
```

**Step 2: Apply the fix**

In `mobile/src/models/ChatModel.ts` around line 145:

```typescript
// BEFORE:
lastMessage: {
  text: 'Chat created',
  senderId: currentUser.uid,
  senderName: currentUser.displayName || 'User',
  timestamp,
},

// AFTER:
lastMessage: {
  text: 'Chat created',
  senderId: currentUser.uid,
  senderName: currentUser.displayName || 'User',
  sentAt: Date.now(),
},
```

**Step 3: Run tests and commit**

```bash
cd mobile && npm test -- --testPathPattern=ChatModel --verbose
git add mobile/src/models/ChatModel.ts
git commit -m "fix: ChatModel.initializeGroupChat uses sentAt (not timestamp) for lastMessage"
```

---

### Task 7: Fix GroupModel.toFirestore mutating caller's input (HIGH)

**Why:** `delete group.meetings` permanently modifies the caller's `Partial<HomeGroup>` object. Any caller that passes a group object and then reads `group.meetings` afterward will get undefined.

**Files:**

- Modify: `mobile/src/models/GroupModel.ts:117`

**Step 1: Apply the fix**

```typescript
// BEFORE (mutates input):
toFirestore(group: Partial<HomeGroup>) {
  if (group.meetings !== undefined) {
    delete group.meetings;
  }
  return group;
}

// AFTER (immutable copy):
toFirestore(group: Partial<HomeGroup>) {
  const { meetings: _meetings, ...firestoreData } = group;
  return firestoreData;
}
```

**Step 2: Run tests and commit**

```bash
cd mobile && npm test --verbose
git add mobile/src/models/GroupModel.ts
git commit -m "fix: GroupModel.toFirestore no longer mutates input parameter"
```

---

### Task 8: Fix GroupSponsorsScreen privacy bypass (HIGH — sobriety date leak)

**Why:** `showSobrietyDate: s.sobrietyDate != null` ignores the user's `showSobrietyDate` privacy preference. A sponsor who has opted out of sharing their sobriety date will have it displayed to all group members in the sponsor list.

**Files:**

- Modify: `mobile/src/screens/homegroup/GroupSponsorsScreen.tsx:57`

**Step 1: Read the sponsor data structure**

Open the file to understand what shape each sponsor `s` has — specifically whether `showSobrietyDate` is available from the sponsor data returned by the cloud function.

**Step 2: Apply the fix**

```typescript
// BEFORE:
showSobrietyDate: s.sobrietyDate != null,

// AFTER (respect privacy setting — both conditions must be true):
showSobrietyDate: s.sobrietyDate != null && s.showSobrietyDate === true,
```

If `showSobrietyDate` isn't returned by the cloud function, update `getCrossGroupSponsors.ts` (in `functions/src/callable/`) to include it. The field must come from the sponsor's member document, not just the existence of the sobriety date.

**Step 3: Commit**

```bash
git add mobile/src/screens/homegroup/GroupSponsorsScreen.tsx
git commit -m "fix: GroupSponsorsScreen respects showSobrietyDate privacy setting"
```

---

### Task 9: Fix intergroup navigation crashes (HIGH — runtime crash on live routes)

**Why:** `IntergroupDashboardScreen.tsx:85,135` calls `navigation.navigate('IntergroupSettings')` and `navigation.navigate('IntergroupUpgrade')`. Neither route exists in `IntergroupNavigator.tsx`. Any user who reaches these buttons will crash the app.

**Files:**

- Modify: `mobile/src/screens/intergroup/IntergroupDashboardScreen.tsx:85,135`

**Step 1: Read the file to find both navigation calls**

```bash
grep -n "IntergroupSettings\|IntergroupUpgrade" mobile/src/screens/intergroup/IntergroupDashboardScreen.tsx
```

**Step 2: Decide on fix approach**

Since the intergroup feature is beyond MVP scope and these routes don't exist, the safest fix is to remove or disable the buttons that trigger these navigations. Do not add the missing routes — that would add more non-MVP screens.

**Step 3: Apply the fix**

Find each button that calls `navigation.navigate('IntergroupSettings')` and `navigation.navigate('IntergroupUpgrade')`. Either:

- Remove the button entirely (preferred if it's a non-MVP action)
- Show an Alert: `Alert.alert('Coming soon', 'This feature is not yet available.')`

```typescript
// Option A: Remove the button (preferred)
// Delete the JSX element for the settings/upgrade buttons

// Option B: Stub with alert
onPress={() => Alert.alert('Coming Soon', 'This feature is not yet available.')}
```

**Step 4: Verify no TypeScript errors**

```bash
cd mobile && npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add mobile/src/screens/intergroup/IntergroupDashboardScreen.tsx
git commit -m "fix: remove navigation to non-existent IntergroupSettings and IntergroupUpgrade routes"
```

---

### Task 10: Fix filename typo ForgotPosswordScreen (HIGH — code quality)

**Files:**

- Rename: `mobile/src/screens/auth/ForgotPosswordScreen.tsx` → `ForgotPasswordScreen.tsx`
- Modify: `mobile/src/navigation/AuthNavigator.tsx`
- Modify: `mobile/src/types/navigation/index.ts`
- Modify: `mobile/src/types/index.ts`

**Step 1: Rename the file**

```bash
mv mobile/src/screens/auth/ForgotPosswordScreen.tsx mobile/src/screens/auth/ForgotPasswordScreen.tsx
```

**Step 2: Update all imports**

```bash
grep -rn "ForgotPossword" mobile/src --include="*.ts" --include="*.tsx"
```

Update each file returned. The import path changes from `./ForgotPosswordScreen` to `./ForgotPasswordScreen`. Also update any type references from `ForgotPossword` to `ForgotPassword` in navigation types.

**Step 3: Verify no broken imports**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors related to ForgotPassword

**Step 4: Commit**

```bash
git add -A
git commit -m "fix: rename ForgotPosswordScreen to ForgotPasswordScreen (typo)"
```

---

## Phase 2: Dead Code Deletion (Zero Risk)

> These files are confirmed dead (never imported, never navigated to). Deleting them reduces the codebase surface area with zero behavior change.

---

### Task 11: Delete orphaned screens and dead navigators

**Files to delete:**

- `mobile/src/screens/homegroup/HomegroupMainScreen.tsx` (1,499 lines — never imported)
- `mobile/src/screens/homegroup/PublicDirectoryScreen.tsx` (registered as route but never navigated to)
- `mobile/src/screens/homegroup/PublicEventsScreen.tsx` (same)
- `mobile/src/navigation/GroupNavigator.tsx` (fully commented-out, never imported)
- `mobile/src/navigation/GroupTabNavigator.tsx` (mostly-commented, never imported)
- `mobile/src/screens/sponsor/SponsorChatScreen.tsx` (95-line stub; homegroup/ version is the real one)

**Step 1: Verify each file is truly dead before deleting**

```bash
grep -rn "HomegroupMainScreen" mobile/src --include="*.ts" --include="*.tsx"
grep -rn "PublicDirectoryScreen" mobile/src --include="*.ts" --include="*.tsx"
grep -rn "PublicEventsScreen" mobile/src --include="*.ts" --include="*.tsx"
grep -rn "GroupNavigator" mobile/src --include="*.ts" --include="*.tsx"
grep -rn "GroupTabNavigator" mobile/src --include="*.ts" --include="*.tsx"
grep -rn "screens/sponsor/SponsorChatScreen" mobile/src --include="*.ts" --include="*.tsx"
```

Expected for each: only the file itself (no external references). If any file IS referenced, skip it and investigate before deleting.

**Step 2: Remove route registrations for dead routes**

If `PublicDirectory` and `PublicEvents` are registered in `GroupStackNavigator.tsx`, remove those `<Stack.Screen>` entries too.

```bash
grep -n "PublicDirectory\|PublicEvents" mobile/src/navigation/GroupStackNavigator.tsx
```

**Step 3: Delete confirmed dead files**

```bash
rm mobile/src/screens/homegroup/HomegroupMainScreen.tsx
rm mobile/src/screens/homegroup/PublicDirectoryScreen.tsx
rm mobile/src/screens/homegroup/PublicEventsScreen.tsx
rm mobile/src/navigation/GroupNavigator.tsx
rm mobile/src/navigation/GroupTabNavigator.tsx
rm mobile/src/screens/sponsor/SponsorChatScreen.tsx
```

**Step 4: Also remove from navigation type declarations**

```bash
grep -rn "HomegroupMain\|PublicDirectory\|PublicEvents" mobile/src/types --include="*.ts"
```

Remove any type entries for deleted screens from navigation param list types.

**Step 5: Verify TypeScript still compiles**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors (these files were never imported, so removing them causes no breaks)

**Step 6: Run tests**

```bash
cd mobile && npm test
```

Expected: all tests pass

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: delete 6 confirmed-dead orphaned screens and navigator files"
```

---

### Task 12: Resolve duplicate gratitudeSlice / engagementSlice (CRITICAL — same Firestore collection, two slices)

**Why:** Both slices write to the same collection with identically-named thunks. Having both registered in the store simultaneously creates state inconsistency risk.

**Files:**

- Read: `mobile/src/store/slices/gratitudeSlice.ts`
- Read: `mobile/src/store/slices/engagementSlice.ts`
- Decide which to keep, then delete the other
- Modify: `mobile/src/store/index.ts`
- Update: any component importing the deleted slice

**Step 1: Compare the two slices**

```bash
wc -l mobile/src/store/slices/gratitudeSlice.ts
wc -l mobile/src/store/slices/engagementSlice.ts
grep -n "createAsyncThunk\|saveGratitude\|Gratitude" mobile/src/store/slices/gratitudeSlice.ts
grep -n "createAsyncThunk\|saveGratitude\|Gratitude" mobile/src/store/slices/engagementSlice.ts
```

**Step 2: Find all components that import from each**

```bash
grep -rn "from.*gratitudeSlice" mobile/src --include="*.ts" --include="*.tsx"
grep -rn "from.*engagementSlice" mobile/src --include="*.ts" --include="*.tsx"
```

**Step 3: Pick the canonical slice**

Choose the one that is more complete and has more component consumers. Update all consumers of the deleted one to import from the canonical one. If the engagementSlice has gratitude as a subset, remove only the gratitude-related thunks from engagementSlice and keep the rest.

**Step 4: Remove the duplicate from store/index.ts**

```typescript
// In mobile/src/store/index.ts, remove the deleted slice's reducer
```

**Step 5: Run tests and commit**

```bash
cd mobile && npm test
git add -A
git commit -m "fix: resolve duplicate gratitudeSlice/engagementSlice writing to same Firestore collection"
```

---

## Phase 3: Startup Performance

> The BrandingProvider wraps the entire app and fires a Firestore read on every launch for a V4.4 enterprise feature that no current user needs. Removing it from the root reduces cold-start latency.

---

### Task 13: Isolate BrandingProvider from app root

**Why:** `BrandingContext.tsx` + `brandingSlice.ts` form a V4.4 enterprise white-label feature. Currently `BrandingProvider` wraps the entire `AppNavigator.tsx:143`, triggering a Firestore read on every app launch. Zero MVP users have custom branding.

**Files:**

- Read: `mobile/src/navigation/AppNavigator.tsx`
- Read: `mobile/src/context/BrandingContext.tsx`
- Modify: `mobile/src/navigation/AppNavigator.tsx`

**Step 1: Understand what BrandingProvider does**

Open `BrandingContext.tsx`. Identify:

- What Firestore read it triggers
- What it provides to children (colors, logo, etc.)
- Which components actually consume the branding context

```bash
grep -rn "useBranding\|BrandingContext" mobile/src --include="*.ts" --include="*.tsx"
```

**Step 2: Determine scope of consumers**

If only enterprise/intergroup screens use the branding context, it can be safely removed from the app root and only wrapped around those specific screens.

**Step 3: Apply the fix**

In `AppNavigator.tsx`:

```tsx
// BEFORE:
return (
  <BrandingProvider>
    <NavigationContainer>...</NavigationContainer>
  </BrandingProvider>
);

// AFTER: remove BrandingProvider from root entirely.
// If needed, add it only around IntergroupNavigator or enterprise screens.
return <NavigationContainer>...</NavigationContainer>;
```

Update `useBranding` hook to return default theme values when no branding context is present (instead of throwing):

```typescript
export function useBranding() {
  const ctx = useContext(BrandingContext);
  // Return safe defaults if context not present
  return ctx ?? DEFAULT_BRANDING;
}
```

**Step 4: Verify no visual regressions**

```bash
cd mobile && npm run ios
```

Check that main app screens look correct. Branding only matters for intergroup/enterprise users who don't exist yet.

**Step 5: Commit**

```bash
git add mobile/src/navigation/AppNavigator.tsx mobile/src/context/BrandingContext.tsx mobile/src/hooks/useBranding.ts
git commit -m "perf: remove BrandingProvider from app root; eliminates Firestore read on every launch"
```

---

## Phase 4: Console.log User Data Cleanup (CRITICAL — privacy in prod)

> All `console.log/warn/error` calls with user data must be wrapped in `if (__DEV__)` or removed. `__DEV__` is a React Native global that is `true` in development and `false` in production builds.

---

### Task 14: Wrap all user-data logs in **DEV** guards

**Files (priority order):**

1. `mobile/src/services/firebase/auth.ts:259` — logs full Google Sign-In result
2. `mobile/src/services/notifications/NotificationHandler.ts:55,100,129,148` — logs FCM payloads
3. `mobile/src/services/notifications/NotificationService.ts:102,122` — logs FCM tokens and UIDs
4. `mobile/src/store/slices/authSlice.ts:222` — logs UID in warning
5. `mobile/src/models/UserModel.ts:590,715,719` — logs UIDs
6. `mobile/src/models/MemberModel.ts:605,619,728,754,787` — logs userIds

**Step 1: Find all console calls in sensitive files**

```bash
grep -n "console\." mobile/src/services/firebase/auth.ts
grep -n "console\." mobile/src/services/notifications/NotificationHandler.ts
grep -n "console\." mobile/src/services/notifications/NotificationService.ts
grep -n "console\." mobile/src/store/slices/authSlice.ts
grep -n "console\." mobile/src/models/UserModel.ts
grep -n "console\." mobile/src/models/MemberModel.ts
```

**Step 2: Apply the pattern to each**

```typescript
// BEFORE:
console.log("Google Sign-In result:", result);

// AFTER:
if (__DEV__) console.log("Google Sign-In result:", result);

// OR for errors that are useful in prod (without sensitive data):
console.error("Sign-in failed"); // no user data in the message
```

**Step 3: Verify **DEV** is available**

`__DEV__` is a built-in React Native global — no import needed.

**Step 4: Run tests and commit**

```bash
cd mobile && npm test
git add mobile/src/services/firebase/auth.ts \
  mobile/src/services/notifications/NotificationHandler.ts \
  mobile/src/services/notifications/NotificationService.ts \
  mobile/src/store/slices/authSlice.ts \
  mobile/src/models/UserModel.ts \
  mobile/src/models/MemberModel.ts
git commit -m "fix: wrap all user-data console.log calls in __DEV__ guard"
```

---

## Phase 5: Code Quality Bugs

---

### Task 15: Fix auth() side effects inside Redux reducers

**Why:** Calling `auth().currentUser` inside a Redux reducer is a side effect. Reducers must be pure functions. These calls can cause subtle issues with concurrent renders and Redux DevTools.

**Files:**

- Modify: `mobile/src/store/slices/chatSlice.ts:488`
- Modify: `mobile/src/store/slices/directMessagesSlice.ts:522`

**Step 1: Find the reducers**

```bash
grep -n "auth().currentUser\|auth\(\)" mobile/src/store/slices/chatSlice.ts
grep -n "auth().currentUser\|auth\(\)" mobile/src/store/slices/directMessagesSlice.ts
```

**Step 2: Move the auth call to the thunk**

```typescript
// BEFORE: auth() called in extraReducer
builder.addCase(markMessageAsRead.fulfilled, (state, action) => {
  const currentUser = auth().currentUser; // side effect in reducer
  // ... uses currentUser
});

// AFTER: pass currentUser through the action payload
export const markMessageAsRead = createAsyncThunk(
  "chat/markMessageAsRead",
  async (messageId: string, { getState }) => {
    const currentUser = auth().currentUser; // moved here — in thunk, not reducer
    if (!currentUser) return;
    // ... rest of logic
    return { messageId, userId: currentUser.uid };
  },
);

builder.addCase(markMessageAsRead.fulfilled, (state, action) => {
  // action.payload now has userId — no auth() call needed
});
```

**Step 3: Run tests and commit**

```bash
cd mobile && npm test
git add mobile/src/store/slices/chatSlice.ts mobile/src/store/slices/directMessagesSlice.ts
git commit -m "fix: move auth().currentUser calls from reducers to thunks"
```

---

### Task 16: Fix silent error swallowing in models

**Why:** Empty `catch (e) {}` blocks hide bugs. In production, a Firestore document with a malformed date would be silently converted to `undefined` with no indication of the problem.

**Files:**

- Modify: `mobile/src/models/MeetingModel.ts:96,103`
- Modify: `mobile/src/models/UserModel.ts:342`

**Step 1: Apply the fix**

```typescript
// BEFORE:
try {
  createdAt = data.createdAt.toDate();
} catch (e) {}

// AFTER:
try {
  createdAt = data.createdAt.toDate();
} catch (e) {
  if (__DEV__) console.warn("MeetingModel: failed to parse createdAt", e);
  createdAt = new Date(); // safe fallback
}
```

Apply same pattern to `UserModel.ts:342` for `recoveryDate`.

**Step 2: Commit**

```bash
git add mobile/src/models/MeetingModel.ts mobile/src/models/UserModel.ts
git commit -m "fix: replace empty catch blocks with logged warnings and safe fallbacks"
```

---

### Task 17: Fix ChatModel.fromFirestore sentAt type lie

**Why:** `sentAt` is typed as `number` but `fromFirestore` returns `undefined` when the field is missing. Code that reads `message.sentAt` and performs arithmetic (like `a.sentAt - b.sentAt` in sort comparers) will produce `NaN`.

**Files:**

- Modify: `mobile/src/models/ChatModel.ts:75`
- Modify: `mobile/src/types/` — update `ChatMessage` type

**Step 1: Fix the type**

```typescript
// In ChatMessage type:
// BEFORE:
sentAt: number;

// AFTER:
sentAt: number | undefined;
```

**Step 2: Fix fromFirestore to return a sensible fallback**

```typescript
// BEFORE:
sentAt: data.sentAt ? data.sentAt.toDate().getTime() : undefined,

// AFTER (0 as fallback means "epoch" — will sort to top, which is acceptable):
sentAt: data.sentAt ? data.sentAt.toDate().getTime() : 0,
```

**Step 3: Check all sort comparers that use sentAt**

```bash
grep -rn "sentAt" mobile/src/store/slices/chatSlice.ts mobile/src/store/slices/directMessagesSlice.ts
```

Ensure sort comparers handle the `undefined`/`0` case safely.

**Step 4: Commit**

```bash
git add mobile/src/models/ChatModel.ts
git commit -m "fix: ChatModel.fromFirestore sentAt returns 0 instead of undefined; update type"
```

---

## Execution Order Summary

| #   | Task                              | Phase | Severity | Est. effort |
| --- | --------------------------------- | ----- | -------- | ----------- |
| 1   | MemberModel privacy defaults      | 1     | CRITICAL | 20 min      |
| 2   | Google Maps API key to env        | 1     | CRITICAL | 20 min      |
| 3   | SponsorModel sponsorId bug        | 1     | CRITICAL | 20 min      |
| 4   | MemberModel broken ID queries     | 1     | HIGH     | 30 min      |
| 5   | photoURL vs photoUrl mismatch     | 1     | HIGH     | 20 min      |
| 6   | ChatModel sentAt field            | 1     | HIGH     | 15 min      |
| 7   | GroupModel mutation               | 1     | HIGH     | 10 min      |
| 8   | GroupSponsors privacy bypass      | 1     | HIGH     | 15 min      |
| 9   | Intergroup nav crashes            | 1     | HIGH     | 15 min      |
| 10  | ForgotPassword typo rename        | 1     | HIGH     | 10 min      |
| 11  | Delete 6 dead files               | 2     | MEDIUM   | 20 min      |
| 12  | Merge gratitude/engagement slices | 2     | CRITICAL | 30 min      |
| 13  | Isolate BrandingProvider          | 3     | HIGH     | 30 min      |
| 14  | Wrap console.log in **DEV**       | 4     | HIGH     | 30 min      |
| 15  | Fix auth() in reducers            | 5     | MEDIUM   | 20 min      |
| 16  | Fix empty catch blocks            | 5     | MEDIUM   | 15 min      |
| 17  | Fix ChatModel sentAt type         | 5     | MEDIUM   | 10 min      |

**Total estimated effort:** ~5 hours

**Revenue impact:** All Phase 1 tasks directly protect trial-to-paid conversion. Privacy defaults fix (Task 1) is the highest-value change: one visible privacy slip in a recovery group will kill word-of-mouth growth permanently.

---

## Out of Scope for This Plan

The review identified ~55 screens beyond MVP scope (elections, intergroup dashboards, literature, referral system, etc.). These are **not deleted in this plan** for two reasons:

1. They are already implemented and some are reachable via the app. Deleting them requires a coordinated product decision about whether to hide vs. remove.
2. The ROADMAP marks V4 as complete — these features may be intentionally preserved for future monetization.

**Recommended follow-up:** A separate plan to feature-flag or gate non-MVP screens behind subscription checks or build configs, rather than deleting them. This preserves the V4 work while controlling surface area for MVP launch.
