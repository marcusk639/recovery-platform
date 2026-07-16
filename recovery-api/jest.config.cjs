/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
  // Ratchet floor — measured 85/80/85/86 on 2026-07-15. Raise as coverage grows; never lower.
  coverageThreshold: {
    global: { statements: 80, branches: 75, functions: 78, lines: 80 },
  },
};
