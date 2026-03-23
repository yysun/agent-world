/**
 * Purpose:
 * - Configure the web app Vite dev/build behavior.
 *
 * Key Features:
 * - Serves the `web/` app as the Vite root.
 * - Preserves API proxying to the local Node server.
 * - Keeps SPA history fallback working for `/World/...` browser routes.
 *
 * Notes on Implementation:
 * - The Playwright web E2E suite depends on deep-linkable SPA routes during dev-server startup.
 * - Setting the Vite root explicitly avoids route 404s when the repo root differs from the app root.
 *
 * Summary of Recent Changes:
 * - 2026-03-10: Set the Vite root to the web app directory and enabled explicit SPA app mode for Playwright web E2E routing.
 */

import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  appType: 'spa',
  root: webRoot,
  build: {
    emptyOutDir: true, // Set to false to prevent clearing the output directory
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false
      },
    },
    // Hosts allowed to access the dev server (useful for tunneling)
    allowedHosts: ['unzealously-plantlike-rebecca.ngrok-free.dev'],
  },
});
