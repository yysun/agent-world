/**
 * Simplified Unit Tests for World Storage - File Backend CRUD Operations
 *
 * Features:
 * - Core CRUD testing for world operations in file storage
 * - Mock file system operations for isolated testing  
 * - Essential edge case testing
 * - Error handling verification
 *
 * Implementation:
 * - Tests saveWorldToDisk, loadWorldFromDisk, deleteWorldFromDisk, loadAllWorldsFromDisk
 * - Uses global Jest mocks for file system operations
 * - Focuses on essential functionality validation
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

// We need to unmock world-storage for this test since we're testing it
jest.unmock('../../../core/world-storage');

import {
  saveWorldToDisk,
  loadWorldFromDisk,
  deleteWorldFromDisk,
  loadAllWorldsFromDisk,
  worldExistsOnDisk,
  getWorldDir,
  ensureWorldDirectory,
  WorldData
} from '../../../core/world-storage';

// Get the global fs mock from setup
const fs = require('fs').promises;

describe('World Storage - File Backend CRUD (Simplified)', () => {
  const rootPath = 'test-data/worlds';

  beforeEach(async () => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up after each test
    jest.clearAllMocks();
  });

  describe('Create Operations (saveWorldToDisk)', () => {
    test('should save world with all required fields', async () => {
      const worldData: WorldData = {
        id: 'test-world',
        name: 'Test World',
        description: 'A test world for unit testing',
        turnLimit: 10
      };

      await saveWorldToDisk(rootPath, worldData);

      // Verify directory creation
      expect(fs.mkdir).toHaveBeenCalledWith(
        `${rootPath}/test-world/agents`,
        { recursive: true }
      );

      // Verify config file creation
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('config.json.tmp'), // Uses temp file
        expect.stringMatching(/"name":\s*"Test World"/), // Allow whitespace
        'utf8'
      );

      // Verify atomic rename
      expect(fs.rename).toHaveBeenCalledWith(
        expect.stringContaining('config.json.tmp'),
        expect.stringContaining('config.json')
      );
    });

    test('should save world with minimal required fields', async () => {
      const worldData: WorldData = {
        id: 'minimal-world',
        name: 'Minimal World',
        turnLimit: 5
      };

      await saveWorldToDisk(rootPath, worldData);

      // Verify the saved data structure
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('config.json.tmp'),
        expect.stringMatching(/"turnLimit":\s*5/), // Allow whitespace
        'utf8'
      );
    });

    test('should handle world updates (overwrite existing)', async () => {
      const originalWorld: WorldData = {
        id: 'update-test',
        name: 'Original Name',
        turnLimit: 5
      };

      const updatedWorld: WorldData = {
        id: 'update-test',
        name: 'Updated Name',
        description: 'Now with description',
        turnLimit: 10
      };

      // Save original
      await saveWorldToDisk(rootPath, originalWorld);
      
      // Save update
      await saveWorldToDisk(rootPath, updatedWorld);

      // Should be called twice (original + update)
      expect(fs.writeFile).toHaveBeenCalledTimes(2); // 2 temp files
      expect(fs.rename).toHaveBeenCalledTimes(2); // 2 renames
    });
  });

  describe('Read Operations (loadWorldFromDisk)', () => {
    test('should load world with all fields correctly', async () => {
      const expectedWorld: WorldData = {
        id: 'load-test',
        name: 'Load Test World',
        description: 'Testing world loading',
        turnLimit: 8
      };

      // Mock file content
      fs.readFile.mockResolvedValue(JSON.stringify(expectedWorld));

      const loadedWorld = await loadWorldFromDisk(rootPath, 'load-test');

      expect(loadedWorld).toEqual(expectedWorld);
      expect(fs.readFile).toHaveBeenCalledWith(
        `${rootPath}/load-test/config.json`,
        'utf8'
      );
    });

    test('should return null for non-existent world', async () => {
      fs.readFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const loadedWorld = await loadWorldFromDisk(rootPath, 'non-existent');

      expect(loadedWorld).toBeNull();
    });

    test('should handle corrupted JSON gracefully', async () => {
      fs.readFile.mockResolvedValue('{ invalid json content }');

      const loadedWorld = await loadWorldFromDisk(rootPath, 'corrupted');

      expect(loadedWorld).toBeNull();
    });

    test('should handle missing required fields', async () => {
      const incompleteData = { name: 'Incomplete World' }; // Missing id and turnLimit
      fs.readFile.mockResolvedValue(JSON.stringify(incompleteData));

      const loadedWorld = await loadWorldFromDisk(rootPath, 'incomplete');

      expect(loadedWorld).toBeNull();
    });

    test('should support legacy format migration (name-only ID)', async () => {
      const legacyData = {
        name: 'Legacy World',
        description: 'Legacy format without explicit ID',
        turnLimit: 5
      };
      fs.readFile.mockResolvedValue(JSON.stringify(legacyData));

      const loadedWorld = await loadWorldFromDisk(rootPath, 'legacy-world');

      expect(loadedWorld).not.toBeNull();
      expect(loadedWorld!.id).toBe('Legacy World'); // Should use name as ID
      expect(loadedWorld!.name).toBe('Legacy World');
    });
  });

  describe('Delete Operations (deleteWorldFromDisk)', () => {
    test('should delete existing world directory', async () => {
      // Mock existing directory
      fs.access.mockResolvedValue(undefined);

      const result = await deleteWorldFromDisk(rootPath, 'delete-test');

      expect(result).toBe(true);
      expect(fs.rm).toHaveBeenCalledWith(
        `${rootPath}/delete-test`,
        { recursive: true, force: true }
      );
    });

    test('should return false for non-existent world', async () => {
      fs.access.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const result = await deleteWorldFromDisk(rootPath, 'non-existent');

      expect(result).toBe(false);
      expect(fs.rm).not.toHaveBeenCalled();
    });

    test('should handle permission errors gracefully', async () => {
      fs.access.mockResolvedValue(undefined);
      fs.rm.mockRejectedValue(new Error('EACCES: permission denied'));

      const result = await deleteWorldFromDisk(rootPath, 'permission-test');

      expect(result).toBe(false);
    });
  });

  describe('List Operations (loadAllWorldsFromDisk)', () => {
    test('should load multiple worlds correctly', async () => {
      const world1Data = {
        id: 'world-1',
        name: 'World One',
        turnLimit: 5
      };
      const world2Data = {
        id: 'world-2',
        name: 'World Two',
        description: 'Second world',
        turnLimit: 10
      };

      // Mock directory listing
      fs.readdir.mockResolvedValue([
        { name: 'world-1', isDirectory: () => true },
        { name: 'world-2', isDirectory: () => true },
        { name: 'not-a-world.txt', isDirectory: () => false } // Should be ignored
      ]);

      // Mock file contents
      fs.readFile.mockImplementation(async (path: string) => {
        if (path.includes('world-1/config.json')) {
          return JSON.stringify(world1Data);
        }
        if (path.includes('world-2/config.json')) {
          return JSON.stringify(world2Data);
        }
        throw new Error('File not found');
      });

      const worlds = await loadAllWorldsFromDisk(rootPath);

      expect(worlds).toHaveLength(2);
      expect(worlds.map(w => w.id)).toEqual(['world-1', 'world-2']);
      expect(worlds.find(w => w.id === 'world-1')!.name).toBe('World One');
      expect(worlds.find(w => w.id === 'world-2')!.description).toBe('Second world');
    });

    test('should return empty array for non-existent root directory', async () => {
      fs.readdir.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const worlds = await loadAllWorldsFromDisk(rootPath);

      expect(worlds).toEqual([]);
    });

    test('should skip corrupted worlds and continue loading', async () => {
      fs.readdir.mockResolvedValue([
        { name: 'good-world', isDirectory: () => true },
        { name: 'bad-world', isDirectory: () => true }
      ]);

      fs.readFile.mockImplementation(async (path: string) => {
        if (path.includes('good-world/config.json')) {
          return JSON.stringify({
            id: 'good-world',
            name: 'Good World',
            turnLimit: 5
          });
        }
        if (path.includes('bad-world/config.json')) {
          return '{ invalid json }';
        }
        throw new Error('File not found');
      });

      const worlds = await loadAllWorldsFromDisk(rootPath);

      expect(worlds).toHaveLength(1);
      expect(worlds[0].id).toBe('good-world');
    });
  });

  describe('Utility Operations', () => {
    describe('worldExistsOnDisk', () => {
      test('should return true for existing world', async () => {
        fs.access.mockResolvedValue(undefined);

        const exists = await worldExistsOnDisk(rootPath, 'existing-world');

        expect(exists).toBe(true);
        expect(fs.access).toHaveBeenCalledWith(
          `${rootPath}/existing-world/config.json`
        );
      });

      test('should return false for non-existent world', async () => {
        fs.access.mockRejectedValue(new Error('ENOENT'));

        const exists = await worldExistsOnDisk(rootPath, 'missing-world');

        expect(exists).toBe(false);
      });
    });

    describe('getWorldDir', () => {
      test('should generate correct world directory path', () => {
        const worldDir = getWorldDir(rootPath, 'test-world');
        expect(worldDir).toBe(`${rootPath}/test-world`);
      });
    });

    describe('ensureWorldDirectory', () => {
      test('should create world and agents directories', async () => {
        await ensureWorldDirectory(rootPath, 'new-world');

        expect(fs.mkdir).toHaveBeenCalledWith(
          `${rootPath}/new-world/agents`,
          { recursive: true }
        );
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle disk full errors during save', async () => {
      const worldData: WorldData = {
        id: 'disk-full-test',
        name: 'Disk Full Test',
        turnLimit: 5
      };

      const diskError = new Error('ENOSPC: no space left on device');
      (diskError as any).code = 'ENOSPC';
      fs.writeFile.mockRejectedValueOnce(diskError);

      await expect(saveWorldToDisk(rootPath, worldData))
        .rejects.toThrow('ENOSPC');
    });

    test('should handle permission errors during directory creation', async () => {
      const worldData: WorldData = {
        id: 'permission-test',
        name: 'Permission Test',
        turnLimit: 5
      };

      fs.mkdir.mockRejectedValue(new Error('EACCES: permission denied'));

      await expect(saveWorldToDisk(rootPath, worldData))
        .rejects.toThrow('EACCES');
    });

    test('should handle world data with special characters', async () => {
      const worldData: WorldData = {
        id: 'special-chars',
        name: 'World with 🌟 emojis and "quotes"',
        description: 'Testing\nnewlines\tand\ttabs',
        turnLimit: 5
      };

      await saveWorldToDisk(rootPath, worldData);

      const savedContent = fs.writeFile.mock.calls.find((call: any) => 
        call[0].includes('config.json.tmp')
      )?.[1];
      
      expect(savedContent).toBeDefined();
      expect(savedContent).toContain('🌟');
      expect(savedContent).toContain('\\"quotes\\"');
    });

    test('should handle null and undefined values', async () => {
      const worldData: WorldData = {
        id: 'null-test',
        name: 'Null Test',
        description: undefined,
        turnLimit: 5
      };

      await saveWorldToDisk(rootPath, worldData);

      const savedContent = fs.writeFile.mock.calls.find((call: any) => 
        call[0].includes('config.json.tmp')
      )?.[1];
      
      expect(savedContent).toBeDefined();
      const parsedContent = JSON.parse(savedContent as string);
      expect(parsedContent.description).toBeUndefined();
    });
  });

  describe('Data Integrity', () => {
    test('should preserve exact data through save/load cycle', async () => {
      const originalWorld: WorldData = {
        id: 'integrity-test',
        name: 'Data Integrity Test',
        description: 'Testing data preservation',
        turnLimit: 42
      };

      await saveWorldToDisk(rootPath, originalWorld);

      // Mock the saved content for loading
      const savedContent = fs.writeFile.mock.calls.find((call: any) => 
        call[0].includes('config.json.tmp')
      )?.[1];
      
      expect(savedContent).toBeDefined();
      fs.readFile.mockResolvedValue(savedContent as string);

      const loadedWorld = await loadWorldFromDisk(rootPath, 'integrity-test');

      expect(loadedWorld).toEqual(originalWorld);
    });

    test('should validate required fields on load', async () => {
      const testCases = [
        { name: 'World' }, // Missing id and turnLimit
        { id: 'test', turnLimit: 5 }, // Missing name
        { id: 'test', name: 'Test' }, // Missing turnLimit
        {} // Missing everything
      ];

      for (const testCase of testCases) {
        fs.readFile.mockResolvedValue(JSON.stringify(testCase));
        
        const result = await loadWorldFromDisk(rootPath, 'test');
        
        if (testCase.id && testCase.name && testCase.turnLimit !== undefined) {
          expect(result).not.toBeNull();
        } else {
          expect(result).toBeNull();
        }
      }
    });
  });
});