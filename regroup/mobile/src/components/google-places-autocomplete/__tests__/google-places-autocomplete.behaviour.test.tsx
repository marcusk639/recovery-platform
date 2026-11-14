/**
 * RatsGooglePlacesAutocomplete with the REAL react-native-google-places-autocomplete.
 *
 * google-places-autocomplete.test.tsx mocks the library, which hid a dead
 * dropdown: from 2.6.5 a boolean `listViewDisplayed` controls the list
 * outright, and the wrapper always passed false, so no suggestion ever showed
 * (the house search filter, house setup and meeting search). These tests open
 * the list the way a user does.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import RatsGooglePlacesAutocomplete from '../index';

jest.mock('../../../../google/apikeys', () => ({
  GOOGLE_API_KEY: () => 'test-key',
}));

const geolocation = {
  getCurrentPosition: jest.fn(),
  watchPosition: jest.fn(),
  clearWatch: jest.fn(),
  stopObserving: jest.fn(),
};

beforeAll(() => {
  (global as any).navigator = { ...(global as any).navigator, geolocation };
});

function renderAutocomplete(extra: Record<string, unknown> = {}) {
  return render(
    <RatsGooglePlacesAutocomplete
      onPress={jest.fn()}
      setRef={jest.fn()}
      listViewDisplayed={false}
      placeholder="Location"
      {...extra}
    />,
  );
}

describe('RatsGooglePlacesAutocomplete dropdown', () => {
  it('shows the Current Location suggestion when the field is focused', () => {
    renderAutocomplete();

    fireEvent(screen.getByPlaceholderText('Location'), 'focus');

    expect(screen.getByText('Current Location')).toBeTruthy();
  });

  it('keeps the list closed until the field is focused', () => {
    renderAutocomplete();

    expect(screen.queryByText('Current Location')).toBeNull();
  });

  it('closes the list when the field loses focus', () => {
    renderAutocomplete();
    const input = screen.getByPlaceholderText('Location');
    fireEvent(input, 'focus');

    fireEvent(input, 'blur');

    expect(screen.queryByText('Current Location')).toBeNull();
  });

  it('opens the list again when the field is focused again', () => {
    renderAutocomplete();
    const input = screen.getByPlaceholderText('Location');
    fireEvent(input, 'focus');
    fireEvent(input, 'blur');

    fireEvent(input, 'focus');

    expect(screen.getByText('Current Location')).toBeTruthy();
  });

  it('still calls the caller onFocus', () => {
    const onFocus = jest.fn();
    renderAutocomplete({ textInputProps: { onFocus } });

    fireEvent(screen.getByPlaceholderText('Location'), 'focus');

    expect(onFocus).toHaveBeenCalledTimes(1);
  });
});
