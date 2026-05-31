// src/navigation/__tests__/service.test.ts
//
// Verifies that service.ts exposes the improved navigation service as its
// default export and does NOT expose the legacy getInitialRoute API.

jest.mock('../../navigation/improved-navigation-service', () => ({
  __esModule: true,
  default: {
    getInitialNavigation: jest.fn(() => ({
      initialRoute: 'main',
      authInitialRoute: undefined,
      initialMainRoute: undefined,
    })),
    navigate: jest.fn(),
    reset: jest.fn(),
    goBack: jest.fn(),
    getCurrentRoute: jest.fn(),
  },
  navigationRef: { current: null },
  UserState: {},
  NavigationContext: {},
}));

jest.mock('@react-native-firebase/auth', () => () => ({
  currentUser: null,
}));

import NavigationService, { navigationRef } from '../service';

describe('service.ts — post-migration contract', () => {
  it('default export has getInitialNavigation (improved service API)', () => {
    expect(typeof NavigationService.getInitialNavigation).toBe('function');
  });

  it('default export does NOT have getInitialRoute (legacy API)', () => {
    expect((NavigationService as any).getInitialRoute).toBeUndefined();
  });

  it('default export does NOT have getInitialAuthRoute (legacy API)', () => {
    expect((NavigationService as any).getInitialAuthRoute).toBeUndefined();
  });

  it('exports navigationRef', () => {
    expect(navigationRef).toBeDefined();
  });
});
