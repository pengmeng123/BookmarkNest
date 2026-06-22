import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { manifest } from './src/manifest';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        app: 'src/app/index.html',
        options: 'src/options/index.html',
        popup: 'src/popup/index.html',
        upgrade: 'src/upgrade/index.html'
      }
    }
  }
});
