/**
 * ChoreSetup opened from House Settings ("Chores"), in the form modal.
 *
 * HouseSettings.tsx renders <ChoreSetup {...setupProps()} /> through
 * showFormModal: forSettings is true, there is no `navigation` prop and no
 * screen navigator. Both of its SetupButtons rows (the Cancel/Save row and
 * the chore editor's CANCEL/APPLY row) must work from their own handlers.
 */
import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import {
  buildSettingsHouse,
  buildSetupProps,
  renderInSettingsModal,
} from './settingsModalHarness';

// jest.setup.js stubs @react-navigation/native (a Fragment container and a
// fake useNavigation). The modal sits in the real container: use it.
jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));

// Native: react-native-modal wraps RN's Modal and animations.
jest.mock('react-native-modal', () => {
  const { View } = require('react-native');
  return ({ children, isVisible }: any) => (isVisible ? <View>{children}</View> : null);
});

import ChoreSetup from '../ChoreSetup';

const CHORES = {
  Kitchen: { name: 'Kitchen', description: 'Clean the kitchen.' },
  Porch: { name: 'Porch', description: 'Sweep the porch.' },
};

const setup = () => {
  const house = buildSettingsHouse({ chores: CHORES });
  const props = buildSetupProps(house);
  const view = renderInSettingsModal(<ChoreSetup {...props} />);
  return { house, props, view };
};

describe('ChoreSetup in the House Settings modal (no navigation)', () => {
  it('renders the house chores and the settings buttons', () => {
    const { view } = setup();
    expect(view.getByText('Kitchen')).toBeTruthy();
    expect(view.getByText('Porch')).toBeTruthy();
    expect(view.getByText(/^cancel$/i)).toBeTruthy();
    expect(view.getByText(/^save$/i)).toBeTruthy();
  });

  it('Cancel calls onPrevPress', () => {
    const { props, view } = setup();
    fireEvent.press(view.getByTestId('previous-step-button'));
    expect(props.onPrevPress).toHaveBeenCalledTimes(1);
    expect(props.handleChoreSubmit).not.toHaveBeenCalled();
  });

  it('Save passes the house with its chores to handleChoreSubmit', () => {
    const { house, props, view } = setup();
    fireEvent.press(view.getByTestId('next-step-button'));
    expect(props.handleChoreSubmit).toHaveBeenCalledTimes(1);
    expect(props.handleChoreSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ id: house.id, chores: CHORES }),
    );
    expect(props.onPrevPress).not.toHaveBeenCalled();
  });

  it("the chore editor's CANCEL closes the editor, not the modal", () => {
    const { props, view } = setup();
    fireEvent.press(view.getAllByText(/^edit$/i)[0]);
    expect(view.getByText(/^edit chore$/i)).toBeTruthy();
    // Two button rows now: the editor's (CANCEL/APPLY) and the screen's.
    const cancels = view.getAllByTestId('previous-step-button');
    expect(cancels).toHaveLength(2);
    fireEvent.press(cancels[0]);
    expect(view.queryByText(/^edit chore$/i)).toBeNull();
    expect(props.onPrevPress).not.toHaveBeenCalled();
    expect(props.handleChoreSubmit).not.toHaveBeenCalled();
  });

  it('Cancel is inert, not a crash, when a caller drops onPrevPress', () => {
    const props = { ...buildSetupProps(buildSettingsHouse({ chores: CHORES })), onPrevPress: undefined };
    const view = renderInSettingsModal(<ChoreSetup {...props} />);
    expect(() => fireEvent.press(view.getByTestId('previous-step-button'))).not.toThrow();
    expect(props.handleChoreSubmit).not.toHaveBeenCalled();
  });
});
