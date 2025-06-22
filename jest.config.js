/*
 * Jest Configuration for Backend Package
 * 
 * Features:
 * - TypeScript testing with ESM support
 * - Node.js test environment for backend code
 * - Coverage reporting excluding API and CLI code
 * - Mock support with auto-reset between tests
 * - Shared package module resolution
 * 
 * Logic:
 * - Uses ts-jest preset for TypeScript compilation
 * - Configures ESM module handling for modern JS features
 * - Maps relative imports ending in .js to TypeScript files
 * - Maps 'shared' imports to the shared package source
 * - Excludes non-core functionality from coverage
 * - Runs tests sequentially to prevent file system conflicts
 * 
 * Changes:
 * - Initial Jest setup for AI World Simulation backend
 * - Added ESM support for modern JavaScript modules
 * - Configured shared package resolution via moduleNameMapper
 * - Note: Even though shared is in package.json as file reference,
 *   Jest still needs moduleNameMapper to resolve 'shared' imports
 *   because Jest's module resolution differs from Node.js runtime
 * - Updated testTimeout from 30000ms to 15000ms for faster test execution
 * - Optimized for async utilities and event-driven waiting patterns
 */

export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/cli/**'  // Exclude CLI
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 15000, // Reduced from 30000ms - faster tests with async utilities
  maxWorkers: 1, // Prevent file system conflicts
  verbose: true,
  clearMocks: true,
  resetMocks: true,
  resetModules: true,
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'esnext',
        target: 'es2022',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        moduleResolution: 'node'
      }
    }]
  },
  globalTeardown: '<rootDir>/tests/global-teardown.ts'
};
