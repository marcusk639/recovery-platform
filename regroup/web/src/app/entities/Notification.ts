import { BaseEntity } from './BaseEntity';
import { Dispute } from './Dispute';
import { RatsMeeting } from './Meeting';

export type NotificationLevel = 'notice' | 'warning' | 'alert';

export type NotificationType = 'dispute' | 'meeting-added' | 'meeting-forced';

export class Notification extends BaseEntity {
  userId?: string = '';
  guestId?: string = '';
  houseId?: string = '';
  adminIds?: string[] = [];
  superAdminId?: string = '';
  message?: string = '';
  subject?: string = '';
  date?: string = '';
  type: NotificationType;
}

export class MeetingAddedNotification extends Notification {
  meeting: RatsMeeting;

  constructor() {
    super();
    this.type = 'meeting-added';
  }
}

export class DisputeNotification extends Notification {
  level?: NotificationLevel = 'alert';
  dispute?: Dispute;
  adminNotification: boolean = false;
}
