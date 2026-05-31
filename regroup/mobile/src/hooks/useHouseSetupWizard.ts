/**
 * useHouseSetupWizard Hook
 *
 * Replaces withHouseSetupWizard HOC
 * Provides setup wizard state from RTK store
 *
 * @migrated Phase 3.3 - Converted from withHouseSetupWizard HOC to hook
 */
import { useAppSelector } from '../state/store';

export const useHouseSetupWizard = () => {
  const organization = useAppSelector(state => state.setup.organization);
  const houses = useAppSelector(state => state.setup.houses);
  const selectedHouse = useAppSelector(state => state.setup.selectedHouse);
  const selectedPhase = useAppSelector(state => state.setup.selectedPhase);
  const guests = useAppSelector(state => state.setup.guests);
  const admin = useAppSelector(state => state.admin.userAsAdmin);
  const submitting = useAppSelector(state => state.setup.submitting);
  const submittingSuccessful = useAppSelector(
    state => state.setup.submittingSuccessful,
  );
  const submittingFailed = useAppSelector(
    state => state.setup.submittingFailed,
  );

  return {
    organization,
    houses,
    selectedHouse,
    selectedPhase,
    guests,
    admin,
    submitting,
    submittingSuccessful,
    submittingFailed,
  };
};
