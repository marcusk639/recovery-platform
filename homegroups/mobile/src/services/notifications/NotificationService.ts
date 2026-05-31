import messaging from '@react-native-firebase/messaging';
import {Platform, PermissionsAndroid} from 'react-native';
import {store} from '../../store';
import {updateFcmToken} from '../../store/slices/authSlice';

/**
 * Service for managing Firebase Cloud Messaging (FCM) notifications
 * Handles initialization, permissions, and token management
 */
export class NotificationService {
  private static isInitialized = false;
  private static tokenRefreshUnsubscribe: (() => void) | null = null;

  /**
   * Initialize the notification service
   * Should be called once when the app starts after authentication
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('NotificationService already initialized');
      return;
    }

    try {
      // Request permission first
      const hasPermission = await this.requestPermission();

      if (hasPermission) {
        // Get and store FCM token
        await this.getAndStoreToken();

        // Set up token refresh listener
        this.setupTokenRefreshListener();

        this.isInitialized = true;
        console.log('NotificationService initialized successfully');
      } else {
        console.log('Notification permission not granted');
      }
    } catch (error) {
      console.error('Error initializing NotificationService:', error);
    }
  }

  /**
   * Request notification permissions
   * iOS requires explicit permission, Android 13+ also requires runtime permission
   */
  static async requestPermission(): Promise<boolean> {
    try {
      if (Platform.OS === 'ios') {
        // iOS permission request
        const authStatus = await messaging().requestPermission();
        const enabled =
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        console.log('iOS notification permission status:', authStatus);
        return enabled;
      } else if (Platform.OS === 'android') {
        // Android 13+ requires POST_NOTIFICATIONS permission
        if (Platform.Version >= 33) {
          const result = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          );
          const enabled = result === PermissionsAndroid.RESULTS.GRANTED;
          console.log('Android notification permission:', result);
          return enabled;
        }
        // Android 12 and below don't need explicit permission
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  /**
   * Check if notification permissions are granted
   */
  static async hasPermission(): Promise<boolean> {
    try {
      const authStatus = await messaging().hasPermission();
      return (
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL
      );
    } catch (error) {
      console.error('Error checking notification permission:', error);
      return false;
    }
  }

  /**
   * Get FCM token for this device
   */
  static async getToken(): Promise<string | null> {
    try {
      const token = await messaging().getToken();
      console.log('FCM Token obtained:', token?.substring(0, 20) + '...');
      return token;
    } catch (error) {
      console.error('Error getting FCM token:', error);
      return null;
    }
  }

  /**
   * Get token and store it in Firestore via Redux
   */
  private static async getAndStoreToken(): Promise<void> {
    try {
      const token = await this.getToken();
      if (token) {
        const state = store.getState();
        const userId = state.auth.user?.uid;

        if (userId) {
          await store.dispatch(updateFcmToken({userId, token}));
          console.log('FCM token stored for user:', userId);
        } else {
          console.warn('Cannot store FCM token: No user logged in');
        }
      }
    } catch (error) {
      console.error('Error storing FCM token:', error);
    }
  }

  /**
   * Set up listener for token refresh events
   * Tokens can be refreshed when the app is reinstalled, data is cleared, etc.
   */
  private static setupTokenRefreshListener(): void {
    // Clean up existing listener
    if (this.tokenRefreshUnsubscribe) {
      this.tokenRefreshUnsubscribe();
    }

    this.tokenRefreshUnsubscribe = messaging().onTokenRefresh(
      async (newToken: string) => {
        console.log('FCM token refreshed');
        const state = store.getState();
        const userId = state.auth.user?.uid;

        if (userId) {
          await store.dispatch(updateFcmToken({userId, token: newToken}));
          console.log('Refreshed FCM token stored');
        }
      },
    );
  }

  /**
   * Delete FCM token (useful for logout)
   */
  static async deleteToken(): Promise<void> {
    try {
      await messaging().deleteToken();
      console.log('FCM token deleted');
    } catch (error) {
      console.error('Error deleting FCM token:', error);
    }
  }

  /**
   * Clean up listeners and reset state
   */
  static cleanup(): void {
    if (this.tokenRefreshUnsubscribe) {
      this.tokenRefreshUnsubscribe();
      this.tokenRefreshUnsubscribe = null;
    }
    this.isInitialized = false;
  }

  /**
   * Subscribe to a topic (e.g., group-specific notifications)
   */
  static async subscribeToTopic(topic: string): Promise<void> {
    try {
      await messaging().subscribeToTopic(topic);
      console.log(`Subscribed to topic: ${topic}`);
    } catch (error) {
      console.error(`Error subscribing to topic ${topic}:`, error);
    }
  }

  /**
   * Unsubscribe from a topic
   */
  static async unsubscribeFromTopic(topic: string): Promise<void> {
    try {
      await messaging().unsubscribeFromTopic(topic);
      console.log(`Unsubscribed from topic: ${topic}`);
    } catch (error) {
      console.error(`Error unsubscribing from topic ${topic}:`, error);
    }
  }
}

export default NotificationService;

