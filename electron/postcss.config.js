/**
 * PostCSS Config - Tailwind Processing for Electron Renderer
 *
 * Features:
 * - Enables Tailwind CSS compilation in Vite renderer pipeline
 *
 * Implementation Notes:
 * - Uses Tailwind v4 PostCSS plugin package
 *
 * Recent Changes:
 * - 2026-02-08: Initial PostCSS config for renderer Tailwind support
 */

export default {
  plugins: {
    '@tailwindcss/postcss': {}
  }
};
