/**
 * World Test Setup Helper
 * 
 * Purpose: Provide reusable utilities for world creation/deletion in tests
 * 
 * Features:
 * - Uses real in-memory storage (not mocks)
 * - Auto-cleanup with beforeEach/afterEach patterns
 * - World factory with common configurations
 * - Test isolation guarantees
 * 
 * Usage:
 * ```typescript
 * import { setupTestWorld, createTestWorld } from '../helpers/world-test-setup';
 * 
 * describe('My Test', () => {
 *   const { worldId, getWorld } = setupTestWorld();
 *   
 *   test('my test', async () => {
 *     const world = await getWorld();
 *     // ... test code
 *   });
 * });
 * 
 * // Or manual control:
 * test('manual test', async () => {
 *   const { worldId, cleanup } = await createTestWorld();
 *   try {
 *     // ... test code
 *   } finally {
 *     await cleanup();
 *   }
 * });
 * ```
 * 
 * Changes:
 * - 2025-11-07: Initial implementation for test deduplication
 */

import { beforeEach, afterEach } from 'vitest';
import { createWorld, getWorld, deleteWorld } from '../../core/managers.js';
import type { World, LLMProvider } from '../../core/types.js';

export interface TestWorldConfig {
  name?: string;
  turnLimit?: number;
  chatLLMProvider?: LLMProvider;
  chatLLMModel?: string;
  description?: string;
}

export interface TestWorldHandle {
  worldId: string;
  getWorld: () => Promise<World | null>;
  cleanup: () => Promise<void>;
}

/**
 * Create a test world with automatic cleanup
 * Returns handle with worldId and cleanup function
 * 
 * @example
 * const { worldId, cleanup } = await createTestWorld();
 * try {
 *   // test code
 * } finally {
 *   await cleanup();
 * }
 */
export async function createTestWorld(
  config: TestWorldConfig = {}
): Promise<TestWorldHandle> {
  const defaultConfig = {
    name: `test-world-${Date.now()}`,
    turnLimit: 5,
    ...config
  };

  const world = await createWorld(defaultConfig);
  if (!world) {
    throw new Error('Failed to create test world');
  }

  return {
    worldId: world.id,
    getWorld: () => getWorld(world.id),
    cleanup: async () => {
      try {
        await deleteWorld(world.id);
      } catch (error) {
        // Ignore cleanup errors in tests
        console.warn(`Failed to cleanup test world ${world.id}:`, error);
      }
    }
  };
}

/**
 * Setup test world with beforeEach/afterEach hooks
 * Returns handle that will be initialized in beforeEach
 * 
 * @example
 * describe('My Test Suite', () => {
 *   const { worldId, getWorld } = setupTestWorld();
 *   
 *   test('should work', async () => {
 *     const world = await getWorld();
 *     expect(world).toBeTruthy();
 *   });
 * });
 */
export function setupTestWorld(config: TestWorldConfig = {}): {
  worldId: () => string;
  getWorld: () => Promise<World | null>;
} {
  let handle: TestWorldHandle | null = null;

  beforeEach(async () => {
    handle = await createTestWorld(config);
  });

  afterEach(async () => {
    if (handle) {
      await handle.cleanup();
      handle = null;
    }
  });

  return {
    worldId: () => {
      if (!handle) {
        throw new Error('Test world not initialized. Make sure tests run inside describe block.');
      }
      return handle.worldId;
    },
    getWorld: async () => {
      if (!handle) {
        throw new Error('Test world not initialized. Make sure tests run inside describe block.');
      }
      return handle.getWorld();
    }
  };
}

/**
 * Create multiple test worlds for tests that need multiple worlds
 * Returns array of handles with cleanup
 * 
 * @example
 * const worlds = await createTestWorlds([
 *   { name: 'world-1' },
 *   { name: 'world-2' }
 * ]);
 * try {
 *   // test code
 * } finally {
 *   await cleanupTestWorlds(worlds);
 * }
 */
export async function createTestWorlds(
  configs: TestWorldConfig[]
): Promise<TestWorldHandle[]> {
  return Promise.all(configs.map(config => createTestWorld(config)));
}

/**
 * Cleanup multiple test worlds
 */
export async function cleanupTestWorlds(handles: TestWorldHandle[]): Promise<void> {
  await Promise.all(handles.map(h => h.cleanup()));
}
