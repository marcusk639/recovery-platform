// Google API key is read from the GOOGLE_MAPS_API_KEY environment variable.
//
// How it works:
//   1. `babel.config.js` calls `require('dotenv').config()`, loading .env into
//      Node's process.env before Metro begins transforming files.
//   2. `babel-plugin-transform-inline-environment-variables` replaces
//      `process.env.GOOGLE_MAPS_API_KEY` with a string literal at bundle time.
//      It only substitutes names listed in BUNDLED_ENV in babel.config.js —
//      a variable missing from that list stays `undefined` however it is set.
//   3. At runtime the inlined value is used — no native bridge required.
//
// Nothing in React Native populates process.env on its own; step 2 is the whole
// mechanism. An earlier version of this comment credited a "Metro built-in
// loose-envify pass", which does not exist — and for a time neither did step 1,
// because babel.config.js was never committed (regroup/.gitignore excluded all
// JavaScript) and was later restored without the dotenv call.
//
// To configure:
//   Copy .env.example → .env and fill in the real API key.
//   Never commit .env — it is listed in .gitignore.

export const GOOGLE_API_KEY = (): string => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    console.warn(
      '[apikeys] GOOGLE_MAPS_API_KEY is not set. ' +
        'Copy .env.example to .env and add the real key.',
    );
    return '';
  }
  return key;
};
