// Google API key is read from the GOOGLE_MAPS_API_KEY environment variable.
//
// How it works:
//   1. `babel.config.js` calls `require('dotenv').config()` which loads .env
//      into Node's process.env before Metro begins transforming files.
//   2. Metro's built-in loose-envify pass replaces `process.env.GOOGLE_MAPS_API_KEY`
//      with the actual string literal at bundle time.
//   3. At runtime the inlined value is used — no native bridge required.
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
