/*
 * Jest Configuration for Integration Tests
 *
 * Features:
 * - TypeScript testing with ESM support
 * - Node.js test environment for integration code
 * - Real file system operations (no mocking)
 * - Integration-specific test patterns
 *
 * Logic:
 * - Uses ts-jest preset for TypeScript compilation
 * - Configures ESM module handling for modern JS features
 * - NO filesystem mocking - uses real file operations
 * - Separate test patterns for integration tests
 * - Higher timeout for file operations
 *
 * Changes:
 * - Split from main Jest config to handle integration tests
 * - Real filesystem operations for world management tests
 * - No global mocks for fs/promises
 */

export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/integration/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.ts'],
  coverageDirectory: 'coverage-integration',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000, // Higher timeout for real file operations
  maxWorkers: 1, // Prevent file system conflicts
  verbose: true,
  clearMocks: true,
  resetMocks: false, // Don't reset mocks - we want real fs
  resetModules: false, // Don't reset modules - we want real fs
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transformIgnorePatterns: [],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'esnext',
        target: 'es2022',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        moduleResolution: 'node',
        allowImportingTsExtensions: true
      }
    }],
    '^.+\\.(js|jsx|mjs)$': ['ts-jest', {
      useESM: true
    }]
  },
  // No global setup - use real fs operations
};
