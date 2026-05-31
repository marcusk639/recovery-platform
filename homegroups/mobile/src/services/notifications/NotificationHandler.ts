import messaging, {
  FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';
import {Alert} from 'react-native';

// Type for notification data payload
export interface NotificationData {
  type:
    | 'chat_mention'
    | 'announcement'
    | 'milestone'
    | 'new_member'
    | 'handoff_request';
  groupId?: string;
  groupName?: string;
  messageId?: string;
  announcementId?: string;
  userId?: string;
  memberId?: string;
  milestone?: string;
  handoffId?: string;
  senderName?: string;
}

// Navigation reference (set from App.tsx)
let navigationRef: any = null;

/**
 * Handler for Firebase Cloud Messaging notifications
 * Manages foreground display, background handling, and notification taps
 */
export class NotificationHandler {
  private static foregroundUnsubscribe: (() => void) | null = null;
  private static notificationOpenedUnsubscribe: (() => void) | null = null;

  /**
   * Set the navigation reference for deep linking from notifications
   */
  static setNavigationRef(ref: any): void {
    navigationRef = ref;
  }

  /**
   * Set up foreground notification handler
   * Shows notifications when the app is in the foreground
   */
  static setupForegroundHandler(): () => void {
    // Clean up existing handler
    if (this.foregroundUnsubscribe) {
      this.foregroundUnsubscribe();
    }

    this.foregroundUnsubscribe = messaging().onMessage(
      async (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
        console.log('Foreground notification received:', remoteMessage);

        // Display notification using Alert for foreground
        const title =
          remoteMessage.notification?.title || 'Homegroups Notification';
        const body = remoteMessage.notification?.body || '';
        const data = remoteMessage.data as NotificationData | undefined;

        Alert.alert(title, body, [
          {
            text: 'Dismiss',
            style: 'cancel',
          },
          {
            text: 'View',
            onPress: () => {
              if (data) {
                this.handleNotificationTap(data);
              }
            },
          },
        ]);
      },
    );

    return () => {
      if (this.foregroundUnsubscribe) {
        this.foregroundUnsubscribe();
        this.foregroundUnsubscribe = null;
      }
    };
  }

  /**
   * Set up handler for when app is opened from a notification
   */
  static setupNotificationOpenedHandler(): () => void {
    // Clean up existing handler
    if (this.notificationOpenedUnsubscribe) {
      this.notificationOpenedUnsubscribe();
    }

    // Handle notification that opened the app from background state
    this.notificationOpenedUnsubscribe = messaging().onNotificationOpenedApp(
      (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
        console.log(
          'Notification opened app from background:',
          remoteMessage.data,
        );
        if (remoteMessage.data) {
          // Small delay to ensure navigation is ready
          setTimeout(() => {
            this.handleNotificationTap(remoteMessage.data as unknown as NotificationData);
          }, 500);
        }
      },
    );

    return () => {
      if (this.notificationOpenedUnsubscribe) {
        this.notificationOpenedUnsubscribe();
        this.notificationOpenedUnsubscribe = null;
      }
    };
  }

  /**
   * Check if app was opened from a notification when it was quit
   */
  static async checkInitialNotification(): Promise<void> {
    try {
      const initialNotification = await messaging().getInitialNotification();

      if (initialNotification?.data) {
        console.log(
          'App opened from quit state via notification:',
          initialNotification.data,
        );
        // Delay navigation to ensure navigation is ready
        setTimeout(() => {
          this.handleNotificationTap(
            initialNotification.data as unknown as NotificationData,
          );
        }, 1500);
      }
    } catch (error) {
      console.error('Error checking initial notification:', error);
    }
  }

  /**
   * Handle notification tap - navigate to appropriate screen
   */
  static handleNotificationTap(data: NotificationData): void {
    if (!navigationRef || !data?.type) {
      console.warn('Cannot navigate: missing navigation ref or data');
      return;
    }

    console.log('Handling notification tap:', data);

    const {type, groupId, groupName} = data;

    // Need groupId for most navigations
    if (!groupId) {
      console.warn('Cannot navigate: missing groupId');
      return;
    }

    const navGroupName = groupName || 'Group';

    try {
      switch (type) {
        case 'chat_mention':
          navigationRef.navigate('Main', {
            screen: 'Home',
            params: {
              screen: 'GroupChat',
              params: {groupId, groupName: navGroupName},
            },
          });
          break;

        case 'announcement':
          navigationRef.navigate('Main', {
            screen: 'Home',
            params: {
              screen: 'GroupAnnouncements',
              params: {groupId, groupName: navGroupName},
            },
          });
          break;

        case 'milestone':
          navigationRef.navigate('Main', {
            screen: 'Home',
            params: {
              screen: 'GroupOverview',
              params: {groupId, groupName: navGroupName},
            },
          });
          break;

        case 'new_member':
          navigationRef.navigate('Main', {
            screen: 'Home',
            params: {
              screen: 'GroupMembers',
              params: {groupId, groupName: navGroupName},
            },
          });
          break;

        case 'handoff_request':
          if (data.handoffId) {
            navigationRef.navigate('Main', {
              screen: 'Home',
              params: {
                screen: 'HandoffRequest',
                params: {
                  groupId,
                  groupName: navGroupName,
                  handoffId: data.handoffId,
                },
              },
            });
          }
          break;

        default:
          // Navigate to group overview as fallback
          navigationRef.navigate('Main', {
            screen: 'Home',
            params: {
              screen: 'GroupOverview',
              params: {groupId, groupName: navGroupName},
            },
          });
      }
    } catch (error) {
      console.error('Error navigating from notification:', error);
    }
  }

  /**
   * Clean up all handlers
   */
  static cleanup(): void {
    if (this.foregroundUnsubscribe) {
      this.foregroundUnsubscribe();
      this.foregroundUnsubscribe = null;
    }
    if (this.notificationOpenedUnsubscribe) {
      this.notificationOpenedUnsubscribe();
      this.notificationOpenedUnsubscribe = null;
    }
  }
}

export default NotificationHandler;
