/**
 * Extracts a user-safe error message from an unknown caught value, matching
 * the `error.message || fallback` pattern already used across ~24 of this
 * codebase's 26 Redux slices — centralized here so it's typed correctly
 * (the caught value in a catch block is `unknown`, not `any`) rather than
 * repeated with an implicit `any` cast at every call site.
 */
export function extractError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
