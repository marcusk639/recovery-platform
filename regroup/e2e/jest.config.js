module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  // *.server.test.ts need emulators and the local Stripe sandbox: npm run test:payments.
  testPathIgnorePatterns: ["/node_modules/", "\\.server\\.test\\.ts$"],
  globals: { "ts-jest": { tsconfig: "tsconfig.json" } },
  clearMocks: true,
};
