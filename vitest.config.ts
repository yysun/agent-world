/**
 * Vitest Configuration for Unit Tests
 * 
 * Migrated from jest.config.js with the following changes:
 * - Using v8 coverage provider instead of babel/istanbul
 * - Native TypeScript support without ts-jest
 * - ESM support built-in
 * - Using globals: false for explicit imports
 * 
 * Features:
 * - Node.js test environment for backend code
 * - Coverage reporting excluding API and CLI code
 * - Mock support with auto-reset between tests
 * - Workspace module resolution via vite-tsconfig-paths
 * - Sequential test file execution (fileParallelism: false)
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Environment
    environment: 'node',

    // Test patterns
    include: ['tests/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/public/**',
      '**/integration/**',
      '**/web/**',
      '**/next/**',
      '**/dist/**',
      '**/coverage/**'
    ],

    // Setup file (converted from Jest setup)
    setupFiles: ['./tests/vitest-setup.ts'],

    // Coverage configuration (v8 instead of istanbul)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['core/**/*.ts'],
      exclude: [
        'core/**/*.d.ts',
        'core/cli/**',
        'core/globals.d.ts',
        'core/pino-browser.d.ts'
      ],
      reportsDirectory: 'coverage'
    },

    // Execution settings
    testTimeout: 15000,
    hookTimeout: 10000,

    // Sequential execution (equivalent to Jest maxWorkers: 1)
    pool: 'forks',
    fileParallelism: false,

    // No globals - explicit imports required
    globals: false,

    // Mock configuration
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,

    // Verbose output
    reporters: ['verbose']
  },

  // Path resolution
  resolve: {
    alias: {
      // Mock sqlite3 module
      'sqlite3': new URL('./tests/__mocks__/sqlite3.js', import.meta.url).pathname
    }
  }
});
