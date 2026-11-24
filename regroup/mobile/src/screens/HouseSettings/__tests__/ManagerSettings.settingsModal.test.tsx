/**
 * ManagerSettings opened from House Settings ("Managers"), in the form modal.
 *
 * HouseSettings.tsx renders <ManagerSettings {...setupProps()} /> through
 * showFormModal: there is no `navigation` prop and no screen navigator. The
 * screen reads the house, guests and admins from state.setup (seeded by
 * startHouseSetup, as HouseSettings' initializeHouseSetup does).
 */
import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import {
  buildSettingsHouse,
  buildSettingsStore,
  buildSetupProps,
  renderInSettingsModal,
} from '../../SetupWizards/__tests__/settingsModalHarness';

// jest.setup.js stubs @react-navigation/native (a Fragment container and a
// fake useNavigation). The modal sits in the real container: use it.
jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));

// Native: react-native-modal wraps RN's Modal and animations.
jest.mock('react-native-modal', () => {
  const { View } = require('react-native');
  return ({ children, isVisible }: any) => (isVisible ? <View>{children}</View> : null);
});

import ManagerSettings from '../ManagerSettings';

const INVITE = 'new.manager@example.com';

const setup = () => {
  const house = buildSettingsHouse({ pendingAdminInvites: [INVITE] });
  const props = buildSetupProps(house);
  const view = renderInSettingsModal(
    <ManagerSettings {...props} />,
    buildSettingsStore(house),
  );
  return { house, props, view };
};

describe('ManagerSettings in the House Settings modal (no navigation)', () => {
  it('renders pending invites and the settings buttons', () => {
    const { view } = setup();
    expect(view.getByText(INVITE)).toBeTruthy();
    expect(view.getByTestId('add-manager-button')).toBeTruthy();
    expect(view.getByText(/^cancel$/i)).toBeTruthy();
    expect(view.getByText(/^save$/i)).toBeTruthy();
  });

  it('Cancel calls onPrevPress', () => {
    const { props, view } = setup();
    fireEvent.press(view.getByText(/^cancel$/i));
    expect(props.onPrevPress).toHaveBeenCalledTimes(1);
    expect(props.handleSubmit).not.toHaveBeenCalled();
  });

  it('Save passes the stored house to handleSubmit', () => {
    const { house, props, view } = setup();
    fireEvent.press(view.getByText(/^save$/i));
    expect(props.handleSubmit).toHaveBeenCalledTimes(1);
    expect(props.handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ id: house.id, pendingAdminInvites: [INVITE] }),
    );
    expect(props.onPrevPress).not.toHaveBeenCalled();
  });
});
