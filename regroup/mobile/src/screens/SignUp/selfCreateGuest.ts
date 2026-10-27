import { Guest } from '../../entities/Guest';
import { User } from '../../entities/User';
import { mapUserToGuest } from '../../util/guest';

/**
 * The resident record an invitee creates for themselves after redeeming a
 * guest or senior-peer invitation. firestore.rules isInvitedSelfCreate allows
 * exactly this shape (drift guard: __tests__/selfCreatePayload.test.ts).
 * createdBy/updatedBy name the invitee, so the server can tell a self-created
 * doc from a staff-created one when it binds the admission ticket to one doc.
 */
export function buildSelfCreateGuest(
  user: Partial<User>,
  invitation: { type: string; initialPhase?: string },
): Guest {
  const guest = mapUserToGuest(user, new Guest());
  guest.isAdmin = invitation.type === 'senior-peer';
  guest.phase = invitation.initialPhase ?? '';
  guest.createdBy = user.uid;
  guest.updatedBy = user.uid;
  return guest;
}
