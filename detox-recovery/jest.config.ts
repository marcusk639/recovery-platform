import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Ratchet floor — measured 96/84/98/96 on 2026-07-15. Raise as coverage grows; never lower.
  coverageThreshold: {
    global: { statements: 90, branches: 78, functions: 92, lines: 90 },
  },
};

export default createJestConfig(config);
