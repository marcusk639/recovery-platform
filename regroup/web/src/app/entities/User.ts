import * as yup from "yup";
import moment from "moment";
import SchemaConstants from "./SchemaConstants";
import { BaseEntity } from "./BaseEntity";
import { Role } from "./Roles";
import OperatorSubscription from "./OperatorSubscription";

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
  uid: string = "";
  adminId: string;
  guestId: string;
  houseId: string = "";
  isAdmin: boolean = false;
  emailVerified: boolean = false;
  houseAccountVerified: boolean = false;
  houseCode: string = "";
  isGuest: boolean = false;
  isSuperAdmin: boolean = false;
  housesOwned: string[] = [];
  email: string = "";
  firstName: string = "";
  lastName: string = "";
  middleInitial: string = "";
  phoneNumber: string = "";
  gender: "male" | "female" = "male";
  ethnicity: string = "";
  dateOfBirth: string = "";
  sobrietyDate: string = "";
  avatar: string = "";
  ssn: string = "";
  maritalStatus: "" | "single" | "separated" | "married" = "";
  housingStatus: "homeless" | "renter" | "homeowner" | "family" = "renter";
  termsOfService: boolean = false;
  keepUpdated: boolean = false;
  infoEntered: boolean = false;
  messagingToken: string[] = [];
  password?: string;
  isAnonymous: boolean = false;
  potentialGuest?: boolean = false;
  potentialSuperAdmin?: boolean = false;
  orgSetupCompleted?: boolean = false;
  billingPhoneNumber: string = "";
  billingEmail: string = "";
  subscriptionMetadata: OperatorSubscription = new OperatorSubscription();
}

export const createSuperAdmin = (values?: User): User => {
  const base = values ? { ...values } : new User();
  return {
    ...base,
    isSuperAdmin: true,
    termsOfService: true,
    potentialSuperAdmin: true,
    emailVerified: true,
    subscriptionMetadata: new OperatorSubscription(),
  };
};

const userSchema = yup.object().shape({
  uid: yup.string().notRequired(),
  adminId: yup.string().notRequired(),
  guestId: yup.string().notRequired(),
  email: yup
    .string()
    .email(SchemaConstants.EMAIL)
    .max(50, SchemaConstants.stringMax(50))
    .required(SchemaConstants.REQUIRED),
  firstName: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .min(1, SchemaConstants.stringMin(0))
    .max(50, SchemaConstants.stringMax(50)),
  lastName: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .min(1, SchemaConstants.stringMin(0))
    .max(50, SchemaConstants.stringMax(50)),
  middleInitial: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .min(1, SchemaConstants.stringMin(0))
    .max(1, SchemaConstants.stringMax(1)),
  phoneNumber: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .min(10, SchemaConstants.stringMin(10))
    .max(14, SchemaConstants.stringMax(15)),
  gender: yup.string().required(),
  ethnicity: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .min(1, SchemaConstants.stringMin(0))
    .max(20, SchemaConstants.stringMax(20)),
  ssn: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .min(4, SchemaConstants.stringMin(4))
    .max(4, SchemaConstants.stringMax(4)),
  maritalStatus: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .min(0, SchemaConstants.stringMin(0))
    .max(20, SchemaConstants.stringMax(20)),
  housingStatus: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .min(0, SchemaConstants.stringMin(0))
    .max(20, SchemaConstants.stringMax(20)),
  dateOfBirth: yup
    .string()
    .test(
      "Maximum date",
      "error.no.future.date",
      (value) => !moment(value).isAfter(moment(), "day"),
    )
    .required(SchemaConstants.REQUIRED),
  termsOfService: yup.boolean().oneOf([true], "error.terms.of.service"),
});

export { User, userSchema };
