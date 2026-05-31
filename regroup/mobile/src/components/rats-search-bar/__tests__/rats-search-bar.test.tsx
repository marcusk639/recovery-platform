/**
 * Tests for RatsSearchBar component
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import RatsSearchBar from '../index';

jest.mock('../../../context', () => ({
  useTheme: () => ({
    theme: {
      primaryColor: '#000',
      secondaryColor: '#fff',
      backgroundColor: '#fff',
      textColor: '#000',
      primaryFontFamily: 'System',
      secondaryFontFamily: 'System',
      tertiaryColor: '#ccc',
    },
  }),
  useTranslation: () => ({ t: (k: string) => k ?? '', i18n: { language: 'en' } }),
}));

jest.mock('../../../util/platform', () => ({ IOS: false }));

jest.mock('react-native-vector-icons/FontAwesome5', () => {
  const { Text } = require('react-native');
  return (props: any) => <Text testID={`icon-${props.name}`}>{props.name}</Text>;
});

jest.mock('../../google-places-autocomplete', () => {
  const { View } = require('react-native');
  return (props: any) => <View testID="google-places-autocomplete" />;
});

jest.mock('../../../util/address', () => ({
  getPlaceAsAddress: jest.fn(() => ({
    lat: 0,
    lng: 0,
    city: '',
    state: '',
    street: '',
    zip: '',
  })),
}));

const baseProps = {
  value: '',
  onChangeText: jest.fn(),
  onFilter: jest.fn(),
};

describe('RatsSearchBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<RatsSearchBar {...baseProps} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders the text input when address is false', () => {
    const { getByPlaceholderText } = render(
      <RatsSearchBar {...baseProps} placeholder="Search..." />,
    );
    expect(getByPlaceholderText('Search...')).toBeTruthy();
  });

  it('uses default placeholder when none is provided', () => {
    const { getByPlaceholderText } = render(<RatsSearchBar {...baseProps} />);
    expect(getByPlaceholderText('Search...')).toBeTruthy();
  });

  it('calls onChangeText when text is entered', () => {
    const onChangeText = jest.fn();
    const { getByPlaceholderText } = render(
      <RatsSearchBar {...baseProps} onChangeText={onChangeText} />,
    );
    fireEvent.changeText(getByPlaceholderText('Search...'), 'hello');
    expect(onChangeText).toHaveBeenCalledWith('hello');
  });

  it('calls onFilter when the filter button is pressed', () => {
    const onFilter = jest.fn();
    const { getByTestId } = render(
      <RatsSearchBar {...baseProps} onFilter={onFilter} />,
    );
    fireEvent.press(getByTestId('filter-activities-button'));
    expect(onFilter).toHaveBeenCalledTimes(1);
  });

  it('renders filter chips when filters prop is provided', () => {
    const { getByText } = render(
      <RatsSearchBar {...baseProps} filters={['Active', 'Pending']} />,
    );
    expect(getByText('Active')).toBeTruthy();
    expect(getByText('Pending')).toBeTruthy();
  });

  it('does not render filter chips when filters is empty', () => {
    const { queryByText } = render(
      <RatsSearchBar {...baseProps} filters={[]} />,
    );
    expect(queryByText('Active')).toBeNull();
  });

  it('renders google places autocomplete when address is true', () => {
    const { getByTestId } = render(
      <RatsSearchBar {...baseProps} address={true} />,
    );
    expect(getByTestId('google-places-autocomplete')).toBeTruthy();
  });

  it('does not render plain text input when address is true', () => {
    const { queryByPlaceholderText } = render(
      <RatsSearchBar {...baseProps} address={true} placeholder="Search..." />,
    );
    expect(queryByPlaceholderText('Search...')).toBeNull();
  });

  it('renders with a current value in the text input', () => {
    const { getByDisplayValue } = render(
      <RatsSearchBar {...baseProps} value="Current query" />,
    );
    expect(getByDisplayValue('Current query')).toBeTruthy();
  });

  it('accepts a custom container style without crashing', () => {
    const { toJSON } = render(
      <RatsSearchBar {...baseProps} container={{ marginTop: 10 }} />,
    );
    expect(toJSON()).toBeTruthy();
  });
});
