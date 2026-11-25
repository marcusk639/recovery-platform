/**
 * HouseSetup opened from House Settings ("Details"), in the form modal.
 *
 * HouseSettings.tsx renders <HouseSetup {...setupProps()} /> through
 * showFormModal: forSettings is true and there is no `navigation` prop and
 * no screen navigator. Cancel must use onPrevPress, Save must reach the
 * handleSubmit it was given, and nothing may dereference `navigation`.
 */
import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
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

import { HouseSetup } from '../HouseSetup';

describe('HouseSetup in the House Settings modal (no navigation)', () => {
  it('renders the settings buttons without a navigation prop', () => {
    const view = renderInSettingsModal(
      <HouseSetup {...buildSetupProps(buildSettingsHouse())} />,
    );
    expect(view.getByTestId('house-name-input')).toBeTruthy();
    expect(view.getByText(/^cancel$/i)).toBeTruthy();
    expect(view.getByText(/^save$/i)).toBeTruthy();
  });

  it('Cancel calls onPrevPress', () => {
    const props = buildSetupProps(buildSettingsHouse());
    const view = renderInSettingsModal(<HouseSetup {...props} />);
    fireEvent.press(view.getByTestId('previous-step-button'));
    expect(props.onPrevPress).toHaveBeenCalledTimes(1);
    expect(props.handleSubmit).not.toHaveBeenCalled();
  });

  it('Save validates the house and passes it to handleSubmit', async () => {
    const house = buildSettingsHouse();
    const props = buildSetupProps(house);
    const view = renderInSettingsModal(<HouseSetup {...props} />);
    fireEvent.press(view.getByTestId('next-step-button'));
    await waitFor(() => expect(props.handleSubmit).toHaveBeenCalledTimes(1));
    expect(props.handleSubmit.mock.calls[0][0]).toMatchObject({
      id: house.id,
      name: house.name,
      phoneNumber: house.phoneNumber,
    });
    expect(props.onPrevPress).not.toHaveBeenCalled();
  });

  it('Save does not submit an invalid house', async () => {
    const props = buildSetupProps(buildSettingsHouse({ name: '' }));
    const view = renderInSettingsModal(<HouseSetup {...props} />);
    fireEvent.press(view.getByTestId('next-step-button'));
    // Formik validates asynchronously: wait for the error to show.
    await waitFor(() => expect(view.getByText(/required/i)).toBeTruthy());
    expect(props.handleSubmit).not.toHaveBeenCalled();
  });

  it('still renders, with an inert Cancel, when a caller drops onPrevPress', () => {
    // Before: leftPress={onPrevPress ? onPrevPress : navigation.goBack}
    // threw "Cannot read properties of undefined" during render.
    const props = { ...buildSetupProps(buildSettingsHouse()), onPrevPress: undefined };
    const view = renderInSettingsModal(<HouseSetup {...props} />);
    expect(() => fireEvent.press(view.getByTestId('previous-step-button'))).not.toThrow();
    expect(props.handleSubmit).not.toHaveBeenCalled();
  });
});
