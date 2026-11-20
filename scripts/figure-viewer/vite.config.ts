import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// A page to look at the 3D cast on their own: npx vite scripts/figure-viewer (or build it into one file with
// npx vite build scripts/figure-viewer --config scripts/figure-viewer/vite.config.ts).
export default defineConfig({
  root: __dirname,
  plugins: [viteSingleFile()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { fs: { allow: ['../..'] } },
});
