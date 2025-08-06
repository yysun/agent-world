/**
 * API Integration Test: World CRUD Operations via HTTP API
 *
 * Features:
 * - Tests world management through HTTP REST API endpoints
 * - Covers: world creation, retrieval, update, listing, export, deletion
 * - Validates API responses, error handling, and status codes
 * - Tests API serialization and validation schemas
 *
 * Implementation:
 * - Uses fetch() to call actual HTTP API at localhost:8080
 * - Tests both success and error scenarios
 * - Comprehensive response validation
 * - Isolated test execution with cleanup
 *
 * API Endpoints Tested:
 * - GET /api/worlds - List worlds
 * - POST /api/worlds - Create world
 * - GET /api/worlds/:worldName - Get specific world
 * - PATCH /api/worlds/:worldName - Update world
 * - GET /api/worlds/:worldName/export - Export world
 * - DELETE /api/worlds/:worldName - Delete world
 */

import { API_BASE_URL, boldRed, boldGreen, boldYellow, red, green, yellow, cyan, log, assert, apiCall } from '../utils.js';

const TEST_WORLD_NAME = `api-world-test-${Date.now()}`;

async function cleanupTestWorld(): Promise<void> {
  const result = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_NAME)}`, {
    method: 'DELETE'
  });

  if (result.status !== 204 && result.status !== 404) {
    console.log(yellow(`Warning: Failed to cleanup test world: ${result.error || 'Unknown error'}`));
  }
}

async function runApiWorldTests(): Promise<void> {
  let worldCreated = false;

  try {
    console.log('Starting API Integration Test: World CRUD Operations');
    console.log('='.repeat(70));

    // Cleanup any existing test world first
    await cleanupTestWorld();

    // Step 1: Test world listing
    console.log('\n1. Testing world listing via API...');
    const listWorldsResult = await apiCall('/worlds');

    assert(listWorldsResult.status === 200, 'World listing should return 200 status');
    assert(Array.isArray(listWorldsResult.data), 'World listing should return array');

    const initialWorldCount = listWorldsResult.data.length;
    log('Initial world listing', {
      count: initialWorldCount,
      worlds: listWorldsResult.data.map((w: any) => ({ name: w.name, id: w.id }))
    });

    // Step 2: Test world creation
    console.log('\n2. Testing world creation via API...');
    const createWorldResult = await apiCall('/worlds', {
      method: 'POST',
      body: JSON.stringify({
        name: TEST_WORLD_NAME,
        description: 'API integration test world for world operations',
        turnLimit: 15
      })
    });

    assert(createWorldResult.status === 201, 'World creation should return 201 status');
    assert(createWorldResult.data !== undefined, 'World creation should return world data');
    assert(createWorldResult.data.name === TEST_WORLD_NAME, 'Created world should have correct name');

    worldCreated = true;
    log('Created world via API', {
      name: createWorldResult.data.name,
      id: createWorldResult.data.id
    });

    // Step 3: Test getting specific world
    console.log('\n3. Testing world retrieval via API...');
    const getWorldResult = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_NAME)}`);

    assert(getWorldResult.status === 200, 'World GET should return 200 status');
    assert(getWorldResult.data !== undefined, 'World GET should return world data');
    assert(getWorldResult.data.name === TEST_WORLD_NAME, 'Retrieved world should have correct name');
    assert(getWorldResult.data.turnLimit === 15, 'Retrieved world should have correct turnLimit');
    assert(Array.isArray(getWorldResult.data.agents), 'Retrieved world should have agents array');
    assert(Array.isArray(getWorldResult.data.chats), 'Retrieved world should have chats array');
    assert(getWorldResult.data.agents.length === 0, 'New world should have no agents');

    log('Retrieved world via API', {
      id: getWorldResult.data.id,
      name: getWorldResult.data.name,
      description: getWorldResult.data.description,
      turnLimit: getWorldResult.data.turnLimit,
      agentCount: getWorldResult.data.agents.length,
      chatCount: getWorldResult.data.chats.length
    });

    // Step 4: Test world update
    console.log('\n4. Testing world update via API...');
    const updateWorldResult = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_NAME)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: `${TEST_WORLD_NAME} Updated`,
        description: 'Updated description for API testing',
        turnLimit: 25
      })
    });

    assert(updateWorldResult.status === 200, 'World update should return 200 status');
    assert(updateWorldResult.data !== undefined, 'World update should return updated world data');
    assert(updateWorldResult.data.name === `${TEST_WORLD_NAME} Updated`, 'Updated world should have new name');
    assert(updateWorldResult.data.description === 'Updated description for API testing', 'Updated world should have new description');
    assert(updateWorldResult.data.turnLimit === 25, 'Updated world should have new turnLimit');

    log('Updated world via API', {
      name: updateWorldResult.data.name,
      description: updateWorldResult.data.description,
      turnLimit: updateWorldResult.data.turnLimit
    });

    // Step 5: Test partial world update
    console.log('\n5. Testing partial world update...');
    const partialUpdateResult = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_NAME)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        turnLimit: 30
      })
    });

    assert(partialUpdateResult.status === 200, 'Partial update should succeed');
    assert(partialUpdateResult.data.turnLimit === 30, 'Partial update should change turnLimit');
    assert(partialUpdateResult.data.name === `${TEST_WORLD_NAME} Updated`, 'Partial update should preserve name');

    log('Partial update verified', {
      turnLimit: partialUpdateResult.data.turnLimit,
      namePreserved: partialUpdateResult.data.name
    });

    // Step 6: Test world export
    console.log('\n6. Testing world export via API...');
    const exportResult = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_NAME)}/export`);

    assert(exportResult.status === 200, 'World export should return 200 status');
    assert(typeof exportResult.data === 'string', 'World export should return string data');
    assert(exportResult.data.length > 0, 'World export should not be empty');
    assert(exportResult.data.includes(`${TEST_WORLD_NAME} Updated`), 'Export should contain world name');

    // Check headers for download
    const contentType = exportResult.headers?.get('content-type');
    const contentDisposition = exportResult.headers?.get('content-disposition');
    assert(contentType !== null && contentType !== undefined && contentType.startsWith('text/markdown'), 'Export should have markdown content type');
    assert(contentDisposition !== null && contentDisposition !== undefined && contentDisposition.includes('attachment'), 'Export should have attachment disposition');

    log('World export verified', {
      contentLength: exportResult.data.length,
      contentType: contentType,
      hasAttachmentHeader: contentDisposition?.includes('attachment'),
      containsWorldName: exportResult.data.includes(`${TEST_WORLD_NAME} Updated`)
    });

    // Step 7: Test updated world listing
    console.log('\n7. Testing updated world listing...');
    const updatedListResult = await apiCall('/worlds');

    assert(updatedListResult.status === 200, 'Updated world listing should succeed');
    assert(updatedListResult.data.length === initialWorldCount + 1, 'World count should increase by 1');

    const testWorldInList = updatedListResult.data.find((w: any) => w.name === `${TEST_WORLD_NAME} Updated`);
    assert(testWorldInList !== undefined, 'Updated world should appear in listing');

    log('Updated world listing verified', {
      totalWorlds: updatedListResult.data.length,
      testWorldFound: !!testWorldInList,
      testWorldName: testWorldInList?.name
    });

    // Step 8: Test error conditions
    console.log('\n8. Testing error conditions...');

    // Test creating world with same name (should fail with 409 conflict)
    const sameName = partialUpdateResult.data.name;
    const sameNameResult = await apiCall('/worlds', {
      method: 'POST',
      body: JSON.stringify({
        name: sameName,
        description: 'Duplicate name test - should fail'
      })
    });

    console.log('Debug: Duplicate world result:', {
      sameName,
      status: sameNameResult.status,
      data: sameNameResult.data,
      error: sameNameResult.error
    });

    assert(sameNameResult.status === 409, 'Duplicate world name should return 409 conflict');
    assert(sameNameResult.data.code === 'WORLD_EXISTS', 'Should return WORLD_EXISTS error code');

    // Non-existent world retrieval
    const nonExistentWorld = await apiCall('/worlds/non-existent-world-12345');
    assert(nonExistentWorld.status === 404, 'Non-existent world should return 404');

    // Invalid world creation
    const invalidWorldResult = await apiCall('/worlds', {
      method: 'POST',
      body: JSON.stringify({
        name: '', // Invalid empty name
        turnLimit: -1 // Invalid negative turnLimit
      })
    });
    assert(invalidWorldResult.status === 400, 'Invalid world data should return 400');

    // Invalid world update
    const invalidUpdateResult = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_NAME)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        turnLimit: 0 // Invalid turnLimit
      })
    });
    assert(invalidUpdateResult.status === 400, 'Invalid update data should return 400');

    log('Error conditions tested', {
      sameNameWorld: sameNameResult.status,
      nonExistentWorld: nonExistentWorld.status,
      invalidCreation: invalidWorldResult.status,
      invalidUpdate: invalidUpdateResult.status
    });

    // Step 9: Test world deletion
    console.log('\n9. Testing world deletion via API...');
    const deleteResult = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_NAME)}`, {
      method: 'DELETE'
    });

    assert(deleteResult.status === 204, 'World deletion should return 204 status');
    log('World deleted via API', { status: deleteResult.status });

    // Step 10: Verify world deletion
    console.log('\n10. Verifying world deletion...');
    const afterDeleteResult = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_NAME)}`);
    assert(afterDeleteResult.status === 404, 'Deleted world should return 404');

    const finalListResult = await apiCall('/worlds');
    assert(finalListResult.data.length === initialWorldCount, 'World count should return to initial count (duplicate was rejected)');

    log('World deletion verified', {
      getDeletedWorld: afterDeleteResult.status,
      finalWorldCount: finalListResult.data.length,
      returnedToInitial: finalListResult.data.length === initialWorldCount
    });

    worldCreated = false; // Mark as cleaned up

    console.log('\n' + '='.repeat(70));
    console.log(boldGreen('API World Integration Test completed successfully!'));
    console.log(green('All world CRUD operations working correctly via HTTP API.'));

  } catch (error) {
    console.error(boldRed('API World Integration Test failed:'), error);
    throw error;
  } finally {
    // Cleanup test world if it still exists
    if (worldCreated) {
      try {
        await cleanupTestWorld();
        console.log(cyan('Cleanup: Test world deleted'));
      } catch (cleanupError) {
        console.log(red('Cleanup failed:'), cleanupError);
      }
    }
  }
}

// Run the test
runApiWorldTests().catch((error) => {
  console.error(boldRed('Test execution failed:'), error);
  process.exit(1);
});
