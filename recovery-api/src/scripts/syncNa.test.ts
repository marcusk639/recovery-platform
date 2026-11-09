import { parseSyncNaArgs } from './syncNa';

test('defaults to a dry run', () => {
  expect(parseSyncNaArgs([])).toEqual({ apply: false, purge: false, allowDeletes: [] });
});

test('--apply turns writes on', () => {
  expect(parseSyncNaArgs(['--apply']).apply).toBe(true);
});

test('--region takes a numeric region', () => {
  expect(parseSyncNaArgs(['--region', '105']).region).toBe(105);
  expect(() => parseSyncNaArgs(['--region', 'utah'])).toThrow(/--region/);
  expect(() => parseSyncNaArgs(['--region'])).toThrow(/--region/);
});

test('--allow-deletes takes a comma-separated list', () => {
  expect(parseSyncNaArgs(['--allow-deletes', '100,101']).allowDeletes).toEqual(['100', '101']);
  expect(() => parseSyncNaArgs(['--allow-deletes'])).toThrow(/--allow-deletes/);
  expect(() => parseSyncNaArgs(['--allow-deletes', 'all'])).toThrow(/--allow-deletes/);
});

test('--allow-deletes must match --region when both are given', () => {
  expect(() => parseSyncNaArgs(['--region', '100', '--allow-deletes', '101'])).toThrow(
    /--allow-deletes/,
  );
  expect(parseSyncNaArgs(['--region', '100', '--allow-deletes', '100']).region).toBe(100);
});

test('--purge cannot be combined with sync options', () => {
  expect(parseSyncNaArgs(['--purge']).purge).toBe(true);
  expect(parseSyncNaArgs(['--purge', '--apply'])).toMatchObject({ purge: true, apply: true });
  expect(() => parseSyncNaArgs(['--purge', '--region', '100'])).toThrow(/--purge/);
  expect(() => parseSyncNaArgs(['--purge', '--allow-deletes', '100'])).toThrow(/--purge/);
});

test('rejects unknown arguments', () => {
  expect(() => parseSyncNaArgs(['--aply'])).toThrow(/--aply/);
});
