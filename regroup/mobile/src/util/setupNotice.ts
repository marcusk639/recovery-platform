import { Alert } from "react-native";

/**
 * Non-blocking notice for a setup that completed but had best-effort steps
 * fail (initializeHouses' inviteFailures / photoFailures). Returns null when
 * nothing failed. Accepts the raw submitHouse result (unknown shape).
 */
export const setupCompletionNotice = (result: unknown): string | null => {
  const { inviteFailures, photoFailures } = (result ?? {}) as {
    inviteFailures?: unknown;
    photoFailures?: unknown;
  };
  const count = (n: unknown) => (typeof n === 'number' && n > 0 ? n : 0);
  const invites = count(inviteFailures);
  const photos = count(photoFailures);
  if (!invites && !photos) return null;

  const parts: string[] = [];
  if (invites) {
    parts.push(
      `${invites} invitation(s) couldn't be sent — resend them from the house's invitations.`,
    );
  }
  if (photos) {
    parts.push(`${photos} photo(s) couldn't upload — add them in House Settings.`);
  }
  return `Setup complete. ${parts.join(' ')}`;
};

/** Shows the setupCompletionNotice, if any, as a dismissable alert. */
export const notifySetupCompletion = (result: unknown): void => {
  const notice = setupCompletionNotice(result);
  if (notice) Alert.alert(notice);
};
