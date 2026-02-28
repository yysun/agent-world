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
import { copyFileSync, mkdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Plugin: copy mcp-sandbox-proxy.html from electron/assets/ to renderer dist after build.
const copyMcpSandboxProxy = {
  name: 'copy-mcp-sandbox-proxy',
  writeBundle() {
    const src = path.resolve(__dirname, 'assets/mcp-sandbox-proxy.html');
    const dest = path.resolve(__dirname, 'renderer/dist/mcp-sandbox-proxy.html');
    try {
      mkdirSync(path.dirname(dest), { recursive: true });
      copyFileSync(src, dest);
    } catch (err) {
      console.warn('[copy-mcp-sandbox-proxy] Failed to copy:', err);
    }
  }
};

export default defineConfig({
  root: path.resolve(__dirname, 'renderer'),
  plugins: [react(), copyMcpSandboxProxy],
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
