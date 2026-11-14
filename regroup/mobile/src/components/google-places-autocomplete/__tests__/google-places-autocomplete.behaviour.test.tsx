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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import RatsGooglePlacesAutocomplete from '../index';

/**
 * XMLHttpRequest as React Native's Android networking treats it: a request
 * with a body and no Content-Type fails on the device and never reaches the
 * server (NetworkingModule: "Payload is set but no content-type header
 * specified"); the library then sees status 0.
 */
class FakeXHR {
  static instances: FakeXHR[] = [];
  readyState = 0;
  status = 0;
  responseText = '';
  method = '';
  url = '';
  body: string | null = null;
  headers: Record<string, string> = {};
  withCredentials = false;
  onreadystatechange: null | (() => void) = null;

  constructor() {
    FakeXHR.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
  }

  send(body?: string) {
    this.body = body ?? null;
    if (body != null && !this.headers['content-type']) {
      this.finish(0, '');
    }
  }

  abort() {}

  respond(status: number, json: unknown) {
    this.finish(status, JSON.stringify(json));
  }

  private finish(status: number, responseText: string) {
    this.readyState = 4;
    this.status = status;
    this.responseText = responseText;
    this.onreadystatechange?.();
  }
}

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

describe('RatsGooglePlacesAutocomplete search request (Places API New)', () => {
  const RealXHR = global.XMLHttpRequest;

  beforeEach(() => {
    FakeXHR.instances = [];
    (global as any).XMLHttpRequest = FakeXHR;
  });

  afterEach(() => {
    (global as any).XMLHttpRequest = RealXHR;
  });

  const searchRequest = () =>
    FakeXHR.instances.filter((r) => r.url.includes('/v1/places:autocomplete')).pop();

  async function search(text: string, extra: Record<string, unknown> = {}) {
    renderAutocomplete(extra);
    const input = screen.getByPlaceholderText('Location');
    fireEvent(input, 'focus');
    fireEvent.changeText(input, text);
    await waitFor(() => expect(searchRequest()).toBeDefined());
    return searchRequest()!;
  }

  it('sends the search as JSON, as Android requires for a request with a body', async () => {
    const request = await search('Austin');

    expect(request.method).toBe('POST');
    expect(request.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request.body!)).toMatchObject({ input: 'Austin', languageCode: 'en' });
  });

  it('lists the suggestions Google returns', async () => {
    const request = await search('Austin');

    act(() => {
      if (request.readyState !== 4) {
        request.respond(200, {
          suggestions: [
            {
              placePrediction: {
                placeId: 'place-austin',
                text: { text: 'Austin, TX, USA' },
                structuredFormat: {
                  mainText: { text: 'Austin' },
                  secondaryText: { text: 'TX, USA' },
                },
              },
            },
          ],
        });
      }
    });

    expect(await screen.findByText('Austin, TX, USA')).toBeTruthy();
  });

  it('hands the picked place to onPress in the legacy shape the app reads', async () => {
    const onPress = jest.fn();
    const request = await search('Austin', { onPress });
    act(() => {
      request.respond(200, {
        suggestions: [
          {
            placePrediction: {
              placeId: 'place-austin',
              text: { text: 'Austin, TX, USA' },
              structuredFormat: {
                mainText: { text: 'Austin' },
                secondaryText: { text: 'TX, USA' },
              },
            },
          },
        ],
      });
    });

    fireEvent.press(await screen.findByText('Austin, TX, USA'));
    const detailsRequest = FakeXHR.instances.find((r) =>
      r.url.includes('/v1/places/place-austin'),
    )!;
    act(() => {
      detailsRequest.respond(200, {
        id: 'place-austin',
        displayName: { text: 'Austin' },
        formattedAddress: 'Austin, TX, USA',
        location: { latitude: 30.267153, longitude: -97.7430608 },
        addressComponents: [
          { longText: 'Austin', shortText: 'Austin', types: ['locality', 'political'] },
        ],
      });
    });

    expect(onPress).toHaveBeenCalledTimes(1);
    const details = onPress.mock.calls[0][1];
    expect(details.geometry).toEqual({ location: { lat: 30.267153, lng: -97.7430608 } });
    expect(details.address_components).toEqual([
      { long_name: 'Austin', short_name: 'Austin', types: ['locality', 'political'] },
    ]);
  });
});
