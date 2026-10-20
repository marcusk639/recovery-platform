// Selectors for setupSlice, re-exported from it.
import type { SetupState } from "./setupSlice";

export const selectCurrentStep = (state: { setup: SetupState }) =>
  state.setup.currentStep;
export const selectOrganization = (state: { setup: SetupState }) =>
  state.setup.organization;
export const selectSelectedHouse = (state: { setup: SetupState }) =>
  state.setup.selectedHouse;
export const selectHouses = (state: { setup: SetupState }) =>
  state.setup.houses;
export const selectSelectedPhase = (state: { setup: SetupState }) =>
  state.setup.selectedPhase;
export const selectSelectedChore = (state: { setup: SetupState }) =>
  state.setup.selectedChore;
export const selectSetupGuests = (state: { setup: SetupState }) =>
  state.setup.guests;
export const selectSetupAdmins = (state: { setup: SetupState }) =>
  state.setup.admins;
export const selectInApp = (state: { setup: SetupState }) => state.setup.inApp;
export const selectSubmitting = (state: { setup: SetupState }) =>
  state.setup.submitting;
export const selectSubmittingSuccessful = (state: { setup: SetupState }) =>
  state.setup.submittingSuccessful;
export const selectSubmittingFailed = (state: { setup: SetupState }) =>
  state.setup.submittingFailed;
export const selectSetupError = (state: { setup: SetupState }) =>
  state.setup.error;
export const selectInviteFailures = (state: { setup: SetupState }) =>
  state.setup.inviteFailures;
export const selectPhotoFailures = (state: { setup: SetupState }) =>
  state.setup.photoFailures;

export const selectSetupErrorKind = (state: { setup: SetupState }) =>
  state.setup.errorKind;
