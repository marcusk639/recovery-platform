/**
 * @format
 */

import 'react-native';
import React from 'react';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../App';
import store from '../src/state/store';

// Note: test renderer must be required after react-native.
import renderer from 'react-test-renderer';

// Dev-only debug widget (visible = __DEV__, which is true under Jest); not part
// of the production tree this smoke test guards.
jest.mock('../src/components/DeepLinkTester', () => ({
  DeepLinkTester: () => null,
}));

// Deep-link wiring registers real Linking listeners that outlive the test.
// Same mocks the Splash suite uses.
jest.mock('../src/services/native-deep-links', () => ({
  getInitialLink: jest.fn().mockResolvedValue(null),
  onLink: jest.fn(() => ({ remove: jest.fn() })),
  getLinkType: jest.fn(),
  createInvitationFromLink: jest.fn(),
}));
jest.mock('react-native/Libraries/Linking/Linking', () => ({
  getInitialURL: jest.fn().mockResolvedValue(null),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  canOpenURL: jest.fn().mockResolvedValue(false),
  openURL: jest.fn().mockResolvedValue(undefined),
}));

// App relies on the redux/react-query providers that index.js wraps around it.
it('renders correctly', () => {
  renderer.create(
    <Provider store={store}>
      <QueryClientProvider client={new QueryClient()}>
        <App {...({} as any)} />
      </QueryClientProvider>
    </Provider>,
  );
});
