/**
 * Types for notification system
 */

export type NotificationType =
  | 'announcement'
  | 'meeting_reminder'
  | 'celebration'
  | 'group_invite'
  | 'direct_message'
  | 'business_meeting'
  | 'service_opportunity'
  | 'system';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
  expiresAt?: Date;
  data?: {
    groupId?: string;
    meetingId?: string;
    announcementId?: string;
    userId?: string;
    url?: string;
    [key: string]: any;
  };
}
