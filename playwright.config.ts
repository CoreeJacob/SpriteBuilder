import { defineConfig } from '@playwright/test'

// End-to-end tests drive the built app (npm run test:e2e builds it first).
export default defineConfig({
  testDir: 'e2e',
  // One test (one app window) at a time. Side by side, only the window in front gets mouse and
  // keyboard input reliably, so drag-heavy tests failed now and then; one at a time they don't.
  workers: 1,
  timeout: 120_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  // ".noindex" keeps Spotlight from indexing the throwaway libraries every run makes.
  outputDir: 'test-results.noindex'
})
