/**
 * PhaseConfigSetup opened from House Settings ("Phases"), in the form modal.
 *
 * HouseSettings.tsx renders <PhaseConfigSetup {...setupProps()} /> through
 * showFormModal: forSettings is true, there is no `navigation` prop and no
 * screen navigator. withHouseSetupWizard reads selectedHouse from the store
 * (seeded by startHouseSetup, as HouseSettings' initializeHouseSetup does).
 */
import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import {
  buildSettingsHouse,
  buildSettingsStore,
  buildSetupProps,
  renderInSettingsModal,
} from './settingsModalHarness';
import { PhaseConfiguration } from '../../../entities/Phase';
import { useNavigation } from '@react-navigation/native';

// jest.setup.js stubs @react-navigation/native (a Fragment container and a
// fake useNavigation). The modal sits in the real container: use it, with
// useNavigation wrapped so one test can stand in for a root navigator.
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: jest.fn(actual.useNavigation) };
});

// Native: react-native-modal wraps RN's Modal and animations.
jest.mock('react-native-modal', () => {
  const { View } = require('react-native');
  return ({ children, isVisible }: any) => (isVisible ? <View>{children}</View> : null);
});

import { PhaseConfigSetup } from '../PhaseSetup/PhaseConfigSetup';

const phase = (name: string, order: number) =>
  Object.assign(new PhaseConfiguration(), { name, order });

const setup = (overrides: Record<string, unknown> = {}) => {
  const house = buildSettingsHouse({
    phases: { Orientation: phase('Orientation', 1), Steady: phase('Steady', 2) },
  });
  const props = { ...buildSetupProps(house), ...overrides };
  // The exported type comes from withHouseSetupWizard (ManagerSetupProps),
  // which still declares navigation as required.
  const view = renderInSettingsModal(
    <PhaseConfigSetup {...(props as any)} />,
    buildSettingsStore(house),
  );
  return { props, view };
};

const mockUseNavigation = useNavigation as jest.Mock;
const realUseNavigation = jest.requireActual('@react-navigation/native').useNavigation;

describe('PhaseConfigSetup in the House Settings modal (no navigation)', () => {
  afterEach(() => mockUseNavigation.mockImplementation(realUseNavigation));

  it('renders the house phases and the settings buttons', () => {
    const { view } = setup();
    expect(view.getByText('Orientation')).toBeTruthy();
    expect(view.getByText('Steady')).toBeTruthy();
    expect(view.getByText(/^cancel$/i)).toBeTruthy();
    expect(view.getByText(/^save$/i)).toBeTruthy();
  });

  it('hides the header back arrow: there is no navigator to go back in', () => {
    const { view } = setup();
    expect(view.queryByTestId('back-button')).toBeNull();
  });

  it('the header back arrow calls onPrevPress, not the root goBack', () => {
    // In the app the root navigator registers on the container, so the
    // root object useNavigation() falls back to can report canGoBack().
    const root = { canGoBack: () => true, goBack: jest.fn(), navigate: jest.fn() };
    mockUseNavigation.mockImplementation(() => root);
    const { props, view } = setup();
    // [0] is the form modal's own header (dismissFormModal); [1] is this screen's.
    const arrows = view.getAllByTestId('back-button');
    expect(arrows).toHaveLength(2);
    fireEvent.press(arrows[1]);
    expect(props.onPrevPress).toHaveBeenCalledTimes(1);
    expect(root.goBack).not.toHaveBeenCalled();
  });

  it('Cancel calls onPrevPress', () => {
    const { props, view } = setup();
    fireEvent.press(view.getByText(/^cancel$/i));
    expect(props.onPrevPress).toHaveBeenCalledTimes(1);
    expect(props.handlePhaseSubmit).not.toHaveBeenCalled();
  });

  it('Save calls handlePhaseSubmit', () => {
    const { props, view } = setup();
    fireEvent.press(view.getByText(/^save$/i));
    expect(props.handlePhaseSubmit).toHaveBeenCalledTimes(1);
    expect(props.onPrevPress).not.toHaveBeenCalled();
  });

  it('renders without navigation even when forSettings is not set', () => {
    // Before: onBackPress={forSettings ? onPrevPress : navigation.pop}
    // threw "Cannot read properties of undefined (reading 'pop')".
    const { view } = setup({ forSettings: false });
    expect(view.getByText('Orientation')).toBeTruthy();
    expect(view.queryByText(/^save$/i)).toBeNull();
  });
});
