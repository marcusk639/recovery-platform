import { classify, inertEntries } from '../tools/replacements.mjs';

test('native import with no entry is unknown', () => {
  expect(classify('react-native-some-new-thing').kind).toBe('unknown');
});
test('a scoped package with react-native in its name is native', () => {
  expect(classify('@dr.pogodin/react-native-some-new-thing').kind).toBe('unknown');
});
test('react-native maps to the portal wrapper', () => {
  expect(classify('react-native')).toEqual({ kind: 'replace', target: 'src/adapter/react-native.ts' });
});
test('firestore maps to the adapter', () => {
  expect(classify('@react-native-firebase/firestore').target).toBe('src/adapter/firebase/firestore.ts');
});
test('ordinary JS packages are real', () => {
  expect(classify('date-fns').kind).toBe('real');
});
test('react-navigation is not treated as native', () => {
  expect(classify('@react-navigation/native').kind).toBe('real');
});
test('a listed web-safe native package is real, including subpaths', () => {
  expect(classify('react-native-popover-view/dist/Popover').kind).toBe('real');
});
test('every inert entry has a reason', () => {
  for (const e of inertEntries()) expect(e.reason.length).toBeGreaterThan(10);
});
