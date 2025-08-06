/**
 * Integration Test: WorldClass World CRUD Operations
 *
 * Features:
 * - Tests WorldClass world management methods using OOP interface
 * - Covers: world creation, update, reload, export, deletion
 * - Validates WorldClass wrapper consistency with core functions
 * - Tests utility methods: toString, toJSON, getters
 *
 * Implementation:
 * - Uses WorldClass instead of direct core function calls
 * - Tests stateless design - each method fetches fresh data
 * - Validates kebab-case conversion in constructor
 * - Designed as standalone TypeScript program with npx tsx
 *
 * Changes:
 * - Focused on WorldClass OOP interface
 * - Tests world CRUD operations through class methods
 * - Validates class utility methods and properties
 * - Uses consistent test patterns from existing integration tests
 */

import {
  createWorld,
  disableStreaming,
} from '../core/index.js';
import { WorldClass } from '../core/world-class.js';
import type { CreateWorldParams } from '../core/types.js';
import { boldRed, boldGreen, boldYellow, red, green, yellow, cyan, log, assert } from './utils.js';

const ROOT_PATH = '.';
const TEST_WORLD_ID = 'test-world-class-world';
const UPDATED_WORLD_ID = 'test-world-class-updated';

async function runWorldClassWorldTest(): Promise<void> {
  let worldClass: WorldClass | null = null;

  try {
    console.log('Starting Integration Test: WorldClass World CRUD Operations');
    console.log('='.repeat(70));

    disableStreaming();

    // Step 1: Create world using core function first
    console.log('\n1. Creating test world using core function...');
    const createParams: CreateWorldParams = {
      name: 'Test World Class World',
      description: 'A test world for WorldClass integration testing',
      turnLimit: 10
    };

    const createdWorld = await createWorld(ROOT_PATH, createParams);
    assert(createdWorld !== null, 'World should be created successfully');
    assert(createdWorld!.id === createdWorld!.name.toLowerCase().replace(/\s+/g, '-'), 'World ID should be kebab-case of name');
    log('Created world', {
      id: createdWorld!.id,
      name: createdWorld!.name,
      description: createdWorld!.description
    });

    // Step 2: Initialize WorldClass instance
    console.log('\n2. Initializing WorldClass instance...');
    worldClass = new WorldClass(ROOT_PATH, createdWorld!.id);

    // Test utility methods
    assert(worldClass.id === createdWorld!.id, 'WorldClass ID getter should work');
    assert(worldClass.path === ROOT_PATH, 'WorldClass path getter should work');
    assert(worldClass.toString() === `WorldClass(${createdWorld!.id})`, 'WorldClass toString should work');

    const jsonRep = worldClass.toJSON();
    assert(jsonRep.id === createdWorld!.id && jsonRep.rootPath === ROOT_PATH, 'WorldClass toJSON should work');

    log('WorldClass initialized', {
      id: worldClass.id,
      path: worldClass.path,
      toString: worldClass.toString(),
      toJSON: worldClass.toJSON()
    });

    // Step 3: Test kebab-case conversion
    console.log('\n3. Testing kebab-case conversion in constructor...');
    const worldClassWithSpaces = new WorldClass(ROOT_PATH, 'Test World With Spaces');
    assert(worldClassWithSpaces.id === 'test-world-with-spaces', 'WorldClass should convert to kebab-case');
    log('Kebab-case conversion', {
      input: 'Test World With Spaces',
      output: worldClassWithSpaces.id
    });

    // Step 4: Test reload method
    console.log('\n4. Testing WorldClass reload method...');
    const reloadedWorld = await worldClass.reload();
    assert(reloadedWorld !== null, 'Reload should return world data');
    assert(reloadedWorld!.id === createdWorld!.id, 'Reloaded world should have correct ID');
    assert(reloadedWorld!.name === createParams.name, 'Reloaded world should have correct name');
    log('Reloaded world', {
      id: reloadedWorld!.id,
      name: reloadedWorld!.name,
      turnLimit: reloadedWorld!.turnLimit
    });

    // Step 5: Test update method
    console.log('\n5. Testing WorldClass update method...');
    const updateParams = {
      name: 'Updated Test World Class',
      description: 'Updated description for WorldClass testing',
      turnLimit: 20
    };

    const updatedWorld = await worldClass.update(updateParams);
    assert(updatedWorld !== null, 'Update should return updated world');
    assert(updatedWorld!.name === updateParams.name, 'World name should be updated');
    assert(updatedWorld!.description === updateParams.description, 'World description should be updated');
    assert(updatedWorld!.turnLimit === updateParams.turnLimit, 'World turnLimit should be updated');
    log('Updated world', {
      id: updatedWorld!.id,
      name: updatedWorld!.name,
      description: updatedWorld!.description,
      turnLimit: updatedWorld!.turnLimit
    });

    // Step 6: Test export to markdown
    console.log('\n6. Testing WorldClass exportToMarkdown method...');
    const markdownExport = await worldClass.exportToMarkdown();
    assert(typeof markdownExport === 'string', 'Export should return string');
    assert(markdownExport.length > 0, 'Export should not be empty');
    assert(markdownExport.includes(updatedWorld!.name), 'Export should contain world name');
    log('Markdown export length', markdownExport.length);
    log('Export preview', markdownExport.substring(0, 200) + '...');

    // Step 7: Test save method (no-op in stateless design)
    console.log('\n7. Testing WorldClass save method...');
    await worldClass.save(); // Should complete without error
    console.log(green('✅ Save method completed (no-op in stateless design)'));

    // Step 8: Verify stateless behavior
    console.log('\n8. Verifying stateless behavior...');
    const freshWorld = await worldClass.reload();
    assert(freshWorld !== null, 'Fresh reload should work');
    assert(freshWorld!.name === updateParams.name, 'Fresh reload should show latest updates');
    log('Fresh world state confirms stateless design', {
      name: freshWorld!.name,
      description: freshWorld!.description
    });

    // Step 9: Test delete method
    console.log('\n9. Testing WorldClass delete method...');
    const deleteResult = await worldClass.delete();
    assert(deleteResult === true, 'Delete should return true on success');
    log('World deleted successfully', deleteResult);

    // Step 10: Verify deletion
    console.log('\n10. Verifying world deletion...');
    const deletedWorld = await worldClass.reload();
    assert(deletedWorld === null, 'Reload after delete should return null');
    console.log(green('✅ World deletion verified - reload returns null'));

    console.log('\n' + '='.repeat(70));
    console.log(boldGreen('Integration test completed successfully!'));
    console.log(green('All WorldClass world CRUD operations working correctly.'));

  } catch (error) {
    console.error(boldRed('Integration test failed:'), error);

    // Cleanup on error
    if (worldClass) {
      try {
        await worldClass.delete();
        console.log(yellow('Cleanup: Test world deleted'));
      } catch (cleanupError) {
        console.log(red('Cleanup failed:'), cleanupError);
      }
    }

    process.exit(1);
  }
}

// Run the test
runWorldClassWorldTest();
