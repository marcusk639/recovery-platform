/**
 * The records that make an account a member of a house once an invitation's
 * role has been granted (redeemInvitation, or the legacy authorization
 * callables). Granting writes only claims and server records; the app reads
 * membership from these (DataContext loads houses from isGuest + houseId +
 * guestId or isAdmin + adminId, getUserState picks the start route from the
 * flags). One implementation for SignUpForm (a new account) and for "Accept as
 * this account" (services/appLinks/signedInInvitation.ts).
 *
 * - guest / senior-peer: a self-created resident record (buildSelfCreateGuest,
 *   the shape firestore.rules isInvitedSelfCreate allows) and the user's
 *   isGuest, houseId, guestId, email.
 * - admin: an admins record for the one invited house (the rules allow a
 *   client create for exactly one house) and the user's isAdmin, adminId.
 */
import { Guest } from '../entities/Guest';
import Admin from '../entities/Admin';
import { User } from '../entities/User';
import { buildSelfCreateGuest } from '../screens/SignUp/selfCreateGuest';
import { mapUserToAdmin } from '../util/admin';
import { getAuthUser } from './users';

export interface MembershipInvitation {
  type: string;
  houseId: string;
  initialPhase?: string;
}

export type InvitationMembership =
  | { kind: 'guest'; guest: Guest; updates: Partial<User> }
  | { kind: 'admin'; admin: Admin; updates: Partial<User> };

export interface MembershipWriters {
  createGuest: (guest: Guest) => Promise<unknown>;
  createAdmin: (admin: Admin) => Promise<unknown>;
  updateUser: (user: User, updates: Partial<User>) => Promise<unknown>;
}

/** The records for this invitation's role, or null for a role without any. */
export function buildInvitationMembership(
  user: Partial<User>,
  invitation: MembershipInvitation,
): InvitationMembership | null {
  if (invitation.type === 'guest' || invitation.type === 'senior-peer') {
    const guest = buildSelfCreateGuest({ ...user, houseId: invitation.houseId }, invitation);
    return {
      kind: 'guest',
      guest,
      updates: {
        isGuest: true,
        houseId: invitation.houseId,
        guestId: guest.id,
        email: user.email,
        // Sign-up writes the user's isAdmin for a senior peer before createUser
        // (handleUserInvitation); the accept path must too.
        ...(invitation.type === 'senior-peer' && { isAdmin: true }),
      },
    };
  }
  if (invitation.type === 'admin') {
    const mapped = mapUserToAdmin(user, new Admin(user.email ?? ''));
    // Immutable add: never mutate what mapUserToAdmin returned.
    const admin = { ...mapped, houseIds: [...mapped.houseIds, invitation.houseId] } as Admin;
    return { kind: 'admin', admin, updates: { isAdmin: true, adminId: admin.id } };
  }
  return null;
}

/**
 * Records already created whose user-doc update has not succeeded yet, keyed
 * by account, role and house. The record's id is random and the rules allow no
 * client lookup of one's own record (an admins list query is refused), so a
 * retry in the same app session reuses this record instead of creating a
 * second one. Lost on an app restart: see SETUP_UNFINISHED's advice.
 */
const createdNotLinked = new Map<string, InvitationMembership>();

const retryKey = (user: Partial<User>, m: InvitationMembership): string =>
  m.kind === 'guest'
    ? `${user.uid}:guest:${m.guest.houseId}`
    : `${user.uid}:admin:${m.admin.houseIds[0]}`;

/** Test seam: forget records created by a failed attempt. */
export function resetInvitationMembershipRetryState(): void {
  createdNotLinked.clear();
}

/**
 * Writes the record, then links the user to it. Sequential, so a failure
 * leaves only "record exists, user not linked" (never a user pointing at a
 * record that was not created), and a retry skips the create. Rejects if
 * either write fails.
 */
export async function writeInvitationMembership(
  membership: InvitationMembership,
  user: Partial<User>,
  writers: MembershipWriters,
): Promise<void> {
  const key = retryKey(user, membership);
  let created = createdNotLinked.get(key);
  if (!created) {
    await (membership.kind === 'guest'
      ? writers.createGuest(membership.guest)
      : writers.createAdmin(membership.admin));
    created = membership;
    createdNotLinked.set(key, created);
  }
  await writers.updateUser(user as User, created.updates);
  createdNotLinked.delete(key);
}

/**
 * After the grant: waits briefly for the custom claims to propagate, then
 * force-refreshes the ID token so the records' writes see the new house role.
 */
export async function refreshInvitationClaims(delayMs: number = 1000): Promise<void> {
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  await getAuthUser(true);
}
