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
