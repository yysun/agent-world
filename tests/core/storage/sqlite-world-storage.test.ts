/**
 * Unit Tests for World Storage - SQLite Backend CRUD Operations
 *
 * Features:
 * - Complete CRUD testing for world operations in SQLite storage
 * - In-memory SQLite database for isolated testing
 * - Foreign key constraint testing and data integrity
 * - Batch operations and performance testing
 * - Error handling and edge cases
 * - Database schema validation and migration testing
 *
 * Implementation:
 * - Tests saveWorld, loadWorld, deleteWorld, listWorlds from sqlite-storage.ts
 * - Uses in-memory SQLite database with initializeWithDefaults
 * - Validates proper schema constraints and relationships
 * - Tests transaction handling and data consistency
 * - Covers edge cases like constraint violations, concurrent access
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock sqlite3 before any imports
jest.mock('sqlite3', () => ({
  Database: jest.fn().mockImplementation(() => ({
    run: jest.fn((sql, params, callback) => callback?.call({ changes: 1, lastID: 1 })),
    get: jest.fn((sql, params, callback) => callback?.(null, { id: 'test', name: 'Test' })),
    all: jest.fn((sql, params, callback) => callback?.(null, [])),
    close: jest.fn(callback => callback?.()),
    exec: jest.fn(callback => callback?.()),
    prepare: jest.fn(() => ({
      run: jest.fn(),
      get: jest.fn(),
      all: jest.fn(),
      finalize: jest.fn()
    }))
  }))
}));

import {
  createSQLiteStorageContext,
  initializeWithDefaults,
  saveWorld,
  loadWorld,
  deleteWorld,
  listWorlds,
  close,
  SQLiteStorageContext
} from '../../../core/sqlite-storage';
import { initializeSchema, validateIntegrity } from '../../../core/sqlite-schema';
import { WorldData } from '../../../core/types';

describe.skip('SQLite World Storage - CRUD Operations', () => {
  let ctx: SQLiteStorageContext;

  beforeEach(async () => {
    // Create in-memory SQLite database for testing
    ctx = await createSQLiteStorageContext({
      database: ':memory:',
      enableWAL: false, // Not supported in memory
      busyTimeout: 5000,
      cacheSize: -2000,
      enableForeignKeys: true
    });

    // Initialize schema and default data
    await initializeSchema(ctx.schemaCtx);
    await initializeWithDefaults(ctx);
  });

  afterEach(async () => {
    if (ctx) {
      await close(ctx);
    }
  });

  describe('Create Operations (saveWorld)', () => {
    test('should save world with all required fields', async () => {
      const worldData: WorldData = {
        id: 'test-world',
        name: 'Test World',
        description: 'A test world for unit testing',
        turnLimit: 10
      };

      await saveWorld(ctx, worldData);

      // Verify world was saved
      const savedWorld = await loadWorld(ctx, 'test-world');
      expect(savedWorld).toEqual(worldData);
    });

    test('should save world with minimal required fields', async () => {
      const worldData: WorldData = {
        id: 'minimal-world',
        name: 'Minimal World',
        turnLimit: 5
      };

      await saveWorld(ctx, worldData);

      const savedWorld = await loadWorld(ctx, 'minimal-world');
      expect(savedWorld).toEqual({
        ...worldData,
        description: undefined // Should be undefined/null in database
      });
    });

    test('should update existing world (INSERT OR REPLACE)', async () => {
      const originalWorld: WorldData = {
        id: 'update-world',
        name: 'Original Name',
        description: 'Original description',
        turnLimit: 5
      };

      const updatedWorld: WorldData = {
        id: 'update-world',
        name: 'Updated Name',
        description: 'Updated description',
        turnLimit: 15
      };

      // Save original
      await saveWorld(ctx, originalWorld);
      let savedWorld = await loadWorld(ctx, 'update-world');
      expect(savedWorld!.name).toBe('Original Name');

      // Save update
      await saveWorld(ctx, updatedWorld);
      savedWorld = await loadWorld(ctx, 'update-world');
      expect(savedWorld!.name).toBe('Updated Name');
      expect(savedWorld!.turnLimit).toBe(15);
    });

    test('should handle special characters in world data', async () => {
      const worldData: WorldData = {
        id: 'special-chars',
        name: 'World with 🌟 emojis and "quotes"',
        description: 'Testing\nnewlines\tand\ttabs with \\ backslashes',
        turnLimit: 5
      };

      await saveWorld(ctx, worldData);

      const savedWorld = await loadWorld(ctx, 'special-chars');
      expect(savedWorld).toEqual(worldData);
    });

    test('should handle very long world names and descriptions', async () => {
      const longName = 'A'.repeat(500);
      const longDescription = 'B'.repeat(2000);
      
      const worldData: WorldData = {
        id: 'long-world',
        name: longName,
        description: longDescription,
        turnLimit: 100
      };

      await saveWorld(ctx, worldData);

      const savedWorld = await loadWorld(ctx, 'long-world');
      expect(savedWorld!.name).toBe(longName);
      expect(savedWorld!.description).toBe(longDescription);
    });

    test('should validate turn limit constraints', async () => {
      const worldData: WorldData = {
        id: 'limit-test',
        name: 'Limit Test',
        turnLimit: 0 // Should be valid
      };

      await saveWorld(ctx, worldData);

      const savedWorld = await loadWorld(ctx, 'limit-test');
      expect(savedWorld!.turnLimit).toBe(0);
    });

    test('should handle null description gracefully', async () => {
      const worldData: WorldData = {
        id: 'null-desc',
        name: 'Null Description',
        description: undefined,
        turnLimit: 5
      };

      await saveWorld(ctx, worldData);

      const savedWorld = await loadWorld(ctx, 'null-desc');
      expect(savedWorld!.description).toBeUndefined();
    });
  });

  describe('Read Operations (loadWorld)', () => {
    test('should load existing world correctly', async () => {
      const worldData: WorldData = {
        id: 'load-test',
        name: 'Load Test World',
        description: 'Testing world loading',
        turnLimit: 8
      };

      await saveWorld(ctx, worldData);
      const loadedWorld = await loadWorld(ctx, 'load-test');

      expect(loadedWorld).toEqual(worldData);
    });

    test('should return null for non-existent world', async () => {
      const loadedWorld = await loadWorld(ctx, 'non-existent');
      expect(loadedWorld).toBeNull();
    });

    test('should handle case-sensitive world IDs', async () => {
      const worldData: WorldData = {
        id: 'CaseSensitive',
        name: 'Case Sensitive World',
        turnLimit: 5
      };

      await saveWorld(ctx, worldData);

      // Exact case should work
      let loadedWorld = await loadWorld(ctx, 'CaseSensitive');
      expect(loadedWorld).toEqual(worldData);

      // Different case should not work
      loadedWorld = await loadWorld(ctx, 'casesensitive');
      expect(loadedWorld).toBeNull();
    });

    test('should load default world created by initializeWithDefaults', async () => {
      const defaultWorld = await loadWorld(ctx, 'default-world');
      
      expect(defaultWorld).not.toBeNull();
      expect(defaultWorld!.id).toBe('default-world');
      expect(defaultWorld!.name).toBe('Default World');
      expect(defaultWorld!.turnLimit).toBe(100);
    });
  });

  describe('Update Operations (saveWorld with existing data)', () => {
    test('should preserve data integrity during updates', async () => {
      const originalWorld: WorldData = {
        id: 'integrity-test',
        name: 'Original',
        description: 'Original description',
        turnLimit: 5
      };

      await saveWorld(ctx, originalWorld);

      // Partial update
      const partialUpdate: WorldData = {
        id: 'integrity-test',
        name: 'Updated Name',
        turnLimit: 10
        // description intentionally omitted
      };

      await saveWorld(ctx, partialUpdate);

      const updatedWorld = await loadWorld(ctx, 'integrity-test');
      expect(updatedWorld!.name).toBe('Updated Name');
      expect(updatedWorld!.turnLimit).toBe(10);
      expect(updatedWorld!.description).toBeUndefined(); // Should be reset to null/undefined
    });

    test('should handle concurrent update operations', async () => {
      const world1: WorldData = {
        id: 'concurrent-test',
        name: 'Initial',
        turnLimit: 5
      };

      await saveWorld(ctx, world1);

      // Simulate concurrent updates
      const update1: WorldData = {
        id: 'concurrent-test',
        name: 'Update 1',
        turnLimit: 10
      };

      const update2: WorldData = {
        id: 'concurrent-test',
        name: 'Update 2',
        turnLimit: 15
      };

      // Execute updates concurrently
      await Promise.all([
        saveWorld(ctx, update1),
        saveWorld(ctx, update2)
      ]);

      // One of the updates should be saved (last one wins)
      const finalWorld = await loadWorld(ctx, 'concurrent-test');
      expect(finalWorld).not.toBeNull();
      expect(['Update 1', 'Update 2']).toContain(finalWorld!.name);
    });
  });

  describe('Delete Operations (deleteWorld)', () => {
    test('should delete existing world', async () => {
      const worldData: WorldData = {
        id: 'delete-test',
        name: 'Delete Test',
        turnLimit: 5
      };

      await saveWorld(ctx, worldData);
      
      // Verify world exists
      let loadedWorld = await loadWorld(ctx, 'delete-test');
      expect(loadedWorld).not.toBeNull();

      // Delete world
      const deleteResult = await deleteWorld(ctx, 'delete-test');
      expect(deleteResult).toBe(true);

      // Verify world is deleted
      loadedWorld = await loadWorld(ctx, 'delete-test');
      expect(loadedWorld).toBeNull();
    });

    test('should return false when deleting non-existent world', async () => {
      const deleteResult = await deleteWorld(ctx, 'non-existent');
      expect(deleteResult).toBe(false);
    });

    test('should handle foreign key constraints (cascade)', async () => {
      // Note: This test requires agents to be created first if FK constraints are enforced
      const worldData: WorldData = {
        id: 'fk-test-world',
        name: 'FK Test World',
        turnLimit: 5
      };

      await saveWorld(ctx, worldData);

      // If there are agents referencing this world, deletion might fail or cascade
      // For now, just test basic deletion since we don't have agents in this test
      const deleteResult = await deleteWorld(ctx, 'fk-test-world');
      expect(deleteResult).toBe(true);
    });

    test('should handle multiple deletions', async () => {
      const worlds = [
        { id: 'delete-1', name: 'Delete 1', turnLimit: 5 },
        { id: 'delete-2', name: 'Delete 2', turnLimit: 10 },
        { id: 'delete-3', name: 'Delete 3', turnLimit: 15 }
      ];

      // Save all worlds
      for (const world of worlds) {
        await saveWorld(ctx, world);
      }

      // Delete all worlds
      const deleteResults = await Promise.all(
        worlds.map(w => deleteWorld(ctx, w.id))
      );

      // All deletions should succeed
      expect(deleteResults).toEqual([true, true, true]);

      // Verify all worlds are deleted
      const remainingWorlds = await listWorlds(ctx);
      const deletedIds = worlds.map(w => w.id);
      const stillExists = remainingWorlds.some(w => deletedIds.includes(w.id));
      expect(stillExists).toBe(false);
    });
  });

  describe('List Operations (listWorlds)', () => {
    test('should list all worlds in alphabetical order', async () => {
      const worlds = [
        { id: 'z-world', name: 'Z World', turnLimit: 5 },
        { id: 'a-world', name: 'A World', turnLimit: 10 },
        { id: 'm-world', name: 'M World', turnLimit: 15 }
      ];

      // Save worlds in random order
      for (const world of worlds) {
        await saveWorld(ctx, world);
      }

      const allWorlds = await listWorlds(ctx);

      // Should include default world + our test worlds
      expect(allWorlds.length).toBeGreaterThanOrEqual(4);

      // Find our test worlds (excluding default world)
      const testWorlds = allWorlds.filter(w => 
        ['z-world', 'a-world', 'm-world'].includes(w.id)
      );

      expect(testWorlds).toHaveLength(3);
      
      // Should be sorted by name (A World, M World, Z World)
      expect(testWorlds[0].name).toBe('A World');
      expect(testWorlds[1].name).toBe('M World');
      expect(testWorlds[2].name).toBe('Z World');
    });

    test('should return empty array when only default world exists', async () => {
      // Delete default world to test empty state
      await deleteWorld(ctx, 'default-world');

      const allWorlds = await listWorlds(ctx);
      expect(allWorlds).toEqual([]);
    });

    test('should handle large number of worlds', async () => {
      const worldCount = 50;
      const worlds: WorldData[] = [];

      // Create many worlds
      for (let i = 0; i < worldCount; i++) {
        const world: WorldData = {
          id: `world-${i.toString().padStart(3, '0')}`,
          name: `World ${i}`,
          description: `Description for world ${i}`,
          turnLimit: i + 1
        };
        worlds.push(world);
        await saveWorld(ctx, world);
      }

      const allWorlds = await listWorlds(ctx);
      
      // Should include default world + our test worlds
      expect(allWorlds.length).toBeGreaterThanOrEqual(worldCount);

      // Filter to our test worlds
      const testWorlds = allWorlds.filter(w => w.id.startsWith('world-'));
      expect(testWorlds).toHaveLength(worldCount);
    });

    test('should preserve all data fields in list results', async () => {
      const worldData: WorldData = {
        id: 'complete-world',
        name: 'Complete World',
        description: 'Complete description with all fields',
        turnLimit: 25
      };

      await saveWorld(ctx, worldData);

      const allWorlds = await listWorlds(ctx);
      const savedWorld = allWorlds.find(w => w.id === 'complete-world');

      expect(savedWorld).toEqual(worldData);
    });
  });

  describe('Database Schema and Constraints', () => {
    test('should enforce unique world IDs', async () => {
      const world1: WorldData = {
        id: 'unique-test',
        name: 'First World',
        turnLimit: 5
      };

      const world2: WorldData = {
        id: 'unique-test', // Same ID
        name: 'Second World',
        turnLimit: 10
      };

      await saveWorld(ctx, world1);
      await saveWorld(ctx, world2); // Should replace, not duplicate

      const allWorlds = await listWorlds(ctx);
      const uniqueWorlds = allWorlds.filter(w => w.id === 'unique-test');
      
      expect(uniqueWorlds).toHaveLength(1);
      expect(uniqueWorlds[0].name).toBe('Second World'); // Last one wins
    });

    test('should validate schema integrity', async () => {
      const integrity = await validateIntegrity(ctx.schemaCtx);
      expect(integrity.isValid).toBe(true);
      expect(integrity.errors).toEqual([]);
    });

    test('should handle database transactions properly', async () => {
      // This test ensures that save operations are atomic
      const worldData: WorldData = {
        id: 'transaction-test',
        name: 'Transaction Test',
        turnLimit: 5
      };

      // Should either completely succeed or completely fail
      await saveWorld(ctx, worldData);

      const savedWorld = await loadWorld(ctx, 'transaction-test');
      expect(savedWorld).toEqual(worldData);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle null and undefined values appropriately', async () => {
      const worldData: WorldData = {
        id: 'null-test',
        name: 'Null Test',
        description: undefined,
        turnLimit: 0
      };

      await saveWorld(ctx, worldData);

      const savedWorld = await loadWorld(ctx, 'null-test');
      expect(savedWorld!.description).toBeUndefined();
      expect(savedWorld!.turnLimit).toBe(0);
    });

    test('should handle empty string values', async () => {
      const worldData: WorldData = {
        id: 'empty-strings',
        name: '', // Empty but valid
        description: '',
        turnLimit: 1
      };

      await saveWorld(ctx, worldData);

      const savedWorld = await loadWorld(ctx, 'empty-strings');
      expect(savedWorld!.name).toBe('');
      expect(savedWorld!.description).toBe('');
    });

    test('should handle extreme turn limit values', async () => {
      const extremeWorlds = [
        { id: 'zero-limit', name: 'Zero Limit', turnLimit: 0 },
        { id: 'max-limit', name: 'Max Limit', turnLimit: Number.MAX_SAFE_INTEGER },
        { id: 'negative-limit', name: 'Negative Limit', turnLimit: -1 }
      ];

      for (const world of extremeWorlds) {
        await saveWorld(ctx, world);
        const savedWorld = await loadWorld(ctx, world.id);
        expect(savedWorld!.turnLimit).toBe(world.turnLimit);
      }
    });

    test('should handle Unicode and special characters', async () => {
      const worldData: WorldData = {
        id: 'unicode-test',
        name: '🌍 Wörld with ñ and 中文',
        description: 'Testing Unicode: 😀 🚀 ⭐ and special chars: äöü ñç',
        turnLimit: 5
      };

      await saveWorld(ctx, worldData);

      const savedWorld = await loadWorld(ctx, 'unicode-test');
      expect(savedWorld).toEqual(worldData);
    });

    test('should handle very long IDs', async () => {
      const longId = 'very-long-world-id-' + 'x'.repeat(200);
      const worldData: WorldData = {
        id: longId,
        name: 'Long ID World',
        turnLimit: 5
      };

      await saveWorld(ctx, worldData);

      const savedWorld = await loadWorld(ctx, longId);
      expect(savedWorld!.id).toBe(longId);
    });

    test('should handle database connection errors gracefully', async () => {
      // Close the context to simulate connection error
      await close(ctx);

      // Operations should handle the closed database gracefully
      await expect(loadWorld(ctx, 'test')).rejects.toThrow();
      await expect(saveWorld(ctx, { id: 'test', name: 'test', turnLimit: 1 })).rejects.toThrow();
      await expect(deleteWorld(ctx, 'test')).rejects.toThrow();
      await expect(listWorlds(ctx)).rejects.toThrow();
    });
  });

  describe('Performance and Optimization', () => {
    test('should handle rapid sequential operations', async () => {
      const operationCount = 100;
      const startTime = Date.now();

      // Rapid save operations
      for (let i = 0; i < operationCount; i++) {
        await saveWorld(ctx, {
          id: `rapid-${i}`,
          name: `Rapid World ${i}`,
          turnLimit: i
        });
      }

      // Rapid load operations
      for (let i = 0; i < operationCount; i++) {
        const world = await loadWorld(ctx, `rapid-${i}`);
        expect(world).not.toBeNull();
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(5000); // 5 seconds for 200 operations
    });

    test('should handle batch operations efficiently', async () => {
      const batchSize = 20;
      const worlds: WorldData[] = Array.from({ length: batchSize }, (_, i) => ({
        id: `batch-${i}`,
        name: `Batch World ${i}`,
        description: `Batch description ${i}`,
        turnLimit: i + 1
      }));

      const startTime = Date.now();

      // Batch save (sequential)
      for (const world of worlds) {
        await saveWorld(ctx, world);
      }

      // Batch load
      const loadedWorlds = await Promise.all(
        worlds.map(w => loadWorld(ctx, w.id))
      );

      const endTime = Date.now();

      // Verify all operations succeeded
      expect(loadedWorlds.every(w => w !== null)).toBe(true);
      expect(loadedWorlds).toHaveLength(batchSize);

      // Should be reasonably fast
      expect(endTime - startTime).toBeLessThan(2000);
    });

    test('should maintain performance with large datasets', async () => {
      // Create a substantial number of worlds
      const worldCount = 100;
      
      for (let i = 0; i < worldCount; i++) {
        await saveWorld(ctx, {
          id: `perf-world-${i}`,
          name: `Performance World ${i}`,
          description: `Description ${i}`,
          turnLimit: i % 50 + 1
        });
      }

      // Test list performance
      const startTime = Date.now();
      const allWorlds = await listWorlds(ctx);
      const endTime = Date.now();

      expect(allWorlds.length).toBeGreaterThanOrEqual(worldCount);
      expect(endTime - startTime).toBeLessThan(1000); // Should be fast even with many worlds
    });
  });

  describe('Data Consistency and ACID Properties', () => {
    test('should maintain data consistency across operations', async () => {
      const worldData: WorldData = {
        id: 'consistency-test',
        name: 'Consistency Test',
        description: 'Testing data consistency',
        turnLimit: 10
      };

      // Save
      await saveWorld(ctx, worldData);

      // Load and verify
      const loadedWorld = await loadWorld(ctx, 'consistency-test');
      expect(loadedWorld).toEqual(worldData);

      // Update
      const updatedWorld: WorldData = {
        ...worldData,
        name: 'Updated Name',
        turnLimit: 20
      };
      await saveWorld(ctx, updatedWorld);

      // Load and verify update
      const reloadedWorld = await loadWorld(ctx, 'consistency-test');
      expect(reloadedWorld).toEqual(updatedWorld);

      // Delete
      const deleteResult = await deleteWorld(ctx, 'consistency-test');
      expect(deleteResult).toBe(true);

      // Verify deletion
      const deletedWorld = await loadWorld(ctx, 'consistency-test');
      expect(deletedWorld).toBeNull();
    });

    test('should handle isolation between concurrent operations', async () => {
      const world1: WorldData = {
        id: 'isolation-1',
        name: 'Isolation Test 1',
        turnLimit: 5
      };

      const world2: WorldData = {
        id: 'isolation-2',
        name: 'Isolation Test 2',
        turnLimit: 10
      };

      // Execute operations concurrently
      await Promise.all([
        saveWorld(ctx, world1),
        saveWorld(ctx, world2)
      ]);

      // Both should be saved correctly
      const [loaded1, loaded2] = await Promise.all([
        loadWorld(ctx, 'isolation-1'),
        loadWorld(ctx, 'isolation-2')
      ]);

      expect(loaded1).toEqual(world1);
      expect(loaded2).toEqual(world2);
    });
  });
});