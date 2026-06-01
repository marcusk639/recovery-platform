// e2e/env.js
// Loads test credentials from process.env (populated from .env.e2e via dotenv-cli)
function requireEnv(name) {
  const val = process.env[name];
  if (!val)
    throw new Error(
      `E2E env var ${name} is required but not set. Copy e2e/.env.e2e.example to e2e/.env.e2e and fill in values.`,
    );
  return val;
}
module.exports = {
  TEST_EMAIL: requireEnv('E2E_TEST_EMAIL'),
  TEST_PASSWORD: requireEnv('E2E_TEST_PASSWORD'),
};
