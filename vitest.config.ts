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
 * - Coverage reporting for core runtime + selected server contracts
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
      reporter: ['text', 'lcov', 'html', 'json-summary'],
      include: ['core/**/*.ts', 'server/api.ts', 'server/sse-handler.ts'],
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

  // Path resolution — array form ensures specific aliases take priority over shorter prefixes
  resolve: {
    alias: [
      // Keep self-reference package imports tied to the working tree during unit tests.
      { find: 'agent-world/core', replacement: new URL('./core/index.ts', import.meta.url).pathname },
      { find: 'react/jsx-dev-runtime', replacement: new URL('./electron/node_modules/react/jsx-dev-runtime.js', import.meta.url).pathname },
      { find: 'react/jsx-runtime', replacement: new URL('./electron/node_modules/react/jsx-runtime.js', import.meta.url).pathname },
      // Unify react resolution so vi.mock('react') intercepts electron workspace imports
      { find: 'react', replacement: new URL('./electron/node_modules/react/index.js', import.meta.url).pathname },
      // Mock sqlite3 module
      { find: 'sqlite3', replacement: new URL('./tests/__mocks__/sqlite3.js', import.meta.url).pathname },
    ]
  }
});
