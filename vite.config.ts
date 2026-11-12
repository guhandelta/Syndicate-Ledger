import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Bundles everything into dist/index.html, renamed to syndicate-ledger.html by the build script.
export default defineConfig({
  plugins: [svelte(), viteSingleFile()],
  build: { outDir: 'dist', emptyOutDir: true },
  test: { include: ['tests/**/*.test.ts'] },
});
