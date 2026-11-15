import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@mobile': path.resolve(__dirname, '../mobile/src') } },
  test: { globals: true, environment: 'jsdom', include: ['tests/**/*.test.{ts,tsx}'] },
});
