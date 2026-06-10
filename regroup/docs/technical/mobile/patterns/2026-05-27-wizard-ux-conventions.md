# Wizard UX Conventions (Regroup mobile)

**Established:** 2026-05-27
**Status:** Active convention
**Applies to:** Any multi-step form flow in Regroup

When to use this pattern: multi-step forms with clear sequential progression
(setup flows, onboarding, multi-page applications).

## Required components

- `src/components/rats-wizard-progress` — step indicator (dots + label)
- `src/components/rats-wizard-slide` — slide-between-steps animation (uses RN's built-in `Animated` API)
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
