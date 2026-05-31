import { Email } from "../entities/Email";
import sendgrid from "@sendgrid/mail";
import { MailDataRequired } from "@sendgrid/helpers/classes/mail";
import { logger } from "firebase-functions";

export const regroupEmail = "admin@regroup-app.com";

let sgInitialized = false;
function initSendGrid() {
  if (!sgInitialized) {
    sendgrid.setApiKey(process.env.SENDGRID_API_KEY!);
    sgInitialized = true;
  }
}

/**
 * Sends an email via SendGrid.
 * Errors are caught and logged rather than propagated to the caller.
 */
export const sendEmail = async (email: Email): Promise<void> => {
  initSendGrid();
  try {
    const emailData: MailDataRequired = {
      to: email.to,
      from: email.from || regroupEmail,
      text: email.text,
      subject: email.subject,
      ...(email.html ? { html: email.html } : {}),
    };

    await sendgrid.send(emailData);
  } catch (error) {
    logger.info("There was an error sending the email:", JSON.stringify(error));
  }
};
