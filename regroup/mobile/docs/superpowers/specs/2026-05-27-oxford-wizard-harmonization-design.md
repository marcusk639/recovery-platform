# Oxford ↔ Traditional Setup Wizard Harmonization — Design Spec

**Date:** 2026-05-27
**Status:** Approved (pending user spec review before plan generation)
**Scope:** Regroup only
**Author:** Marcus Klein + Claude (brainstorming session)

---

## Source of Truth

This design supersedes / extends:

- `docs/superpowers/plans/2026-05-25-oxford-onboarding-wizard.md` — Tasks 1–4 of that plan are already merged (`77027f1`, `30df8f2`, `247faf6`); Tasks 5–9 are **explicitly deferred** from this work as a separate follow-up. This spec is **net-new scope** that surfaced from the audit finding that the existing Oxford wizard had drifted from the conventions used by `OperatorSetupWizard`.
- `docs/prompt-answers/docs-to-roadmap-05-25-2026-rats.md` — listed Oxford onboarding wizard as P1.9.

---

## Problem Statement

The existing Oxford onboarding wizard (`src/screens/Oxford/OxfordOnboardingWizard.tsx`, merged in commits `77027f1` / `30df8f2` / `247faf6`) shipped without referencing the conventions established by the traditional house setup wizard (`src/screens/SetupWizards/OperatorSetupWizard.tsx`). Eight distinct UX/structural axes diverge between the two. Some of Traditional's patterns are real wins Oxford lacks; some of Oxford's patterns are real wins Traditional should adopt. The result is two screen families that should feel identical but feel materially different to users moving between them.

This spec defines a **bidirectional harmonization**: extract the common winning patterns into shared components, refactor both wizards to use them, and document the conventions for future wizard work.

---

## Divergence Map (current state)

| Aspect              | Traditional (`OperatorSetupWizard`)                                     | Oxford (current)                          | Resolution                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Step indicator      | `RatsSetupStepIndicator` — icon + label per step                        | Plain progress dots (no labels)           | **New `RatsWizardProgress`**: hybrid dots + `Step N of M · <label>`                                                                  |
| Step transition     | `ViewPager` (slide animations) via fragile GitHub-fork dep              | `useState(step)` (no animation)           | **New `RatsWizardSlide`**: Reanimated 2.x slide; drops `react-native-best-viewpager` dependency                                      |
| Per-step header     | Inline `SetupHeader` (lines 70–97 of OperatorSetupWizard)               | Minimal `ScreenHeader` (just back button) | Adopt the **canonical `src/components/setup-header/index.tsx`** (richer card with `BoxedIcon` + title + description) in both wizards |
| Button row          | Inline `SetupButtons` (lines 24–68 of OperatorSetupWizard)              | Single full-width `RatsButton`            | **Extract `SetupButtons` to `src/components/setup-buttons/`** so both wizards can import                                             |
| Safe area           | `SafeAreaView` from `react-native-safe-area-context`                    | Plain `View` (clips notch/home-indicator) | Oxford ← Traditional                                                                                                                 |
| Style organization  | Externalized `OperatorSetupWizardStyles.ts`                             | Inline `StyleSheet.create()` colocation   | Traditional ← Oxford; delete the styles file                                                                                         |
| Validation feedback | `rightDisabled` prop on Next button                                     | `Alert.alert()` after invalid tap         | Oxford ← Traditional; `Alert.alert` reserved for genuinely async errors (mutation failures)                                          |
| Keyboard listener   | Inline `useEffect` (lines 107–125 of OperatorSetupWizard) with iOS hack | None                                      | Extract to **`src/hooks/useKeyboardVisible.ts`**; both wizards reuse                                                                 |

---

## Decision Log (from clarifying questions)

| #   | Decision                                                                                      | Rationale                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Bidirectional cherry-pick** of wins between wizards                                         | Each wizard has real wins; making both converge on best-of-both produces one canonical pattern going forward                                        |
| 2   | **Hybrid dots + current-step label** (componentized as `RatsWizardProgress`)                  | Scales to any step count; tells user _where_ they are without dominating screen height; smallest visual footprint while informative                 |
| 3   | **Reanimated slide animation** (componentized as `RatsWizardSlide`)                           | `react-native-reanimated 2.17.0` already a dep; drops fragile GitHub-fork `react-native-best-viewpager`; same user-facing slide feel as Traditional |
| 4   | **Harmonization only** scope — defer Tasks 5–7 (test expansion) + 9 (CI gate) from prior plan | Smaller, more reviewable PR; test rot work is parallel, not blocking                                                                                |
| 5   | **Hybrid documentation**: spec + standalone pattern doc + JSDoc                               | Spec for PR reviewers; pattern doc for future engineers building wizard #3; JSDoc for IDE discovery                                                 |

---

## Architecture

### Strategy: Component-first roll-out (3 commits)

Each commit is independently revert-safe. Bug found in `RatsWizardSlide` mid-rollout can be reverted at the swap commit without losing component code.

| Commit                    | Touches                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| **C1: Shared components** | All net-new components + extracted hook                                                  |
| **C2: Oxford swap**       | `OxfordOnboardingWizard.tsx` + its test file (assertions updated, coverage not expanded) |
| **C3: Traditional swap**  | `OperatorSetupWizard.tsx` + 5 step components + delete styles file + update test file    |

### New shared components (`src/components/`)

#### `RatsWizardProgress`

```tsx
// src/components/rats-wizard-progress/index.tsx
interface RatsWizardProgressProps {
  stepCount: number; // e.g. 5
  currentStep: number; // 0-indexed
  currentLabel?: string; // e.g. "Officers" — if omitted, shows "Step N of M"
  testID?: string;
}
```

Renders:

```
●  ●  ○  ○  ○
Step 2 of 5 · Officers
```

#### `RatsWizardSlide`

```tsx
// src/components/rats-wizard-slide/index.tsx
interface RatsWizardSlideProps {
  currentStep: number; // 0-indexed; component derives direction from prev step
  children: ReactNode[]; // one child per step; only active renders
  testID?: string;
}
```

Implementation sketch:

```tsx
const translateX = useSharedValue(0);

useEffect(() => {
  translateX.value = withTiming(-currentStep * SCREEN_WIDTH, {
    duration: 250,
    easing: Easing.out(Easing.cubic),
  });
}, [currentStep]);

const slideStyle = useAnimatedStyle(() => ({
  transform: [{ translateX: translateX.value }],
}));

return (
  <Animated.View style={[styles.row, slideStyle]}>
    {children.map((child, i) => (
      <View key={i} style={{ width: SCREEN_WIDTH }}>
        {child}
      </View>
    ))}
  </Animated.View>
);
```

#### `SetupButtons` (extracted from `OperatorSetupWizard.tsx:24`)

```tsx
// src/components/setup-buttons/index.tsx
interface SetupButtonsProps {
  onBackPress: () => void;
  onNextPress: () => void;
  backLabel?: string; // default "Back"
  nextLabel?: string; // default "Next"
  nextDisabled?: boolean; // replaces Oxford's Alert.alert validation
  hideBack?: boolean; // for step 0
  isLoading?: boolean; // shows ActivityIndicator instead of next
}
```

#### `SetupHeader` — adopt canonical existing component

`src/components/setup-header/index.tsx` already exists (richer card with `BoxedIcon`). The inline copy in `OperatorSetupWizard.tsx:70–97` is the duplicate; delete it and use the canonical one.

#### `useKeyboardVisible` hook

```tsx
// src/hooks/useKeyboardVisible.ts
export function useKeyboardVisible(): boolean {
  /* ... */
}
```

Extracted from `OperatorSetupWizard.tsx:107–125`.

### Dependency changes

- **No additions** — `react-native-reanimated 2.17.0` is already a project dep.
- **Drops in code, kept in `package.json` (this PR)**: After C3, no file in `src/` imports `react-native-best-viewpager`. The package itself **stays in `package.json`** for now — its actual removal (and the corresponding `npm install` / lockfile change) is a separate small PR after we've smoke-tested both wizards in production. This split keeps the diff reviewable and lets us roll back code-level changes without a dependency churn.

---

## Per-Wizard Refactor

### Oxford (`src/screens/Oxford/OxfordOnboardingWizard.tsx`)

Imports diff:

```diff
- import { ..., Alert } from 'react-native';
- import ScreenHeader from '../../components/screen-header';
+ import { SafeAreaView } from 'react-native-safe-area-context';
+ import RatsWizardProgress from '../../components/rats-wizard-progress';
+ import RatsWizardSlide from '../../components/rats-wizard-slide';
+ import SetupHeader from '../../components/setup-header';
+ import SetupButtons from '../../components/setup-buttons';
+ import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';
```

Per-step icon + label mapping (drives `SetupHeader` and `RatsWizardProgress`):

| Step | Label         | `BoxedIcon` name | `nextDisabled` rule         |
| ---- | ------------- | ---------------- | --------------------------- |
| 0    | Welcome       | `hand-wave`      | never                       |
| 1    | Officers      | `users`          | never (optional fields)     |
| 2    | First Meeting | `calendar-day`   | `firstMeetingDate == null`  |
| 3    | EES           | `dollar-sign`    | invalid amount (NaN or ≤ 0) |
| 4    | Done          | `check-circle`   | mutation in-flight          |

State machine simplification: all `Alert.alert()` validation calls **removed** — replaced by `nextDisabled` preventing forward nav. `Alert.alert` retained only for the final-step mutation error case (genuinely async).

TanStack Query mutation `useCompleteOxfordOnboarding` stays unchanged.

### Traditional (`src/screens/SetupWizards/OperatorSetupWizard.tsx`)

Structural changes:

| Current                                                   | New                                                                                             |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `ViewPager` + `viewPagerRef.current?.setPage(N)`          | `RatsWizardSlide currentStep={currentPage}`                                                     |
| `RatsSetupStepIndicator` with 5 icon+label rows           | `RatsWizardProgress stepCount={5} currentStep={currentPage} currentLabel={labels[currentPage]}` |
| `phaseConfigViewPagerRef` iOS hack (lines 131–141)        | **Removed** — Reanimated handles iOS animations natively                                        |
| `OperatorSetupWizardStyles.ts`                            | **Deleted**; inline `StyleSheet.create()` colocation                                            |
| Each step's own back/next buttons                         | Steps stop rendering buttons; parent renders single `SetupButtons` row                          |
| Inline `SetupHeader` (line 70) + `SetupButtons` (line 24) | Both replaced by imports from `src/components/`                                                 |
| Inline keyboard `useEffect` (line 107)                    | `useKeyboardVisible` hook                                                                       |

Step labels: `Details`, `Managers`, `Phases`, `Chores`, `Guests` — passed to `RatsWizardProgress`.

Per-step component signature change: `HouseSetup`, `ManagerSetup`, `PhaseConfig`, `ChoreSetup`, `GuestSetup` all **stop rendering their own button row**. They still receive `onPrevPress` / `onNextPress` as parent-driven callbacks, but the button UI lives once at wizard level.

---

## Testing Strategy

### Per-commit test bar

| Commit                    | Tests required                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1: Shared components** | Unit test per component: `RatsWizardProgress` (dot count, active dot, label rendering), `RatsWizardSlide` (renders active child, slides on `currentStep` change), `SetupButtons` (click handlers, `nextDisabled` blocks press, `hideBack` hides left, `isLoading` shows spinner), `useKeyboardVisible` (true/false on listener calls) |
| **C2: Oxford swap**       | Update existing `OxfordOnboardingWizard.test.tsx` smoke test to pass against new tree. **Explicit non-goal**: expanding from 1 test to 20 (deferred).                                                                                                                                                                                 |
| **C3: Traditional swap**  | Update `OperatorSetupWizard.test.tsx` queries to match new component tree. Critical assertion: navigation between steps still works (was `viewPagerRef.current.setPage()`, now `RatsWizardSlide currentStep` prop).                                                                                                                   |

### Reanimated mock

If `jest.setup.ts` doesn't already mock Reanimated, add:

```ts
jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock'),
);
```

Confirm in C1 task list before writing component tests.

### Manual smoke test (after all 3 commits)

1. **Traditional flow**: New house → step through all 5 wizard pages → verify slides + buttons + completion.
2. **Oxford flow**: Upgrade existing house via `setOxfordEnabled` → verify redirect to Oxford wizard → step through 5 pages → verify completion redirects to OxfordDashboard.
3. **Visual parity check**: Side-by-side screenshots of equivalent steps (officer entry vs manager entry) — confirm progress indicator, header, button row look identical.

---

## Error Handling

Largely unchanged. Two simplifications:

| Current Oxford pattern                                                                     | New pattern                               |
| ------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `Alert.alert('Invalid Amount', ...)` after Step 4 Next tap                                 | `nextDisabled={!isValidEes}`              |
| `Alert.alert('Invalid Date', ...)` after Step 3 Next tap                                   | `nextDisabled={firstMeetingDate == null}` |
| `completeOnboarding.isError` → red error text below button                                 | **Kept** — async mutation failure         |
| `navigation.replace()` outside try-catch (avoid mislabeling nav errors as mutation errors) | **Kept**                                  |

---

## Documentation Deliverables

### A. This spec — `docs/superpowers/specs/2026-05-27-oxford-wizard-harmonization-design.md`

For PR reviewers.

### B. Pattern reference — `docs/patterns/2026-05-27-wizard-ux-conventions.md` (new directory)

For the next engineer building a wizard. Scannable; tells them which components to import + when to break convention. The markdown below is the **outline** of what this doc will contain — concrete code skeletons (`File layout template` section) and the initial "Candidates for future application" list will be authored during commit C1 alongside the components, not left as placeholders:

```markdown
# Wizard UX Conventions (Regroup mobile)

When to use this pattern: multi-step forms with clear sequential progression
(setup flows, onboarding, multi-page applications).

## Required components

- RatsWizardProgress — step indicator (dots + label)
- RatsWizardSlide — slide-between-steps animation
- SetupHeader — per-step title + description + icon (BoxedIcon)
- SetupButtons — paired Back/Next at bottom

## Required wrapping

- SafeAreaView from react-native-safe-area-context
- ScrollView inside each step for content

## Validation pattern

- Prefer `nextDisabled` on SetupButtons over Alert.alert after tap
- Reserve Alert.alert for genuinely async errors (mutation failures)

## State management

- useState for step index (0-indexed)
- TanStack Query mutation for the final submission
- No Redux for transient wizard state

## File layout template

... (concrete code skeleton)

## Where this is applied today

- src/screens/Oxford/OxfordOnboardingWizard.tsx
- src/screens/SetupWizards/OperatorSetupWizard.tsx

## Candidates for future application

- (TBD list of other multi-step flows that could adopt this — to be populated by future audit)
```

### C. JSDoc on shared components

Each new component gets a JSDoc block:

- One-line purpose
- Usage example (~10-line code snippet)
- Notes on non-obvious prop semantics (e.g., `currentStep` is 0-indexed)

---

## Touched-File Inventory

**Commit 1 — Shared components (new):**

- `src/components/rats-wizard-progress/index.tsx`
- `src/components/rats-wizard-progress/__tests__/index.test.tsx`
- `src/components/rats-wizard-slide/index.tsx`
- `src/components/rats-wizard-slide/__tests__/index.test.tsx`
- `src/components/setup-buttons/index.tsx`
- `src/components/setup-buttons/__tests__/index.test.tsx`
- `src/hooks/useKeyboardVisible.ts`
- `src/hooks/__tests__/useKeyboardVisible.test.ts`

**Commit 2 — Oxford swap:**

- `src/screens/Oxford/OxfordOnboardingWizard.tsx` (modify)
- `src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx` (update assertions, coverage scope deferred)

**Commit 3 — Traditional swap:**

- `src/screens/SetupWizards/OperatorSetupWizard.tsx` (modify)
- `src/screens/SetupWizards/HouseSetup.tsx` (modify — remove inline button row)
- `src/screens/SetupWizards/ManagerSetup.tsx` (modify — remove inline button row)
- `src/screens/SetupWizards/PhaseSetup/PhaseConfig.tsx` (modify — remove inline button row)
- `src/screens/SetupWizards/ChoreSetup.tsx` (modify — remove inline button row)
- `src/screens/SetupWizards/GuestSetup.tsx` (modify — remove inline button row)
- `src/screens/SetupWizards/OperatorSetupWizardStyles.ts` (delete)
- `src/screens/SetupWizards/__tests__/OperatorSetupWizard.test.tsx` (update queries)

**Total**: 8 new source files, 9 modified, 1 deleted, 3 commits. (Plus 2 new doc files: this spec and the pattern-reference doc.)

---

## Acceptance Criteria

- [ ] Both wizards render with identical progress indicator + button row + per-step header structure
- [ ] Reanimated slide animation runs at 60fps on iOS simulator (subjectively smooth)
- [ ] `npx tsc --noEmit` clean — no new TS errors
- [ ] All existing wizard tests pass after refactor (no regression)
- [ ] `react-native-best-viewpager` import count in `src/screens/SetupWizards/` drops to 0
- [ ] `OperatorSetupWizardStyles.ts` deleted; inline styles in each step component
- [ ] Spec + pattern doc + JSDoc all committed
- [ ] Package removal of `react-native-best-viewpager` **explicitly deferred** to follow-up PR

---

## Out of Scope

- Tasks 5–7 from prior plan: wizard test expansion, `EESTracker.test.tsx` + `OfficerManagement.test.tsx` test rot
- Task 9: CI gate investigation
- Google Maps key rotation (separate followup from `regroup-functions` work earlier today)
- RC-side `RATS_API_KEY` mirror (separate followup)
- `package.json` removal of `react-native-best-viewpager` (follow-up PR after both wizards confirmed working)
- DM push notification gap (surfaced earlier today; separate product ticket)

---

## Risk + Mitigation

| Risk                                                         | Mitigation                                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Reanimated slide animation regression on Android             | Manual smoke test on Android emulator before merging C3                                                                  |
| Test mock for Reanimated missing                             | Verify `jest.setup.ts` configuration in C1 before writing component tests; add `react-native-reanimated/mock` if missing |
| Step components break because parent now owns button row     | Each step's tests verify the button row is no longer present + the parent's `onNextPress` is called correctly            |
| iOS-only behavior in original `phaseConfigViewPagerRef` hack | Remove the hack; manually verify PhaseConfig step renders correctly on iOS in smoke test                                 |
| Per-step `BoxedIcon` names may not exist in icon font        | Verify icon names against existing `BoxedIcon` usage before C2; substitute compatible icons if needed                    |
