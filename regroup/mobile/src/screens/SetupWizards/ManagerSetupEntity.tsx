import { Houses, Guests } from "../../types";
import { FormikProps } from "formik";
import { PhaseConfiguration } from "../../entities/Phase";
import { House } from "../../entities/House";
import Admin from "../../entities/Admin";
import { SetupScreenNavigationProp } from "../../navigation/types";

class ManagerSetupEntity {
  admin: Admin = new Admin("");
  houses: Houses = {};
}

export type ManagerSetupWithForm = FormikProps<ManagerSetupProps> &
  ManagerSetupProps;

export default interface ManagerSetupProps {
  onNextPress?: () => void;
  onPrevPress?: () => void;
  guests?: Guests;
  forSettings?: boolean;
  admin?: Admin;
  houses?: Houses;
  selectedHouse?: House;
  inApp?: boolean;
  focused?: boolean;
  imageUrl?: string;
  selectedPhase?: PhaseConfiguration;
  handlePhaseSubmit?: () => void;
  handleChoreSubmit?: (values: House) => void;
  startPhaseSetup?: (phase?: PhaseConfiguration) => void;
  startHouseSetup?: (house?: House) => void;
  removeHouse?: (houseId?: string) => void;
  updateHouse?: (house: Partial<House> & { id: string }) => void;
  submitHouse?: () => void;
  resetSetup?: () => void;
  setupHouse?: (house: House) => void;
  phase?: PhaseConfiguration;
  submitting?: boolean;
  submittingSuccessful?: boolean;
  submittingFailed?: boolean;
  guestEmailButton?: string;
  handleSubmit?: (values: House) => any;
  navigation: SetupScreenNavigationProp;
}

export { ManagerSetupEntity };
