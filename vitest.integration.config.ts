/**
 * Vitest Configuration for Integration Tests
 *
 * Migrated from jest.integration.config.js with the following changes:
 * - Real filesystem operations (no mocking)
 * - Higher timeouts for file operations
 * - Separate test patterns for integration tests
 * - Minimal setup (no mock resets)
 *
 * Features:
 * - Node.js test environment for integration code
 * - Real file system operations
 * - Integration-specific test patterns
 * - Higher timeout for file operations
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Environment
    environment: 'node',

    // Test patterns - only integration tests
    include: ['tests/integration/**/*.test.ts'],

    // Setup file for integration tests (minimal setup)
    setupFiles: ['./tests/vitest-integration.ts'],

    // Coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: 'coverage-integration'
    },

    // Higher timeouts for real file operations
    testTimeout: 30000,
    hookTimeout: 20000,

    // Sequential execution to prevent file system conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    },

    // No globals - explicit imports
    globals: false,

    // No mocking - real filesystem
    mockReset: false,
    restoreMocks: false,

    // Verbose output
    reporters: ['verbose']
  }
});
