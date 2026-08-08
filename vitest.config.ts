import { defineConfig } from 'vitest/config'

// Node environment: the PR-C guardrail tests are pure logic + file-integrity
// checks and need no DOM. (PR-A's UI tests use a jsdom config on their own
// branch; keep this minimal to avoid coupling.)
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
