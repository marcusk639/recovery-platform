// The payment suite: real Stripe objects, against emulators. Run with npm run test:payments.
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.server.test.ts"],
  globals: { "ts-jest": { tsconfig: "tsconfig.json" } },
  maxWorkers: 1,
  testTimeout: 180000,
};
