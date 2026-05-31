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
      <RatsWizardProgress stepCount={3} currentStep={0} currentLabel="Start" />,
    );
    expect(getByText('Step 1 of 3 · Start')).toBeTruthy();
  });
});
