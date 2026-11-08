// Typecheck boundary. Following @mobile/* into regroup/mobile/src would pull in
// types for native packages the portal doesn't install, so they are `any` here.
declare module '@mobile/*';
declare module 'react-native-web';
