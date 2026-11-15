/**
 * The `npm run maestro:*` scripts check a device with e2e-build-guard.js, then
 * run Maestro. With several devices booted, each picks its own unless both are
 * told which one, so the guard could pass a device Maestro then didn't drive
 * (#176). E2E_DEVICE, when set, goes to both.
 */
const { scripts } = require('../../../package.json');

const DEVICE = '${E2E_DEVICE:+--device "$E2E_DEVICE"}';
const guarded = Object.entries(scripts).filter(([, cmd]) => cmd.includes('e2e-build-guard.js'));

describe('npm maestro scripts', () => {
  it('finds the guarded scripts', () => {
    expect(guarded.map(([name]) => name)).toEqual(
      expect.arrayContaining([
        'maestro:ios',
        'maestro:android',
        'maestro:smoke:ios',
        'maestro:smoke:android',
      ]),
    );
  });

  it.each(guarded)('%s gives the guard and Maestro the same E2E_DEVICE', (_name, cmd) => {
    const [guard, maestro] = cmd.split(' && maestro ');
    expect(guard).toContain(`e2e-build-guard.js`);
    expect(guard.trim().endsWith(DEVICE)).toBe(true);
    expect(maestro.startsWith(`${DEVICE} test `)).toBe(true);
  });
});
