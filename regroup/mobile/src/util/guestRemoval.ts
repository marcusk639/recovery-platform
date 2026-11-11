/**
 * The rules let a peer leader remove only a resident who owes nothing (owner decision
 * 2026-11-10): removing one who owes rent or chore fees would clear what they owe. When
 * the rules refuse a removal, say why instead of "something went wrong".
 */
export function removalRefusalMessage(error: unknown): string | null {
  const code = String((error as { code?: unknown } | undefined)?.code ?? '');
  return code.endsWith('permission-denied')
    ? 'Only a manager can remove a resident who still owes rent or chore fees.'
    : null;
}
