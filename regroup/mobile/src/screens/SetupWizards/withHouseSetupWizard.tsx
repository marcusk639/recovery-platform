import React from 'react';
import ManagerSetupProps from './ManagerSetupEntity';
import { useAppSelector, useAppDispatch } from '../../state/store';

export const withHouseSetupWizard = <P extends object>(
  WrappedComponent: React.ComponentType<P>,
  header?: string,
  content?: string,
  displayHeader: boolean = true,
  displayBanner: boolean = true,
  noScroll: boolean = false,
) => {
  const HouseSetupWizard: React.FC<ManagerSetupProps> = props => {
    const dispatch = useAppDispatch();
    const organization = useAppSelector(state => state.setup.organization);
    const houses = useAppSelector(state => state.setup.houses);
    const selectedHouse = useAppSelector(state => state.setup.selectedHouse);
    const selectedPhase = useAppSelector(state => state.setup.selectedPhase);
    const guests = useAppSelector(state => state.setup.guests);
    const admin = useAppSelector(state => state.admin.userAsAdmin);
    const submitting = useAppSelector(state => state.setup.submitting);
    const submittingSuccessful = useAppSelector(state => state.setup.submittingSuccessful);
    const submittingFailed = useAppSelector(state => state.setup.submittingFailed);

    return (
      <WrappedComponent
        {...(props as P)}
        organization={organization}
        houses={houses}
        selectedHouse={selectedHouse}
        selectedPhase={selectedPhase}
        guests={guests}
        admin={admin}
        submitting={submitting}
        submittingSuccessful={submittingSuccessful}
        submittingFailed={submittingFailed}
      />
    );
  };

  /**
   * @migrated Phase 2.2 - Converted from old Redux to RTK
   * Changes:
   * - Removed old Redux action imports (setupWizardActions, adminActions)
   * - Updated 9 selectors to use state.setup and state.admin (removed 'as any' casts)
   * - Uses setupSlice and adminSlice instead of managerSignUp and admin reducers
   *
   * @migrated Phase 3.3 - Removed withRats HOC wrapper
   * - HOC provided no value (component doesn't use theme or translation)
   */
  return HouseSetupWizard;
};
