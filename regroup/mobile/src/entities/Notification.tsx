import { BaseEntity } from './BaseEntity';
import { Dispute } from './Dispute';
import { getTodaysDate } from '../util/display';
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
  type: NotificationType = 'dispute';
  read: boolean = false;
}

export class MeetingAddedNotification extends Notification {
  meeting!: RatsMeeting;

  constructor() {
    super();
    this.type = 'meeting-added';
  }
}

export class DisputeNotification extends Notification {
  level?: NotificationLevel = 'alert';
  dispute?: Dispute;
  adminNotification: boolean = false;

  getActivityTypeLabel(type: string): string {
    const typeLabels: { [key: string]: string } = {
      // ActivityType enum values (current — from ActivityModel.ts)
      CHORE: 'chore completion',
      MEETING: 'meeting attendance',
      WORK: 'work hours',
      MEDICATION: 'medication',
      PRIMARY_SUPPORTER: 'sponsor meeting',
      // Legacy camelCase values (may exist in old Firestore documents)
      choreCompleted: 'chore completion',
      hoursWorked: 'work hours',
      medication: 'medication',
      metPrimarySupporter: 'sponsor meeting',
      meeting: 'meeting attendance',
    };
    return typeLabels[type] || 'activity';
  }

  getNotificationMessage(dispute: Dispute, admin: boolean = false) {
    const activityLabel = this.getActivityTypeLabel(dispute.type);
    // Read canonical M1 field first; fall back to legacy `createdDate` for pre-migration disputes.
    const date = dispute.createdAt || dispute.createdDate || 'today';

    if (admin) {
      return `A ${activityLabel} has been disputed. Reason: ${
        dispute.message || 'No reason provided'
      }`;
    } else {
      return `Your ${activityLabel} has been disputed. Reason: ${
        dispute.message || 'No reason provided'
      }`;
    }
  }

  constructor(dispute: Dispute, admin: boolean = false, userId: string) {
    super();
    this.dispute = dispute;
    this.date = getTodaysDate();
    this.subject = 'Activity Disputed';
    this.userId = userId;
    this.type = 'dispute';
    this.message = this.getNotificationMessage(dispute, admin);
  }
}
