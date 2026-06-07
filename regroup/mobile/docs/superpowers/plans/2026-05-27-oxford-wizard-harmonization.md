# Oxford ↔ Traditional Setup Wizard Harmonization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harmonize the existing Oxford and Traditional setup wizards by extracting their winning patterns into shared components (`RatsWizardProgress`, `RatsWizardSlide`, `SetupButtons`, `useKeyboardVisible` hook), then refactoring both wizards to use them — producing a single canonical wizard pattern for future use.

**Architecture:** Component-first roll-out in 3 commits, each independently revert-safe. C1 ships shared components in isolation. C2 swaps Oxford to use them. C3 swaps Traditional. After C3, no file in `src/` imports `react-native-best-viewpager`; its removal from `package.json` is a separate follow-up PR.

**Tech Stack:** React Native, `react-native-reanimated 2.17.0` (already a project dep), `@testing-library/react-native`, Jest, TypeScript, `react-native-safe-area-context`, TanStack Query v5.

**Spec:** `docs/superpowers/specs/2026-05-27-oxford-wizard-harmonization-design.md`

---

## File Structure

### Created (Commit 1)

- `src/components/rats-wizard-progress/index.tsx` — hybrid dots + label step indicator
- `src/components/rats-wizard-progress/__tests__/index.test.tsx`
- `src/components/rats-wizard-slide/index.tsx` — Reanimated slide-between-steps wrapper
- `src/components/rats-wizard-slide/__tests__/index.test.tsx`
- `src/components/setup-buttons/index.tsx` — paired Back/Next button row (extracted from `OperatorSetupWizard.tsx:24`)
- `src/components/setup-buttons/__tests__/index.test.tsx`
- `src/hooks/useKeyboardVisible.ts` — extracted keyboard listener
- `src/hooks/__tests__/useKeyboardVisible.test.ts`
- `docs/patterns/2026-05-27-wizard-ux-conventions.md` — pattern reference doc

### Modified (Commit 1)

- `jest.setup.js` — add `react-native-reanimated/mock` if not already present

### Modified (Commit 2)

- `src/screens/Oxford/OxfordOnboardingWizard.tsx` — swap to shared components
- `src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx` — update queries to match new tree

### Modified (Commit 3)

- `src/screens/SetupWizards/OperatorSetupWizard.tsx` — drop `ViewPager`, use shared components
- `src/screens/SetupWizards/HouseSetup.tsx` — remove inline button row
- `src/screens/SetupWizards/ManagerSetup.tsx` — remove inline button row
- `src/screens/SetupWizards/PhaseSetup/PhaseConfig.tsx` — remove inline button row
- `src/screens/SetupWizards/ChoreSetup.tsx` — remove inline button row
- `src/screens/SetupWizards/GuestSetup.tsx` — remove inline button row
- `src/screens/SetupWizards/__tests__/OperatorSetupWizard.test.tsx` — update queries

### Deleted (Commit 3)

- `src/screens/SetupWizards/OperatorSetupWizardStyles.ts`

---

## Task 0: Pre-flight Verification

**Files:** None (verification only)

This task confirms the environment matches the plan's assumptions. Each step is a check, not a code change.

- [ ] **Step 1: Confirm `react-native-reanimated/mock` setup**

  Run: `grep -l "react-native-reanimated" /Users/marcuspersonal/dev/Regroup/jest.setup.js /Users/marcuspersonal/dev/Regroup/jest.setup.globals.js`
  Expected: Either output empty (no mock yet — Task 4 adds it) OR contains the mock (Task 4 skips that step).

- [ ] **Step 2: Confirm theme exports needed by new components**

  Run: `grep -E "main|baby_blue|light_purple|green_blue|red|dark_blue|medium_grey|white|black|light_grey|dark_grey" /Users/marcuspersonal/dev/Regroup/src/styles/theme.tsx | head -20`
  Expected: All colors referenced in the plan exist in the `color` object.

- [ ] **Step 3: Identify the BoxedIcon icons used for Oxford steps**

  Run: `grep -rn 'BoxedIcon' /Users/marcuspersonal/dev/Regroup/src --include='*.tsx' | grep -v __tests__ | head -10`
  Read 2-3 usages and note the icon-name format. The codebase uses FontAwesome 5 names (e.g., `users`, `house-user`, `calendar-day`). If any of these are missing, substitute the nearest equivalent. Document substitutions in Task 6 Step 3 below.

- [ ] **Step 4: Confirm `react-native-safe-area-context` is a dep**

  Run: `grep "react-native-safe-area-context" /Users/marcuspersonal/dev/Regroup/package.json`
  Expected: present in `dependencies`. (Used by `OperatorSetupWizard.tsx` already.)

- [ ] **Step 5: Confirm `react-native-reanimated 2.17.0` is a dep**

  Run: `grep "react-native-reanimated" /Users/marcuspersonal/dev/Regroup/package.json`
  Expected: `"react-native-reanimated": "2.17.0"` in `dependencies`.

- [ ] **Step 6: Run baseline tests**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx jest src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx src/screens/SetupWizards/__tests__/OperatorSetupWizard.test.tsx --no-coverage 2>&1 | tail -20`
  Expected: Both test files pass. Note the test count for each — it'll be the regression target after refactor.

- [ ] **Step 7: Create working branch**

  ```bash
  cd /Users/marcuspersonal/dev/Regroup
  git checkout -b feat/oxford-wizard-harmonization
  ```

  Expected: branch created and checked out from latest `main`.

---

## Task 1: Create `useKeyboardVisible` hook (Commit 1, part 1)

**Files:**

- Create: `src/hooks/useKeyboardVisible.ts`
- Create: `src/hooks/__tests__/useKeyboardVisible.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `src/hooks/__tests__/useKeyboardVisible.test.ts`:

  ```typescript
  import { renderHook, act } from '@testing-library/react-native';
  import { Keyboard } from 'react-native';
  import { useKeyboardVisible } from '../useKeyboardVisible';

  describe('useKeyboardVisible', () => {
    it('returns false initially', () => {
      const { result } = renderHook(() => useKeyboardVisible());
      expect(result.current).toBe(false);
    });

    it('returns true when keyboardDidShow fires', () => {
      const listeners: Record<string, Array<() => void>> = {};
      jest
        .spyOn(Keyboard, 'addListener')
        .mockImplementation((event: string, cb: () => void) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(cb);
          return { remove: jest.fn() };
        });

      const { result } = renderHook(() => useKeyboardVisible());
      act(() => {
        listeners['keyboardDidShow']?.forEach(cb => cb());
      });
      expect(result.current).toBe(true);
    });

    it('returns false again when keyboardDidHide fires', () => {
      const listeners: Record<string, Array<() => void>> = {};
      jest
        .spyOn(Keyboard, 'addListener')
        .mockImplementation((event: string, cb: () => void) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(cb);
          return { remove: jest.fn() };
        });

      const { result } = renderHook(() => useKeyboardVisible());
      act(() => {
        listeners['keyboardDidShow']?.forEach(cb => cb());
      });
      act(() => {
        listeners['keyboardDidHide']?.forEach(cb => cb());
      });
      expect(result.current).toBe(false);
    });

    it('removes listeners on unmount', () => {
      const removeShow = jest.fn();
      const removeHide = jest.fn();
      jest
        .spyOn(Keyboard, 'addListener')
        .mockImplementationOnce(() => ({ remove: removeShow }))
        .mockImplementationOnce(() => ({ remove: removeHide }));

      const { unmount } = renderHook(() => useKeyboardVisible());
      unmount();

      expect(removeShow).toHaveBeenCalled();
      expect(removeHide).toHaveBeenCalled();
    });
  });
  ```

- [ ] **Step 2: Run test to confirm failure**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx jest src/hooks/__tests__/useKeyboardVisible.test.ts --no-coverage 2>&1 | tail -15`
  Expected: FAIL — `Cannot find module '../useKeyboardVisible'`

- [ ] **Step 3: Implement the hook**

  Create `src/hooks/useKeyboardVisible.ts`:

  ```typescript
  import { useEffect, useState } from 'react';
  import { Keyboard } from 'react-native';

  /**
   * Returns true while the soft keyboard is visible. Use to hide bulky chrome
   * (e.g., wizard progress indicators) during text entry.
   *
   * @example
   * const keyboardVisible = useKeyboardVisible();
   * return (
   *   <>
   *     {!keyboardVisible && <RatsWizardProgress ... />}
   *     <TextInput ... />
   *   </>
   * );
   */
  export function useKeyboardVisible(): boolean {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
      const showSub = Keyboard.addListener('keyboardDidShow', () =>
        setVisible(true),
      );
      const hideSub = Keyboard.addListener('keyboardDidHide', () =>
        setVisible(false),
      );
      return () => {
        showSub.remove();
        hideSub.remove();
      };
    }, []);

    return visible;
  }
  ```

- [ ] **Step 4: Run test to confirm pass**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx jest src/hooks/__tests__/useKeyboardVisible.test.ts --no-coverage 2>&1 | tail -10`
  Expected: PASS — 4 tests pass.

- [ ] **Step 5: TypeScript check**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx tsc --noEmit 2>&1 | grep -E "useKeyboardVisible" | head -5`
  Expected: No output (no TS errors in the new files).

---

## Task 2: Extract `SetupButtons` component (Commit 1, part 2)

**Files:**

- Create: `src/components/setup-buttons/index.tsx`
- Create: `src/components/setup-buttons/__tests__/index.test.tsx`

Reference: the inline `SetupButtons` at `src/screens/SetupWizards/OperatorSetupWizard.tsx:24-68`. We're extracting it with these enhancements: explicit `onBackPress` / `onNextPress` props (vs. the current `leftPress` / `submit`), explicit `nextDisabled` (the current `rightDisabled` — renamed for clarity), and explicit `isLoading` for the in-flight state.

- [ ] **Step 1: Write the failing test**

  Create `src/components/setup-buttons/__tests__/index.test.tsx`:

  ```typescript
  import React from 'react';
  import { ActivityIndicator } from 'react-native';
  import { fireEvent, render } from '@testing-library/react-native';
  import SetupButtons from '../index';

  describe('SetupButtons', () => {
    it('renders Back and Next buttons by default', () => {
      const { getByTestId } = render(
        <SetupButtons onBackPress={jest.fn()} onNextPress={jest.fn()} />,
      );
      expect(getByTestId('setup-buttons-back')).toBeTruthy();
      expect(getByTestId('setup-buttons-next')).toBeTruthy();
    });

    it('calls onBackPress when Back is tapped', () => {
      const onBack = jest.fn();
      const { getByTestId } = render(
        <SetupButtons onBackPress={onBack} onNextPress={jest.fn()} />,
      );
      fireEvent.press(getByTestId('setup-buttons-back'));
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('calls onNextPress when Next is tapped', () => {
      const onNext = jest.fn();
      const { getByTestId } = render(
        <SetupButtons onBackPress={jest.fn()} onNextPress={onNext} />,
      );
      fireEvent.press(getByTestId('setup-buttons-next'));
      expect(onNext).toHaveBeenCalledTimes(1);
    });

    it('does not call onNextPress when nextDisabled is true', () => {
      const onNext = jest.fn();
      const { getByTestId } = render(
        <SetupButtons
          onBackPress={jest.fn()}
          onNextPress={onNext}
          nextDisabled
        />,
      );
      fireEvent.press(getByTestId('setup-buttons-next'));
      expect(onNext).not.toHaveBeenCalled();
    });

    it('hides Back when hideBack is true', () => {
      const { queryByTestId } = render(
        <SetupButtons
          onBackPress={jest.fn()}
          onNextPress={jest.fn()}
          hideBack
        />,
      );
      expect(queryByTestId('setup-buttons-back')).toBeNull();
    });

    it('renders ActivityIndicator instead of Next when isLoading is true', () => {
      const { queryByTestId, UNSAFE_getByType } = render(
        <SetupButtons
          onBackPress={jest.fn()}
          onNextPress={jest.fn()}
          isLoading
        />,
      );
      expect(queryByTestId('setup-buttons-next')).toBeNull();
      expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    });

    it('respects custom backLabel and nextLabel props', () => {
      const { getByText } = render(
        <SetupButtons
          onBackPress={jest.fn()}
          onNextPress={jest.fn()}
          backLabel="Cancel"
          nextLabel="Finish"
        />,
      );
      // RatsButton uppercases via RatsText toUpper={true}
      expect(getByText('CANCEL')).toBeTruthy();
      expect(getByText('FINISH')).toBeTruthy();
    });
  });
  ```

- [ ] **Step 2: Run test to confirm failure**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx jest src/components/setup-buttons --no-coverage 2>&1 | tail -10`
  Expected: FAIL — `Cannot find module '../index'`

- [ ] **Step 3: Implement the component**

  Create `src/components/setup-buttons/index.tsx`:

  ```typescript
  import React from 'react';
  import { View, ViewStyle, ActivityIndicator } from 'react-native';
  import { SafeAreaView } from 'react-native-safe-area-context';
  import RatsButton from '../rats-button/rats-button';
  import { ROW, CARD_STYLE, normalize, color } from '../../styles/theme';

  export interface SetupButtonsProps {
    onBackPress: () => void;
    onNextPress: () => void;
    /** Default: "Back" */
    backLabel?: string;
    /** Default: "Next" */
    nextLabel?: string;
    /** When true, the Next button is disabled (greyed out, no press handler). */
    nextDisabled?: boolean;
    /** When true, the Back button is not rendered (useful for step 0). */
    hideBack?: boolean;
    /** When true, renders ActivityIndicator in place of Next. */
    isLoading?: boolean;
    container?: ViewStyle;
  }

  /**
   * Paired Back/Next button row anchored to the bottom of a wizard step.
   * Wraps in SafeAreaView so the home-indicator on iPhone X+ doesn't overlap.
   *
   * @example
   * <SetupButtons
   *   onBackPress={() => setStep(s => s - 1)}
   *   onNextPress={() => setStep(s => s + 1)}
   *   nextDisabled={!isValid}
   *   hideBack={step === 0}
   * />
   */
  const SetupButtons: React.FC<SetupButtonsProps> = ({
    onBackPress,
    onNextPress,
    backLabel = 'Back',
    nextLabel = 'Next',
    nextDisabled = false,
    hideBack = false,
    isLoading = false,
    container,
  }) => {
    return (
      <SafeAreaView
        edges={['bottom']}
        style={[
          ROW,
          CARD_STYLE,
          {
            justifyContent: 'space-between',
            marginTop: 'auto',
            paddingBottom: normalize(20),
            ...container,
          },
        ]}>
        {!hideBack && (
          <RatsButton
            testID="setup-buttons-back"
            title={backLabel}
            containerStyle={{ width: '49%' }}
            onPress={onBackPress}
            light
          />
        )}
        {isLoading ? (
          <View
            style={{ width: hideBack ? '100%' : '49%', alignItems: 'center' }}>
            <ActivityIndicator color={color.main} />
          </View>
        ) : (
          <RatsButton
            testID="setup-buttons-next"
            title={nextLabel}
            containerStyle={{ width: hideBack ? '100%' : '49%' }}
            onPress={onNextPress}
            disabled={nextDisabled}
          />
        )}
      </SafeAreaView>
    );
  };

  export default SetupButtons;
  ```

- [ ] **Step 4: Run test to confirm pass**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx jest src/components/setup-buttons --no-coverage 2>&1 | tail -10`
  Expected: PASS — 7 tests pass.

- [ ] **Step 5: TypeScript check**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx tsc --noEmit 2>&1 | grep -E "setup-buttons" | head -5`
  Expected: No output.

---

## Task 3: Create `RatsWizardProgress` component (Commit 1, part 3)

**Files:**

- Create: `src/components/rats-wizard-progress/index.tsx`
- Create: `src/components/rats-wizard-progress/__tests__/index.test.tsx`

- [ ] **Step 1: Write the failing test**

  Create `src/components/rats-wizard-progress/__tests__/index.test.tsx`:

  ```typescript
  import React from 'react';
  import { render } from '@testing-library/react-native';
  import RatsWizardProgress from '../index';

  describe('RatsWizardProgress', () => {
    it('renders the correct number of dots', () => {
      const { getAllByTestId } = render(
        <RatsWizardProgress stepCount={5} currentStep={0} />,
      );
      expect(getAllByTestId(/wizard-progress-dot-\d+/)).toHaveLength(5);
    });

    it('marks active dots with the active style up through currentStep', () => {
      const { getByTestId } = render(
        <RatsWizardProgress stepCount={5} currentStep={2} />,
      );
      // Dot 0, 1, 2 active (3 active dots when on step 2 — inclusive)
      expect(
        getByTestId('wizard-progress-dot-0').props.accessibilityState?.selected,
      ).toBe(true);
      expect(
        getByTestId('wizard-progress-dot-2').props.accessibilityState?.selected,
      ).toBe(true);
      expect(
        getByTestId('wizard-progress-dot-3').props.accessibilityState?.selected,
      ).toBe(false);
    });

    it('renders "Step N of M · Label" when currentLabel is provided', () => {
      const { getByText } = render(
        <RatsWizardProgress
          stepCount={5}
          currentStep={1}
          currentLabel="Officers"
        />,
      );
      expect(getByText('Step 2 of 5 · Officers')).toBeTruthy();
    });

    it('renders "Step N of M" when currentLabel is not provided', () => {
      const { getByText } = render(
        <RatsWizardProgress stepCount={5} currentStep={3} />,
      );
      expect(getByText('Step 4 of 5')).toBeTruthy();
    });

    it('uses 1-indexed step in label text (currentStep is 0-indexed prop)', () => {
      const { getByText } = render(
        <RatsWizardProgress
          stepCount={3}
          currentStep={0}
          currentLabel="Start"
        />,
      );
      expect(getByText('Step 1 of 3 · Start')).toBeTruthy();
    });
  });
  ```

- [ ] **Step 2: Run test to confirm failure**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx jest src/components/rats-wizard-progress --no-coverage 2>&1 | tail -10`
  Expected: FAIL — `Cannot find module '../index'`

- [ ] **Step 3: Implement the component**

  Create `src/components/rats-wizard-progress/index.tsx`:

  ```typescript
  import React from 'react';
  import { View, StyleSheet } from 'react-native';
  import { RatsText } from '../rats-text';
  import { color, fontSize, fontFamily, normalize } from '../../styles/theme';

  export interface RatsWizardProgressProps {
    /** Total number of steps in the wizard. */
    stepCount: number;
    /** Active step index (0-indexed). */
    currentStep: number;
    /** Optional label for the current step (e.g. "Officers"). */
    currentLabel?: string;
    testID?: string;
  }

  /**
   * Hybrid step indicator: compact dot row + "Step N of M · <label>" caption.
   * Scales to any step count; takes minimal vertical space.
   *
   * @example
   * <RatsWizardProgress
   *   stepCount={5}
   *   currentStep={1}
   *   currentLabel="Officers"
   * />
   */
  const RatsWizardProgress: React.FC<RatsWizardProgressProps> = ({
    stepCount,
    currentStep,
    currentLabel,
    testID,
  }) => {
    const captionText = currentLabel
      ? `Step ${currentStep + 1} of ${stepCount} · ${currentLabel}`
      : `Step ${currentStep + 1} of ${stepCount}`;

    return (
      <View style={styles.container} testID={testID}>
        <View style={styles.dotRow}>
          {Array.from({ length: stepCount }).map((_, i) => {
            const isActive = i <= currentStep;
            return (
              <View
                key={i}
                testID={`wizard-progress-dot-${i}`}
                accessibilityState={{ selected: isActive }}
                style={[styles.dot, isActive && styles.dotActive]}
              />
            );
          })}
        </View>
        <RatsText text={captionText} style={styles.caption} translate={false} />
      </View>
    );
  };

  const styles = StyleSheet.create({
    container: {
      alignItems: 'center',
      paddingVertical: normalize(12),
      gap: normalize(6),
    },
    dotRow: {
      flexDirection: 'row',
      gap: normalize(8),
    },
    dot: {
      width: normalize(8),
      height: normalize(8),
      borderRadius: normalize(4),
      backgroundColor: color.medium_grey,
    },
    dotActive: {
      backgroundColor: color.main,
    },
    caption: {
      fontSize: fontSize.small,
      fontFamily: fontFamily.regular,
      color: color.dark_grey,
    },
  });

  export default RatsWizardProgress;
  ```

- [ ] **Step 4: Run test to confirm pass**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx jest src/components/rats-wizard-progress --no-coverage 2>&1 | tail -10`
  Expected: PASS — 5 tests pass.

- [ ] **Step 5: TypeScript check**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx tsc --noEmit 2>&1 | grep -E "rats-wizard-progress" | head -5`
  Expected: No output.

---

## Task 4: Create `RatsWizardSlide` component + Reanimated mock setup (Commit 1, part 4)

**Files:**

- Modify: `jest.setup.js` (add Reanimated mock if not present)
- Create: `src/components/rats-wizard-slide/index.tsx`
- Create: `src/components/rats-wizard-slide/__tests__/index.test.tsx`

- [ ] **Step 1: Verify or add the Reanimated mock**

  Run: `grep -n "reanimated" /Users/marcuspersonal/dev/Regroup/jest.setup.js`
  If the output shows a `jest.mock('react-native-reanimated', ...)` line, skip to Step 2.

  Otherwise, add the official mock to the top of `jest.setup.js`:

  ```javascript
  jest.mock('react-native-reanimated', () =>
    require('react-native-reanimated/mock'),
  );
  ```

- [ ] **Step 2: Write the failing test**

  Create `src/components/rats-wizard-slide/__tests__/index.test.tsx`:

  ```typescript
  import React from 'react';
  import { Text } from 'react-native';
  import { render } from '@testing-library/react-native';
  import RatsWizardSlide from '../index';

  describe('RatsWizardSlide', () => {
    it('renders all children (one per step)', () => {
      const { getByText } = render(
        <RatsWizardSlide currentStep={0}>
          <Text>Page 1</Text>
          <Text>Page 2</Text>
          <Text>Page 3</Text>
        </RatsWizardSlide>,
      );
      expect(getByText('Page 1')).toBeTruthy();
      expect(getByText('Page 2')).toBeTruthy();
      expect(getByText('Page 3')).toBeTruthy();
    });

    it('renders a step container per child', () => {
      const { getAllByTestId } = render(
        <RatsWizardSlide currentStep={0}>
          <Text>A</Text>
          <Text>B</Text>
        </RatsWizardSlide>,
      );
      expect(getAllByTestId(/wizard-slide-step-\d+/)).toHaveLength(2);
    });

    it('exposes currentStep via testID for the wrapper', () => {
      const { getByTestId } = render(
        <RatsWizardSlide currentStep={1} testID="my-wizard">
          <Text>A</Text>
          <Text>B</Text>
        </RatsWizardSlide>,
      );
      expect(getByTestId('my-wizard')).toBeTruthy();
    });

    it('does not crash when currentStep changes', () => {
      const { rerender, getByText } = render(
        <RatsWizardSlide currentStep={0}>
          <Text>A</Text>
          <Text>B</Text>
        </RatsWizardSlide>,
      );
      rerender(
        <RatsWizardSlide currentStep={1}>
          <Text>A</Text>
          <Text>B</Text>
        </RatsWizardSlide>,
      );
      expect(getByText('A')).toBeTruthy();
      expect(getByText('B')).toBeTruthy();
    });
  });
  ```

- [ ] **Step 3: Run test to confirm failure**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx jest src/components/rats-wizard-slide --no-coverage 2>&1 | tail -10`
  Expected: FAIL — `Cannot find module '../index'`

- [ ] **Step 4: Implement the component**

  Create `src/components/rats-wizard-slide/index.tsx`:

  ```typescript
  import React, { useEffect } from 'react';
  import { Dimensions, View, StyleSheet } from 'react-native';
  import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
  } from 'react-native-reanimated';

  const SCREEN_WIDTH = Dimensions.get('window').width;

  export interface RatsWizardSlideProps {
    /** Active step index (0-indexed). */
    currentStep: number;
    /** One child per step; all render, but only the active one is on-screen. */
    children: React.ReactNode[];
    testID?: string;
  }

  /**
   * Slide-between-steps animation for multi-step wizards. Lays out children
   * horizontally and animates a translateX based on `currentStep`.
   *
   * Uses react-native-reanimated 2.x. Replaces the older ViewPager pattern.
   *
   * @example
   * <RatsWizardSlide currentStep={step}>
   *   <StepOne />
   *   <StepTwo />
   *   <StepThree />
   * </RatsWizardSlide>
   */
  const RatsWizardSlide: React.FC<RatsWizardSlideProps> = ({
    currentStep,
    children,
    testID,
  }) => {
    const translateX = useSharedValue(-currentStep * SCREEN_WIDTH);

    useEffect(() => {
      translateX.value = withTiming(-currentStep * SCREEN_WIDTH, {
        duration: 250,
        easing: Easing.out(Easing.cubic),
      });
    }, [currentStep, translateX]);

    const slideStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: translateX.value }],
    }));

    return (
      <View style={styles.viewport} testID={testID}>
        <Animated.View
          style={[
            styles.row,
            { width: SCREEN_WIDTH * children.length },
            slideStyle,
          ]}>
          {children.map((child, i) => (
            <View key={i} testID={`wizard-slide-step-${i}`} style={styles.step}>
              {child}
            </View>
          ))}
        </Animated.View>
      </View>
    );
  };

  const styles = StyleSheet.create({
    viewport: {
      flex: 1,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      flex: 1,
    },
    step: {
      width: SCREEN_WIDTH,
      flex: 1,
    },
  });

  export default RatsWizardSlide;
  ```

- [ ] **Step 5: Run test to confirm pass**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx jest src/components/rats-wizard-slide --no-coverage 2>&1 | tail -10`
  Expected: PASS — 4 tests pass.

- [ ] **Step 6: TypeScript check**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx tsc --noEmit 2>&1 | grep -E "rats-wizard-slide" | head -5`
  Expected: No output.

---

## Task 5: Author the pattern reference doc + commit C1

**Files:**

- Create: `docs/patterns/2026-05-27-wizard-ux-conventions.md`

- [ ] **Step 1: Create `docs/patterns/` directory and the doc**

  ```bash
  cd /Users/marcuspersonal/dev/Regroup
  mkdir -p docs/patterns
  ```

  Create `docs/patterns/2026-05-27-wizard-ux-conventions.md`:

  ````markdown
  # Wizard UX Conventions (Regroup mobile)

  **Established:** 2026-05-27
  **Status:** Active convention
  **Applies to:** Any multi-step form flow in Regroup

  When to use this pattern: multi-step forms with clear sequential progression
  (setup flows, onboarding, multi-page applications).

  ## Required components

  - `src/components/rats-wizard-progress` — step indicator (dots + label)
  - `src/components/rats-wizard-slide` — slide-between-steps animation
  - `src/components/setup-header` — per-step title + description + icon (BoxedIcon)
  - `src/components/setup-buttons` — paired Back/Next at bottom

  ## Required wrapping

  - `SafeAreaView` from `react-native-safe-area-context` at root
  - `ScrollView` inside each step for content (handle keyboard scroll)
  - `useKeyboardVisible` from `src/hooks/useKeyboardVisible` if you want to hide chrome when the keyboard is up

  ## Validation pattern

  - Prefer `nextDisabled` on SetupButtons over `Alert.alert` after tap
  - Reserve `Alert.alert` for genuinely async errors (mutation failures)

  ## State management

  - `useState` for step index (0-indexed)
  - TanStack Query mutation for the final submission
  - No Redux for transient wizard state

  ## File layout template

  ```tsx
  import React, { useState } from 'react';
  import { View, ScrollView } from 'react-native';
  import { SafeAreaView } from 'react-native-safe-area-context';
  import RatsWizardProgress from '../../components/rats-wizard-progress';
  import RatsWizardSlide from '../../components/rats-wizard-slide';
  import SetupHeader from '../../components/setup-header';
  import SetupButtons from '../../components/setup-buttons';
  import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';
  import { color } from '../../styles/theme';

  const STEPS = [
    { label: 'Welcome', icon: 'hand-wave', bg: color.light_purple },
    { label: 'Details', icon: 'info-circle', bg: color.baby_blue },
    { label: 'Done', icon: 'check-circle', bg: color.main },
  ];

  const MyWizard: React.FC = () => {
    const [step, setStep] = useState(0);
    const keyboardUp = useKeyboardVisible();
    const current = STEPS[step];

    const stepValid = true; // derive per-step

    return (
      <SafeAreaView
        edges={['top']}
        style={{ flex: 1, backgroundColor: color.light_grey }}>
        {!keyboardUp && (
          <RatsWizardProgress
            stepCount={STEPS.length}
            currentStep={step}
            currentLabel={current.label}
          />
        )}
        <RatsWizardSlide currentStep={step}>
          {STEPS.map((s, i) => (
            <ScrollView key={i} contentContainerStyle={{ padding: 24 }}>
              <SetupHeader
                header={s.label}
                description="..."
                icon={s.icon}
                iconBackgroundColor={s.bg}
              />
              {/* per-step content */}
            </ScrollView>
          ))}
        </RatsWizardSlide>
        <SetupButtons
          onBackPress={() => setStep(s => Math.max(0, s - 1))}
          onNextPress={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}
          hideBack={step === 0}
          nextDisabled={!stepValid}
        />
      </SafeAreaView>
    );
  };
  ```

  ## Where this is applied today

  - `src/screens/Oxford/OxfordOnboardingWizard.tsx`
  - `src/screens/SetupWizards/OperatorSetupWizard.tsx`

  ## Candidates for future application

  These flows currently use ad-hoc multi-step UI that could adopt the pattern:

  - `src/screens/ResidentIntake/IntakeFormScreen.tsx` — multi-step intake form
  - `src/screens/Payments/ResidentPayment.tsx` — multi-step payment flow

  (List to be expanded as wizard work continues.)

  ## When to break the convention

  - Single-screen flows that don't benefit from step-by-step framing
  - Modal flows where the wizard chrome would compete with the modal's own framing
  - Flows where step order is non-linear (use a routing approach instead)
  ````

- [ ] **Step 2: Run full Commit 1 test suite**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx jest src/hooks/__tests__/useKeyboardVisible.test.ts src/components/setup-buttons src/components/rats-wizard-progress src/components/rats-wizard-slide --no-coverage 2>&1 | tail -10`
  Expected: All 4 test files pass.

- [ ] **Step 3: TypeScript clean check (project-wide)**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx tsc --noEmit 2>&1 | tail -10`
  Expected: No new TS errors (pre-existing errors in unrelated files are fine).

- [ ] **Step 4: Commit C1**

  ```bash
  cd /Users/marcuspersonal/dev/Regroup
  git add \
    src/hooks/useKeyboardVisible.ts \
    src/hooks/__tests__/useKeyboardVisible.test.ts \
    src/components/setup-buttons/ \
    src/components/rats-wizard-progress/ \
    src/components/rats-wizard-slide/ \
    docs/patterns/2026-05-27-wizard-ux-conventions.md \
    jest.setup.js
  git commit -m "feat(components): add shared wizard components (RatsWizardProgress, RatsWizardSlide, SetupButtons, useKeyboardVisible)

  Implements the shared component layer for Oxford+Traditional wizard
  harmonization (spec: 2026-05-27-oxford-wizard-harmonization-design.md).

  - RatsWizardProgress: hybrid dots + 'Step N of M · label' caption
  - RatsWizardSlide: Reanimated 2.x slide transition; replaces ViewPager
  - SetupButtons: paired Back/Next row (extracted from OperatorSetupWizard)
  - useKeyboardVisible: keyboard-visibility hook for hiding wizard chrome
  - docs/patterns/2026-05-27-wizard-ux-conventions.md: usage guide

  No wizard files modified in this commit — wizards swap in C2 + C3."
  ```

---

## Task 6: Refactor `OxfordOnboardingWizard.tsx` (Commit 2)

**Files:**

- Modify: `src/screens/Oxford/OxfordOnboardingWizard.tsx`

Reference: current file is at `src/screens/Oxford/OxfordOnboardingWizard.tsx` (350 lines, see spec for current behavior).

- [ ] **Step 1: Choose icons for each step**

  Run: `grep -rhoE 'icon="[a-z-]+"' /Users/marcuspersonal/dev/Regroup/src --include='*.tsx' | sort -u`
  Read the list of icon names already used in the app. Pick the closest match for each step from these — substitute as needed:

  | Step            | Preferred icon | Fallback if missing |
  | --------------- | -------------- | ------------------- |
  | 0 Welcome       | `house-user`   | `home`              |
  | 1 Officers      | `users`        | `user-friends`      |
  | 2 First Meeting | `calendar-day` | `calendar`          |
  | 3 EES           | `dollar-sign`  | `money-bill`        |
  | 4 Done          | `check-circle` | `check`             |

  Record substitutions in your local notes; they go into Step 2's `STEPS` const.

- [ ] **Step 2: Rewrite the wizard**

  Replace the entire contents of `src/screens/Oxford/OxfordOnboardingWizard.tsx`:

  ```typescript
  import React, { useMemo, useState } from 'react';
  import {
    View,
    ScrollView,
    TextInput,
    TouchableOpacity,
    StyleSheet,
  } from 'react-native';
  import { SafeAreaView } from 'react-native-safe-area-context';
  import DatePicker from 'react-native-date-picker';
  import { format } from 'date-fns';
  import { NativeStackNavigationProp } from '@react-navigation/native-stack';
  import { RootStackParamList, Routes } from '../../navigation/types';
  import { RatsText } from '../../components/rats-text';
  import RatsWizardProgress from '../../components/rats-wizard-progress';
  import RatsWizardSlide from '../../components/rats-wizard-slide';
  import SetupHeader from '../../components/setup-header';
  import SetupButtons from '../../components/setup-buttons';
  import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';
  import { color, fontSize, fontFamily, normalize } from '../../styles/theme';
  import { useSelectedHouse } from '../../hooks/useSelectedHouse';
  import { useCompleteOxfordOnboarding } from '../../state/mutations/oxfordOnboardingMutations';
  import { logException } from '../../util/logging';

  interface Props {
    navigation: NativeStackNavigationProp<RootStackParamList>;
  }

  interface WizardState {
    presidentName: string;
    treasurerName: string;
    secretaryName: string;
    firstMeetingDate: Date | null;
    firstMeetingTime: string;
    eesMonthlyAmount: string;
  }

  const STEPS = [
    { label: 'Welcome', icon: 'house-user', bg: color.light_purple },
    { label: 'Officers', icon: 'users', bg: color.baby_blue },
    { label: 'First Meeting', icon: 'calendar-day', bg: color.green_blue },
    { label: 'EES', icon: 'dollar-sign', bg: color.main },
    { label: 'Done', icon: 'check-circle', bg: color.main },
  ];
  const TOTAL_STEPS = STEPS.length;

  const OxfordOnboardingWizard: React.FC<Props> = ({ navigation }) => {
    const [step, setStep] = useState(0);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const { house } = useSelectedHouse();
    const completeOnboarding = useCompleteOxfordOnboarding();
    const keyboardVisible = useKeyboardVisible();
    const [state, setState] = useState<WizardState>({
      presidentName: '',
      treasurerName: '',
      secretaryName: '',
      firstMeetingDate: null,
      firstMeetingTime: '',
      eesMonthlyAmount: '',
    });

    const houseId = house?.id ?? '';

    // Per-step validation: button Next stays disabled until input is valid
    const eesAmountValid = useMemo(() => {
      const n = parseFloat(state.eesMonthlyAmount);
      return state.eesMonthlyAmount.trim() !== '' && !isNaN(n) && n > 0;
    }, [state.eesMonthlyAmount]);

    const nextDisabled = useMemo(() => {
      switch (step) {
        case 2:
          return state.firstMeetingDate == null;
        case 3:
          return !eesAmountValid;
        case 4:
          return completeOnboarding.isPending;
        default:
          return false;
      }
    }, [
      step,
      state.firstMeetingDate,
      eesAmountValid,
      completeOnboarding.isPending,
    ]);

    const goNext = () => {
      if (step === TOTAL_STEPS - 1) {
        handleFinish();
      } else {
        setStep(s => Math.min(s + 1, TOTAL_STEPS - 1));
      }
    };

    const goBack = () => {
      if (step === 0) navigation.goBack();
      else setStep(s => s - 1);
    };

    const handleFinish = async () => {
      if (!houseId || !state.firstMeetingDate || !eesAmountValid) {
        // Defensive guard — UI shouldn't allow reaching here, but keep the
        // server-call safe.
        return;
      }

      const officers = [
        { role: 'president' as const, name: state.presidentName },
        { role: 'treasurer' as const, name: state.treasurerName },
        { role: 'secretary' as const, name: state.secretaryName },
      ].filter(o => o.name.trim() !== '');

      try {
        await completeOnboarding.mutateAsync({
          houseId,
          officers,
          firstMeeting: {
            scheduledDate: `${format(state.firstMeetingDate, 'yyyy-MM-dd')}T${
              state.firstMeetingTime || '19:00'
            }:00`,
          },
          eesMonthlyAmount: parseFloat(state.eesMonthlyAmount),
        });
      } catch (error) {
        logException(error);
        return;
      }

      // Navigate outside the try so navigation failure isn't mislabeled as a
      // mutation failure.
      navigation.replace(Routes.OxfordDashboard);
    };

    return (
      <SafeAreaView
        edges={['top']}
        style={{ flex: 1, backgroundColor: color.light_grey }}>
        {!keyboardVisible && (
          <RatsWizardProgress
            stepCount={TOTAL_STEPS}
            currentStep={step}
            currentLabel={STEPS[step].label}
            testID="oxford-wizard-progress"
          />
        )}
        <RatsWizardSlide currentStep={step} testID="oxford-wizard-slide">
          {/* Step 0: Welcome */}
          <ScrollView
            contentContainerStyle={styles.content}
            testID="wizard-step-1">
            <SetupHeader
              header="Welcome to Oxford House Management"
              description="This quick setup takes 2 minutes. We'll configure your officers, first meeting, and equity distribution settings."
              icon={STEPS[0].icon}
              iconBackgroundColor={STEPS[0].bg}
            />
          </ScrollView>

          {/* Step 1: Officers */}
          <ScrollView
            contentContainerStyle={styles.content}
            testID="wizard-step-2">
            <SetupHeader
              header="Officers"
              description="Assign your house's current leadership. All fields are optional."
              icon={STEPS[1].icon}
              iconBackgroundColor={STEPS[1].bg}
            />
            {(['president', 'treasurer', 'secretary'] as const).map(role => {
              const key = `${role}Name` as
                | 'presidentName'
                | 'treasurerName'
                | 'secretaryName';
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
                    } name (optional)`}
                    value={state[key]}
                    onChangeText={v => setState(s => ({ ...s, [key]: v }))}
                  />
                </View>
              );
            })}
          </ScrollView>

          {/* Step 2: First Meeting */}
          <ScrollView
            contentContainerStyle={styles.content}
            testID="wizard-step-3">
            <SetupHeader
              header="First business meeting"
              description="Schedule your first business meeting. You can change this later."
              icon={STEPS[2].icon}
              iconBackgroundColor={STEPS[2].bg}
            />
            <View style={styles.fieldRow}>
              <RatsText
                text="Meeting date"
                style={styles.label}
                translate={false}
              />
              <TouchableOpacity
                testID="wizard-date-display"
                accessibilityLabel="Select meeting date"
                accessibilityRole="button"
                style={styles.input}
                onPress={() => setShowDatePicker(true)}>
                <RatsText
                  text={
                    state.firstMeetingDate
                      ? format(state.firstMeetingDate, 'yyyy-MM-dd')
                      : 'Select a date'
                  }
                  style={{ fontSize: fontSize.regular, color: color.black }}
                  translate={false}
                />
              </TouchableOpacity>
              <DatePicker
                modal
                mode="date"
                open={showDatePicker}
                date={state.firstMeetingDate ?? new Date()}
                onConfirm={(d: Date) => {
                  setShowDatePicker(false);
                  setState(s => ({ ...s, firstMeetingDate: d }));
                }}
                onCancel={() => setShowDatePicker(false)}
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
          </ScrollView>

          {/* Step 3: EES */}
          <ScrollView
            contentContainerStyle={styles.content}
            testID="wizard-step-4">
            <SetupHeader
              header="Oxford House Equity"
              description="The Equity Expense Share (EES) is the monthly amount each resident contributes to house expenses."
              icon={STEPS[3].icon}
              iconBackgroundColor={STEPS[3].bg}
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
          </ScrollView>

          {/* Step 4: Done */}
          <ScrollView
            contentContainerStyle={styles.content}
            testID="wizard-step-5">
            <SetupHeader
              header="You're all set!"
              description="Your Oxford House is configured. You can update any of these settings from the Oxford Dashboard."
              icon={STEPS[4].icon}
              iconBackgroundColor={STEPS[4].bg}
            />
            {completeOnboarding.isError && (
              <RatsText
                text="Setup failed. Please try again."
                style={styles.errorText}
                translate={false}
              />
            )}
          </ScrollView>
        </RatsWizardSlide>

        <SetupButtons
          onBackPress={goBack}
          onNextPress={goNext}
          nextLabel={step === TOTAL_STEPS - 1 ? 'Finish' : 'Next'}
          nextDisabled={nextDisabled}
          isLoading={step === TOTAL_STEPS - 1 && completeOnboarding.isPending}
        />
      </SafeAreaView>
    );
  };

  const styles = StyleSheet.create({
    content: { padding: normalize(24), gap: normalize(16) },
    body: { fontSize: fontSize.regular, color: color.dark_grey },
    hint: { fontSize: fontSize.small, color: color.dark_grey },
    label: {
      fontSize: fontSize.regular,
      fontFamily: fontFamily.bold,
      color: color.black,
      marginBottom: normalize(4),
    },
    input: {
      borderWidth: 1,
      borderColor: color.medium_grey,
      borderRadius: normalize(8),
      padding: normalize(12),
      fontSize: fontSize.regular,
      backgroundColor: color.white,
    },
    fieldRow: { marginBottom: normalize(16) },
    errorText: {
      color: color.red,
      fontSize: fontSize.regular,
      marginTop: normalize(8),
    },
  });

  export default OxfordOnboardingWizard;
  ```

- [ ] **Step 3: TypeScript check**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx tsc --noEmit 2>&1 | grep -E "OxfordOnboardingWizard" | head -5`
  Expected: No output. If errors appear, the most likely cause is a missing color in the theme — replace with a present color (e.g., `color.baby_blue` instead of `color.green_blue` if the latter doesn't exist).

---

## Task 7: Update Oxford wizard tests + commit C2

**Files:**

- Modify: `src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx`

The existing test file is comprehensive (10+ tests). The refactor changes the rendered tree in two ways:

- `ScreenHeader` is replaced by `SetupHeader` — the `MockScreenHeader` mock no longer matches the actual tree. We need to either update or remove that mock.
- Validation `Alert.alert` calls are removed — tests that asserted on Alert behavior need to assert on `nextDisabled` instead.
- The button row uses `setup-buttons-next` testID instead of `RatsButton` queried by text.

- [ ] **Step 1: Run existing test to confirm what breaks**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx jest src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx --no-coverage 2>&1 | tail -30`
  Note which tests fail and why. Common patterns:

  - "Cannot find module 'screen-header'" — the mock import path needs updating
  - "Unable to find element with text NEXT" — the button query needs updating to `getByTestId('setup-buttons-next')`
  - Alert spy assertions failing — alerts are no longer fired

- [ ] **Step 2: Update mocks at the top of the test file**

  Replace the `ScreenHeader` mock block with a `SetupHeader` mock. Open `src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx` and locate the existing `jest.mock('../../../components/screen-header', ...)` block (around line 41). Replace it with:

  ```typescript
  // ─── SetupHeader mock — preserve header text for queries ──────────────────
  jest.mock('../../../components/setup-header', () => {
    const React = require('react');
    const { View, Text } = require('react-native');
    return function MockSetupHeader(props: {
      header: string;
      description?: string;
    }) {
      return React.createElement(
        View,
        { testID: 'setup-header' },
        React.createElement(Text, null, props.header),
        props.description && React.createElement(Text, null, props.description),
      );
    };
  });
  ```

  Then also add a mock for `SetupButtons` so tests can press the Next button via stable testIDs:

  ```typescript
  jest.mock('../../../components/setup-buttons', () => {
    const React = require('react');
    const {
      TouchableOpacity,
      Text,
      ActivityIndicator,
      View,
    } = require('react-native');
    return function MockSetupButtons(props: {
      onBackPress: () => void;
      onNextPress: () => void;
      nextDisabled?: boolean;
      hideBack?: boolean;
      isLoading?: boolean;
      nextLabel?: string;
    }) {
      return React.createElement(
        View,
        null,
        !props.hideBack &&
          React.createElement(
            TouchableOpacity,
            { testID: 'setup-buttons-back', onPress: props.onBackPress },
            React.createElement(Text, null, 'BACK'),
          ),
        props.isLoading
          ? React.createElement(ActivityIndicator, null)
          : React.createElement(
              TouchableOpacity,
              {
                testID: 'setup-buttons-next',
                onPress: props.nextDisabled ? undefined : props.onNextPress,
                accessibilityState: { disabled: !!props.nextDisabled },
              },
              React.createElement(
                Text,
                null,
                (props.nextLabel || 'NEXT').toUpperCase(),
              ),
            ),
      );
    };
  });
  ```

  Also mock `RatsWizardProgress` and `RatsWizardSlide` so they don't drag Reanimated into every Oxford test:

  ```typescript
  jest.mock('../../../components/rats-wizard-progress', () => {
    const React = require('react');
    const { View, Text } = require('react-native');
    return function MockProgress(props: {
      stepCount: number;
      currentStep: number;
      currentLabel?: string;
    }) {
      return React.createElement(
        View,
        { testID: 'wizard-progress' },
        React.createElement(
          Text,
          null,
          `Step ${props.currentStep + 1} of ${props.stepCount}${
            props.currentLabel ? ' · ' + props.currentLabel : ''
          }`,
        ),
      );
    };
  });

  jest.mock('../../../components/rats-wizard-slide', () => {
    const React = require('react');
    const { View } = require('react-native');
    return function MockSlide(props: {
      currentStep: number;
      children: React.ReactNode[];
    }) {
      // Render ONLY the active step so existing testID queries (wizard-step-N)
      // continue to match a single element.
      return React.createElement(
        View,
        { testID: 'wizard-slide' },
        props.children[props.currentStep],
      );
    };
  });
  ```

- [ ] **Step 3: Update queries throughout the test body**

  Find-and-replace within the test file:

  | Old query                                                        | New query                                                                                                                                            |
  | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `getByText('NEXT')` / `fireEvent.press(getByText('NEXT'))`       | `fireEvent.press(getByTestId('setup-buttons-next'))`                                                                                                 |
  | `getByText('FINISH')` / similar                                  | `fireEvent.press(getByTestId('setup-buttons-next'))` (the Mock renders nextLabel uppercased — query by testID instead for stability)                 |
  | `getByTestId('screen-header-back')`                              | `getByTestId('setup-buttons-back')`                                                                                                                  |
  | Alert.alert spy assertions for "Invalid Amount" / "Invalid Date" | **Remove** — validation now disables the button. Replace with: assert `getByTestId('setup-buttons-next').props.accessibilityState.disabled === true` |

- [ ] **Step 4: Run tests to confirm pass**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx jest src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx --no-coverage 2>&1 | tail -15`
  Expected: PASS — same test count as the baseline from Task 0 Step 6 (or higher; some Alert tests may have split into "next disabled when X" tests).
  If a test fails, look at the rendered tree (use `debug()` from `@testing-library/react-native`) — most failures are query-path issues, not logic issues.

- [ ] **Step 5: Commit C2**

  ```bash
  cd /Users/marcuspersonal/dev/Regroup
  git add \
    src/screens/Oxford/OxfordOnboardingWizard.tsx \
    src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx
  git commit -m "refactor(oxford): swap OxfordOnboardingWizard to shared wizard components

  Swaps the Oxford onboarding wizard to use the shared components
  introduced in C1 (RatsWizardProgress, RatsWizardSlide, SetupHeader,
  SetupButtons, useKeyboardVisible hook).

  Behavior changes:
  - SafeAreaView wraps the screen (was: plain View) — fixes notch clipping
  - Per-step SetupHeader card (was: minimal ScreenHeader)
  - Paired Back/Next button row (was: single full-width Next)
  - Validation via nextDisabled (was: Alert.alert after invalid tap)
  - Reanimated slide animation between steps (was: instant swap)
  - Progress indicator hides when keyboard is up

  All existing tests updated to query the new component tree."
  ```

---

## Task 8: Refactor `OperatorSetupWizard.tsx` parent (Commit 3, part 1)

**Files:**

- Modify: `src/screens/SetupWizards/OperatorSetupWizard.tsx`

- [ ] **Step 1: Rewrite the parent**

  Replace the entire contents of `src/screens/SetupWizards/OperatorSetupWizard.tsx`:

  ```typescript
  import React, { useCallback, useMemo, useState } from 'react';
  import { View, StyleSheet } from 'react-native';
  import { SafeAreaView } from 'react-native-safe-area-context';
  import ManagerSetup from './ManagerSetup';
  import ChoreSetup from './ChoreSetup';
  import HouseSetup from './HouseSetup';
  import { PhaseConfig } from './PhaseSetup/PhaseConfig';
  import GuestSetup from './GuestSetup';
  import { Routes, SetupScreenNavigationProp } from '../../navigation/types';
  import RatsWizardProgress from '../../components/rats-wizard-progress';
  import RatsWizardSlide from '../../components/rats-wizard-slide';
  import SetupButtons from '../../components/setup-buttons';
  import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';
  import { color, normalize } from '../../styles/theme';

  interface Props {
    navigation: SetupScreenNavigationProp;
  }

  const STEP_LABELS = [
    'Details',
    'Managers',
    'Phases',
    'Chores',
    'Guests',
  ] as const;
  const TOTAL_STEPS = STEP_LABELS.length;

  const OperatorSetupWizard: React.FC<Props> = props => {
    const [currentPage, setCurrentPage] = useState(0);
    const keyboardVisible = useKeyboardVisible();
    const navigation = props.navigation;

    const finishHouseSetup = useCallback(() => {
      navigation.navigate(Routes.OrgSetup);
    }, [navigation]);

    const goBack = useCallback(() => {
      if (currentPage === 0) navigation.goBack();
      else setCurrentPage(p => p - 1);
    }, [currentPage, navigation]);

    const goNext = useCallback(() => {
      if (currentPage === TOTAL_STEPS - 1) {
        finishHouseSetup();
      } else {
        setCurrentPage(p => Math.min(p + 1, TOTAL_STEPS - 1));
      }
    }, [currentPage, finishHouseSetup]);

    // Step components receive their parent-driven navigation callbacks but
    // no longer render their own button row.
    const pages = useMemo(
      () => [
        <HouseSetup
          {...props}
          focused={currentPage === 0}
          onNextPress={goNext}
          key="0"
        />,
        <ManagerSetup
          {...props}
          focused={currentPage === 1}
          onPrevPress={goBack}
          onNextPress={goNext}
          key="1"
        />,
        <PhaseConfig
          {...props}
          focused={currentPage === 2}
          onPrevPress={goBack}
          onNextPress={goNext}
          key="2"
        />,
        <ChoreSetup
          {...props}
          focused={currentPage === 3}
          onPrevPress={goBack}
          onNextPress={goNext}
          key="3"
        />,
        <GuestSetup
          {...props}
          focused={currentPage === 4}
          onPrevPress={goBack}
          onNextPress={goNext}
          key="4"
        />,
      ],
      [currentPage, goBack, goNext, props],
    );

    return (
      <SafeAreaView
        edges={['top']}
        style={styles.container}
        testID="house-setup-wizard">
        {!keyboardVisible && (
          <RatsWizardProgress
            stepCount={TOTAL_STEPS}
            currentStep={currentPage}
            currentLabel={STEP_LABELS[currentPage]}
            testID="operator-wizard-progress"
          />
        )}
        <RatsWizardSlide
          currentStep={currentPage}
          testID="operator-wizard-slide">
          {pages}
        </RatsWizardSlide>
        <SetupButtons
          onBackPress={goBack}
          onNextPress={goNext}
          hideBack={currentPage === 0}
          nextLabel={currentPage === TOTAL_STEPS - 1 ? 'Finish' : 'Next'}
        />
      </SafeAreaView>
    );
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: color.light_grey,
    },
  });

  export default OperatorSetupWizard;
  ```

- [ ] **Step 2: TypeScript check**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx tsc --noEmit 2>&1 | grep -E "OperatorSetupWizard|SetupWizard" | head -10`
  Expected: TS errors will appear because the step components (`HouseSetup`, etc.) still try to render their own `SetupButtons` rows. Those errors will resolve as we refactor each step in Task 9.

---

## Task 9: Refactor 5 step components (drop inline button rows)

**Files:**

- Modify: `src/screens/SetupWizards/HouseSetup.tsx`
- Modify: `src/screens/SetupWizards/ManagerSetup.tsx`
- Modify: `src/screens/SetupWizards/PhaseSetup/PhaseConfig.tsx`
- Modify: `src/screens/SetupWizards/ChoreSetup.tsx`
- Modify: `src/screens/SetupWizards/GuestSetup.tsx`

Each step component currently calls `<SetupButtons ... />` (the local one, defined in the old `OperatorSetupWizard.tsx`) at the bottom. The parent now owns this row, so each step needs to **stop rendering buttons** but **keep the `onPrevPress` / `onNextPress` props** so the parent can trigger them (e.g., for steps that validate or save data on Next).

The general pattern per step:

1. Find the `import` line: `import { SetupButtons, SetupHeader } from './OperatorSetupWizard'` (or similar local import). Replace with imports from the new shared paths.
2. Find the `<SetupButtons ... />` JSX block and remove it.
3. If the step has any validation it wanted to enforce on Next, expose it to the parent via a prop callback OR move the validation into the step's own submit logic that runs before calling `onNextPress`.

- [ ] **Step 1: Refactor `HouseSetup.tsx`**

  Read the file first: `cat /Users/marcuspersonal/dev/Regroup/src/screens/SetupWizards/HouseSetup.tsx | head -40` to see the current import + button block.

  Apply two changes:

  - Replace the import `import { SetupButtons, SetupHeader } from './OperatorSetupWizard'` with: `import SetupHeader from '../../components/setup-header'`.
  - Find the `<SetupButtons ... />` JSX block (search for `SetupButtons`) and **delete** it. The parent now renders the button row.
  - If the step calls `submitHouseSetup()` or similar on Next, leave that function in place and ensure it's still called by `onNextPress` — change the parent's `goNext` callback in the page array to call `submitHouseSetup` first, then advance. For HouseSetup specifically, the existing flow does form submission on the Next press; preserve that.

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx tsc --noEmit 2>&1 | grep "HouseSetup" | head -5`
  Expected: TS clean for HouseSetup itself.

- [ ] **Step 2: Refactor `ManagerSetup.tsx`**

  Same pattern as Step 1: replace the local `SetupHeader` / `SetupButtons` import with `import SetupHeader from '../../components/setup-header'`, delete the `<SetupButtons />` block.

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx tsc --noEmit 2>&1 | grep "ManagerSetup" | head -5`
  Expected: TS clean.

- [ ] **Step 3: Refactor `PhaseSetup/PhaseConfig.tsx`**

  Same pattern. **Additionally**: `PhaseConfig` had an iOS-specific `phaseConfigViewPagerRef` hack in the old parent. With Reanimated `RatsWizardSlide`, this hack is no longer needed — verify no references to `phaseConfigViewPagerRef` remain in `PhaseConfig.tsx`. If `PhaseConfig` uses its own internal `ViewPager`, that's a separate concern; leave it intact (it's the sub-pager inside the chore phase config step).

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx tsc --noEmit 2>&1 | grep "PhaseConfig" | head -5`
  Expected: TS clean.

- [ ] **Step 4: Refactor `ChoreSetup.tsx`**

  Same pattern.

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx tsc --noEmit 2>&1 | grep "ChoreSetup" | head -5`
  Expected: TS clean.

- [ ] **Step 5: Refactor `GuestSetup.tsx`**

  Same pattern.

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx tsc --noEmit 2>&1 | grep "GuestSetup" | head -5`
  Expected: TS clean.

- [ ] **Step 6: Full TypeScript check**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx tsc --noEmit 2>&1 | tail -20`
  Expected: No new errors from `SetupWizards/`. Pre-existing errors in unrelated files are acceptable.

---

## Task 10: Delete `OperatorSetupWizardStyles.ts`

**Files:**

- Delete: `src/screens/SetupWizards/OperatorSetupWizardStyles.ts`

The new `OperatorSetupWizard.tsx` has its own colocated `StyleSheet.create()`. The external styles file is no longer imported anywhere.

- [ ] **Step 1: Confirm no remaining imports**

  Run: `grep -rn "OperatorSetupWizardStyles" /Users/marcuspersonal/dev/Regroup/src 2>/dev/null`
  Expected: No output. If any file still imports it, refactor that file to inline its styles.

- [ ] **Step 2: Delete the file**

  ```bash
  cd /Users/marcuspersonal/dev/Regroup
  rm src/screens/SetupWizards/OperatorSetupWizardStyles.ts
  ```

- [ ] **Step 3: TypeScript check**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx tsc --noEmit 2>&1 | grep "OperatorSetupWizardStyles" | head -5`
  Expected: No output.

---

## Task 11: Update Traditional wizard test

**Files:**

- Modify: `src/screens/SetupWizards/__tests__/OperatorSetupWizard.test.tsx`

- [ ] **Step 1: Run existing test to see what breaks**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx jest src/screens/SetupWizards/__tests__/OperatorSetupWizard.test.tsx --no-coverage 2>&1 | tail -20`
  Note failures. Likely issues:

  - `Cannot find module 'react-native-best-viewpager'` — if the test imported `ViewPager` directly; replace with the new RatsWizardSlide mock
  - `viewPagerRef.current.setPage is not a function` — tests that called the ref imperatively. Replace with rerendering the component with a new `currentPage` prop, or with firing the `setup-buttons-next` press

- [ ] **Step 2: Add mocks for the shared components at the top of the test**

  Open `src/screens/SetupWizards/__tests__/OperatorSetupWizard.test.tsx`. Add at the top, near other `jest.mock` calls:

  ```typescript
  jest.mock('../../../components/rats-wizard-progress', () => {
    const React = require('react');
    const { View } = require('react-native');
    return function Mock(props: { currentStep: number }) {
      return React.createElement(View, {
        testID: `progress-${props.currentStep}`,
      });
    };
  });

  jest.mock('../../../components/rats-wizard-slide', () => {
    const React = require('react');
    const { View } = require('react-native');
    return function Mock(props: {
      currentStep: number;
      children: React.ReactNode[];
    }) {
      return React.createElement(View, null, props.children[props.currentStep]);
    };
  });

  jest.mock('../../../components/setup-buttons', () => {
    const React = require('react');
    const { TouchableOpacity, Text, View } = require('react-native');
    return function Mock(props: {
      onBackPress: () => void;
      onNextPress: () => void;
      hideBack?: boolean;
      nextLabel?: string;
    }) {
      return React.createElement(
        View,
        null,
        !props.hideBack &&
          React.createElement(
            TouchableOpacity,
            { testID: 'setup-buttons-back', onPress: props.onBackPress },
            React.createElement(Text, null, 'BACK'),
          ),
        React.createElement(
          TouchableOpacity,
          { testID: 'setup-buttons-next', onPress: props.onNextPress },
          React.createElement(Text, null, props.nextLabel || 'NEXT'),
        ),
      );
    };
  });
  ```

- [ ] **Step 3: Update navigation assertions to use button presses**

  Find any test that called the ViewPager imperatively (e.g., `viewPagerRef.current.setPage(2)`) and replace with:

  ```typescript
  // Step 0 → Step 1
  fireEvent.press(getByTestId('setup-buttons-next'));
  // Step 1 → Step 2
  fireEvent.press(getByTestId('setup-buttons-next'));
  // Step 2 → Step 3
  fireEvent.press(getByTestId('setup-buttons-next'));
  // Step 3 → Step 4 (final)
  fireEvent.press(getByTestId('setup-buttons-next'));
  ```

  For tests that need to start from a specific step, repeat the `fireEvent.press(getByTestId('setup-buttons-next'))` line for each forward step (the wizard has 5 steps, indexed 0–4 — 4 forward presses go from step 0 to step 4).

- [ ] **Step 4: Run test to confirm pass**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx jest src/screens/SetupWizards/__tests__/OperatorSetupWizard.test.tsx --no-coverage 2>&1 | tail -15`
  Expected: PASS — same test count as baseline (Task 0 Step 6).

---

## Task 12: Manual smoke test + commit C3

- [ ] **Step 1: Run full test suite**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx jest src/screens/Oxford src/screens/SetupWizards src/components/rats-wizard-progress src/components/rats-wizard-slide src/components/setup-buttons src/hooks/__tests__/useKeyboardVisible.test.ts --no-coverage 2>&1 | tail -15`
  Expected: All test files pass.

- [ ] **Step 2: TypeScript clean**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx tsc --noEmit 2>&1 | tail -5`
  Expected: No new errors.

- [ ] **Step 3: Confirm ViewPager not imported in src/**

  Run: `grep -rln "react-native-best-viewpager" /Users/marcuspersonal/dev/Regroup/src 2>/dev/null`
  Expected: No output. (Package stays in `package.json` for now; removal is a separate follow-up PR.)

- [ ] **Step 4: iOS simulator smoke test (manual)**

  ```bash
  cd /Users/marcuspersonal/dev/Regroup
  npx react-native run-ios
  ```

  Manual flow:

  - Sign in as an operator with a non-Oxford house
  - Trigger new house setup (depends on your app's entry point — e.g., via Settings → New House or the OperatorSetupWizard route directly)
  - Step through all 5 traditional wizard pages: verify each step slides smoothly, dot indicator advances, Back button appears on step 2+, Finish button on step 5
  - Sign in as an Oxford-enabled operator (or use `setOxfordEnabled` callable from the Stripe testing flow)
  - Verify redirect to Oxford wizard, step through all 5 pages: verify slide animation, header card per step, Next button is disabled on Step 3 (date) and Step 4 (EES) until input is valid, Finish button on Step 5

- [ ] **Step 5: Visual parity screenshot check (manual)**

  Take screenshots of the equivalent step in each wizard (e.g., "Officers" in Oxford vs. "Managers" in Traditional). Confirm:

  - Same progress indicator (dots + label) at top
  - Same SetupHeader card (icon + title + description)
  - Same SetupButtons row (Back left, Next right) at bottom
  - Same SafeAreaView edge treatment

  If a screenshot reveals a divergence not anticipated by the spec, fix it now and note the fix below before committing.

- [ ] **Step 6: Commit C3**

  ```bash
  cd /Users/marcuspersonal/dev/Regroup
  git add \
    src/screens/SetupWizards/OperatorSetupWizard.tsx \
    src/screens/SetupWizards/HouseSetup.tsx \
    src/screens/SetupWizards/ManagerSetup.tsx \
    src/screens/SetupWizards/PhaseSetup/PhaseConfig.tsx \
    src/screens/SetupWizards/ChoreSetup.tsx \
    src/screens/SetupWizards/GuestSetup.tsx \
    src/screens/SetupWizards/__tests__/OperatorSetupWizard.test.tsx
  git rm src/screens/SetupWizards/OperatorSetupWizardStyles.ts
  git commit -m "refactor(setup-wizards): swap OperatorSetupWizard to shared components

  Final commit of the Oxford+Traditional wizard harmonization (spec:
  2026-05-27-oxford-wizard-harmonization-design.md). Both wizards now use
  the same shared components introduced in C1.

  Changes:
  - OperatorSetupWizard: drop react-native-best-viewpager + IOS hack;
    use RatsWizardSlide + RatsWizardProgress + SetupButtons
  - 5 step components: drop inline SetupButtons rows (parent owns the
    button row now); switch SetupHeader import to canonical component
  - Delete OperatorSetupWizardStyles.ts (styles colocated in parent)
  - Wrap in SafeAreaView (was: plain View)
  - Hide progress indicator while keyboard is up (was: hide step indicator
    via custom keyboard listener — extracted to useKeyboardVisible hook)
  - Update tests to query the new component tree

  Follow-up: remove react-native-best-viewpager from package.json once
  this PR is confirmed working in production."
  ```

- [ ] **Step 7: Push and open PR**

  ```bash
  cd /Users/marcuspersonal/dev/Regroup
  git push -u origin feat/oxford-wizard-harmonization
  ```

  Open a PR from `feat/oxford-wizard-harmonization` to `main`. PR description should reference:

  - `docs/superpowers/specs/2026-05-27-oxford-wizard-harmonization-design.md` (rationale)
  - `docs/patterns/2026-05-27-wizard-ux-conventions.md` (future-engineer reference)
  - The 3-commit structure (C1: components, C2: Oxford, C3: Traditional)
  - The deferred `package.json` cleanup as a separate follow-up

---

## Done Criteria

- [ ] All shared components (`RatsWizardProgress`, `RatsWizardSlide`, `SetupButtons`, `useKeyboardVisible`) ship with passing unit tests
- [ ] `OxfordOnboardingWizard.tsx` uses the shared components and existing tests still pass
- [ ] `OperatorSetupWizard.tsx` uses the shared components, step components no longer render their own button rows, `OperatorSetupWizardStyles.ts` is deleted, existing tests still pass
- [ ] `grep -r react-native-best-viewpager src/` returns no results
- [ ] `npx tsc --noEmit` introduces no new errors
- [ ] iOS simulator smoke test: both wizards complete end-to-end without crash
- [ ] Visual parity confirmed via side-by-side screenshots
- [ ] Pattern reference doc (`docs/patterns/2026-05-27-wizard-ux-conventions.md`) committed
- [ ] PR opened against `main`

## Out of Scope (explicit reminder)

- Wizard test coverage expansion (Tasks 5–7 of prior plan) — separate follow-up
- CI gate investigation (Task 9 of prior plan) — separate follow-up
- `package.json` removal of `react-native-best-viewpager` — separate follow-up after this PR is confirmed in production
- Google Maps key rotation — separate operational follow-up
- RC-side `RATS_API_KEY` mirror — separate operational follow-up
- DM push notification gap — separate product ticket
