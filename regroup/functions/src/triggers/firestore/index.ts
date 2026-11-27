import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} from 'firebase-functions/v2/firestore';
import { auth } from 'firebase-admin';
import { logger } from 'firebase-functions';
import { Notification } from '../../entities/Notification';
import { House } from '../../entities/House';
import { Contact } from '../../entities/Contact';
import { BugReport } from '../../entities/BugReport';
import { Feedback } from '../../entities/Feedback';
import { User } from '../../entities/User';
import { Guest } from '../../entities/Guest';
import { sendNotification } from '../../util/notifications';
import { sendEmail, regroupEmail } from '../../util/email';
import { getUser, guestCollection, updateContact } from '../../api/firestore';
import { getCurrentTime } from '../../util/date';
import { deleteClaim } from '../../util/claims';
import { SENDGRID_API_KEY } from '../../config';
import { operatorStatusToHouseStatus } from '../../util/entitlement';
import { selectLegitimateGuests } from '../../util/guestMembership';
import { eventAgeMinutes, isStaleEvent, RETRY_CUTOFF_MS } from '../../util/eventAge';

export { onHouseDeleted } from './houseTombstone';
export { onActivityWritten } from './activityWeekSummary';
export { onGuestLinkedRestamp } from './guestRestamp';
export { onGuestWrite } from './guestWrite';
export { onHouseRentSettingsWrite } from './houseRentSettings';
export { onHouseListingSync } from './houseListing';
export { notifyOperatorOnApplication } from './applicationNotice';

/**
 * Sends a push notification when a new document is created in /notifications/{notificationId}.
 */
export const notify = onDocumentCreated('/notifications/{notificationId}', async (event) => {
  const data = event.data?.data();
  if (!data) return;

  const notification = data as Notification;
  return sendNotification({
    recipientId: notification.userId,
    body: notification.message ?? '',
    title: notification.subject ?? '',
  });
});

/**
 * Sends an admin email when a new house document is created in /houses/{houseId}.
 */
export const notifyNewHouseCreated = onDocumentCreated(
  { document: '/houses/{houseId}', secrets: [SENDGRID_API_KEY] },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const house = data as House;
    try {
      await sendEmail({
        to: regroupEmail,
        from: regroupEmail,
        text: `
        Name: ${house.name}
        ID: ${house.id}
        Super Admin: ${house.superAdminId}
        Date: ${(house as House & { createdAt?: string }).createdAt ?? house.createdDate}
      `,
        subject: 'New house created',
      });
    } catch (error) {
      logger.error('notifyNewHouseCreated: email delivery failed', { error });
    }
  },
);

/**
 * Stamps `house.subscriptionStatus` from the operator's subscription when a
 * house is created.
 *
 * This is the ONLY path that sets an initial status. No Stripe webhook fires on
 * subscription creation — all four webhook writers sit in existing-subscription
 * handlers (invoice.payment_succeeded/failed, subscription.deleted/updated) — and
 * createOperatorSubscription cannot write it because houses do not exist yet at
 * checkout time. Deriving it from a Firestore trigger also makes initial
 * entitlement independent of webhook health, which matters because that endpoint
 * has a history of delivery failures.
 *
 * Separate from notifyNewHouseCreated on purpose: an email failure must not be
 * able to prevent the entitlement write.
 */
export const setHouseSubscriptionStatusOnCreate = onDocumentCreated(
  '/houses/{houseId}',
  async (event) => {
    const houseId = event.params.houseId;
    const data = event.data?.data();
    if (!data) return;

    const house = data as House;
    const operatorId = house.superAdminId || house.ownerId;
    if (!operatorId) {
      logger.error('house.created_without_operator', { houseId });
      return;
    }

    const operator = await getUser(operatorId);
    const operatorStatus = operator?.subscriptionMetadata?.status;
    const status = operatorStatusToHouseStatus(operatorStatus);

    if (!status) {
      // Invariant: a house may only exist once its operator has a subscription,
      // even a trialing one. Reaching here means the signup funnel created a
      // house too early, or the operator's status is unrecognized — a bug, not a
      // state to model. Deny, and log loudly enough to be noticed.
      logger.error('house.created_without_subscription', {
        houseId,
        operatorId,
        operatorStatus: operatorStatus ?? null,
      });
      await event.data!.ref.update({ subscriptionStatus: 'canceled' });
      return;
    }

    await event.data!.ref.update({ subscriptionStatus: status });
    logger.info('house.subscription_status_stamped', { houseId, status });
  },
);

/**
 * Sends a contact-form email and saves the timestamp when a new document
 * is created in /contact/{contactId}.
 */
export const sendContactEmail = onDocumentCreated(
  { document: '/contact/{contactId}', secrets: [SENDGRID_API_KEY] },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const contact = data as Contact;
    await sendEmail({
      to: regroupEmail,
      from: regroupEmail,
      text: `
      Contact Name: ${contact.name} \n
      Contact Email: ${contact.email} \n
      \n
      ${contact.message}
    `,
      subject: contact.subject,
    });

    await updateContact(event.params.contactId, {
      ...contact,
      date: getCurrentTime(),
    });
  },
);

/**
 * Sends an admin email when a user's subscription status changes.
 * Listens for updates on /users/{userId}.
 */
export const sendSubscriptionUpdateEmail = onDocumentUpdated(
  { document: '/users/{userId}', secrets: [SENDGRID_API_KEY] },
  async (event) => {
    const before = event.data?.before.data() as User | undefined;
    const after = event.data?.after.data() as User | undefined;
    if (!before || !after) return;

    const statusBefore = before.subscriptionMetadata?.status;
    const statusAfter = after.subscriptionMetadata?.status;

    if (statusBefore !== statusAfter) {
      try {
        await sendEmail({
          to: regroupEmail,
          from: regroupEmail,
          text: `
          Subscription status updated for user ${before.id}
          Status changed from ${statusBefore} to ${statusAfter}
        `,
          subject: 'User subscription changed',
        });
      } catch (error) {
        logger.error('sendSubscriptionUpdateEmail: email delivery failed', {
          error,
        });
      }
    }
  },
);

/**
 * Sends an admin email when a new bug report is created in /bugs/{bugId}.
 */
export const reportBug = onDocumentCreated(
  { document: '/bugs/{bugId}', secrets: [SENDGRID_API_KEY] },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const bugReport = data as BugReport;
    try {
      await sendEmail({
        to: regroupEmail,
        from: regroupEmail,
        text: `
        Description: ${bugReport.description}
        Reporter: ${bugReport.reporter}
        ID: ${bugReport.id}
        Date: ${bugReport.createdDate}
      `,
        subject: 'New bug report',
      });
    } catch (error) {
      logger.error('reportBug: email delivery failed', { error });
    }
  },
);

/**
 * Sends an admin email when new feedback is submitted in /feedback/{feedbackId}.
 */
export const submitFeedback = onDocumentCreated(
  { document: '/feedback/{feedbackId}', secrets: [SENDGRID_API_KEY] },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const feedback = data as Feedback;
    try {
      await sendEmail({
        to: regroupEmail,
        from: regroupEmail,
        text: `
        Description: ${feedback.description}
        Reporter: ${feedback.reviewer}
        ID: ${feedback.id}
        Date: ${feedback.createdDate}
      `,
        subject: 'New feedback',
      });
    } catch (error) {
      logger.error('submitFeedback: email delivery failed', { error });
    }
  },
);
