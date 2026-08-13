import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Runs before every test file: redirects the app home to a throwaway dir so
    // no test can write to the professor's real ~/.canvas-design-mcp config.
    setupFiles: ['./tests/setup-sandbox-home.ts'],
    exclude: [
      '**/node_modules/**',
      '**/.worktrees/**',
    ],
  },
});
