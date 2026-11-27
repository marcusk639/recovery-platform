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

  // Rent spec §4.1: the operator's first-time wizard offers how rent is charged.
  // 'both' is how the house stores Off. In House Settings the Rent screen, with
  // its preview, is the only place it changes.
  const inWizard = (house = buildSettingsHouse()) => ({
    ...buildSetupProps(house),
    forSettings: false,
  });

  it("offers Weekly, Monthly and Off for rent in the operator's wizard", () => {
    const view = renderInSettingsModal(<HouseSetup {...inWizard()} />);
    expect(view.getByTestId('house-rent-weekly')).toBeTruthy();
    expect(view.getByTestId('house-rent-monthly')).toBeTruthy();
    expect(view.getByTestId('house-rent-off')).toBeTruthy();
    expect(view.getByText('Weekly Rent')).toBeTruthy();
  });

  it('House Settings → Details has no rent fields: the Rent screen sets them', () => {
    const view = renderInSettingsModal(<HouseSetup {...buildSetupProps(buildSettingsHouse())} />);
    expect(view.queryByTestId('house-rent-weekly')).toBeNull();
    expect(view.queryByTestId('house-rent-off')).toBeNull();
    expect(view.queryByText('Weekly Rent')).toBeNull();
    expect(view.queryByText('Monthly Rent')).toBeNull();
  });

  it('an Oxford house is offered only Off (the rules refuse a price schedule)', () => {
    const view = renderInSettingsModal(
      <HouseSetup {...inWizard(buildSettingsHouse({ houseType: 'oxford' }))} />,
    );
    expect(view.queryByTestId('house-rent-weekly')).toBeNull();
    expect(view.queryByTestId('house-rent-monthly')).toBeNull();
    expect(view.getByTestId('house-rent-off')).toBeTruthy();
  });

  it('a $6,000 monthly price, which the rules allow, still saves', async () => {
    const props = buildSetupProps(buildSettingsHouse({ monthlyRent: 6000 as any }));
    const view = renderInSettingsModal(<HouseSetup {...props} />);
    fireEvent.press(view.getByTestId('next-step-button'));
    await waitFor(() => expect(props.handleSubmit).toHaveBeenCalledTimes(1));
    expect(props.handleSubmit.mock.calls[0][0]).toMatchObject({ monthlyRent: 6000 });
  });

  it("caps the wizard's prices at the rules' limits, in dollars: $2,500 a week, $10,000 a month", () => {
    const view = renderInSettingsModal(<HouseSetup {...inWizard()} />);
    expect(view.UNSAFE_getAllByProps({ name: 'weeklyRent' })[0].props.maximumValue).toBe(2500);
    expect(view.UNSAFE_getAllByProps({ name: 'monthlyRent' })[0].props.maximumValue).toBe(10000);
  });

  it("Details passes the house's rent on unchanged; HouseSettings leaves it out of the write", async () => {
    const props = buildSetupProps(buildSettingsHouse({ rentFrequency: 'weekly', weeklyRent: 175 as any }));
    const view = renderInSettingsModal(<HouseSetup {...props} />);
    fireEvent.press(view.getByTestId('next-step-button'));
    await waitFor(() => expect(props.handleSubmit).toHaveBeenCalledTimes(1));
    expect(props.handleSubmit.mock.calls[0][0]).toMatchObject({ rentFrequency: 'weekly', weeklyRent: 175 });
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
