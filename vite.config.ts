import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Bundles everything into dist/index.html, renamed to syndicate-ledger.html by the build script.
export default defineConfig({
  plugins: [svelte(), viteSingleFile()],
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Not unit-testable without a browser: they draw WebGL or DOM, and the Playwright suite (npm run e2e) covers them.
      // Type-only files hold no code.
      exclude: ['src/main.ts', 'src/town/TownScene.ts', 'src/ui/session.svelte.ts', 'src/ui/notepad.ts', 'src/town/townTypes.ts', 'src/engine/types.ts'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
