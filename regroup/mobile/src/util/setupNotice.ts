import { Alert } from 'react-native';

type FailedInvite = { houseName?: unknown; role?: unknown };

const ROLE_LABELS: Record<string, string> = {
  admin: 'admin',
  guest: 'guest',
  'senior-peer': 'senior peer',
};

// Where each role's invitation can be sent again. There is no per-house list
// of pending invitations to resend from.
const ROLE_REDO: Record<string, string> = {
  admin: 'Re-invite admins from House Settings > Admin Management.',
  guest: 'Re-invite guests from House Settings > Guests.',
  'senior-peer': "Senior peer invitations can't be re-sent in the app yet; contact support.",
};

/** "Oak House (admin, guest) and Elm House (senior peer)". */
const describeInviteFailures = (failed: FailedInvite[]): string => {
  const byHouse = new Map<string, Set<string>>();
  failed.forEach(({ houseName, role }) => {
    const name = typeof houseName === 'string' && houseName.trim() ? houseName.trim() : 'a house';
    const roles = byHouse.get(name) ?? new Set<string>();
    roles.add(ROLE_LABELS[String(role)] ?? 'member');
    byHouse.set(name, roles);
  });
  const parts = Array.from(byHouse, ([name, roles]) => `${name} (${Array.from(roles).join(', ')})`);
  return parts.length > 1
    ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
    : parts[0];
};

const inviteNotice = (count: number, failed: unknown): string => {
  if (!Array.isArray(failed) || failed.length === 0) {
    return `${count} invitation(s) couldn't be sent — invite them again from House Settings.`;
  }
  const list = failed as FailedInvite[];
  const redo = Object.keys(ROLE_REDO)
    .filter((role) => list.some((f) => f.role === role))
    .map((role) => ROLE_REDO[role]);
  return [`Invitations couldn't be sent for ${describeInviteFailures(list)}.`, ...redo].join(' ');
};

/**
 * Non-blocking notice for a setup that completed but had best-effort steps
 * fail (initializeHouses' inviteFailures / failedInvites / photoFailures).
 * Names the houses and roles whose invitations failed when failedInvites is
 * present. Returns null when nothing failed. Accepts the raw submitHouse
 * result (unknown shape).
 */
export const setupCompletionNotice = (result: unknown): string | null => {
  const { inviteFailures, photoFailures, failedInvites } = (result ?? {}) as {
    inviteFailures?: unknown;
    photoFailures?: unknown;
    failedInvites?: unknown;
  };
  const count = (n: unknown) => (typeof n === 'number' && n > 0 ? n : 0);
  const invites = count(inviteFailures);
  const photos = count(photoFailures);
  if (!invites && !photos) return null;

  const parts: string[] = [];
  if (invites) {
    parts.push(inviteNotice(invites, failedInvites));
  }
  if (photos) {
    parts.push(`${photos} photo(s) couldn't upload — add them in House Settings > Details.`);
  }
  return `Setup complete. ${parts.join(' ')}`;
};

/** Shows the setupCompletionNotice, if any, as a dismissable alert. */
export const notifySetupCompletion = (result: unknown): void => {
  const notice = setupCompletionNotice(result);
  if (notice) Alert.alert(notice);
};
