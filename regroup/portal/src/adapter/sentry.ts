// Mobile code reports through logException, often with resident details in the
// message, so only the error's code and name reach the console.
type Reportable = { code?: unknown; name?: unknown } | null | undefined;

export function captureException(error: Reportable, _context?: unknown): void {
  console.error('[portal error]', String(error?.code ?? ''), String(error?.name ?? 'Error'));
}
export function captureMessage(_message?: unknown): void {
  console.warn('[portal message]');
}
export const init = (): void => {};
export const addBreadcrumb = (): void => {};
export const setUser = (): void => {};
export const setTag = (): void => {};
export const wrap = <T,>(component: T): T => component;
