import { BaseEntity } from "./BaseEntity";
import { Roles } from "./Roles";
import { getTodaysDate, getCurrentTime } from "../util/date";
import { RatsMeeting } from "./Meeting";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { v4: uuid } = require("uuid") as { v4: () => string };
import { createGuestId } from "../api/firestore";

export type Stat =
  | "meeting"
  | "medication"
  | "metPrimarySupporter"
  | "hoursWorked"
  | "choreCompleted";
export const stats: Stat[] = [
  "meeting",
  "medication",
  "metPrimarySupporter",
  "hoursWorked",
  "choreCompleted",
];

export type ActivityType =
  // Snake case (new)
  | "chore_completed"
  | "hours_worked"
  | "meeting_attended"
  | "supporter_met"
  | "medication_taken"
  | "chore_changed"
  // Camel case (legacy)
  | "dispute"
  | "payment"
  | "chore"
  | "meeting"
  | "supporter"
  | "work"
  | "medication"
  | "metPrimarySupporter"
  | "hoursWorked"
  | "choreCompleted"
  | "all"
  | "";

export class Activity {
  type: ActivityType;
  id: string;
  guest: string;
  name: string;
  date: string;
  message: string;
  underDispute: number = 0;
  disputeResult: "none" | "success" | "fail" = "none";
  meeting?: RatsMeeting;
  disputeId: string = "";
  createdDate: string;
  jobName: string;
  [key: string]: unknown;

  constructor(
    guestId: string,
    type: ActivityType,
    name: string,
    message?: string,
    date?: string,
    meeting?: RatsMeeting,
    jobName?: string,
  ) {
    this.id = uuid();
    this.guest = guestId;
    this.type = type;
    this.name = name;
    this.date = date || getTodaysDate();
    this.message = message ?? "";
    this.meeting = meeting;
    this.createdDate = getCurrentTime();
    this.jobName = jobName ?? "";
  }
}

export type Guests = { [guestId: string]: Guest };

export type PartialGuestWithId = Partial<Guest> & { id: string };

/**
 * TODO: UPDATE GUEST SCHEMA
 */
export class Guest extends BaseEntity {
  id: string = "";
  userId: string = "";
  houseId: string = "";
  isAdmin: boolean = false;
  rentOwed: number = 0;
  choreFees: number = 0;
  dailyHabit: number = 0;
  drugOfChoice: string = "";
  email: string = "";
  firstName: string = "";
  hasJob: boolean = false;
  lastName: string = "";
  sobrietyDate: string = "";
  phase: number | string = "default";
  avatar: string = "";
  supporters: string[] = [];
  roles: Roles = {} as Roles;
  phoneNumber: string = "";
  infoEntered: boolean = false;
  jobs: string[] = [];
  createdDate: string = getCurrentTime();

  // Fields added to align with mobile app entity
  displayName: string = "";
  status: "active" | "inactive" | "expelled" = "active";
  step: number = 0;
  version: number = 0;
  lastUpdated: string = "";
  moveInDate?: string;
  moveOutDate?: string;
  primarySupporterId?: string;
  primarySupporterName?: string;
  currentChore?: string;

  // Week reference (normalized — no embedded week objects)
  currentWeekId?: string; // Format: {guestId}_{YYYY-MM-DD}
  currentWeekStartDate?: string; // ISO date string YYYY-MM-DD

  constructor() {
    super();
    this.id = createGuestId();
  }
}
