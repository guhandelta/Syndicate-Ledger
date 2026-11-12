import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Bundles everything into dist/index.html, renamed to syndicate-ledger.html by the build script.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: { outDir: 'dist', emptyOutDir: true },
});
