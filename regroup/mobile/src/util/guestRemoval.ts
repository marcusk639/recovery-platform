/**
 * The rules let a peer leader remove only a resident who owes nothing and has no custom
 * rate (owner decision 2026-11-10), and nobody remove someone who outranks them. When the
 * rules refuse a removal, say so instead of "something went wrong".
 */
export function removalRefusalMessage(error: unknown): string | null {
  const code = String((error as { code?: unknown } | undefined)?.code ?? '');
  return code.endsWith('permission-denied')
    ? "You don't have permission to remove this resident. Only a manager can remove a " +
      'resident who still owes rent or chore fees, or has a custom rate.'
    : null;
}
