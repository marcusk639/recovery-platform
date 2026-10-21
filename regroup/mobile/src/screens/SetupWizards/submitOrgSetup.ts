import { navigateToMainTab } from '../../navigation/authNavigation';
import { Routes } from '../../navigation/types';
import { logException } from '../../util/logging';
import { notifySetupCompletion } from '../../util/setupNotice';
import ManagerSetupProps from './ManagerSetupEntity';

type SubmitOrgSetupProps = Pick<ManagerSetupProps, 'submitHouse' | 'resetSetup'> & {
  navigation?: ManagerSetupProps['navigation'];
};

const step = (name: string, run: () => void) => {
  try {
    run();
  } catch (error) {
    logException(error, `OrgSetup: ${name} failed after setup completed`);
  }
};

/**
 * OrgSetup's COMPLETE SETUP handler. Only a submitHouse rejection is caught
 * silently: the thunk already put submittingFailed + error in Redux, which
 * OrgSetup surfaces, and the operator stays on the wizard with their house
 * list. Once the houses exist, each follow-up step runs on its own and a throw
 * is logged rather than swallowed.
 */
export const submitOrgSetup = async (props: SubmitOrgSetupProps): Promise<void> => {
  let result: unknown;
  try {
    result = await props.submitHouse?.();
  } catch {
    return;
  }
  // Invites/photos are best effort: setup is done, but say what to redo.
  step('completion notice', () => notifySetupCompletion(result));
  // Clear the staged wizard state so a later re-entry (e.g. via HouseSettings
  // -> OperatorSetupWizard) does not start from this session's houses.
  step('wizard reset', () => props.resetSetup?.());
  step('navigation', () => {
    if (props.navigation) {
      navigateToMainTab(props.navigation, Routes.House);
    }
  });
};
