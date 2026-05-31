import { BaseEntity } from "./BaseEntity";
import { Phases, defaultPhases } from "./Phase";
import { defaultChores, Chores } from "./Chore";
import { Dispute } from "./Dispute";
import { createHouseId } from "../api/firestore";

export type PartialHouseWithId = Partial<House> & { id: string };

export interface AwaitingVerification {
  firstName: string;
  lastName: string;
  userId: string;
}

export interface HouseHealth {
  [weekEndDate: string]: number;
}

export type ManagerSetupType =
  | "senior-peer"
  | "operator-only"
  | "external-managers"
  | "democratic";

export const HouseActionItems: HouseActionType[] = [
  "issues",
  "applications",
  "disputes",
  "complaints",
];
export type HouseActionType =
  | "issues"
  | "applications"
  | "disputes"
  | "complaints";

export class House extends BaseEntity {
  id: string = createHouseId();
  timezone: string = ""; // needed for cloud scheduler function
  superAdminId: string = "";
  lat: string | number = "";
  lng: string | number = "";
  adminId: string = "";
  adminIds: string[] = [];
  superAdminIds: string[] = [];
  street: string = "";
  city: string = "";
  country: string = "";
  health: HouseHealth = {};
  name: string = "";
  monthlyRent: number = 0;
  weeklyRent: number = 0;
  currentCapacity: number = 0;
  maximumCapacity: number = 1;
  state: string = "";
  zip: string = "";
  code: string = "";
  avatar: string = "";
  imageUrl: string = "";
  depositsAndFees: string | number = 0;
  certified: boolean = false;
  phoneNumber: string = "";
  rentFrequency: "weekly" | "monthly" | "both" = "both";
  pendingAdminInvites?: string[] = [];
  pendingGuestInvites?: string[] = [];
  isDemoHouse: boolean = false;
  seniorPeerEmails?: string[] = [];
  managerSetupType: ManagerSetupType = "operator-only";
  awaitingVerification: AwaitingVerification[] = [];
  chores: Chores = defaultChores;
  phases: Phases = defaultPhases;
  gender: string | null = null;
  disputes: {
    [id: string]: Dispute;
  } = {};
  issues: { [id: string]: unknown } = {};
  applications: { [id: string]: unknown } = {};
  complaints: { [id: string]: unknown } = {};
  rooms: { [id: string]: unknown } = {};
  baths: number = 1;
  wifi: boolean = false;
  rating: number = 3;
  subscriptionStatus: string = "";

  // Fields added to align with mobile app entity
  ownerId: string = "";
  geohash: string = "";
  houseType: "traditional" | "oxford" = "traditional";

  // Stripe Connect fields (written by stripeWebhook and callable functions)
  stripeAccountId?: string;
  stripeStatus:
    | "not_connected"
    | "pending"
    | "active"
    | "restricted"
    | "disconnected" = "not_connected";
  stripeConnectedAt?: number;
  stripeLastSyncAt?: number;
  stripeError?: string;
}
