module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { isolatedModules: true, diagnostics: false }],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  setupFiles: ["<rootDir>/jest.setup.ts"],
  setupFilesAfterEnv: [],
  testTimeout: 30000,
  // Ignore lib folder and emulator-dependent tests
  modulePathIgnorePatterns: ["<rootDir>/lib/"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "/lib/",
    "security-rules.test.ts", // requires Firestore emulator on port 8080
  ],
};
