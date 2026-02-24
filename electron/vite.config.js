/**
 * Vite Renderer Config - Electron Workspace UI Build
 *
 * Features:
 * - Vite React plugin for JSX renderer pipeline
 * - Dedicated renderer root and output directory
 * - Stable dev server port for Electron startup coordination
 *
 * Implementation Notes:
 * - `root` points to electron/renderer
 * - `outDir` points to electron/renderer/dist for packaged/start mode
 * - Base path is relative for file:// loading in Electron
 *
 * Recent Changes:
 * - 2026-02-08: Pinned dev host to 127.0.0.1 so wait-on and Vite use the same interface
 * - 2026-02-08: Moved Electron renderer dev server to port 5181 to avoid React app conflicts
 * - 2026-02-08: Initial Vite config for Electron React renderer
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  root: path.resolve(__dirname, 'renderer'),
  plugins: [react()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5181,
    strictPort: true
  },
  build: {
    outDir: path.resolve(__dirname, 'renderer/dist'),
    emptyOutDir: true
  }
});
