import { BaseEntity } from "./BaseEntity";
import { Dispute } from "./Dispute";

export type NotificationLevel = "notice" | "warning" | "alert";

export type NotificationType =
  | "dispute"
  | "invite"
  | "meeting-added"
  | "meeting-forced"
  | "application-received"
  | "";

export class Notification extends BaseEntity {
  userId: string = "";
  guestId?: string;
  houseId?: string;
  adminIds?: string[];
  superAdminId?: string;
  message?: string;
  subject?: string;
  date?: string;
  type: NotificationType = "";
  read: boolean = false;
}

export class DisputeNotification extends Notification {
  level: NotificationLevel = "alert";
  dispute: Dispute;

  constructor(
    dispute: Dispute,
    date: string,
    subject: string,
    message: string,
    userId: string
  ) {
    super();
    this.dispute = dispute;
    this.date = date;
    this.subject = subject;
    this.message = message;
    this.userId = userId;
    this.type = "dispute";
  }
}
