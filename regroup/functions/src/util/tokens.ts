import { randomBytes } from "crypto";

/**
 * Returns a 32-byte cryptographically random base64url-encoded string
 * (~43 characters). Suitable as an opaque bearer token whose only
 * security property is being unguessable.
 */
export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}
