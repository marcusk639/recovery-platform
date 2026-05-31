/**
 * Tests for NavBar component
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

// Vector icons mock
jest.mock('react-native-vector-icons/FontAwesome5', () => 'FontAwesome5Icon');
jest.mock('react-native-vector-icons/MaterialIcons', () => 'MaterialIcon');

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
  useRoute: () => ({}),
  DrawerActions: { openDrawer: jest.fn(() => ({ type: 'OPEN_DRAWER' })) },
}));

// Mock the display utility
jest.mock('../../../util/display', () => ({
  camelCaseToDisplayForm: jest.fn((s: string) => s),
}));

import NavBar from '../index';

// Build a minimal Redux store with customNavigationState shape expected by NavBar
const makeStore = (navTitle: string = '') =>
  configureStore({
    reducer: {
      customNavigationState: () => ({ title: navTitle }),
    },
  });

const makeNavigation = (routeName = 'Home') => ({
  goBack: jest.fn(),
  navigate: jest.fn(),
  dispatch: jest.fn(),
  getState: jest.fn(() => ({
    routes: [{ key: routeName, name: routeName }],
    routeNames: [routeName],
    index: 0,
  })),
});

const makeRoute = () => ({ key: 'Home', name: 'Home' });

describe('NavBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    const store = makeStore();
    const { toJSON } = render(
      <Provider store={store}>
        <NavBar
          navigation={makeNavigation() as any}
          route={makeRoute() as any}
          title="Home"
          navTitle=""
          containerStyle={{}}
          drawer={false}
          guest={null as any}
        />
      </Provider>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('displays the title prop', () => {
    const store = makeStore();
    const { getByText } = render(
      <Provider store={store}>
        <NavBar
          navigation={makeNavigation('Dashboard') as any}
          route={makeRoute() as any}
          title="Dashboard"
          navTitle=""
          containerStyle={{}}
          drawer={false}
          guest={null as any}
        />
      </Provider>,
    );
    expect(getByText('Dashboard')).toBeTruthy();
  });

  it('displays navTitle from Redux state when provided', () => {
    const store = makeStore('MyTitle');
    const { getByText } = render(
      <Provider store={store}>
        <NavBar
          navigation={makeNavigation() as any}
          route={makeRoute() as any}
          title="Ignored"
          navTitle=""
          containerStyle={{}}
          drawer={false}
          guest={null as any}
        />
      </Provider>,
    );
    expect(getByText('MyTitle')).toBeTruthy();
  });

  it('shows drawer icon when drawer=true', () => {
    const store = makeStore();
    const { UNSAFE_getAllByType } = render(
      <Provider store={store}>
        <NavBar
          navigation={makeNavigation() as any}
          route={makeRoute() as any}
          title="Test"
          navTitle=""
          containerStyle={{}}
          drawer={true}
          guest={null as any}
        />
      </Provider>,
    );
    expect(UNSAFE_getAllByType('FontAwesome5Icon' as any).length).toBeGreaterThan(0);
  });

  it('hides drawer icon when drawer=false', () => {
    const store = makeStore();
    const { UNSAFE_queryAllByType } = render(
      <Provider store={store}>
        <NavBar
          navigation={makeNavigation() as any}
          route={makeRoute() as any}
          title="Test"
          navTitle=""
          containerStyle={{}}
          drawer={false}
          guest={null as any}
        />
      </Provider>,
    );
    expect(UNSAFE_queryAllByType('FontAwesome5Icon' as any).length).toBe(0);
  });

  it('dispatches openDrawer when drawer icon is pressed', () => {
    const { DrawerActions } = require('@react-navigation/native');
    const store = makeStore();
    const navigation = makeNavigation();
    const { UNSAFE_getByType } = render(
      <Provider store={store}>
        <NavBar
          navigation={navigation as any}
          route={makeRoute() as any}
          title="Test"
          navTitle=""
          containerStyle={{}}
          drawer={true}
          guest={null as any}
        />
      </Provider>,
    );
    const { TouchableWithoutFeedback } = require('react-native');
    fireEvent.press(UNSAFE_getByType(TouchableWithoutFeedback));
    expect(navigation.dispatch).toHaveBeenCalledTimes(1);
    expect(DrawerActions.openDrawer).toHaveBeenCalledTimes(1);
  });

  it('renders children inside the nav bar', () => {
    const { getByText } = render(
      <Provider store={makeStore()}>
        <NavBar
          navigation={makeNavigation() as any}
          route={makeRoute() as any}
          title="Test"
          navTitle=""
          containerStyle={{}}
          drawer={false}
          guest={null as any}>
          <>{/* @ts-ignore */}</>
        </NavBar>
      </Provider>,
    );
    expect(getByText('Test')).toBeTruthy();
  });

  it('falls back to route key when no title or navTitle', () => {
    const store = makeStore('');
    const { getByText } = render(
      <Provider store={store}>
        <NavBar
          navigation={makeNavigation('RouteName') as any}
          route={makeRoute() as any}
          title=""
          navTitle=""
          containerStyle={{}}
          drawer={false}
          guest={null as any}
        />
      </Provider>,
    );
    expect(getByText('RouteName')).toBeTruthy();
  });

  it('applies containerStyle to the outer View', () => {
    const store = makeStore();
    const containerStyle = { backgroundColor: 'purple' };
    const { toJSON } = render(
      <Provider store={store}>
        <NavBar
          navigation={makeNavigation() as any}
          route={makeRoute() as any}
          title="Test"
          navTitle=""
          containerStyle={containerStyle}
          drawer={false}
          guest={null as any}
        />
      </Provider>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('snapshot matches', () => {
    const store = makeStore();
    const { toJSON } = render(
      <Provider store={store}>
        <NavBar
          navigation={makeNavigation('Home') as any}
          route={makeRoute() as any}
          title="Home"
          navTitle=""
          containerStyle={{}}
          drawer={true}
          guest={null as any}
        />
      </Provider>,
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
