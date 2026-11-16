import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    jsx: 'transform',
    jsxFactory: 'ir',
    jsxFragment: 'ir',
  },
  test: {
    include: ['packages/**/*.test.ts', 'packages/**/*.test.tsx', 'apps/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
