/**
 * GuestSetup opened from House Settings ("Guests"), in the form modal.
 *
 * HouseSettings.tsx renders <GuestSetup {...setupProps()} /> through
 * showFormModal: forSettings is true, there is no `navigation` prop and no
 * screen navigator. Cancel must use onPrevPress and Save must reach the
 * onSubmit it was given (handleGuestSubmission in HouseSettings).
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

import GuestSetup from '../GuestSetup';

const PENDING = 'pending.guest@example.com';

const setup = () => {
  const house = buildSettingsHouse({ pendingGuestInvites: [PENDING] });
  const props = buildSetupProps(house);
  const view = renderInSettingsModal(<GuestSetup {...props} />);
  return { house, props, view };
};

describe('GuestSetup in the House Settings modal (no navigation)', () => {
  it('renders pending invites and the settings buttons', () => {
    const { view } = setup();
    expect(view.getByText(PENDING)).toBeTruthy();
    expect(view.getByText(/^cancel$/i)).toBeTruthy();
    expect(view.getByText(/^save$/i)).toBeTruthy();
  });

  it('Cancel calls onPrevPress', () => {
    const { props, view } = setup();
    fireEvent.press(view.getByTestId('previous-step-button'));
    expect(props.onPrevPress).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('Save with no new emails passes the empty list to onSubmit', async () => {
    const { props, view } = setup();
    fireEvent.press(view.getByTestId('next-step-button'));
    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledTimes(1));
    expect(props.onSubmit.mock.calls[0][0]).toEqual({ guestEmails: [] });
    expect(props.onPrevPress).not.toHaveBeenCalled();
    // HouseSettings' guest handler is onSubmit; the house handler is not used.
    expect(props.handleSubmit).not.toHaveBeenCalled();
  });

  it('Cancel is inert, not a crash, when a caller drops onPrevPress', () => {
    // Before: leftPress={onPrevPress} was undefined, so the legacy
    // SetupButtons fell back to navigation.goBack and threw during render.
    const props = { ...buildSetupProps(buildSettingsHouse()), onPrevPress: undefined };
    const view = renderInSettingsModal(<GuestSetup {...props} />);
    expect(() => fireEvent.press(view.getByTestId('previous-step-button'))).not.toThrow();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });
});
