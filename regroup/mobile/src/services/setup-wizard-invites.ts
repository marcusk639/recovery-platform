import { User } from '../entities/User';
import { Houses } from '../types';
import { getInitialPhase } from '../util/house';
import { logException } from '../util/logging';
import { createInvitation, CreateInvitationResult } from './invitations';

export type InviteRole = 'admin' | 'guest' | 'senior-peer';

export interface InviteFailure {
  houseId: string;
  role: InviteRole;
}

export interface SendInvitesResult {
  sent: number;
  failed: number;
  /** One entry per invitation that was not sent. Never carries the email. */
  failures: InviteFailure[];
}

interface PendingInvite extends InviteFailure {
  email: string;
  initialPhase?: string;
}

const pendingInvites = (
  houses: Houses,
  roles: Record<InviteRole, boolean>,
  withPhase: boolean,
): PendingInvite[] =>
  Object.values(houses).flatMap((house) => {
    const initialPhase = withPhase ? getInitialPhase(house)?.name : undefined;
    const lists: [InviteRole, string[] | undefined][] = [
      ['admin', house.pendingAdminInvites],
      ['guest', house.pendingGuestInvites],
      ['senior-peer', house.seniorPeerEmails],
    ];
    return lists.flatMap(([role, emails]) =>
      roles[role] && emails
        ? emails.map((email) => ({ email, houseId: house.id, role, initialPhase }))
        : [],
    );
  });

const errorCode = (error: unknown): string => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code ? code : 'unknown';
};

/**
 * Sends every pending invitation. Each invitation settles independently (a
 * synchronous throw counts as that invitation's failure), so one failure does
 * not stop the others. Each failure is logged with house id, role and error
 * code only: the error itself may quote the email.
 */
export async function sendAllInvites(
  houses: Houses,
  _operator: User,
  guest: boolean = true,
  admin: boolean = true,
  seniorPeer: boolean = true,
): Promise<SendInvitesResult> {
  const invites = pendingInvites(houses, { admin, guest, 'senior-peer': seniorPeer }, true);
  const results = await Promise.allSettled(
    invites.map(async ({ email, houseId, role, initialPhase }): Promise<CreateInvitationResult> =>
      createInvitation({ email, houseId, role, initialPhase }),
    ),
  );
  const failures: InviteFailure[] = [];
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const { houseId, role } = invites[i];
      failures.push({ houseId, role });
      logException(
        new Error('sendAllInvites: invitation failed'),
        `house=${houseId} role=${role} code=${errorCode(result.reason)}`,
      );
    }
  });
  return { sent: results.length - failures.length, failed: failures.length, failures };
}

/** Every pending invitation as a failure, for when sending could not start. */
export const allInvitesFailed = (houses: Houses): InviteFailure[] =>
  pendingInvites(houses, { admin: true, guest: true, 'senior-peer': true }, false).map(
    ({ houseId, role }) => ({ houseId, role }),
  );
