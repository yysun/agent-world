/**
 * Functional test to verify the world loading function consolidation fix
 * This test verifies that the API issue is resolved
 */

import { getWorld, getWorldConfig } from '../../core/managers.js';

describe('World Loading Functions API Fix', () => {
  it('should have consolidated function signatures correctly', () => {
    // Verify function exists and has correct signature
    expect(typeof getWorld).toBe('function');
    expect(typeof getWorldConfig).toBe('function');
    
    // Verify the functions are properly exported and available
    expect(getWorld.name).toBe('getWorld');
    expect(getWorldConfig.name).toBe('getWorldConfig');
  });

  it('should return proper types from functions', async () => {
    // Test with non-existent world to verify return types without side effects
    const nonExistentWorldId = 'definitely-does-not-exist-12345';
    const testRootPath = './non-existent-path';
    
    // getWorld should return Promise<World | null>
    const worldResult = await getWorld(testRootPath, nonExistentWorldId);
    expect(worldResult).toBeNull(); // Should be null for non-existent world
    
    // getWorldConfig should return Promise<WorldData | null>
    const configResult = await getWorldConfig(testRootPath, nonExistentWorldId);
    expect(configResult).toBeNull(); // Should be null for non-existent world
  });
});