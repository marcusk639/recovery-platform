import { parseMigrateDayNamesArgs } from './migrateDayNames';

test('defaults to a dry run', () => {
  expect(parseMigrateDayNamesArgs([])).toEqual({ apply: false });
});

test('--apply turns writes on', () => {
  expect(parseMigrateDayNamesArgs(['--apply'])).toEqual({ apply: true });
});

test('rejects unknown arguments, so a typo of --apply cannot pass silently', () => {
  expect(() => parseMigrateDayNamesArgs(['--aply'])).toThrow(/--aply/);
});
