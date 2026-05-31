import { firestore, FirebaseFirestoreTypes } from '../../firebase-setup';
import * as crud from './crud';
import { Notification } from '../entities/Notification';
import FirebaseFirestore from '@react-native-firebase/firestore';

export const notificationCollection = firestore.collection('notifications');

/**
 * Gets a house by id
 * @param {*} notificationId
 */
export async function getNotification(
  notificationId: string,
): Promise<Notification> {
  return crud.get<Notification>(notificationCollection, notificationId);
}

/**
 * Gets houses where attribute == value
 * @param {*} attribute The attribute to select by
 * @param {*} value The value of the attribute
 */
export async function getNotifications(
  attribute: string,
  value: string,
): Promise<{ [id: string]: Notification }> {
  const result = await crud.getByAttribute<Notification>(
    notificationCollection,
    attribute,
    '==',
    value,
  );
  const notifications: Record<string, Notification> = {};
  result.forEach(
    notification => (notifications[notification.id] = notification),
  );
  return notifications;
}

/**
 * Update house with values
 * @param {*} values
 * @param {*} attribute
 * @param {*} value
 */
export async function updateNotification(
  notificationId: string,
  values: Partial<Notification>,
): Promise<void> {
  if (!values.id) {
    values.id = notificationId;
  }
  return crud.update<Partial<Notification>>(notificationCollection, values);
}

export async function createNotification(
  newNotification: Notification,
): Promise<Notification> {
  return crud.create<Notification>(notificationCollection, newNotification);
}

export async function deleteNotification(
  notification: Notification | string,
): Promise<void> {
  if (typeof notification === 'string') {
    const notif = await getNotification(notification);
    return crud.deleteObject<Notification>(notificationCollection, notif);
  }
  return crud.deleteObject<Notification>(notificationCollection, notification);
}

/**
 * Register a device token for push notifications
 * @param userId The user ID
 * @param token The FCM device token
 */
export async function registerDeviceToken(
  userId: string,
  token: string,
): Promise<void> {
  const userTokensCollection = firestore.collection('userDeviceTokens');
  await userTokensCollection
    .doc(userId)
    .set(
      {
        tokens: FirebaseFirestore.FieldValue.arrayUnion(token),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
}

/**
 * Get all notifications for a user
 * @param userId The user ID
 */
export async function getUserNotifications(
  userId: string,
): Promise<Notification[]> {
  const result = await crud.getByAttribute<Notification>(
    notificationCollection,
    'userId',
    '==',
    userId,
  );
  return result;
}

/**
 * Mark a notification as read
 * @param notificationId The notification ID
 */
export async function markNotificationAsRead(
  notificationId: string,
): Promise<void> {
  await updateNotification(notificationId, { read: true });
}

/**
 * Mark all notifications as read for a user
 * @param userId The user ID
 */
export async function markAllNotificationsAsRead(
  userId: string,
): Promise<void> {
  const notifications = await getUserNotifications(userId);
  const updatePromises = notifications
    .filter(n => !n.read)
    .map(n => updateNotification(n.id, { read: true }));
  await Promise.all(updatePromises);
}
