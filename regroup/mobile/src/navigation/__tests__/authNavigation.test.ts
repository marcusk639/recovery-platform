import {
  navigateAuthStackRoute,
  navigateToMain,
  navigateToMainTab,
} from '../authNavigation';
import { Routes } from '../types';

const createNavigation = () => ({
  navigate: jest.fn(),
  dispatch: jest.fn(),
});

describe('authNavigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('navigateAuthStackRoute navigates to Signup with empty params', () => {
    const navigation = createNavigation();
    navigateAuthStackRoute(navigation as any, Routes.Signup);
    expect(navigation.navigate).toHaveBeenCalledWith(Routes.Signup, {});
  });

  it('navigateAuthStackRoute navigates to Login without params', () => {
    const navigation = createNavigation();
    navigateAuthStackRoute(navigation as any, Routes.Login);
    expect(navigation.navigate).toHaveBeenCalledWith(Routes.Login);
  });

  it('navigateToMain dispatches navigation to Main', () => {
    const navigation = createNavigation();
    navigateToMain(navigation as any);
    expect(navigation.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ name: Routes.Main }),
      }),
    );
  });

  it('navigateToMainTab opens Main on the requested tab', () => {
    const navigation = createNavigation();
    navigateToMainTab(navigation as any, Routes.House);
    expect(navigation.navigate).toHaveBeenCalledWith(Routes.Main, {
      screen: Routes.House,
    });
  });
});
