import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the built single file: npm run build && npm run e2e
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: { trace: 'off' },
  // the timeline test case is served by the dev server (fixtures/timeline.html); everything else runs on the built file
  webServer: { command: 'npx vite --port 5199 --strictPort', url: 'http://localhost:5199/fixtures/timeline.html', reuseExistingServer: true, timeout: 60_000 },
  projects: [
    // software WebGL, so the 3D town renders on machines without a graphics card
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
