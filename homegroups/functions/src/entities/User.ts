import { BaseEntity } from "./BaseEntity";

export const removeUserFromHouse = () => {
  return {
    guestId: null,
    houseId: null,
    potentialGuest: false,
    potentialSuperAdmin: false,
    isGuest: false,
    isSuperAdmin: false,
  };
};

class User extends BaseEntity {
  uid = "";
  adminId: string;
  guestId: string;
  houseId = "";
  isAdmin = false;
  emailVerified = false;
  houseAccountVerified = false;
  houseCode = "";
  isGuest = false;
  isSuperAdmin = false;
  email = "";
  firstName = "";
  lastName = "";
  middleInitial = "";
  phoneNumber = "";
  housesOwned: string[] = [];
  gender: "male" | "female" = "male";
  ethnicity = "";
  dateOfBirth = "";
  sobrietyDate = "";
  avatar = "";
  ssn = "";
  maritalStatus: "" | "single" | "separated" | "married" = "";
  housingStatus: "homeless" | "renter" | "homeowner" | "family" = "renter";
  termsOfService = false;
  keepUpdated = false;
  infoEntered = false;
  messagingToken: string[] = [];
  password?: string;
  isAnonymous = false;
  potentialGuest?: boolean = false;
  potentialSuperAdmin?: boolean = false;
  orgSetupCompleted?: boolean = false;
  // @ts-ignore
  subscriptionMetadata: OperatorSubscription = new OperatorSubscription();
}

export { User };
