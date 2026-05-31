import { ActivityType } from "./Guest";

export type DisputeType = ActivityType;
export const DISPUTABLE_STATS = [
  "choreCompleted",
  "metPrimarySupporter",
  "hoursWorked",
  "meeting",
  "medication",
];

export interface DisputeChallenge {
  challenger: string;
  message: string;
}

export class Dispute {
  id: string = "";
  activityId: string = "";
  type: ActivityType = "";
  disputerIds: string[] = []; // guest id
  victimId: string = ""; // guest id
  active: boolean = true;
  challenges: DisputeChallenge[] = [];
  messages: string[] = [];
  resolution?: "overturned" | "allowed" | "";
  count: number = 0;
  initiatedDate: string = "";
  disputeDate: string = "";
  meetingStreet: string = "";
  meetingName: string = "";
  disputerName: string = "";
  victimName: string = "";

  // Fields added to align with mobile app entity
  guestId?: string;
  houseId?: string;
  message?: string;
  status?: "pending" | "resolved" | "rejected";
  createdDate?: string;
  createdAt?: string;
  updatedAt?: string;
  resolvedDate?: string;
  resolvedBy?: string;
  resolutionMessage?: string;
}
