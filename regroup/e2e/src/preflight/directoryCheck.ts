import { fail, firstLine, pass, redact, type Check } from './checks';

export type DirectoryKeyDeps = {
  /** Staging's RECOVERY_PLATFORM_API_KEY. Never printed. */
  readKey: () => Promise<string>;
  /** The HTTP status the deployed directory answers this key with. */
  probe: (key: string) => Promise<number>;
};

/**
 * Staging always searches the real meeting directory, so its key has to keep
 * matching recovery-api's. A key that passes gets past the auth check; the
 * directory then answers 200 or 400 depending on the request body.
 */
export function stagingDirectoryKeyCheck(deps: DirectoryKeyDeps): Check {
  return {
    name: 'stagingMeetingDirectoryKey',
    async run() {
      let key = '';
      try {
        key = (await deps.readKey()).trim();
        if (!key) return fail('regroup-e2e has no RECOVERY_PLATFORM_API_KEY in Secret Manager');
        const status = await deps.probe(key);
        if (status === 401 || status === 403) {
          return fail(
            `the meeting directory refused regroup-e2e's RECOVERY_PLATFORM_API_KEY (${status}); it must match recovery-platform-e6cb3's`,
          );
        }
        if (status >= 500) return fail(`the meeting directory answered ${status}`);
        return pass(`the meeting directory accepts regroup-e2e's key (${status})`);
      } catch (err) {
        return fail(
          `cannot check the meeting directory key: ${firstLine(redact((err as Error)?.message ?? String(err), [key]))}`,
        );
      }
    },
  };
}
