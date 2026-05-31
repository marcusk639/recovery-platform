import { getUsersByEmail } from './user';
import { createInviteNotification } from './notifications';
import { User } from '../entities/User';
import { InviteEmailPayload } from '../entities/Email';

export async function notifyAdminsIfTheyExist(
  adminEmails: string[],
  inviteEmails: InviteEmailPayload[]
): Promise<FirebaseFirestore.WriteResult[]> {
  const promises: Promise<FirebaseFirestore.WriteResult>[] = [];
  try {
    for (let i = 0; i < adminEmails.length; i++) {
      const user = await getUsersByEmail(adminEmails[i]);
      if (user.docs && user.docs.length && user.docs[0].exists) {
        const matchedEmail = inviteEmails.find(
          (email) => email.email.to.toLowerCase() === adminEmails[i].toLowerCase()
        );
        if (matchedEmail) {
          promises.push(
            createInviteNotification(
              user.docs[0].data() as User,
              matchedEmail
            )
          );
        }
      }
    }
  } catch (error) {
    // continue processing remaining admins
  }
  return Promise.all(promises);
}
