/**
 * Integration Test Setup
 *
 * Features:
 * - Minimal setup for integration tests
 * - No filesystem mocking - uses real file operations
 * - Mocked nanoid for predictable ID generation
 *
 * Purpose:
 * - Provides clean environment for integration tests
 * - Allows real file system operations
 * - Uses mocked UUID/nanoid generation for predictable tests
 */

import { jest } from '@jest/globals';

// Mock crypto and performance globals for compatibility
const mockCrypto = {
  randomUUID: () => {
    // Use a simple random UUID generator for integration tests
    return 'test-' + Math.random().toString(36).substr(2, 9);
  }
};

// Mock nanoid for unique ID generation (same as core tests)
jest.mock('nanoid', () => ({
  nanoid: jest.fn<any>().mockReturnValue('mock-nanoid-id')
}));

// Only mock crypto if not available
if (!global.crypto) {
  global.crypto = mockCrypto as any;
}

// Mock performance if not available
if (!global.performance) {
  global.performance = {
    now: () => Date.now()
  } as any;
}

// No other mocks - we want real behavior for integration tests
