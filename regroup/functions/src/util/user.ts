import { getUsers } from "../api/firestore";
import { Guest } from "../entities/Guest";
import { User } from "../entities/User";
import { auth } from "firebase-admin";
import { regroupEmail } from "./email";
import { Email } from "../entities/Email";

export async function getUsersByEmail(email: string): Promise<FirebaseFirestore.QuerySnapshot> {
  return getUsers("email", email.toLowerCase());
}

export async function getGuestsAsUsers(guests: Guest[]): Promise<User[]> {
  const userPromises: Promise<FirebaseFirestore.QuerySnapshot>[] = guests.map(
    (guest) => getUsers("uid", guest.userId)
  );
  const users: User[] = [];
  for (let i = 0; i < userPromises.length; i++) {
    const promise = userPromises[i];
    const user = await promise;
    users.push(user.docs[0].data() as User);
  }
  return users;
}

export async function _verifyUserEmail(userId: string) {
  return auth().updateUser(userId, { emailVerified: true });
}

export function createConfirmationEmail(
  email: string,
  dynamicLink: string,
  name?: string
): Email {
  const decodedLink = decodeURIComponent(dynamicLink);
  const greeting = name ? `Hello ${name},` : "Hello,";
  const header = name ? `Hello ${name},\n\n` : "Hello,\n\n";
  const body = `Follow this link to verify your email address.\n\n
   ${decodedLink}\n\n
   If you didn't create an account with this address, you can ignore this email.\n\n
   Thanks,\n\n
   Your Regroup: Sober Living App team`;

  // Wrap custom-scheme deep links in a web redirect so email clients can open them.
  const linkToUse = decodedLink.startsWith("regroup-app://")
    ? `https://regroup-app.com/redirect?url=${encodeURIComponent(decodedLink)}`
    : decodedLink;

  const html = [
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">',
    '<h2 style="color: #333; text-align: center;">Email Verification</h2>',
    '<p style="font-size: 16px; line-height: 1.5; color: #555;">',
    greeting,
    "</p>",
    '<p style="font-size: 16px; line-height: 1.5; color: #555;">',
    "Please verify your email address by clicking the button below:",
    "</p>",
    '<div style="text-align: center; margin: 30px 0;">',
    '<a href="' +
      linkToUse +
      '" style="background-color: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold; display: inline-block;">',
    "Verify Email Address",
    "</a>",
    "</div>",
    '<p style="font-size: 14px; color: #666; text-align: center;">',
    "If the button doesn't work, you can copy and paste this link into your browser:<br>",
    '<a href="' +
      linkToUse +
      '" style="color: #28a745; word-break: break-all;">' +
      linkToUse +
      "</a>",
    "</p>",
    '<p style="font-size: 14px; color: #666;">',
    "If you didn't create an account with this address, you can ignore this email.",
    "</p>",
    '<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">',
    '<p style="font-size: 12px; color: #999; text-align: center;">',
    "Thanks,<br>",
    "Your Regroup: Sober Living App team",
    "</p>",
    "</div>",
  ].join("");

  return {
    text: `${header}${body}`,
    html,
    to: email,
    from: `"Regroup LLC" ${regroupEmail}`,
    subject: `Email Confirmation`,
  };
}
