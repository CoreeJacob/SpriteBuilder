import { defineConfig } from '@playwright/test'

// End-to-end tests drive the built app (npm run test:e2e builds it first).
export default defineConfig({
  testDir: 'e2e',
  // Every test opens its own app window on its own library, so tests can run side by side.
  // More than a few at once starts to crowd the timing-sensitive checks (animation playback).
  workers: 3,
  timeout: 120_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  // ".noindex" keeps Spotlight from indexing the throwaway libraries every run makes.
  outputDir: 'test-results.noindex'
})
