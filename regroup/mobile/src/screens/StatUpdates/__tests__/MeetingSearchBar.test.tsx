jest.mock('../../../components/rats-search-bar', () => {
  const { TextInput, TouchableOpacity, View } = require('react-native');
  return ({ onChangeText, onFilter, placeholder }: any) => (
    <View>
      <TextInput
        placeholder={placeholder ?? 'Search meeting name or hour...'}
        onChangeText={onChangeText}
      />
      <TouchableOpacity testID="filter-activities-button" onPress={onFilter} />
    </View>
  );
});

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import MeetingSearchBar from '../MeetingSearchBar';
import { MeetingFilters } from '../MeetingFilterForm';

const defaultFilters = new MeetingFilters();

describe('MeetingSearchBar', () => {
  it('renders the search bar', () => {
    const { getByPlaceholderText } = render(
      <MeetingSearchBar
        filters={defaultFilters}
        onChangeText={jest.fn()}
        setLocation={jest.fn()}
        onFilter={jest.fn()}
      />,
    );
    expect(getByPlaceholderText('Search meeting name or hour...')).toBeTruthy();
  });

  it('calls onFilter when filter button is pressed', () => {
    const onFilter = jest.fn();
    const { getByTestId } = render(
      <MeetingSearchBar
        filters={defaultFilters}
        onChangeText={jest.fn()}
        setLocation={jest.fn()}
        onFilter={onFilter}
      />,
    );
    fireEvent.press(getByTestId('filter-activities-button'));
    expect(onFilter).toHaveBeenCalledTimes(1);
  });

  it('calls onChangeText when text changes', () => {
    const onChangeText = jest.fn();
    const { getByPlaceholderText } = render(
      <MeetingSearchBar
        filters={defaultFilters}
        onChangeText={onChangeText}
        setLocation={jest.fn()}
        onFilter={jest.fn()}
      />,
    );
    fireEvent.changeText(getByPlaceholderText('Search meeting name or hour...'), 'serenity');
    expect(onChangeText).toHaveBeenCalledWith('serenity');
  });
});
