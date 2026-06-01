# Audit Wave — Follow-Up Items

This file tracks issues uncovered during the `fix/audit-wave-1` branch. Items marked **DONE** were resolved in-scope. Items marked **TODO** were deferred to keep the change set bounded.

## Mobile TypeScript — latent type errors

**Status:** mobile `tsc --noEmit` step in CI is currently `continue-on-error: true` to unblock npm-ci-level fixes. Re-enable as a blocking gate once the remaining 16 production errors are resolved.

**Why this happened:** CI was added 2026-05-22 but never produced a green run (the `npm ci` step blocked everything). During that window, `mobile/tsconfig.json` was updated to TS 5 options (`moduleResolution: "bundler"`, `allowImportingTsExtensions`) without bumping `typescript@4.8.4`. With CI now passing `npm ci` and TypeScript bumped to 5.4.5, ~52 latent errors became visible in production code; 37 were resolved by the victory-native downgrade (below), leaving 16.

### Resolved in this PR

| Files                                                                                                                        | Issue                                                                                                                                                                                                                                           | Fix applied                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GroupHealthDashboardScreen.tsx`, `TreasuryTrendsScreen.tsx`, `MyRecoveryJourneyScreen.tsx`, `AttendanceAnalyticsScreen.tsx` | `victory-native@41.x` (Skia rewrite) does not export `VictoryChart`, `VictoryBar`, `VictoryAxis`, `VictoryTheme`, `VictoryArea`, `VictoryGroup`. Those screens import the legacy v36 API which no longer exists. Charts would crash at runtime. | **DONE** — Downgraded `victory-native` to `^36.9.2` (last legacy-API release). 10 chart instances across 4 screens now match the installed API. Eliminated 37 of the 52 errors. |

**Future-state note:** the v41 / Skia API is blocked behind a React 19 upgrade (Skia v2 requires `react@>=19`; project is on `react@18.2.0`). If/when React 19 becomes viable, consider whether to migrate to `victory-native@41` Skia primitives or swap to `react-native-gifted-charts` (works on react 18, simpler API, actively maintained).

### ✅ Resolved (2026-05-27) — `tsc --noEmit` exits 0

| Files                                              | Fix applied                                                                                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/navigation/index.ts`                    | Removed duplicate `ManageRecurring` / `YearEndSummary` entries (lines 124–126)                                                      |
| `src/screens/meetings/MeetingFinderScreen.tsx`     | Removed `'Al-Anon'` and `'CA'` from `TYPE_CHIPS` (not in `MeetingType`); cast `selectedDay` to `keyof DaysAndTimes`                 |
| `src/screens/homegroup/SecretaryToolkitScreen.tsx` | Replaced `instanceof Date` ternary with `(x as any)?.toDate?.() ?? new Date(x as any)` to avoid `never`-branch narrowing            |
| `src/screens/profile/GratitudeJournalScreen.tsx`   | `fetchGratitudeEntries(30)` (added required arg); `saveGratitudeEntry(entries)` (removed spurious `{date, entries}` object wrapper) |
| `src/screens/profile/MyRecoveryJourneyScreen.tsx`  | Added `!` non-null assertion on `sobrietyStartDate` inside the guarded block                                                        |
| `src/store/slices/stepWorkSlice.ts`                | Imported `FirebaseFirestoreTypes` from `@react-native-firebase/firestore`; replaced `FirebaseFirestore.Timestamp`                   |
| `src/screens/intergroup/IntergroupSSOScreen.tsx`   | `Switch.onValueChange` handler uses `if` statement instead of `&&` short-circuit                                                    |
| `src/models/ReportModel.ts`                        | `input.groupId ?? undefined` (was `?? null`; field type is `string \| undefined`)                                                   |
| `mobile/tsconfig.json`                             | Added `exclude` array for test files (option 2 — production-only tsc check)                                                         |

### Re-enable as a blocking CI gate — ONE STEP REMAINING

All 16 production errors are resolved and test files are excluded. The only remaining action:

**Edit `.github/workflows/ci.yml`** and remove `continue-on-error: true` from the mobile `tsc --noEmit` step. This is tracked as **C-15** in [`docs/PRE_LAUNCH_CHECKLIST.md`](./PRE_LAUNCH_CHECKLIST.md).
