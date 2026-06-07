# Oxford Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After an operator upgrades to Oxford House tier (subscriptionMetadata.oxfordEnabled becomes true), show a guided 5-screen wizard that collects initial house name, officer assignments, first meeting schedule, and EES configuration — then navigates to the OxfordDashboard.

**Architecture:** A new `OxfordOnboardingWizard` screen with internal step state (no new routes for each step — single route with wizard steps managed by `useState`). Steps: (1) Welcome/Intro, (2) Officers setup, (3) First meeting, (4) EES config, (5) Completion. Calls existing Firestore writes via existing mutation hooks from `oxfordQueries`. Wizard is shown once: after completion, `house.oxfordOnboardingComplete` flag is set to true.

**Tech Stack:** React Native, TanStack Query v5 (`useMutation`), Firestore direct writes (`doc.set`), `oxfordQueries.ts` existing hooks, existing `Officer`/`BusinessMeeting` entities

**Status (2026-05-26):** Tasks 1–4 are complete on `main` (commits `77027f1`, `30df8f2`, `247faf6` and others). The wizard screen, mutation, route, and dashboard redirect are all live. Tasks 5–9 below were added after a follow-up audit of Oxford-area test suites that surfaced rot in `EESTracker.test.tsx` and `OfficerManagement.test.tsx`, plus thin coverage in the wizard's own test file, plus a UX consistency gap and a CI-gate blind spot. The audit findings live in `~/.claude/projects/-Users-marcuspersonal-dev-Regroup/memory/project_test_suite_rot_oxford.md`.

---

## File Structure

**Original wizard build (Tasks 1–4, done):**

- **Create:** `src/screens/Oxford/OxfordOnboardingWizard.tsx`
- **Modify:** `src/navigation/types.ts` — add `OxfordOnboardingWizard` route
- **Modify:** `src/navigation/navigators.tsx` — register route
- **Modify:** `src/screens/Oxford/OxfordDashboard.tsx` — redirect to wizard when `oxfordEnabled && !oxfordOnboardingComplete`
- **Create:** `src/state/mutations/oxfordOnboardingMutations.ts`
- **Create:** `src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx`

**Follow-up work (Tasks 5–9):**

- **Modify:** `src/screens/Oxford/__tests__/EESTracker.test.tsx` — fix stale header assertion + rewrite Refresh test to trigger `RefreshControl.onRefresh`
- **Modify:** `src/screens/Oxford/__tests__/OfficerManagement.test.tsx` — rewrite Refresh test the same way
- **Modify:** `src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx` — expand from 1 smoke test to full suite (~20 tests)
- **Modify:** `src/screens/Oxford/OxfordOnboardingWizard.tsx` — replace raw YYYY-MM-DD `TextInput` with `react-native-date-picker` (UX parity with BusinessMeetings)
- **Investigate:** CI workflow files under `.github/workflows/` — determine why test failures in `main` don't block PRs, and fix or document

---

## Task 1: Add route and register navigator

**Files:**

- Modify: `src/navigation/types.ts`
- Modify: `src/navigation/navigators.tsx`

- [x] **Step 1: Write the failing test**

  Create `src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx`:

  ```typescript
  import React from 'react';
  import { render } from '@testing-library/react-native';
  import OxfordOnboardingWizard from '../../../screens/Oxford/OxfordOnboardingWizard';

  describe('OxfordOnboardingWizard', () => {
    it('renders the welcome step by default', () => {
      const { getByTestId } = render(
        <OxfordOnboardingWizard navigation={mockNavigation} />,
      );
      expect(getByTestId('wizard-step-1')).toBeTruthy();
    });
  });
  ```

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx jest src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx --no-coverage`
  Expected: FAIL — module not found

- [x] **Step 2: Add route to types.ts**

  In `src/navigation/types.ts`, find the `Routes` enum (line ~60) and add after `OxfordDashboard`:

  ```typescript
  OxfordOnboardingWizard = 'oxfordOnboardingWizard',
  ```

  Find the `RootStackParamList` type (line ~200) and add:

  ```typescript
  [Routes.OxfordOnboardingWizard]: undefined;
  ```

- [x] **Step 3: Register in navigators.tsx**

  In `src/navigation/navigators.tsx`:

  1. Add import:

     ```typescript
     import OxfordOnboardingWizard from '../screens/Oxford/OxfordOnboardingWizard';
     ```

  2. In the main stack navigator (where `OxfordDashboard` is registered, line ~339), add after it:
     ```tsx
     <Stack.Screen
       name={Routes.OxfordOnboardingWizard}
       component={OxfordOnboardingWizard}
       options={{ headerShown: false }}
     />
     ```

- [x] **Step 4: Commit**

  ```bash
  git add src/navigation/types.ts src/navigation/navigators.tsx
  git commit -m "chore(oxford): register OxfordOnboardingWizard route"
  ```

---

## Task 2: Create onboarding mutation

**Files:**

- Create: `src/state/mutations/oxfordOnboardingMutations.ts`
- Test: included in wizard test in Task 3

- [x] **Step 1: Create the mutation file**

  Create `src/state/mutations/oxfordOnboardingMutations.ts`:

  ```typescript
  import firestore from '@react-native-firebase/firestore';
  import { useMutation, useQueryClient } from '@tanstack/react-query';
  import { Officer } from '../../entities/oxford/Officer';
  import { BusinessMeeting } from '../../entities/oxford/BusinessMeeting';
  import { houseKeys } from '../queries/houseQueries';

  interface OxfordOnboardingPayload {
    houseId: string;
    officers: Omit<Officer, 'id' | 'houseId' | 'createdAt'>[];
    firstMeeting: Omit<BusinessMeeting, 'id' | 'houseId' | 'createdAt'>;
    eesMonthlyAmount: number;
  }

  async function completeOxfordOnboarding(
    payload: OxfordOnboardingPayload,
  ): Promise<void> {
    const { houseId, officers, firstMeeting, eesMonthlyAmount } = payload;
    const batch = firestore().batch();

    // Write officers
    officers.forEach(officer => {
      const ref = firestore()
        .collection('officers')
        .doc(`${houseId}_${officer.role}`);
      batch.set(ref, {
        ...officer,
        houseId,
        isActive: true,
        createdAt: firestore.FieldValue.serverTimestamp(),
      });
    });

    // Write first meeting
    const meetingRef = firestore().collection('business-meetings').doc();
    batch.set(meetingRef, {
      ...firstMeeting,
      houseId,
      createdAt: firestore.FieldValue.serverTimestamp(),
    });

    // Write EES monthly amount and mark onboarding complete
    const houseRef = firestore().collection('houses').doc(houseId);
    batch.update(houseRef, {
      eesMonthlyAmount,
      oxfordOnboardingComplete: true,
    });

    await batch.commit();
  }

  export function useCompleteOxfordOnboarding() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: completeOxfordOnboarding,
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries({ queryKey: houseKeys.selected() });
        queryClient.invalidateQueries({
          queryKey: ['officers', variables.houseId],
        });
        queryClient.invalidateQueries({
          queryKey: ['business-meetings', variables.houseId],
        });
      },
    });
  }
  ```

- [x] **Step 2: Check what houseKeys looks like**

  Run: `grep -n "houseKeys\|selected" /Users/marcuspersonal/dev/Regroup/src/state/queries/houseQueries.ts | head -10`

  If `houseKeys.selected()` doesn't exist, use the correct key pattern from the file. Adjust the import accordingly.

- [x] **Step 3: Commit**

  ```bash
  git add src/state/mutations/oxfordOnboardingMutations.ts
  git commit -m "feat(oxford): add completeOxfordOnboarding mutation"
  ```

---

## Task 3: Create OxfordOnboardingWizard screen

**Files:**

- Create: `src/screens/Oxford/OxfordOnboardingWizard.tsx`

- [x] **Step 1: Create the wizard screen**

  Create `src/screens/Oxford/OxfordOnboardingWizard.tsx`:

  ```tsx
  import React, { useState } from 'react';
  import {
    View,
    ScrollView,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
  } from 'react-native';
  import { NativeStackNavigationProp } from '@react-navigation/native-stack';
  import { RootStackParamList, Routes } from '../../navigation/types';
  import { RatsText } from '../../components/rats-text';
  import RatsButton from '../../components/rats-button/rats-button';
  import ScreenHeader from '../../components/screen-header';
  import { color, fontSize, normalize, CARD_STYLE } from '../../styles/theme';
  import { useSelectedHouse } from '../../hooks/useSelectedHouse';
  import { useCompleteOxfordOnboarding } from '../../state/mutations/oxfordOnboardingMutations';
  import { logException } from '../../util/logging';

  interface Props {
    navigation: NativeStackNavigationProp<RootStackParamList>;
  }

  interface WizardState {
    // Step 2: Officers
    presidentName: string;
    treasurerName: string;
    secretaryName: string;
    // Step 3: First meeting
    firstMeetingDate: string; // YYYY-MM-DD
    firstMeetingTime: string; // HH:MM
    // Step 4: EES
    eesMonthlyAmount: string; // string for TextInput, parsed to number on submit
  }

  const TOTAL_STEPS = 5;

  const OxfordOnboardingWizard: React.FC<Props> = ({ navigation }) => {
    const [step, setStep] = useState(1);
    const { house } = useSelectedHouse();
    const completeOnboarding = useCompleteOxfordOnboarding();

    const [state, setState] = useState<WizardState>({
      presidentName: '',
      treasurerName: '',
      secretaryName: '',
      firstMeetingDate: '',
      firstMeetingTime: '',
      eesMonthlyAmount: '',
    });

    const houseId = house?.id ?? '';

    const goNext = () => setStep(s => Math.min(s + 1, TOTAL_STEPS));
    const goBack = () => {
      if (step === 1) {
        navigation.goBack();
      } else {
        setStep(s => s - 1);
      }
    };

    const handleFinish = async () => {
      try {
        await completeOnboarding.mutateAsync({
          houseId,
          officers: [
            {
              role: 'president',
              name: state.presidentName,
              termStartDate: new Date().toISOString().split('T')[0],
            },
            {
              role: 'treasurer',
              name: state.treasurerName,
              termStartDate: new Date().toISOString().split('T')[0],
            },
            {
              role: 'secretary',
              name: state.secretaryName,
              termStartDate: new Date().toISOString().split('T')[0],
            },
          ].filter(o => o.name.trim() !== ''),
          firstMeeting: {
            scheduledDate: `${state.firstMeetingDate}T${
              state.firstMeetingTime || '19:00'
            }:00`,
            meetingType: 'business',
          },
          eesMonthlyAmount: parseFloat(state.eesMonthlyAmount) || 0,
        });
        navigation.replace(Routes.OxfordDashboard);
      } catch (error) {
        logException(error);
      }
    };

    return (
      <View style={styles.container}>
        <ScreenHeader
          header="Oxford House Setup"
          renderBackButton
          onBackPress={goBack}
        />

        {/* Progress bar */}
        <View style={styles.progressBar}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={[styles.progressDot, i < step && styles.progressDotActive]}
            />
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {step === 1 && (
            <View testID="wizard-step-1">
              <RatsText
                text="Welcome to Oxford House Management"
                style={styles.title}
                translate={false}
              />
              <RatsText
                text="This quick setup takes 2 minutes. We'll configure your officers, first meeting, and equity distribution settings."
                style={styles.body}
                translate={false}
              />
              <RatsButton label="Let's Get Started" onPress={goNext} />
            </View>
          )}

          {step === 2 && (
            <View testID="wizard-step-2">
              <RatsText
                text="Who are your current officers?"
                style={styles.title}
                translate={false}
              />
              {(['president', 'treasurer', 'secretary'] as const).map(role => {
                const key = `${role}Name` as keyof WizardState;
                return (
                  <View key={role} style={styles.fieldRow}>
                    <RatsText
                      text={role.charAt(0).toUpperCase() + role.slice(1)}
                      style={styles.label}
                      translate={false}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder={`${
                        role.charAt(0).toUpperCase() + role.slice(1)
                      } name`}
                      value={state[key]}
                      onChangeText={v => setState(s => ({ ...s, [key]: v }))}
                    />
                  </View>
                );
              })}
              <RatsButton label="Next" onPress={goNext} />
            </View>
          )}

          {step === 3 && (
            <View testID="wizard-step-3">
              <RatsText
                text="When is your first business meeting?"
                style={styles.title}
                translate={false}
              />
              <View style={styles.fieldRow}>
                <RatsText
                  text="Date (YYYY-MM-DD)"
                  style={styles.label}
                  translate={false}
                />
                <TextInput
                  style={styles.input}
                  placeholder="2026-06-01"
                  value={state.firstMeetingDate}
                  onChangeText={v =>
                    setState(s => ({ ...s, firstMeetingDate: v }))
                  }
                />
              </View>
              <View style={styles.fieldRow}>
                <RatsText
                  text="Time (HH:MM, 24h)"
                  style={styles.label}
                  translate={false}
                />
                <TextInput
                  style={styles.input}
                  placeholder="19:00"
                  value={state.firstMeetingTime}
                  onChangeText={v =>
                    setState(s => ({ ...s, firstMeetingTime: v }))
                  }
                />
              </View>
              <RatsButton label="Next" onPress={goNext} />
            </View>
          )}

          {step === 4 && (
            <View testID="wizard-step-4">
              <RatsText
                text="Oxford House Equity"
                style={styles.title}
                translate={false}
              />
              <RatsText
                text="The Equity Expense Share (EES) is the monthly amount each resident contributes to house expenses."
                style={styles.body}
                translate={false}
              />
              <View style={styles.fieldRow}>
                <RatsText
                  text="Monthly EES Amount ($)"
                  style={styles.label}
                  translate={false}
                />
                <TextInput
                  style={styles.input}
                  placeholder="0.00"
                  keyboardType="numeric"
                  value={state.eesMonthlyAmount}
                  onChangeText={v =>
                    setState(s => ({ ...s, eesMonthlyAmount: v }))
                  }
                />
              </View>
              <RatsText
                text="You can change this at any time from the Oxford settings."
                style={styles.hint}
                translate={false}
              />
              <RatsButton label="Next" onPress={goNext} />
            </View>
          )}

          {step === 5 && (
            <View testID="wizard-step-5">
              <RatsText
                text="You're all set!"
                style={styles.title}
                translate={false}
              />
              <RatsText
                text="Your Oxford House is configured. You can update any of these settings from the Oxford Dashboard."
                style={styles.body}
                translate={false}
              />
              {completeOnboarding.isPending ? (
                <ActivityIndicator color={color.primary} />
              ) : (
                <RatsButton
                  label="Go to Oxford Dashboard"
                  onPress={handleFinish}
                  disabled={completeOnboarding.isPending}
                />
              )}
              {completeOnboarding.isError && (
                <RatsText
                  text="Setup failed. Please try again."
                  style={styles.errorText}
                  translate={false}
                />
              )}
            </View>
          )}
        </ScrollView>
      </View>
    );
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: color.background },
    progressBar: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: normalize(8),
      paddingVertical: normalize(12),
    },
    progressDot: {
      width: normalize(8),
      height: normalize(8),
      borderRadius: normalize(4),
      backgroundColor: color.lightGray,
    },
    progressDotActive: { backgroundColor: color.primary },
    content: { padding: normalize(24), gap: normalize(16) },
    title: {
      fontSize: fontSize.h2,
      fontWeight: 'bold',
      marginBottom: normalize(8),
    },
    body: {
      fontSize: fontSize.body,
      color: color.secondaryText,
      lineHeight: normalize(22),
    },
    hint: { fontSize: fontSize.small, color: color.secondaryText },
    label: {
      fontSize: fontSize.body,
      fontWeight: '600',
      marginBottom: normalize(4),
    },
    input: {
      borderWidth: 1,
      borderColor: color.border,
      borderRadius: normalize(8),
      padding: normalize(12),
      fontSize: fontSize.body,
      backgroundColor: color.white,
    },
    fieldRow: { gap: normalize(4), marginBottom: normalize(16) },
    errorText: {
      color: color.error,
      fontSize: fontSize.body,
      marginTop: normalize(8),
    },
  });

  export default OxfordOnboardingWizard;
  ```

- [x] **Step 2: Run test**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx jest src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx --no-coverage`
  Expected: PASS

- [x] **Step 3: Type check**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx tsc --noEmit 2>&1 | grep OxfordOnboarding`
  Expected: No type errors

- [x] **Step 4: Commit**

  ```bash
  git add src/screens/Oxford/OxfordOnboardingWizard.tsx src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx
  git commit -m "feat(oxford): add OxfordOnboardingWizard 5-step guided setup"
  ```

---

## Task 4: Wire wizard entry point from OxfordDashboard

**Files:**

- Modify: `src/screens/Oxford/OxfordDashboard.tsx`

After `setOxfordEnabled` sets `subscriptionMetadata.oxfordEnabled = true`, the operator returns to OxfordDashboard. Currently it shows the full dashboard. We want to intercept first-time setup with the wizard.

- [x] **Step 1: Write the failing test**

  Add to `src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx`:

  ```typescript
  import OxfordDashboard from '../../../screens/Oxford/OxfordDashboard';

  it('navigates to wizard when oxfordEnabled=true but onboarding not complete', () => {
    // Mock house with oxfordOnboardingComplete = false
    mockUseSelectedHouse({
      house: {
        ...mockHouse,
        houseType: 'oxford',
        oxfordOnboardingComplete: false,
      },
    });
    mockUseAppSelector({ subscriptionMetadata: { oxfordEnabled: true } });

    const { navigate } = mockNavigation;
    render(<OxfordDashboard navigation={mockNavigation} />);

    expect(navigate).toHaveBeenCalledWith(Routes.OxfordOnboardingWizard);
  });
  ```

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx jest src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx --no-coverage`
  Expected: FAIL

- [x] **Step 2: Add wizard redirect to OxfordDashboard**

  In `src/screens/Oxford/OxfordDashboard.tsx`, in the `OxfordDashboard` component, after the `subscriptionMetadata.oxfordEnabled` check (line ~91), add a redirect to the wizard when `oxfordOnboardingComplete` is false:

  ```typescript
  // After the existing oxfordEnabled check:
  if (subscriptionMetadata?.oxfordEnabled && !house.oxfordOnboardingComplete) {
    navigation.navigate(Routes.OxfordOnboardingWizard);
    return null;
  }
  ```

  Also add the import at the top:

  ```typescript
  import { Routes } from '../../navigation/types';
  ```

  (if not already imported)

- [x] **Step 3: Add oxfordOnboardingComplete to House entity**

  Check `src/entities/House.tsx`:

  ```bash
  grep -n "oxfordOnboardingComplete\|houseType\|oxfordEnabled" /Users/marcuspersonal/dev/Regroup/src/entities/House.tsx | head -10
  ```

  If `oxfordOnboardingComplete` is not in the entity, add it:

  ```typescript
  oxfordOnboardingComplete?: boolean;
  ```

- [x] **Step 4: Run tests**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx jest src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx --no-coverage`
  Expected: PASS

  Run: `cd /Users/marcuspersonal/dev/Regroup && npm test --no-coverage`
  Expected: No regressions

- [x] **Step 5: Commit**

  ```bash
  git add src/screens/Oxford/OxfordDashboard.tsx src/entities/House.tsx
  git commit -m "feat(oxford): redirect to onboarding wizard on first Oxford upgrade"
  ```

---

## Task 5: Fix EESTracker test rot (audit item 1)

**Files:**

- Modify: `src/screens/Oxford/__tests__/EESTracker.test.tsx`

**Context:** Commit `abe400d` ("UX consistency pass — back buttons, raw IDs, duplicate refresh, header title, custom checkbox") renamed the screen header from `"EES Tracker"` to `"Equal Expense Share"` and removed a duplicate text "Refresh" button (pull-to-refresh `RefreshControl` is the sole refresh affordance now). Two tests in this file still assert against the old UI and fail on `main`:

- `:358` — `expect(getByText('EES Tracker')).toBeTruthy()` — should be `'Equal Expense Share'`.
- `:614` — `getByText('Refresh')` then `fireEvent.press` — should trigger the `RefreshControl.onRefresh` prop directly.

The `RefreshControl` is wired in `src/screens/Oxford/EESTracker.tsx:208-214` as `refreshControl={<RefreshControl refreshing={...} onRefresh={refetch} />}` on a `RatsScrollView`. React Native Testing Library can find it via `UNSAFE_getByType(RefreshControl)`.

- [ ] **Step 1: Run the baseline (see current red)**

  ```bash
  cd /Users/marcuspersonal/dev/Regroup
  npx jest src/screens/Oxford/__tests__/EESTracker.test.tsx --no-coverage > /tmp/ees-before.txt 2>&1
  grep -E "Tests:|✕" /tmp/ees-before.txt
  ```

  Expected:

  ```
  ✕ renders screen header text in loading state
  ✕ calls getEESRecords again when Refresh is pressed
  Tests:       2 failed, 18 passed, 20 total
  ```

  If you don't see exactly 2 failures, stop and re-investigate before editing — the rot may have evolved.

- [ ] **Step 2: Fix the header assertion**

  In `src/screens/Oxford/__tests__/EESTracker.test.tsx`, find the test at line ~358 (`it('renders screen header text in loading state', () => {`). Replace the assertion:

  ```typescript
  // Before:
  expect(getByText('EES Tracker')).toBeTruthy();

  // After:
  expect(getByText('Equal Expense Share')).toBeTruthy();
  ```

  Rationale: the source renders `<ScreenHeader header="Equal Expense Share" ... />` in all three branches (gate-closed, loading, ready) — see `EESTracker.tsx:183,198,215`.

- [ ] **Step 3: Rewrite the Refresh test to trigger `RefreshControl.onRefresh`**

  In the same file, find the `describe('refresh', ...)` block at line ~613. Replace the entire `it(...)` body with:

  ```typescript
  describe('refresh', () => {
    it('calls getEESRecords again when pull-to-refresh fires', async () => {
      mockGetEESRecords.mockResolvedValue([]);
      const { RefreshControl } = require('react-native');
      const { UNSAFE_getByType } = renderScreen();

      // Wait for the first fetch to settle so the screen is in its ready
      // branch (the RefreshControl only mounts on the ready branch — see
      // EESTracker.tsx:207-214).
      await waitFor(() => {
        expect(mockGetEESRecords).toHaveBeenCalledTimes(1);
      });

      const refreshControl = UNSAFE_getByType(RefreshControl);
      await act(async () => {
        refreshControl.props.onRefresh();
      });

      expect(mockGetEESRecords).toHaveBeenCalledTimes(2);
    });
  });
  ```

  Notes:

  - `UNSAFE_getByType` is the documented escape hatch for React Native components that don't expose a public testID. It's fine here — the alternative (adding a testID on the `RefreshControl`) would be churn in production code for a test-only need.
  - `refetch` from React Query is what `onRefresh` is wired to. Invoking `onRefresh` triggers a re-fetch which re-invokes `mockGetEESRecords`.

- [ ] **Step 4: Update the file's docblock**

  At the top of `src/screens/Oxford/__tests__/EESTracker.test.tsx`, the comment on line 14 reads `* - Refresh button reloads records`. Update it to:

  ```
  * - Pull-to-refresh reloads records
  ```

- [ ] **Step 5: Run the file — expect all green**

  ```bash
  cd /Users/marcuspersonal/dev/Regroup
  npx jest src/screens/Oxford/__tests__/EESTracker.test.tsx --no-coverage
  ```

  Expected: `Tests: 20 passed, 20 total`.

- [ ] **Step 6: Commit**

  ```bash
  git add src/screens/Oxford/__tests__/EESTracker.test.tsx
  git commit -m "test(oxford): fix EESTracker test rot from abe400d (header rename + pull-to-refresh)"
  ```

---

## Task 6: Fix OfficerManagement test rot (audit item 2)

**Files:**

- Modify: `src/screens/Oxford/__tests__/OfficerManagement.test.tsx`

**Context:** Same root cause as Task 5 — commit `abe400d` removed the duplicate text "Refresh" button in favor of pull-to-refresh. One test in this file still asserts the old UI:

- `:709` — `getByText('Refresh')` then `fireEvent.press` — should trigger `RefreshControl.onRefresh`.

The `RefreshControl` is wired in `src/screens/Oxford/OfficerManagement.tsx:254-260` on a `RatsScrollView`. Same fix pattern as Task 5.

- [ ] **Step 1: Run baseline**

  ```bash
  cd /Users/marcuspersonal/dev/Regroup
  npx jest src/screens/Oxford/__tests__/OfficerManagement.test.tsx --no-coverage > /tmp/om-before.txt 2>&1
  grep -E "Tests:|✕" /tmp/om-before.txt
  ```

  Expected:

  ```
  ✕ calls getOfficers again when Refresh button is pressed
  Tests:       1 failed, 21 passed, 22 total
  ```

- [ ] **Step 2: Rewrite the Refresh test**

  In `src/screens/Oxford/__tests__/OfficerManagement.test.tsx`, find the `describe('refresh', ...)` block at line ~708. Replace the entire `it(...)` body with:

  ```typescript
  describe('refresh', () => {
    it('calls getOfficers again when pull-to-refresh fires', async () => {
      mockGetOfficers.mockResolvedValue([]);
      const { RefreshControl } = require('react-native');
      const { UNSAFE_getByType } = renderScreen();

      await waitFor(() => {
        expect(mockGetOfficers).toHaveBeenCalledTimes(1);
      });

      const refreshControl = UNSAFE_getByType(RefreshControl);
      await act(async () => {
        refreshControl.props.onRefresh();
      });

      // getOfficers called once on mount, once on pull-to-refresh
      expect(mockGetOfficers).toHaveBeenCalledTimes(2);
    });
  });
  ```

- [ ] **Step 3: Update the file's docblock**

  At the top of `src/screens/Oxford/__tests__/OfficerManagement.test.tsx`, line 14 reads `* - Refresh button calls getOfficers service again`. Update to:

  ```
  * - Pull-to-refresh calls getOfficers service again
  ```

- [ ] **Step 4: Run the file — expect all green**

  ```bash
  cd /Users/marcuspersonal/dev/Regroup
  npx jest src/screens/Oxford/__tests__/OfficerManagement.test.tsx --no-coverage
  ```

  Expected: `Tests: 22 passed, 22 total`.

- [ ] **Step 5: Commit**

  ```bash
  git add src/screens/Oxford/__tests__/OfficerManagement.test.tsx
  git commit -m "test(oxford): fix OfficerManagement Refresh test rot from abe400d (pull-to-refresh)"
  ```

---

## Task 7: Expand OxfordOnboardingWizard test coverage (audit item 3)

**Files:**

- Modify: `src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx`

**Context:** The current test file has exactly one smoke test (`renders the welcome step by default`) for a 320-line, 5-step wizard with input validation, a mutation call, navigation side effects, and pending/error states — none of which are exercised. The component file is `src/screens/Oxford/OxfordOnboardingWizard.tsx`. Key behaviors to cover:

1. **Step navigation forward:** pressing the per-step "Next" / "Let's Get Started" button advances `step` by 1.
2. **Step navigation back:** the `onBackPress` callback on `ScreenHeader` calls `navigation.goBack()` on step 1, and decrements `step` on steps 2–5.
3. **Input persistence across steps:** typing into officer / date / time / EES fields and navigating away and back preserves the values.
4. **Step 5 validation — missing houseId:** when `useSelectedHouse` returns `house: null`, pressing the finish button shows `Alert.alert('Error', 'House not found. ...')` and does **not** call the mutation.
5. **Step 5 validation — invalid date:** with `firstMeetingDate=''` or a non-`YYYY-MM-DD` string, pressing finish shows `Alert.alert('Invalid Date', ...)` and does not call the mutation.
6. **Step 5 validation — invalid EES amount:** with `eesMonthlyAmount=''`, `'abc'`, `'0'`, or a negative number, pressing finish shows `Alert.alert('Invalid Amount', ...)` and does not call the mutation.
7. **Step 5 happy path:** with valid inputs, `useCompleteOxfordOnboarding().mutateAsync` is called with the correct payload, then `navigation.replace(Routes.OxfordDashboard)` fires.
8. **Officer filtering:** when one or more officer name fields are blank, the mutation payload's `officers` array filters those out (the source does this at line 84).
9. **Default meeting time:** when `firstMeetingTime` is blank, the payload's `scheduledDate` uses `T19:00:00` as the suffix (source line 90–91).
10. **Mutation error path:** when `mutateAsync` rejects, `logException` is called and `navigation.replace` is **not** called.
11. **Pending state:** when `completeOnboarding.isPending` is true, step 5 renders an `ActivityIndicator` and the finish button is hidden (or disabled).
12. **Error display:** when `completeOnboarding.isError` is true, step 5 renders the error message "Setup failed. Please try again.".

- [ ] **Step 1: Read the existing test file so the new file builds on (rather than discards) the existing mock setup**

  ```bash
  cat /Users/marcuspersonal/dev/Regroup/src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx
  ```

  The current file mocks `oxfordOnboardingMutations`, `useSelectedHouse`, and `screen-header`. The expansion will replace the existing single test but keep and extend those mocks.

- [ ] **Step 2: Replace the test file**

  Overwrite `src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx` with:

  ```typescript
  /**
   * OxfordOnboardingWizard Screen Tests
   *
   * Covers:
   * - Step navigation forward via Next buttons
   * - Step navigation back via ScreenHeader onBackPress
   * - Input persistence across step transitions
   * - handleFinish validation: missing houseId, invalid date, invalid EES amount
   * - handleFinish happy path: correct mutation payload + navigation.replace
   * - Officer filtering: blank names dropped from payload
   * - Default meeting time defaults to 19:00 when blank
   * - Mutation error path logs exception and does not navigate
   * - Pending state renders ActivityIndicator
   * - Error state renders error message
   */
  import React from 'react';
  import { Alert } from 'react-native';
  import { fireEvent, render, act } from '@testing-library/react-native';

  // ─── Mutation mock ────────────────────────────────────────────────────────────
  const mockMutateAsync = jest.fn();
  const mockUseCompleteOxfordOnboarding = jest.fn();

  jest.mock('../../../state/mutations/oxfordOnboardingMutations', () => ({
    useCompleteOxfordOnboarding: () => mockUseCompleteOxfordOnboarding(),
  }));

  // ─── useSelectedHouse mock ────────────────────────────────────────────────────
  const mockUseSelectedHouse = jest.fn();
  jest.mock('../../../hooks/useSelectedHouse', () => ({
    useSelectedHouse: () => mockUseSelectedHouse(),
  }));

  // ─── ScreenHeader mock — expose onBackPress so tests can trigger it ──────────
  jest.mock('../../../components/screen-header', () => {
    const React = require('react');
    const { TouchableOpacity, Text } = require('react-native');
    return function MockScreenHeader(props: {
      header: string;
      onBackPress?: () => void;
    }) {
      return React.createElement(
        TouchableOpacity,
        { testID: 'screen-header-back', onPress: props.onBackPress },
        React.createElement(Text, null, props.header),
      );
    };
  });

  // ─── logException mock ────────────────────────────────────────────────────────
  const mockLogException = jest.fn();
  jest.mock('../../../util/logging', () => ({
    logException: (...args: any[]) => mockLogException(...args),
  }));

  // ─── Alert spy ────────────────────────────────────────────────────────────────
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});

  // ─── Navigation mock ──────────────────────────────────────────────────────────
  const mockNavigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
  } as any;

  // ─── Import under test (after mocks) ──────────────────────────────────────────
  import OxfordOnboardingWizard from '../../../screens/Oxford/OxfordOnboardingWizard';
  import { Routes } from '../../../navigation/types';

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  function setupHappyPath() {
    mockUseSelectedHouse.mockReturnValue({
      house: { id: 'house-1', name: 'Test Oxford House' },
    });
    mockMutateAsync.mockResolvedValue(undefined);
    mockUseCompleteOxfordOnboarding.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
      isError: false,
    });
  }

  function renderWizard() {
    return render(<OxfordOnboardingWizard navigation={mockNavigation} />);
  }

  // Click "Let's Get Started" / "Next" until the wizard reaches the requested step.
  async function advanceTo(
    step: 1 | 2 | 3 | 4 | 5,
    utils: ReturnType<typeof renderWizard>,
  ) {
    const labels = ["Let's Get Started", 'Next', 'Next', 'Next'] as const;
    for (let i = 1; i < step; i++) {
      await act(async () => {
        fireEvent.press(utils.getByText(labels[i - 1]));
      });
    }
  }

  beforeEach(() => {
    jest.clearAllMocks();
    setupHappyPath();
  });

  // ─── Step rendering ───────────────────────────────────────────────────────────
  describe('step rendering', () => {
    it('renders the welcome step by default', () => {
      const { getByTestId } = renderWizard();
      expect(getByTestId('wizard-step-1')).toBeTruthy();
    });

    it('renders step 2 after pressing "Let\'s Get Started"', async () => {
      const utils = renderWizard();
      await advanceTo(2, utils);
      expect(utils.getByTestId('wizard-step-2')).toBeTruthy();
    });

    it('renders step 5 after pressing Next four times', async () => {
      const utils = renderWizard();
      await advanceTo(5, utils);
      expect(utils.getByTestId('wizard-step-5')).toBeTruthy();
    });
  });

  // ─── Back navigation ──────────────────────────────────────────────────────────
  describe('back navigation', () => {
    it('calls navigation.goBack on step 1 back press', () => {
      const { getByTestId } = renderWizard();
      fireEvent.press(getByTestId('screen-header-back'));
      expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
    });

    it('decrements step instead of leaving on step 2 back press', async () => {
      const utils = renderWizard();
      await advanceTo(2, utils);
      fireEvent.press(utils.getByTestId('screen-header-back'));
      expect(mockNavigation.goBack).not.toHaveBeenCalled();
      expect(utils.getByTestId('wizard-step-1')).toBeTruthy();
    });
  });

  // ─── Input persistence ────────────────────────────────────────────────────────
  describe('input persistence', () => {
    it('preserves officer names when navigating away from step 2 and back', async () => {
      const utils = renderWizard();
      await advanceTo(2, utils);
      const presidentInput = utils.getByPlaceholderText(
        'President name (optional)',
      );
      fireEvent.changeText(presidentInput, 'Alice Smith');

      // Forward to step 3, back to step 2
      await act(async () => {
        fireEvent.press(utils.getByText('Next'));
      });
      fireEvent.press(utils.getByTestId('screen-header-back'));

      expect(
        utils.getByPlaceholderText('President name (optional)').props.value,
      ).toBe('Alice Smith');
    });
  });

  // ─── Validation: missing houseId ──────────────────────────────────────────────
  describe('validation: missing houseId', () => {
    it('shows error alert and does not call mutation when house is null', async () => {
      mockUseSelectedHouse.mockReturnValue({ house: null });
      const utils = renderWizard();
      await advanceTo(5, utils);
      await act(async () => {
        fireEvent.press(utils.getByText('Go to Oxford Dashboard'));
      });
      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        expect.stringContaining('House not found'),
      );
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });
  });

  // ─── Validation: invalid date ─────────────────────────────────────────────────
  describe('validation: invalid date', () => {
    it('shows Invalid Date alert when firstMeetingDate is blank', async () => {
      const utils = renderWizard();
      await advanceTo(5, utils);
      await act(async () => {
        fireEvent.press(utils.getByText('Go to Oxford Dashboard'));
      });
      expect(Alert.alert).toHaveBeenCalledWith(
        'Invalid Date',
        expect.stringContaining('YYYY-MM-DD'),
      );
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it('shows Invalid Date alert when firstMeetingDate is malformed', async () => {
      const utils = renderWizard();
      await advanceTo(3, utils);
      fireEvent.changeText(
        utils.getByPlaceholderText('2026-06-01'),
        '06/01/2026',
      );
      await advanceTo(5, { ...utils, getByText: utils.getByText } as any);
      // Re-fetch finish button after re-render
      await act(async () => {
        fireEvent.press(utils.getByText('Go to Oxford Dashboard'));
      });
      expect(Alert.alert).toHaveBeenCalledWith(
        'Invalid Date',
        expect.any(String),
      );
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });
  });

  // ─── Validation: invalid EES amount ───────────────────────────────────────────
  describe('validation: invalid EES amount', () => {
    async function fillDateOnly(utils: ReturnType<typeof renderWizard>) {
      await advanceTo(3, utils);
      fireEvent.changeText(
        utils.getByPlaceholderText('2026-06-01'),
        '2026-06-01',
      );
      // Step 3 -> step 4
      await act(async () => {
        fireEvent.press(utils.getByText('Next'));
      });
      // Step 4 -> step 5
      await act(async () => {
        fireEvent.press(utils.getByText('Next'));
      });
    }

    it('shows Invalid Amount alert when EES is blank', async () => {
      const utils = renderWizard();
      await fillDateOnly(utils);
      await act(async () => {
        fireEvent.press(utils.getByText('Go to Oxford Dashboard'));
      });
      expect(Alert.alert).toHaveBeenCalledWith(
        'Invalid Amount',
        expect.stringContaining('greater than $0'),
      );
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it('shows Invalid Amount alert when EES is non-numeric', async () => {
      const utils = renderWizard();
      await advanceTo(4, utils);
      fireEvent.changeText(utils.getByPlaceholderText('0.00'), 'abc');
      // Fill date too (step 3 was skipped over in advanceTo's path? no — date is still blank)
      // Re-render: go back to step 3, fill date, advance forward
      fireEvent.press(utils.getByTestId('screen-header-back')); // step 4 -> 3
      fireEvent.changeText(
        utils.getByPlaceholderText('2026-06-01'),
        '2026-06-01',
      );
      await act(async () => {
        fireEvent.press(utils.getByText('Next')); // -> 4
      });
      await act(async () => {
        fireEvent.press(utils.getByText('Next')); // -> 5
      });
      await act(async () => {
        fireEvent.press(utils.getByText('Go to Oxford Dashboard'));
      });
      expect(Alert.alert).toHaveBeenCalledWith(
        'Invalid Amount',
        expect.any(String),
      );
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it('shows Invalid Amount alert when EES is zero', async () => {
      const utils = renderWizard();
      await fillDateOnly(utils);
      fireEvent.press(utils.getByTestId('screen-header-back')); // -> step 4
      fireEvent.changeText(utils.getByPlaceholderText('0.00'), '0');
      await act(async () => {
        fireEvent.press(utils.getByText('Next'));
      });
      await act(async () => {
        fireEvent.press(utils.getByText('Go to Oxford Dashboard'));
      });
      expect(Alert.alert).toHaveBeenCalledWith(
        'Invalid Amount',
        expect.any(String),
      );
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });
  });

  // ─── Happy path ───────────────────────────────────────────────────────────────
  describe('happy path', () => {
    it('calls mutateAsync with the full payload and navigates to OxfordDashboard', async () => {
      const utils = renderWizard();

      // Step 2: officers
      await advanceTo(2, utils);
      fireEvent.changeText(
        utils.getByPlaceholderText('President name (optional)'),
        'Alice',
      );
      fireEvent.changeText(
        utils.getByPlaceholderText('Treasurer name (optional)'),
        'Bob',
      );
      fireEvent.changeText(
        utils.getByPlaceholderText('Secretary name (optional)'),
        'Carol',
      );

      // Step 3: meeting
      await act(async () => {
        fireEvent.press(utils.getByText('Next'));
      });
      fireEvent.changeText(
        utils.getByPlaceholderText('2026-06-01'),
        '2026-06-01',
      );
      fireEvent.changeText(utils.getByPlaceholderText('19:00'), '20:30');

      // Step 4: EES
      await act(async () => {
        fireEvent.press(utils.getByText('Next'));
      });
      fireEvent.changeText(utils.getByPlaceholderText('0.00'), '450');

      // Step 5: finish
      await act(async () => {
        fireEvent.press(utils.getByText('Next'));
      });
      await act(async () => {
        fireEvent.press(utils.getByText('Go to Oxford Dashboard'));
      });

      expect(mockMutateAsync).toHaveBeenCalledWith({
        houseId: 'house-1',
        officers: [
          { role: 'president', name: 'Alice' },
          { role: 'treasurer', name: 'Bob' },
          { role: 'secretary', name: 'Carol' },
        ],
        firstMeeting: { scheduledDate: '2026-06-01T20:30:00' },
        eesMonthlyAmount: 450,
      });
      expect(mockNavigation.replace).toHaveBeenCalledWith(
        Routes.OxfordDashboard,
      );
    });

    it('drops blank officer names from the payload', async () => {
      const utils = renderWizard();
      await advanceTo(2, utils);
      // Only fill president, leave treasurer + secretary blank
      fireEvent.changeText(
        utils.getByPlaceholderText('President name (optional)'),
        'Alice',
      );
      await act(async () => {
        fireEvent.press(utils.getByText('Next'));
      });
      fireEvent.changeText(
        utils.getByPlaceholderText('2026-06-01'),
        '2026-06-01',
      );
      await act(async () => {
        fireEvent.press(utils.getByText('Next'));
      });
      fireEvent.changeText(utils.getByPlaceholderText('0.00'), '100');
      await act(async () => {
        fireEvent.press(utils.getByText('Next'));
      });
      await act(async () => {
        fireEvent.press(utils.getByText('Go to Oxford Dashboard'));
      });
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          officers: [{ role: 'president', name: 'Alice' }],
        }),
      );
    });

    it('defaults meeting time to 19:00 when blank', async () => {
      const utils = renderWizard();
      await advanceTo(3, utils);
      fireEvent.changeText(
        utils.getByPlaceholderText('2026-06-01'),
        '2026-06-01',
      );
      // Skip time field
      await act(async () => {
        fireEvent.press(utils.getByText('Next'));
      });
      fireEvent.changeText(utils.getByPlaceholderText('0.00'), '100');
      await act(async () => {
        fireEvent.press(utils.getByText('Next'));
      });
      await act(async () => {
        fireEvent.press(utils.getByText('Go to Oxford Dashboard'));
      });
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          firstMeeting: { scheduledDate: '2026-06-01T19:00:00' },
        }),
      );
    });
  });

  // ─── Error path ───────────────────────────────────────────────────────────────
  describe('error path', () => {
    it('logs exception and does not navigate when mutation rejects', async () => {
      mockMutateAsync.mockRejectedValueOnce(new Error('firestore unavailable'));
      const utils = renderWizard();
      await advanceTo(3, utils);
      fireEvent.changeText(
        utils.getByPlaceholderText('2026-06-01'),
        '2026-06-01',
      );
      await act(async () => {
        fireEvent.press(utils.getByText('Next'));
      });
      fireEvent.changeText(utils.getByPlaceholderText('0.00'), '100');
      await act(async () => {
        fireEvent.press(utils.getByText('Next'));
      });
      await act(async () => {
        fireEvent.press(utils.getByText('Go to Oxford Dashboard'));
      });
      expect(mockLogException).toHaveBeenCalledTimes(1);
      expect(mockLogException).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNavigation.replace).not.toHaveBeenCalled();
    });
  });

  // ─── Pending and error UI states ──────────────────────────────────────────────
  describe('pending and error UI states', () => {
    it('renders ActivityIndicator when mutation is pending', async () => {
      mockUseCompleteOxfordOnboarding.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: true,
        isError: false,
      });
      const utils = renderWizard();
      await advanceTo(5, utils);
      const { ActivityIndicator } = require('react-native');
      expect(utils.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
      // Finish button should not render in pending state (source line 251)
      expect(utils.queryByText('Go to Oxford Dashboard')).toBeNull();
    });

    it('renders "Setup failed" message when isError is true', async () => {
      mockUseCompleteOxfordOnboarding.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        isError: true,
      });
      const utils = renderWizard();
      await advanceTo(5, utils);
      expect(utils.getByText('Setup failed. Please try again.')).toBeTruthy();
    });
  });
  ```

- [ ] **Step 3: Run the new test file**

  ```bash
  cd /Users/marcuspersonal/dev/Regroup
  npx jest src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx --no-coverage
  ```

  Expected: all tests pass. If any tests fail because the wizard's actual behavior differs from what the test asserts (e.g., placeholder strings have drifted), update the test to match the **source** — the source is correct unless you find a bug. If you find a bug while writing tests, capture it in a separate task; do **not** edit the wizard inside this Task to make a flawed test pass.

- [ ] **Step 4: Commit**

  ```bash
  git add src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx
  git commit -m "test(oxford): expand OxfordOnboardingWizard coverage to all 5 steps + validation + mutation paths"
  ```

---

## Task 8: Replace raw `YYYY-MM-DD` TextInput with RNDatePicker (UX parity)

**Files:**

- Modify: `src/screens/Oxford/OxfordOnboardingWizard.tsx`
- Modify: `src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx`

**Context:** `BusinessMeetings.tsx` already moved off raw `YYYY-MM-DD`/`HH:MM` `TextInput`s to a `react-native-date-picker` modal in commit `abe400d`. The wizard's step 3 still uses raw text inputs with regex validation in `handleFinish` (`OxfordOnboardingWizard.tsx:61-68`). This is the same UX inconsistency the earlier commit explicitly cleaned up — easy to fix and removes a class of "invalid date" alerts from happening at all. Mirroring the BusinessMeetings pattern keeps the cleanup consistent.

**Important:** Look at `src/screens/Oxford/BusinessMeetings.tsx` and `src/screens/Oxford/__tests__/BusinessMeetings.test.tsx` first for the exact pattern. The BusinessMeetings test enforces it with assertions like:

```
✓ does NOT render a raw TextInput with placeholder "YYYY-MM-DD"
✓ renders the DatePicker modal (RNDatePicker) in date mode
✓ DatePicker receives a Date object as its date prop
✓ opens DatePicker when the date display TouchableOpacity is pressed
```

We want the wizard to satisfy equivalent assertions.

- [ ] **Step 1: Read the BusinessMeetings reference implementation**

  ```bash
  grep -n "DatePicker\|scheduledDate\|YYYY-MM-DD" /Users/marcuspersonal/dev/Regroup/src/screens/Oxford/BusinessMeetings.tsx
  grep -n "DatePicker\|YYYY-MM-DD\|date mode" /Users/marcuspersonal/dev/Regroup/src/screens/Oxford/__tests__/BusinessMeetings.test.tsx | head -20
  ```

  Note the import (`import DatePicker from 'react-native-date-picker'`), the state shape (a `Date` object, not a string), and how the display `TouchableOpacity` shows the formatted date.

- [ ] **Step 2: Write the failing tests first**

  In `src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx`, add a new describe block near the bottom of the file:

  ```typescript
  describe('step 3 date picker', () => {
    it('does NOT render a raw TextInput with placeholder "2026-06-01"', async () => {
      const utils = renderWizard();
      await advanceTo(3, utils);
      expect(utils.queryByPlaceholderText('2026-06-01')).toBeNull();
    });

    it('renders the DatePicker modal in date mode', async () => {
      const utils = renderWizard();
      await advanceTo(3, utils);
      const DatePicker = require('react-native-date-picker').default;
      const dp = utils.UNSAFE_getByType(DatePicker);
      expect(dp.props.mode).toBe('date');
    });

    it('DatePicker receives a Date object as its date prop', async () => {
      const utils = renderWizard();
      await advanceTo(3, utils);
      const DatePicker = require('react-native-date-picker').default;
      const dp = utils.UNSAFE_getByType(DatePicker);
      expect(dp.props.date).toBeInstanceOf(Date);
    });
  });
  ```

  Run:

  ```bash
  npx jest src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx -t "step 3 date picker" --no-coverage
  ```

  Expected: 3 failures (still on raw TextInput).

- [ ] **Step 3: Update the wizard component**

  In `src/screens/Oxford/OxfordOnboardingWizard.tsx`:

  1. Add the import (alongside the existing imports):

     ```typescript
     import DatePicker from 'react-native-date-picker';
     import { TouchableOpacity } from 'react-native';
     ```

  2. Change `WizardState.firstMeetingDate` from `string` to `Date`:

     ```typescript
     interface WizardState {
       presidentName: string;
       treasurerName: string;
       secretaryName: string;
       firstMeetingDate: Date | null;
       firstMeetingTime: string;
       eesMonthlyAmount: string;
     }
     ```

  3. Default it to `null` in the initial state:

     ```typescript
     firstMeetingDate: null,
     ```

  4. Add a `useState` for the modal-open flag inside the component (just below the `step` state):

     ```typescript
     const [showDatePicker, setShowDatePicker] = useState(false);
     ```

  5. Replace the step 3 date `View style={styles.fieldRow}` (the one containing the raw `TextInput` with placeholder `"2026-06-01"`) with:

     ```tsx
     <View style={styles.fieldRow}>
       <RatsText text="Meeting date" style={styles.label} translate={false} />
       <TouchableOpacity
         style={styles.input}
         onPress={() => setShowDatePicker(true)}
         testID="wizard-date-display">
         <RatsText
           text={
             state.firstMeetingDate
               ? state.firstMeetingDate.toISOString().split('T')[0]
               : 'Select a date'
           }
           style={{ fontSize: fontSize.regular }}
           translate={false}
         />
       </TouchableOpacity>
       <DatePicker
         modal
         mode="date"
         open={showDatePicker}
         date={state.firstMeetingDate ?? new Date()}
         onConfirm={d => {
           setShowDatePicker(false);
           setState(s => ({ ...s, firstMeetingDate: d }));
         }}
         onCancel={() => setShowDatePicker(false)}
       />
     </View>
     ```

  6. Update `handleFinish` validation — drop the regex check, replace with a null check:

     ```typescript
     if (!state.firstMeetingDate) {
       Alert.alert(
         'Invalid Date',
         'Please choose a meeting date before finishing.',
       );
       return;
     }
     ```

  7. Update the payload construction:

     ```typescript
     firstMeeting: {
       scheduledDate: `${state.firstMeetingDate.toISOString().split('T')[0]}T${
         state.firstMeetingTime || '19:00'
       }:00`,
     },
     ```

- [ ] **Step 4: Update the existing tests that referenced the old string-based date**

  The tests written in Task 7 reference `getByPlaceholderText('2026-06-01')` and `fireEvent.changeText(...)` for the date. Those will now break. Update them to set the date via the DatePicker's `onConfirm`:

  In each happy-path / error-path test that previously called:

  ```typescript
  fireEvent.changeText(utils.getByPlaceholderText('2026-06-01'), '2026-06-01');
  ```

  Replace with:

  ```typescript
  const DatePicker = require('react-native-date-picker').default;
  fireEvent.press(utils.getByTestId('wizard-date-display'));
  act(() => {
    utils.UNSAFE_getByType(DatePicker).props.onConfirm(new Date('2026-06-01'));
  });
  ```

  The "invalid date when malformed" test from Task 7 is no longer meaningful (the picker can't produce a malformed date). Delete that test and replace it with:

  ```typescript
  it('shows Invalid Date alert when no date is chosen', async () => {
    const utils = renderWizard();
    await advanceTo(5, utils);
    await act(async () => {
      fireEvent.press(utils.getByText('Go to Oxford Dashboard'));
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      'Invalid Date',
      expect.stringContaining('meeting date'),
    );
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
  ```

- [ ] **Step 5: Run the wizard test file — expect all green**

  ```bash
  cd /Users/marcuspersonal/dev/Regroup
  npx jest src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx --no-coverage
  ```

  Expected: all tests pass, including the three new `step 3 date picker` assertions.

- [ ] **Step 6: Type-check**

  ```bash
  cd /Users/marcuspersonal/dev/Regroup
  npx tsc --noEmit 2>&1 | grep -E "OxfordOnboardingWizard|Oxford/__tests__"
  ```

  Expected: no errors.

- [ ] **Step 7: Commit**

  ```bash
  git add src/screens/Oxford/OxfordOnboardingWizard.tsx src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx
  git commit -m "feat(oxford): wizard step 3 uses RNDatePicker (parity with BusinessMeetings)"
  ```

---

## Task 9: Investigate the CI test-gate blind spot

**Files:**

- Read: `.github/workflows/*.yml` (all workflow files)
- Possibly modify: one or more workflow files
- Possibly add: a new task entry in `~/.claude/projects/-Users-marcuspersonal-dev-Regroup/memory/project_test_suite_rot_oxford.md`

**Context:** The audit memory establishes that three separate commits (`77027f1`, `abe400d`, and the original commit that broke OxfordDashboard) shipped to `main` while tests in this repo were red. The PR workflow `d5ca565` ostensibly runs unit tests, yet failures didn't block. This task confirms the gap and fixes it.

- [ ] **Step 1: Enumerate workflows**

  ```bash
  cd /Users/marcuspersonal/dev/Regroup
  ls -la .github/workflows/
  ```

  For each `.yml` file, note:

  - Triggers (`on:` block)
  - Whether a job runs `npm test` / `jest` / `npm run test`
  - The exact branches/paths it gates

- [ ] **Step 2: Inspect each workflow's test job**

  ```bash
  for f in .github/workflows/*.yml; do
    echo "=== $f ==="
    grep -nE "on:|branches:|paths:|npm test|npm run test|jest|continue-on-error|test-coverage" "$f"
  done
  ```

  Look specifically for:

  - `continue-on-error: true` on a test step (would let a failing job report success)
  - A `paths:` filter that excludes `src/screens/Oxford/**` (e.g., `paths: ['src/lib/**']`)
  - A test command with `|| true` appended in the run script
  - A job that runs `jest --testPathPattern=...` with a pattern that misses Oxford
  - No workflow at all running `npm test` on pull_request

- [ ] **Step 3: Capture findings**

  Write a short note (3-5 sentences) to the memory file appending under the existing audit results section, describing **which** workflow ran tests, **why** the failures didn't block, and what change (if any) was made. Append to `~/.claude/projects/-Users-marcuspersonal-dev-Regroup/memory/project_test_suite_rot_oxford.md`.

- [ ] **Step 4: Fix the gate (if a fix exists)**

  Most likely fix scenarios:

  - **Continue-on-error:** remove that flag from the test step.
  - **Wrong command:** replace `npm run test:unit` (or similar narrow command) with `npm test`.
  - **Wrong trigger:** add `pull_request` to a test workflow's `on:` block if missing.
  - **No workflow at all:** create one. Minimal version:

    ```yaml
    name: test
    on:
      pull_request:
        branches: [main]
      push:
        branches: [main]
    jobs:
      test:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - uses: actions/setup-node@v4
            with:
              node-version: 20
              cache: 'npm'
          - run: npm ci
          - run: npm test
    ```

  Do not invent a fix if you can't reproduce the gap — sometimes the gap is upstream (a required-status-checks setting in the GitHub repo's branch-protection rules, which is configured in GitHub UI, not in the repo). If that's the case, the deliverable is a comment in the memory file documenting the finding for the human operator to action manually.

- [ ] **Step 5: Verify the fix on a throwaway branch**

  Only required if Step 4 made a change.

  ```bash
  git checkout -b ci-test-gate-verify
  # Introduce a deliberate test failure in a known-safe file:
  echo "test('intentional failure', () => { expect(1).toBe(2); });" >> src/__tests__/ci-gate-canary.test.ts
  git add src/__tests__/ci-gate-canary.test.ts
  git commit -m "test(ci): canary to verify test gate"
  git push -u origin ci-test-gate-verify
  gh pr create --title "CI gate canary — DO NOT MERGE" --body "Verifying that test failures block merges."
  ```

  Watch the PR's checks. The failing test must produce a red check that blocks merging. Once verified:

  ```bash
  gh pr close ci-test-gate-verify
  git checkout main
  git branch -D ci-test-gate-verify
  git push origin :ci-test-gate-verify
  ```

- [ ] **Step 6: Commit any workflow changes**

  ```bash
  git add .github/workflows/
  git commit -m "ci: fix test gate so red unit tests block merges (closes CI blind spot from audit 2026-05-26)"
  ```

---

## Self-Review

**Spec coverage:**

- P1.9 (Oxford onboarding wizard — guided setup after setOxfordEnabled): Covered by Tasks 1–4 ✅ (shipped)
- Audit item 1 (EESTracker test rot): Covered by Task 5 ✅
- Audit item 2 (OfficerManagement test rot): Covered by Task 6 ✅
- Audit item 3 (thin wizard test coverage): Covered by Task 7 ✅
- UX consistency with BusinessMeetings (raw date input → DatePicker): Covered by Task 8 ✅
- CI gate blind spot (3-commit drift): Covered by Task 9 ✅

**One-way door:** The `oxfordOnboardingComplete = true` flag written by Task 2's mutation is permanent — once set, the wizard won't show again. The wizard is skippable (user can tap back at step 1). No rollback mechanism needed.

**Officer field matching:** The Officer entity in `src/entities/oxford/Officer.ts` must be verified before Task 3 step 1. If the field names differ, adjust the mutation payload in `oxfordOnboardingMutations.ts`. Run: `cat /Users/marcuspersonal/dev/Regroup/src/entities/oxford/Officer.ts`. (Tasks 1–4 are shipped, so this was already verified.)

**Task 5/6 RefreshControl pattern:** Both tests use `UNSAFE_getByType(RefreshControl)` and call `props.onRefresh()` directly. The alternative — adding a `testID` to the `RefreshControl` JSX in production code — is not worth it for a test-only concern, and `UNSAFE_getByType` is the documented escape hatch for React Native primitives without public testIDs.

**Task 7 mock strategy:** The expanded test file does **not** mock `@react-native-firebase/firestore` at all, because the wizard's only Firestore touchpoint goes through the mocked `useCompleteOxfordOnboarding` hook. This is intentional — we test the wizard's behavior, not the mutation's. The mutation has its own test suite at `src/state/mutations/__tests__/oxfordOnboardingMutations.test.ts`.

**Task 8 ordering:** Task 8 must come **after** Task 7. Task 7 writes happy-path tests against the current raw-TextInput interface; Task 8 then changes that interface and updates only the assertions that referenced the old placeholder/changeText. If you do them out of order, the Task 7 tests would be born already-broken.

**Task 9 scope:** Investigation is bounded — if the issue is in GitHub branch-protection settings (not in `.github/workflows/`), document the finding and stop. Do not attempt to script `gh api` calls against repo settings without explicit human approval; those changes can affect every contributor.

**EES auto-recalculation (P2.4):** Covered by a separate plan. This wizard only sets the monthly EES amount; the Firestore trigger that recalculates on guest add/remove is out of scope here.
