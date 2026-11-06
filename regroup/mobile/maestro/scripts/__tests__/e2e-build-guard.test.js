const { checkAppId, checkBundleMarkers } = require('../e2e-build-guard');

describe('checkAppId', () => {
  it.each([
    ['com.rats.dev.e2e.emu', 'emulator'],
    ['com.rats.dev.e2e.stg', 'staging'],
    ['com.regroup.app.e2e.emu', 'emulator'],
    ['com.regroup.app.e2e.stg', 'staging'],
  ])('accepts %s as %s', (id, variant) => {
    expect(checkAppId(id)).toEqual({ ok: true, variant });
  });

  it.each([
    'com.rats.dev',
    'com.regroup.app',
    'com.rats.dev.e2e',
    'com.rats.dev.e2e.emu.evil',
    'e2e.emu',
    '',
    undefined,
  ])('refuses %p', (id) => {
    const r = checkAppId(id);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not an e2e app id/);
  });
});

describe('checkBundleMarkers', () => {
  it('accepts exactly one matching marker', () => {
    expect(checkBundleMarkers('x regroup-e2e-variant=emulator y', 'emulator')).toEqual({
      ok: true,
    });
  });

  it('accepts the same marker repeated', () => {
    expect(
      checkBundleMarkers('regroup-e2e-variant=staging..regroup-e2e-variant=staging', 'staging').ok,
    ).toBe(true);
  });

  it('refuses a missing marker', () => {
    expect(checkBundleMarkers('no marker here', 'emulator')).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/no e2e marker/),
    });
  });

  it('refuses a store bundle', () => {
    expect(checkBundleMarkers('regroup-e2e-variant=none', 'emulator')).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/=none/),
    });
  });

  it('refuses the wrong variant', () => {
    expect(checkBundleMarkers('regroup-e2e-variant=staging', 'emulator').ok).toBe(false);
  });

  it('refuses two different markers', () => {
    expect(
      checkBundleMarkers('regroup-e2e-variant=emulator regroup-e2e-variant=staging', 'emulator').ok,
    ).toBe(false);
  });
});
