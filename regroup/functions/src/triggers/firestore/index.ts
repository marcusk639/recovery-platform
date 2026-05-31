import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import { auth } from "firebase-admin";
import { logger } from "firebase-functions";
import { Notification } from "../../entities/Notification";
import { House } from "../../entities/House";
import { Contact } from "../../entities/Contact";
import { BugReport } from "../../entities/BugReport";
import { Feedback } from "../../entities/Feedback";
import { User } from "../../entities/User";
import { Guest } from "../../entities/Guest";
import { sendNotification } from "../../util/notifications";
import { sendEmail, regroupEmail } from "../../util/email";
import {
  guestCollection,
  houseCollection,
  notificationCollection,
  ratsFirestore,
  updateContact,
} from "../../api/firestore";
import { getCurrentTime } from "../../util/date";
import { deleteClaim } from "../../util/claims";
import { SENDGRID_API_KEY } from "../../config";

/**
 * Sends a push notification when a new document is created in /notifications/{notificationId}.
 */
export const notify = onDocumentCreated(
  "/notifications/{notificationId}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const notification = data as Notification;
    return sendNotification({
      recipientId: notification.userId,
      body: notification.message ?? "",
      title: notification.subject ?? "",
    });
  },
);

/**
 * Sends an admin email when a new house document is created in /houses/{houseId}.
 */
export const notifyNewHouseCreated = onDocumentCreated(
  { document: "/houses/{houseId}", secrets: [SENDGRID_API_KEY] },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const house = data as House;
    sendEmail({
      to: regroupEmail,
      from: regroupEmail,
      text: `
        Name: ${house.name}
        ID: ${house.id}
        Super Admin: ${house.superAdminId}
        Date: ${house.createdDate}
      `,
      subject: "New house created",
    });
  },
);

/**
 * Sends a contact-form email and saves the timestamp when a new document
 * is created in /contact/{contactId}.
 */
export const sendContactEmail = onDocumentCreated(
  { document: "/contact/{contactId}", secrets: [SENDGRID_API_KEY] },
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
  { document: "/users/{userId}", secrets: [SENDGRID_API_KEY] },
  async (event) => {
    const before = event.data?.before.data() as User | undefined;
    const after = event.data?.after.data() as User | undefined;
    if (!before || !after) return;

    const statusBefore = before.subscriptionMetadata?.status;
    const statusAfter = after.subscriptionMetadata?.status;

    if (statusBefore !== statusAfter) {
      sendEmail({
        to: regroupEmail,
        from: regroupEmail,
        text: `
          Subscription status updated for user ${before.id}
          Status changed from ${statusBefore} to ${statusAfter}
        `,
        subject: "User subscription changed",
      });
    }
  },
);

/**
 * Sends an admin email when a new bug report is created in /bugs/{bugId}.
 */
export const reportBug = onDocumentCreated(
  { document: "/bugs/{bugId}", secrets: [SENDGRID_API_KEY] },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const bugReport = data as BugReport;
    sendEmail({
      to: regroupEmail,
      from: regroupEmail,
      text: `
        Description: ${bugReport.description}
        Reporter: ${bugReport.reporter}
        ID: ${bugReport.id}
        Date: ${bugReport.createdDate}
      `,
      subject: "New bug report",
    });
  },
);

/**
 * Sends an admin email when new feedback is submitted in /feedback/{feedbackId}.
 */
export const submitFeedback = onDocumentCreated(
  { document: "/feedback/{feedbackId}", secrets: [SENDGRID_API_KEY] },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const feedback = data as Feedback;
    sendEmail({
      to: regroupEmail,
      from: regroupEmail,
      text: `
        Description: ${feedback.description}
        Reporter: ${feedback.reviewer}
        ID: ${feedback.id}
        Date: ${feedback.createdDate}
      `,
      subject: "New feedback",
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// onGuestWrite
//
// Merged handler replacing addDeleteGuestAuthorization + eesRecalculationOnGuestWrite.
// Fires on every create, update, or delete of a document in guests/{guestId}.
//
// On DELETE only: removes the departed guest's Firebase Auth custom claims.
// On ALL writes:  recalculates EES for the house based on active resident count.
//
// Both operations run independently — a failure in one is logged and does not
// abort the other. EES failures are re-thrown for Firebase retry; auth cleanup
// failures are logged-only since a deleted doc won't retrigger this function.
// ─────────────────────────────────────────────────────────────────────────────
export const onGuestWrite = onDocumentWritten(
  "guests/{guestId}",
  async (event) => {
    const isDelete = !event.data?.after?.exists;
    const guestData = event.data?.after?.data() ?? event.data?.before?.data();
    if (!guestData) return;

    let eesError: Error | null = null;

    if (isDelete) {
      try {
        const guest = event.data!.before.data() as Guest;
        const userClaims = await deleteClaim(
          guest.userId,
          [guest.houseId],
          "guest",
        );
        const adminClaims = await deleteClaim(
          guest.userId,
          [guest.houseId],
          "admin",
        );
        await auth().setCustomUserClaims(guest.userId, {
          ...userClaims,
          ...adminClaims,
        });
      } catch (err) {
        logger.error("onGuestWrite: auth claims cleanup failed", {
          guestId: event.params.guestId,
          error: (err as Error).message,
        });
      }
    }

    try {
      const houseId = guestData.houseId as string | undefined;
      if (!houseId) return;

      const guestsSnap = await guestCollection
        .where("houseId", "==", houseId)
        .get();

      const activeCount = guestsSnap.docs.filter(
        (d) =>
          !d.data().moveOutDate &&
          d.data().status !== "inactive" &&
          d.data().status !== "expelled",
      ).length;
      if (activeCount === 0) return;

      const weekStart = new Date();
      const day = weekStart.getDay();
      weekStart.setDate(weekStart.getDate() - (day === 0 ? 6 : day - 1));
      const weekStartStr = weekStart.toISOString().slice(0, 10);

      const eesSnap = await ratsFirestore
        .collection("ees-records")
        .where("houseId", "==", houseId)
        .where("weekStart", "==", weekStartStr)
        .where("paid", "==", false)
        .get();

      if (eesSnap.empty) return;

      const firstRecord = eesSnap.docs[0].data();
      const totalExpenses = (firstRecord.totalExpenses as number) ?? 0;
      const newAmount = totalExpenses > 0 ? totalExpenses / activeCount : 0;

      const batch = ratsFirestore.batch();
      eesSnap.docs.forEach((doc) => {
        batch.update(doc.ref, {
          amount: newAmount,
          residentCount: activeCount,
        });
      });
      await batch.commit();

      logger.info(
        `onGuestWrite: EES recalculated for house ${houseId}: ${activeCount} residents, $${newAmount.toFixed(
          2,
        )} each`,
      );
    } catch (err) {
      eesError = err as Error;
      logger.error("onGuestWrite: EES recalculation failed", {
        guestId: event.params.guestId,
        error: eesError.message,
      });
    }

    // On non-delete events only EES runs, so re-throw to allow Firebase retry.
    // On delete events auth cleanup already ran; retrying would duplicate that work
    // without guaranteeing EES succeeds, so log-only.
    if (eesError && !isDelete) throw eesError;
  },
);

/**
 * Notifies all house admins when a new resident application is submitted.
 *
 * Fires on: create of houses/{houseId}/applications/{appId}
 * Action:   creates a /notifications/{id} document for each admin, which
 *           triggers the existing `notify` function to send push notifications.
 */
export const notifyOperatorOnApplication = onDocumentCreated(
  "houses/{houseId}/applications/{appId}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const houseId = event.params.houseId;
    const applicantName = (data.applicantName as string) || "Someone";

    try {
      const houseSnap = await houseCollection.doc(houseId).get();
      if (!houseSnap.exists) return;

      const houseData = houseSnap.data()!;
      const adminIds: string[] = houseData.adminIds ?? [];
      const superAdminId: string = houseData.superAdminId ?? "";

      const recipientIds = [
        ...new Set([...adminIds, superAdminId].filter(Boolean)),
      ];
      if (recipientIds.length === 0) return;

      const batch = ratsFirestore.batch();
      recipientIds.forEach((adminId) => {
        const notifRef = notificationCollection.doc();
        batch.set(notifRef, {
          userId: adminId,
          houseId,
          subject: "New Application Received",
          message: `${applicantName} applied to join your house.`,
          type: "application-received",
          date: new Date().toISOString(),
          read: false,
        });
      });

      await batch.commit();
      logger.info(
        `notifyOperatorOnApplication: sent ${recipientIds.length} notifications for house ${houseId}`,
      );
    } catch (error) {
      logger.error("notifyOperatorOnApplication: failed to notify admins", {
        houseId,
        error: (error as Error).message,
      });
      throw error;
    }
  },
);
