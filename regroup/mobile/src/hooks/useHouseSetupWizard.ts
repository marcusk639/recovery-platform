/**
 * useHouseSetupWizard Hook
 *
 * Replaces withHouseSetupWizard HOC
 * Provides setup wizard state from RTK store
 *
 * @migrated Phase 3.3 - Converted from withHouseSetupWizard HOC to hook
 *
 * Hardened 2026-07-05: withHouseSetupWizard (and this hook, originally) only
 * ever provided READ-side state. Every wizard step (OrgSetup, ManagerSetup,
 * ChoreSetup, PhaseConfig, GuestSetup, HouseSetup) destructured `updateHouse`
 * / `setupHouse` / `removeHouse` / `startHouseSetup` / `submitHouse` props
 * that no parent ever supplied — those calls were always no-ops, so edits
 * made in every wizard step past the first were silently discarded and
 * "COMPLETE SETUP" never persisted anything. This hook now also returns
 * dispatch-bound versions of those actions so components can fall back to
 * them, e.g. `props.updateHouse ?? setupWizard.updateHouse`.
 */
import { useCallback } from "react";
import { useAppSelector, useAppDispatch } from "../state/store";
import { House } from "../entities/House";
import { User } from "../entities/User";
import { PhaseConfiguration } from "../entities/Phase";
import {
  setSelectedHouse,
  updateHouseData,
  removeHouseFromSetup,
  startHouseSetup as startHouseSetupAction,
  setSelectedPhase,
  submitHouseSetup,
  setSubmissionFailed,
  resetSetupState,
} from "../state/slices/setupSlice";

export const useHouseSetupWizard = () => {
  const dispatch = useAppDispatch();
  const organization = useAppSelector((state) => state.setup.organization);
  const houses = useAppSelector((state) => state.setup.houses);
  const selectedHouse = useAppSelector((state) => state.setup.selectedHouse);
  const selectedPhase = useAppSelector((state) => state.setup.selectedPhase);
  const guests = useAppSelector((state) => state.setup.guests);
  const admins = useAppSelector((state) => state.setup.admins);
  const inApp = useAppSelector((state) => state.setup.inApp);
  const admin = useAppSelector((state) => state.admin.userAsAdmin);
  const user = useAppSelector((state) => state.user.user);
  const submitting = useAppSelector((state) => state.setup.submitting);
  const submittingSuccessful = useAppSelector(
    (state) => state.setup.submittingSuccessful
  );
  const submittingFailed = useAppSelector(
    (state) => state.setup.submittingFailed
  );

  const setupHouse = useCallback(
    (house: House) => {
      dispatch(setSelectedHouse(house));
    },
    [dispatch]
  );

  const updateHouse = useCallback(
    (house: Partial<House> & { id: string }) => {
      dispatch(updateHouseData(house));
    },
    [dispatch]
  );

  const removeHouse = useCallback(
    (houseId?: string) => {
      if (houseId) {
        dispatch(removeHouseFromSetup(houseId));
      }
    },
    [dispatch]
  );

  const startHouseSetup = useCallback(
    (house?: House) => {
      if (house) {
        // Matches the ManagerSetupProps#startHouseSetup(house) signature —
        // callers here (e.g. OrgSetup's "EDIT" action) only ever have a
        // House, not its guests/admins, so those start empty. Screens that
        // do have that data (e.g. HouseSettings) dispatch startHouseSetup
        // directly instead of going through this hook.
        dispatch(startHouseSetupAction({ house, guests: {}, admins: {} }));
      }
    },
    [dispatch]
  );

  const startPhaseSetup = useCallback(
    (phase?: PhaseConfiguration) => {
      if (phase) {
        dispatch(setSelectedPhase(phase));
      }
    },
    [dispatch]
  );

  /**
   * Persist every house currently held in the wizard (OrgSetup's "COMPLETE
   * SETUP"). Requires a signed-in operator — throws if state.user.user is
   * unavailable rather than silently no-op'ing, since the button that
   * triggers this is only reachable while authenticated.
   */
  const submitHouse = useCallback(async () => {
    if (!user?.id) {
      // Hardened 2026-07-07: this guard throws before the submitHouseSetup
      // thunk is ever dispatched, so its pending/rejected lifecycle never
      // runs and submittingFailed stayed false — any screen gating a
      // failure UI on that flag (e.g. OrgSetup.tsx) saw nothing when this
      // path was hit. Dispatch the same failure state every other
      // submission path sets, so the UI actually surfaces it.
      const message = "Cannot submit house setup without a signed-in user.";
      dispatch(setSubmissionFailed(message));
      throw new Error(message);
    }
    return dispatch(
      submitHouseSetup({ houses, operator: user as User, inApp })
    ).unwrap();
  }, [dispatch, houses, user, inApp]);

  // Hardened 2026-07-07: resetSetupState was exported from the slice but
  // dispatched nowhere. Since submitHouse() now actually persists (it used
  // to be a no-op), an operator who completes setup and later re-enters the
  // wizard (e.g. via HouseSettings/ManagerSettings -> OperatorSetupWizard)
  // could see stale selectedHouse/houses from the prior session bleed into
  // the new one. Callers invoke this after a successful submitHouse().
  const resetSetup = useCallback(() => {
    dispatch(resetSetupState());
  }, [dispatch]);

  return {
    organization,
    houses,
    selectedHouse,
    selectedPhase,
    guests,
    admins,
    inApp,
    admin,
    user,
    submitting,
    submittingSuccessful,
    submittingFailed,
    setupHouse,
    updateHouse,
    removeHouse,
    startHouseSetup,
    startPhaseSetup,
    submitHouse,
    resetSetup,
  };
};
