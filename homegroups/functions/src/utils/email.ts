import sgMail from "@sendgrid/mail";
import * as logger from "firebase-functions/logger";

// Initialize SendGrid with API key from Firebase config
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export const sendEmail = async ({
  to,
  subject,
  html,
  from = "admin@regroup-app.com",
}: EmailOptions): Promise<void> => {
  try {
    const msg = {
      to,
      from,
      subject,
      html,
    };

    await sgMail.send(msg);
    logger.info("Email sent successfully");
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error("Failed to send email");
  }
};
