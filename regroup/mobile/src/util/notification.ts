import { getTodaysDate } from './display';
import { RatsMeeting } from '../entities/Meeting';
import {
  MeetingAddedNotification,
  Notification,
  NotificationType,
} from '../entities/Notification';

export function createNewMeetingNotifications(
  adminIds: string[],
  meeting: RatsMeeting,
  message?: string,
): MeetingAddedNotification[] {
  return adminIds.map<MeetingAddedNotification>((adminId: string, _index: number, _array: string[]): MeetingAddedNotification => {
    const notification = new MeetingAddedNotification();
    notification.meeting = meeting;
    notification.adminIds = [adminId];
    notification.message = `${meeting.addedBy} added a new meeting called ${meeting.name}. Please review this meeting and approve, deny, or edit its information.`;
    notification.subject = 'New Meeting Added';
    notification.date = getTodaysDate();
    return notification;
  });
}

export function createAdminNotifications(
  type: NotificationType,
  subject: string,
  message: string,
  adminIds: string[],
): Notification[] {
  return adminIds.map<Notification>((adminId: string, _index: number, _array: string[]): Notification => {
    const notification = new Notification();
    notification.adminIds = [adminId];
    notification.message = message;
    notification.subject = subject;
    notification.date = getTodaysDate();
    notification.type = type;
    return notification;
  });
}
