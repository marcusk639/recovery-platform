# Navigation Migration Completion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Remove the legacy `NavigationService` class, compatibility layer, and migration scaffolding now that `App.tsx` already calls `improvedNavigationService` directly.

**Architecture:** `service.ts` becomes a thin file that exports only `navigationRef` and re-exports `improvedNavigationService` as default. `migration-utils.ts`, `MigrationControlPanel.tsx`, and `improved-app.tsx` are deleted. Import statements in 4 screens and `App.tsx` are cleaned up. `Routes.PriorAuth` is untouched — it is the legitimate auth stack name.

**Tech Stack:** TypeScript, React Native, React Navigation, Jest

---

## Context — What Is Where

| File | Current state | Planned state |
|---|---|---|
| `src/navigation/service.ts` | 339-line file with old `NavigationService` class, compat layer | ≤15 lines: just `navigationRef` + re-export |
| `src/navigation/migration-utils.ts` | `MigrationManager`, compat layer factory, rollout helpers | Deleted |
| `src/components/MigrationControlPanel.tsx` | Dev debug panel | Deleted |
| `src/improved-app.tsx` | Alternate App entry, never wired up | Deleted |
| `App.tsx` | Imports `migrationManager`/`logMigration` for debug logging | Remove those imports + 2 log calls |
| `src/navigation/index.tsx` | Exports `oldNavigationService` | Remove that export |
| `src/screens/Splash/Splash.tsx` | Imports + renders `MigrationControlPanel` | Remove import, state, button, and component |
| `src/screens/Login/LoginForm.tsx` line 17 | `import NavigationService from '../../navigation/service'` (unused) | Remove line |
| `src/screens/NewAccount/NewAccountForm.tsx` line 20 | `import NavigationService from '../../navigation/service'` (unused) | Remove line |
| `src/navigation/migration-plan.md` | Phases 2-5 unchecked | Mark all complete |

**Key constraint:** `navigationRef` must remain exported from `src/navigation/service.ts` — three files import it from there:
- `index.js` (root, connected to `<NavigationContainer>`)
- `src/state/slices/userSlice.ts`
- `src/screens/Login/LoginForm.tsx`

---

## Task 0: Write the failing test for `service.ts` new contract

**Files:**
- Create: `src/navigation/__tests__/service.test.ts`

This test will FAIL now (the default export is still the compat layer with no `getInitialNavigation`). It will PASS after Task 1 guts the file.

**Step 1: Create the test file**

```typescript
// src/navigation/__tests__/service.test.ts
//
// Verifies that service.ts exposes the improved navigation service as its
// default export and does NOT expose the legacy getInitialRoute API.

jest.mock('../../navigation/improved-navigation-service', () => ({
  __esModule: true,
  default: {
    getInitialNavigation: jest.fn(() => ({
      initialRoute: 'main',
      authInitialRoute: undefined,
      initialMainRoute: undefined,
    })),
    navigate: jest.fn(),
    reset: jest.fn(),
    goBack: jest.fn(),
    getCurrentRoute: jest.fn(),
  },
  navigationRef: { current: null },
  UserState: {},
  NavigationContext: {},
}));

jest.mock('@react-native-firebase/auth', () => () => ({
  currentUser: null,
}));

import NavigationService, { navigationRef } from '../service';

describe('service.ts — post-migration contract', () => {
  it('default export has getInitialNavigation (improved service API)', () => {
    expect(typeof NavigationService.getInitialNavigation).toBe('function');
  });

  it('default export does NOT have getInitialRoute (legacy API)', () => {
    expect((NavigationService as any).getInitialRoute).toBeUndefined();
  });

  it('default export does NOT have getInitialAuthRoute (legacy API)', () => {
    expect((NavigationService as any).getInitialAuthRoute).toBeUndefined();
  });

  it('exports navigationRef', () => {
    expect(navigationRef).toBeDefined();
  });
});
```

**Step 2: Run the test — verify it FAILS**

```bash
npx jest src/navigation/__tests__/service.test.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — default export is the compat layer which has `getInitialRoute` but not `getInitialNavigation` directly, or it fails to import. Either way it fails.

**Step 3: Commit the failing test**

```bash
git add src/navigation/__tests__/service.test.ts
git commit -m "test(navigation): Add failing contract test for post-migration service.ts"
```

---

## Task 1: Gut `service.ts` — make the test pass

**Files:**
- Modify: `src/navigation/service.ts`

**Step 1: Replace the entire file contents**

The new file keeps only:
1. `navigationRef` export (unchanged — still a `createRef` for the NavigationContainer)
2. Re-export `improvedNavigationService` as the default

```typescript
// src/navigation/service.ts
//
// Thin shim kept for backward-compat of `navigationRef` imports.
// The improved navigation service is the only service; the old
// NavigationService class and compatibility layer have been removed.

import { createRef } from 'react';
import { NavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from './types';
import ImprovedNavigationService from './improved-navigation-service';

export const navigationRef =
  createRef<NavigationContainerRef<RootStackParamList>>();

export default ImprovedNavigationService;
```

**Step 2: Run the contract test — verify it PASSES**

```bash
npx jest src/navigation/__tests__/service.test.ts --no-coverage 2>&1 | tail -15
```

Expected: PASS (4 tests).

**Step 3: Run the full suite — confirm nothing broke**

```bash
npx jest --no-coverage 2>&1 | tail -10
```

Expected: same pass count as before (688+ tests, 0 failures).

**Step 4: Commit**

```bash
git add src/navigation/service.ts
git commit -m "refactor(navigation): Remove legacy NavigationService class and compatibility layer from service.ts"
```

---

## Task 2: Clean up `App.tsx` — remove migration-utils usage

**Files:**
- Modify: `App.tsx`

**Context:** `App.tsx` imports `migrationManager` and `logMigration` from `migration-utils` for debug logging only. These are the only remaining callers of `migration-utils` outside of the files being deleted.

**Step 1: Remove the import block**

Find and delete lines 28-30:
```typescript
  migrationManager,
  logMigration,
} from './src/navigation/migration-utils';
```

The full import statement starts with `import {` — remove the entire block. After removing, ensure the preceding import (if any) is not left with a trailing comma or broken syntax.

**Step 2: Remove the two `logMigration` call blocks**

Delete this block (~line 128):
```typescript
  // Log migration status
  logMigration('App render called', {
    hasUser: !!user,
    hasInvitation: !!invitation,
    migrationConfig: migrationManager.getConfig(),
  });
```

Delete this block (~line 141):
```typescript
  logMigration('Navigation routes determined', {
    hasUser: !!user,
    hasInvitation: !!invitation,
    userIsAnonymous: user?.isAnonymous,
    userIsGuest: user?.isGuest,
    userIsAdmin: user?.isAdmin,
    userInfoEntered: user?.infoEntered,
    initialRoute,
    authInitialRoute,
    initialMainRoute,
    navigationKey,
  });
```

**Step 3: Run the full suite**

```bash
npx jest --no-coverage 2>&1 | tail -10
```

Expected: same pass count, 0 failures.

**Step 4: Commit**

```bash
git add App.tsx
git commit -m "refactor(navigation): Remove migration-utils logging from App.tsx"
```

---

## Task 3: Delete the three dead files

**Files:**
- Delete: `src/navigation/migration-utils.ts`
- Delete: `src/components/MigrationControlPanel.tsx`
- Delete: `src/improved-app.tsx`

**Step 1: Delete the files**

```bash
rm src/navigation/migration-utils.ts
rm src/components/MigrationControlPanel.tsx
rm src/improved-app.tsx
```

**Step 2: Run the full suite — confirm no remaining imports break anything**

```bash
npx jest --no-coverage 2>&1 | tail -10
```

Expected: same pass count, 0 failures.

If any test file imported from `migration-utils`, it will fail here. Fix by removing those imports. (The only known test that uses `enableGradualRollout` is `src/navigation/__tests__/migration.test.ts` — check it.)

```bash
grep -rn "migration-utils\|MigrationControlPanel\|improved-app" src --include="*.ts" --include="*.tsx" | grep -v "node_modules"
```

Expected: no output.

**Step 3: Commit**

```bash
git rm src/navigation/migration-utils.ts src/components/MigrationControlPanel.tsx src/improved-app.tsx
git commit -m "refactor(navigation): Delete migration-utils, MigrationControlPanel, and improved-app.tsx"
```

---

## Task 4: Clean up stale imports across 4 files

**Files:**
- Modify: `src/navigation/index.tsx`
- Modify: `src/screens/Splash/Splash.tsx`
- Modify: `src/screens/Login/LoginForm.tsx`
- Modify: `src/screens/NewAccount/NewAccountForm.tsx`

### 4a — `src/navigation/index.tsx`

Remove `oldNavigationService` from the export. Current file:

```typescript
export * from './types';
export {
  default as NavigationService,
  oldNavigationService,
  improvedNavigationService,
} from './service';
export * from './navigators';
```

New file:

```typescript
export * from './types';
export {
  default as NavigationService,
  improvedNavigationService,
} from './service';
export * from './navigators';
```

### 4b — `src/screens/Splash/Splash.tsx`

Remove line 27:
```typescript
import { MigrationControlPanel } from '../../components/MigrationControlPanel';
```

Remove line 70:
```typescript
const [showMigrationPanel, setShowMigrationPanel] = useState(false);
```

Remove the "Migration" button block (~lines 286-298):
```tsx
{__DEV__ && (
  <TouchableOpacity
    style={{
      position: 'absolute',
      top: 100,
      right: 20,
      backgroundColor: '#007AFF',
      padding: 10,
      borderRadius: 5,
    }}
    onPress={() => setShowMigrationPanel(true)}>
    <Text style={{ color: 'white', fontSize: 12 }}>Migration</Text>
  </TouchableOpacity>
)}
```

Remove the component usage (~lines 300-304):
```tsx
{__DEV__ && showMigrationPanel && (
  <MigrationControlPanel
    visible={showMigrationPanel}
    onClose={() => setShowMigrationPanel(false)}
  />
)}
```

### 4c — `src/screens/Login/LoginForm.tsx`

Remove line 17:
```typescript
import NavigationService from '../../navigation/service';
```

(`improvedNavigationService` on line 16 and `navigationRef` on line 19 stay.)

### 4d — `src/screens/NewAccount/NewAccountForm.tsx`

Remove line 20:
```typescript
import NavigationService from '../../navigation/service';
```

**Step 1: Make all 4 edits described above**

**Step 2: Run the full suite**

```bash
npx jest --no-coverage 2>&1 | tail -10
```

Expected: same pass count, 0 failures.

**Step 3: Verify no remaining references to the deleted items**

```bash
grep -rn "oldNavigationService\|MigrationControlPanel\|improved-app" src App.tsx --include="*.ts" --include="*.tsx" | grep -v "node_modules\|__tests__"
```

Expected: no output.

**Step 4: Commit**

```bash
git add src/navigation/index.tsx src/screens/Splash/Splash.tsx src/screens/Login/LoginForm.tsx src/screens/NewAccount/NewAccountForm.tsx
git commit -m "refactor(navigation): Remove stale legacy navigation imports from 4 files"
```

---

## Task 5: Update migration-plan.md and run final verification

**Files:**
- Modify: `src/navigation/migration-plan.md`

**Step 1: Mark all phases complete**

Replace the entire file with:

```markdown
# Navigation Migration Plan

## Overview

Migration from the legacy `NavigationService` class to `ImprovedNavigationService` is complete.

## Migration Steps

### Phase 1: Preparation ✅
- [x] Create improved navigation service
- [x] Create improved navigators
- [x] Create improved App.tsx
- [x] Create test utilities

### Phase 2: Backward Compatibility ✅
- [x] Compatibility layer created (since removed)
- [x] Feature flags added (since removed)

### Phase 3: Gradual Migration ✅
- [x] App.tsx uses ImprovedNavigationService directly
- [x] All stat screens migrated to new hooks
- [x] Navigation service.ts reduced to thin shim

### Phase 4: Testing & Validation ✅
- [x] Contract test for service.ts post-migration shape
- [x] 688+ unit tests passing

### Phase 5: Cleanup ✅
- [x] Deleted migration-utils.ts
- [x] Deleted MigrationControlPanel.tsx
- [x] Deleted improved-app.tsx
- [x] Removed oldNavigationService export
- [x] Removed stale imports from LoginForm, NewAccountForm, Splash, App
```

**Step 2: Run the full suite one final time**

```bash
npx jest --no-coverage 2>&1 | tail -10
```

Expected: all suites pass, 0 failures.

**Step 3: Final commit**

```bash
git add src/navigation/migration-plan.md
git commit -m "docs(navigation): Mark navigation migration complete in migration-plan.md"
```
