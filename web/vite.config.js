import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    emptyOutDir: true, // Set to false to prevent clearing the output directory
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false
      }
    },
    // SPA mode - serve index.html for all routes
    historyApiFallback: true
  }
})