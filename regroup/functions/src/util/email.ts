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
    // Allowlist, never the whole error. A SendGrid ResponseError carries
    // response.body and request, and its `message` echoes the recipient
    // address and the message text — so `message` is deliberately excluded.
    // `field` and `help` describe the API contract, not the payload, and are
    // what actually distinguishes a bad sender identity from a bad field or a
    // revoked key. Logged at error level so a severity-based alert can fire;
    // a send failure is swallowed here, so the log is the only signal there is.
    const err = error as
      | {
          code?: unknown;
          name?: unknown;
          response?: { body?: { errors?: { field?: unknown; help?: unknown }[] } };
        }
      | null
      | undefined;
    logger.error("There was an error sending the email", {
      code: err?.code,
      name: err?.name,
      errors: (err?.response?.body?.errors ?? []).map((e) => ({
        field: e?.field,
        help: e?.help,
      })),
    });
  }
};
