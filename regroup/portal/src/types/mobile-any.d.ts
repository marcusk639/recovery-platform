// Typecheck boundary. Following @mobile/* into regroup/mobile/src would pull in
// types for native packages the portal doesn't install, so they are `any` here.
declare module '@mobile/*';
declare module 'react-native-web';
// Deferred, so not installed; the e2e harness calls its stand-in.
declare module 'react-native-image-picker';
declare module '*.ttf' {
  const source: string;
  export default source;
}
declare const __E2E__: boolean;
