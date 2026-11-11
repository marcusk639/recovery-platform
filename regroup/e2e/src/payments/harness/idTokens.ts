/** ID tokens per uid. A token carries the claims it was minted with, so forget it when they change. */
export const idTokens = new Map<string, string>();

export function forgetIdToken(uid: string): void {
  idTokens.delete(uid);
}
