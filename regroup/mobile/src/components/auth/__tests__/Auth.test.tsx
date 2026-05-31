import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

// Auth component connects to redux
jest.mock('@react-native-firebase/auth');

const makeStore = (overrides: any = {}) =>
  configureStore({
    reducer: {
      user: () => ({
        user: overrides.user ?? null,
        token: overrides.token ?? null,
      }),
      houses: () => ({
        houses: overrides.houses ?? {},
        selectedHouse: overrides.selectedHouse ?? null,
      }),
    },
  });

const makeClaims = (overrides: any = {}) => ({
  guest: [],
  admin: [],
  superAdmin: [],
  potentialSuperAdmin: false,
  ...overrides,
});

import Auth from '../auth';

const ChildText = () => <Text testID="child">Child</Text>;

describe('Auth', () => {
  it('renders children inside AuthProvider', () => {
    const store = makeStore();
    const { getByTestId } = render(
      <Provider store={store}>
        <Auth>
          <ChildText />
        </Auth>
      </Provider>,
    );
    expect(getByTestId('child')).toBeTruthy();
  });

  it('renders with a guest user in the store', () => {
    const store = makeStore({
      user: { id: 'user1', name: 'Alice' },
      token: {
        claims: makeClaims({ guest: ['house1'] }),
        role: { house1: 'guest' },
      },
    });
    const { getByTestId } = render(
      <Provider store={store}>
        <Auth>
          <ChildText />
        </Auth>
      </Provider>,
    );
    expect(getByTestId('child')).toBeTruthy();
  });

  it('renders with an admin user in the store', () => {
    const store = makeStore({
      user: { id: 'admin1', name: 'Bob' },
      token: {
        claims: makeClaims({ admin: ['house1'] }),
        role: { house1: 'admin' },
      },
    });
    const { getByTestId } = render(
      <Provider store={store}>
        <Auth>
          <ChildText />
        </Auth>
      </Provider>,
    );
    expect(getByTestId('child')).toBeTruthy();
  });

  it('renders with a superAdmin user in the store', () => {
    const store = makeStore({
      user: { id: 'super1', name: 'Charlie' },
      token: {
        claims: makeClaims({ superAdmin: ['house1', 'house2'] }),
        role: { house1: 'superAdmin', house2: 'superAdmin' },
      },
    });
    const { getByTestId } = render(
      <Provider store={store}>
        <Auth>
          <ChildText />
        </Auth>
      </Provider>,
    );
    expect(getByTestId('child')).toBeTruthy();
  });

  it('renders when token is null (unauthenticated)', () => {
    const store = makeStore({ user: null, token: null });
    const { getByTestId } = render(
      <Provider store={store}>
        <Auth>
          <ChildText />
        </Auth>
      </Provider>,
    );
    expect(getByTestId('child')).toBeTruthy();
  });

  it('renders multiple children', () => {
    const store = makeStore();
    const { getByTestId } = render(
      <Provider store={store}>
        <Auth>
          <Text testID="child-1">Child 1</Text>
          <Text testID="child-2">Child 2</Text>
        </Auth>
      </Provider>,
    );
    expect(getByTestId('child-1')).toBeTruthy();
    expect(getByTestId('child-2')).toBeTruthy();
  });
});
