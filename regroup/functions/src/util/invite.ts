import { logger } from "firebase-functions/v2";
import { getUsersByEmail } from "./user";
import { createInviteNotification } from "./notifications";
import { User } from "../entities/User";
import { InviteEmailPayload } from "../entities/Email";

export async function notifyAdminsIfTheyExist(
  adminEmails: string[],
  inviteEmails: InviteEmailPayload[]
): Promise<FirebaseFirestore.WriteResult[]> {
  const promises: Promise<FirebaseFirestore.WriteResult>[] = [];
  // Hardened 2026-07-05: the try/catch previously wrapped the whole loop, so
  // one admin lookup failure exited the loop entirely — despite the comment
  // claiming "continue processing remaining admins," a caught exception does
  // not resume a for loop. Moved inside the loop so a single bad lookup only
  // skips that admin.
  for (let i = 0; i < adminEmails.length; i++) {
    try {
      const user = await getUsersByEmail(adminEmails[i]);
      if (user.docs && user.docs.length && user.docs[0].exists) {
        const matchedEmail = inviteEmails.find(
          (email) =>
            email.email.to.toLowerCase() === adminEmails[i].toLowerCase()
        );
        if (matchedEmail) {
          promises.push(
            createInviteNotification(user.docs[0].data() as User, matchedEmail)
          );
        }
      }
    } catch (error) {
      logger.error(`Failed to notify admin at index ${i}`, error);
    }
  }
  return Promise.all(promises);
}
