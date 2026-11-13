import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the built single file: npm run build && npm run e2e
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: { trace: 'off' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
