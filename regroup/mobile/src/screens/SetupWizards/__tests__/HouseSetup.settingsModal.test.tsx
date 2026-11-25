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

// Only a manager or owner sets rent (rules: rank >= 2); peer leaders open Details too.
let mockMayEditRent = true;
jest.mock('../../../state/queries/houseTierQueries', () => ({
  useMayEditRentMoney: () => mockMayEditRent,
}));

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

  // Rent spec §4.1: the wizard offers the same choice as House Settings → Rent.
  // 'both' is how the house stores Off (charging off).
  it('offers Weekly, Monthly and Off for rent', () => {
    const view = renderInSettingsModal(<HouseSetup {...buildSetupProps(buildSettingsHouse())} />);
    expect(view.getByTestId('house-rent-weekly')).toBeTruthy();
    expect(view.getByTestId('house-rent-monthly')).toBeTruthy();
    expect(view.getByTestId('house-rent-off')).toBeTruthy();
  });

  it('choosing Weekly saves rentFrequency weekly with the weekly price in dollars', async () => {
    const props = buildSetupProps(buildSettingsHouse({ weeklyRent: 175 as any }));
    const view = renderInSettingsModal(<HouseSetup {...props} />);
    fireEvent.press(view.getByText('Weekly'));
    fireEvent.press(view.getByTestId('next-step-button'));
    await waitFor(() => expect(props.handleSubmit).toHaveBeenCalledTimes(1));
    expect(props.handleSubmit.mock.calls[0][0]).toMatchObject({
      rentFrequency: 'weekly',
      weeklyRent: 175,
    });
  });

  it('choosing Off saves rentFrequency both', async () => {
    const props = buildSetupProps(buildSettingsHouse({ rentFrequency: 'monthly' }));
    const view = renderInSettingsModal(<HouseSetup {...props} />);
    fireEvent.press(view.getByText('Off'));
    fireEvent.press(view.getByTestId('next-step-button'));
    await waitFor(() => expect(props.handleSubmit).toHaveBeenCalledTimes(1));
    expect(props.handleSubmit.mock.calls[0][0]).toMatchObject({ rentFrequency: 'both' });
  });

  it('an Oxford house cannot choose Weekly or Monthly (the rules refuse it)', async () => {
    const props = buildSetupProps(buildSettingsHouse({ houseType: 'oxford' }));
    const view = renderInSettingsModal(<HouseSetup {...props} />);
    fireEvent.press(view.getByText('Weekly'));
    fireEvent.press(view.getByTestId('next-step-button'));
    await waitFor(() => expect(props.handleSubmit).toHaveBeenCalledTimes(1));
    expect(props.handleSubmit.mock.calls[0][0]).toMatchObject({ rentFrequency: 'both' });
  });

  it('a $6,000 monthly price, which the rules allow, still saves', async () => {
    const props = buildSetupProps(buildSettingsHouse({ monthlyRent: 6000 as any }));
    const view = renderInSettingsModal(<HouseSetup {...props} />);
    fireEvent.press(view.getByTestId('next-step-button'));
    await waitFor(() => expect(props.handleSubmit).toHaveBeenCalledTimes(1));
    expect(props.handleSubmit.mock.calls[0][0]).toMatchObject({ monthlyRent: 6000 });
  });

  it("hides the rent fields from a peer leader, and saves the house's rent unchanged", async () => {
    mockMayEditRent = false;
    try {
      const props = buildSetupProps(buildSettingsHouse({ rentFrequency: 'weekly', weeklyRent: 175 as any }));
      const view = renderInSettingsModal(<HouseSetup {...props} />);
      expect(view.queryByTestId('house-rent-weekly')).toBeNull();
      expect(view.queryByText('Weekly Rent')).toBeNull();
      fireEvent.press(view.getByTestId('next-step-button'));
      await waitFor(() => expect(props.handleSubmit).toHaveBeenCalledTimes(1));
      expect(props.handleSubmit.mock.calls[0][0]).toMatchObject({ rentFrequency: 'weekly', weeklyRent: 175 });
    } finally {
      mockMayEditRent = true;
    }
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
