import { Alert } from 'react-native';
import { claimsInvitation } from './parseAppLink';

const TITLE = 'Invitation link not valid';
const MESSAGE =
  'This invitation link is incomplete or damaged. Ask the person who invited you to send a new one.';

/**
 * Tells the user when a link meant as an invitation can't be read (a mangled
 * or truncated email link), instead of opening the app and doing nothing.
 * Returns whether it did. The link is never shown or logged: it may hold a
 * token.
 */
export const reportBrokenInvitationLink = (url: string): boolean => {
  if (!claimsInvitation(url)) return false;
  Alert.alert(TITLE, MESSAGE);
  return true;
};
