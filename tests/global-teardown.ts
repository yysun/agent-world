/**
 * Jest Global Teardown - Cleanup test data after all tests complete
 * 
 * This file runs after all Jest tests have completed and cleans up any
 * test data folders that may have been created during testing.
 * 
 * Features:
 * - Removes test-data directory and all contents
 * - Removes any world folders created in data/worlds during tests
 * - Safe cleanup that ignores errors if directories don't exist
 * - Preserves non-test world folders that may exist
 * 
 * Logic:
 * - Runs as Jest globalTeardown hook
 * - Uses fs.rm with recursive and force options for thorough cleanup
 * - Handles cleanup errors gracefully to prevent test failures
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export default async (): Promise<void> => {
  console.log('🧹 Running global test cleanup...');
  
  const testDataPath = path.join(process.cwd(), 'test-data');
  const worldsDataPath = path.join(process.cwd(), 'data', 'worlds');
  
  try {
    // Clean up test-data directory
    await fs.rm(testDataPath, { recursive: true, force: true });
    console.log('✅ Cleaned up test-data directory');
  } catch (error) {
    console.log('ℹ️  test-data directory cleanup skipped (may not exist)');
  }
  
  try {
    // Clean up test world folders from data/worlds
    // Only remove world folders that are test-generated (UUID format: world_[uuid])
    const worldsDir = await fs.readdir(worldsDataPath, { withFileTypes: true });
    const uuidPattern = /^world_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const testWorldFolders = worldsDir
      .filter(dirent => dirent.isDirectory())
      .filter(dirent => uuidPattern.test(dirent.name));
    
    if (testWorldFolders.length > 0) {
      console.log(`🗂️  Found ${testWorldFolders.length} test world folders to clean up`);
      
      for (const folder of testWorldFolders) {
        const worldPath = path.join(worldsDataPath, folder.name);
        try {
          await fs.rm(worldPath, { recursive: true, force: true });
          console.log(`   ✅ Removed ${folder.name}`);
        } catch (error) {
          console.log(`   ⚠️  Failed to remove ${folder.name}:`, (error as Error).message);
        }
      }
    } else {
      console.log('ℹ️  No test world folders found to clean up');
    }
  } catch (error) {
    console.log('ℹ️  World folders cleanup skipped (data/worlds may not exist)');
  }
  
  console.log('✨ Global test cleanup complete!');
};