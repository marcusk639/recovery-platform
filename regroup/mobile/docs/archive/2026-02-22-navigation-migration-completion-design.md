# Navigation Migration Completion — Design

**Date:** 2026-02-22

## Goal

Remove the legacy `NavigationService` class, compatibility layer, and associated migration scaffolding now that `App.tsx` fully uses `ImprovedNavigationService` directly.

## Context

`App.tsx` and `LoginForm.tsx` already call `improvedNavigationService.getInitialNavigation()` directly. The old `NavigationService` class, `MigrationManager`, compatibility layer, and `MigrationControlPanel` are dead code. `Routes.PriorAuth` is **not** legacy — it is the legitimate auth stack navigator name and is kept.

## Approach: Gut `service.ts`, delete scaffolding files

Chosen over full consolidation of `navigationRef` to minimize blast radius. All `navigationRef` consumers (`index.js`, `userSlice.ts`, `LoginForm.tsx`) continue importing from `service.ts` without change.

## Changes

### Delete entirely
- `src/navigation/migration-utils.ts`
- `src/components/MigrationControlPanel.tsx`
- `src/improved-app.tsx`

### Gut and replace
- `src/navigation/service.ts` — delete `NavigationService` class, `oldNavigationService`, and `createCompatibilityLayer` call. Keep only `navigationRef` export and re-export `improvedNavigationService` as default.

### Clean up imports/usage
- `src/navigation/index.tsx` — remove `oldNavigationService` from exports
- `src/screens/Splash/Splash.tsx` — remove `MigrationControlPanel` import and JSX usage
- `src/screens/Login/LoginForm.tsx` — remove unused `import NavigationService from '../../navigation/service'`
- `src/screens/NewAccount/NewAccountForm.tsx` — remove unused `import NavigationService from '../../navigation/service'`
- `src/navigation/migration-plan.md` — mark all phases complete

### Add test
- Confirm `service.ts` default export has `getInitialNavigation` and does not expose `getInitialRoute`.

## What Does Not Change
- `Routes.PriorAuth`, `linking.ts`, `navigators.tsx`, `types.ts` — route definitions untouched
- `improved-navigation-service.ts` — the live service, no changes
- All existing tests — already passing

## Success Criteria
- All 688 unit tests pass after changes
- No imports of `oldNavigationService` remain
- No imports of `migration-utils` remain outside of tests
- `MigrationControlPanel` is gone from Splash screen
- `service.ts` is ≤15 lines
