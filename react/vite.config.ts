/**
 * Vite configuration for the React app.
 *
 * - Enables the React plugin for Fast Refresh and reliable JSX transforms.
 * - Adds a path alias (`@` -> `./src`).
 * - Configures the dev server proxy for API requests.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react() as any],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    emptyOutDir: true, // Set to false to prevent clearing the output directory
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
