// OrgSetup "COMPLETE SETUP": only a submitHouse rejection may be swallowed
// (the thunk already put the failure in Redux). After a successful submit the
// notice is shown, the wizard reset and the operator navigated to the house
// tab; a throw from any of those is logged, never silently dropped.
jest.mock('../../../util/logging', () => ({ logException: jest.fn() }));
jest.mock('../../../navigation/authNavigation', () => ({ navigateToMainTab: jest.fn() }));

import { Alert } from 'react-native';
import { navigateToMainTab } from '../../../navigation/authNavigation';
import { Routes } from '../../../navigation/types';
import { logException } from '../../../util/logging';
import { submitOrgSetup } from '../submitOrgSetup';

const navigation = { navigate: jest.fn() } as any;
const props = (submitHouse: () => Promise<unknown>) => ({
  submitHouse: jest.fn(submitHouse),
  resetSetup: jest.fn(),
  navigation,
});

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('submitOrgSetup', () => {
  it('on success with best-effort failures, shows the notice, resets and navigates', async () => {
    const p = props(async () => ({ inviteFailures: 1, photoFailures: 1 }));
    await submitOrgSetup(p);

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toMatch(/^Setup complete\./);
    expect(p.resetSetup).toHaveBeenCalled();
    expect(navigateToMainTab).toHaveBeenCalledWith(navigation, Routes.House);
    expect(logException).not.toHaveBeenCalled();
  });

  it('notifies before resetting and navigating', async () => {
    const order: string[] = [];
    (Alert.alert as jest.Mock).mockImplementation(() => order.push('notify'));
    (navigateToMainTab as jest.Mock).mockImplementationOnce(() => order.push('navigate'));
    const p = props(async () => ({ inviteFailures: 2 }));
    p.resetSetup.mockImplementation(() => order.push('reset'));

    await submitOrgSetup(p);
    expect(order).toEqual(['notify', 'reset', 'navigate']);
  });

  it('a submitHouse rejection neither notifies, resets nor navigates', async () => {
    const p = props(async () => {
      throw new Error('createHouses failed');
    });
    await expect(submitOrgSetup(p)).resolves.toBeUndefined();

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(p.resetSetup).not.toHaveBeenCalled();
    expect(navigateToMainTab).not.toHaveBeenCalled();
    expect(logException).not.toHaveBeenCalled();
  });

  it('logs a throw from a post-success step and still navigates', async () => {
    const boom = new Error('reset blew up');
    const p = props(async () => ({ inviteFailures: 0, photoFailures: 0 }));
    p.resetSetup.mockImplementation(() => {
      throw boom;
    });

    await expect(submitOrgSetup(p)).resolves.toBeUndefined();
    expect(logException).toHaveBeenCalledWith(boom, expect.stringContaining('OrgSetup'));
    expect(navigateToMainTab).toHaveBeenCalledWith(navigation, Routes.House);
  });

  it('logs a navigation throw', async () => {
    const boom = new Error('no navigator');
    (navigateToMainTab as jest.Mock).mockImplementationOnce(() => {
      throw boom;
    });
    await submitOrgSetup(props(async () => ({})));
    expect(logException).toHaveBeenCalledWith(boom, expect.stringContaining('OrgSetup'));
  });
});
