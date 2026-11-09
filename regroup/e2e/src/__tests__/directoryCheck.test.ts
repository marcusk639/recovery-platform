import { stagingDirectoryKeyCheck } from '../preflight/directoryCheck';

const CANARY = 'CANARY7f3a9notforoutput';

const check = (status: number | Error, key: string | Error = CANARY) =>
  stagingDirectoryKeyCheck({
    readKey: async () => {
      if (key instanceof Error) throw key;
      return key;
    },
    probe: async () => {
      if (status instanceof Error) throw status;
      return status;
    },
  }).run();

describe('stagingDirectoryKeyCheck', () => {
  it.each([200, 400])('passes when the directory accepts the key (%i)', async (status) => {
    await expect(check(status)).resolves.toMatchObject({ ok: true });
  });

  it.each([401, 403])('fails when the directory refuses the key (%i)', async (status) => {
    const result = await check(status);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/RECOVERY_PLATFORM_API_KEY/);
  });

  it.each([500, 503])('fails when the directory is down (%i)', async (status) => {
    await expect(check(status)).resolves.toMatchObject({ ok: false });
  });

  it('fails when staging has no key', async () => {
    await expect(check(200, '')).resolves.toMatchObject({ ok: false });
  });

  it('fails when the key cannot be read', async () => {
    await expect(check(200, new Error('no access'))).resolves.toMatchObject({ ok: false });
  });

  it('never prints the key', async () => {
    const results = await Promise.all([
      check(200),
      check(401),
      check(new Error(`request with ${CANARY} failed`)),
    ]);
    for (const result of results) expect(result.detail).not.toContain(CANARY);
  });
});
