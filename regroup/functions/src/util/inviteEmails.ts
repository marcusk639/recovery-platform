import { sendEmail, regroupEmail } from "./email";

export type InviteEmailType = "admin" | "guest" | "superAdmin" | "supporter";

export interface SendOneInviteParams {
  toEmail: string;
  inviteLink: string;
  role: InviteEmailType;
  inviterDisplayName?: string;
}

/**
 * Sends a single invitation email via SendGrid. Extracted from
 * sendInviteEmails so it can be reused by createInvitation without
 * recreating the SendGrid plumbing.
 *
 * Preserves the subject/text/html template of the existing
 * sendInviteEmails loop; the link is sent as given (no scheme rewrite).
 *
 * NOTE: `inviterDisplayName` is part of the spec signature but is
 * not yet referenced by the current template. It is accepted so
 * downstream callers (createInvitation) can plumb it through; we
 * will start rendering it in a later task when the template is
 * updated. Adding it now does not change current output.
 */
export async function sendOneInviteEmail(
  params: SendOneInviteParams
): Promise<void> {
  const { toEmail, inviteLink, role } = params;

  // The link is an https app link: emailed as-is in both bodies. (It used to
  // be rewritten to com.rats.dev:// behind an unrouted /redirect page.)
  // Not decoded: the token is percent-encoded and must reach the app intact.
  const linkToUse = inviteLink || "#";

  const text =
    role === "guest"
      ? `You have been invited to join a sober living house. Click ${linkToUse} to join.`
      : `You have been invited to manage a sober living house. Click ${linkToUse} to join.`;

  // Build HTML more explicitly to avoid template string issues
  const invitationMessage =
    role === "guest"
      ? "You have been invited to join a sober living house."
      : "You have been invited to manage a sober living house.";

  const buttonText = role === "guest" ? "Join House" : "Accept Invitation";

  const html = [
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">',
    '<h2 style="color: #333; text-align: center;">Sober Living Invitation</h2>',
    '<p style="font-size: 16px; line-height: 1.5; color: #555;">',
    invitationMessage,
    "</p>",
    '<div style="text-align: center; margin: 30px 0;">',
    '<a href="' +
      linkToUse +
      '" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold; display: inline-block;">',
    buttonText,
    "</a>",
    "</div>",
    '<p style="font-size: 14px; color: #666; text-align: center;">',
    "If the button doesn't work, you can copy and paste this link into your browser:<br>",
    '<a href="' +
      linkToUse +
      '" style="color: #007bff; word-break: break-all;">' +
      linkToUse +
      "</a>",
    "</p>",
    '<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">',
    '<p style="font-size: 12px; color: #999; text-align: center;">',
    "This invitation was sent by Regroup: Sober Living App",
    "</p>",
    "</div>",
  ].join("");


  await sendEmail({
    text,
    html,
    to: toEmail,
    from: regroupEmail,
    subject: `Sober Living Invite`,
  });
}
