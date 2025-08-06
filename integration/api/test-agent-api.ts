/**
 * API Integration Test: Agent CRUD Operations via HTTP API
 *
 * Features:
 * - Tests agent management through HTTP REST API endpoints
 * - Covers: agent creation, retrieval, update, listing, deletion
 * - Tests memory operations (clearing, updating)
 * - Validates API responses, error handling, and status codes
 *
 * Implementation:
 * - Uses fetch() to call actual HTTP API at localhost:8080
 * - Tests both success and error scenarios
 * - Comprehensive response validation
 * - Isolated test execution with cleanup
 *
 * API Endpoints Tested:
 * - GET /api/worlds/:name - Get world with agents
 * - POST /api/worlds/:worldName/agents - Create agent
 * - PATCH /api/worlds/:worldName/agents/:name - Update agent
 * - DELETE /api/worlds/:worldName/agents/:name/memory - Clear agent memory
 * - DELETE /api/worlds/:worldName/agents/:name - Delete agent
 */

import { API_BASE_URL, boldRed, boldGreen, boldYellow, red, green, yellow, cyan, log, assert, apiCall } from '../utils.js';

const TEST_WORLD_NAME = `api-agent-test-${Date.now()}`;
const TEST_AGENT_NAME = `api-test-agent-${Date.now()}`;

async function cleanupTestData(): Promise<void> {
  // Delete test agent
  const deleteAgentResult = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_NAME)}/agents/${encodeURIComponent(TEST_AGENT_NAME)}`, {
    method: 'DELETE'
  });

  // Delete test world
  const deleteWorldResult = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_NAME)}`, {
    method: 'DELETE'
  });

  if (deleteAgentResult.status !== 204 && deleteAgentResult.status !== 404) {
    console.log(yellow(`Warning: Failed to cleanup test agent: ${deleteAgentResult.error || 'Unknown error'}`));
  }

  if (deleteWorldResult.status !== 204 && deleteWorldResult.status !== 404) {
    console.log(yellow(`Warning: Failed to cleanup test world: ${deleteWorldResult.error || 'Unknown error'}`));
  }
}

async function runApiAgentTests(): Promise<void> {
  let worldCreated = false;
  let agentCreated = false;

  try {
    console.log('Starting API Integration Test: Agent CRUD Operations');
    console.log('='.repeat(70));

    // Cleanup any existing test data first
    await cleanupTestData();

    // Step 1: Create test world for agent operations
    console.log('\n1. Creating test world for agent operations...');
    const createWorldResult = await apiCall('/worlds', {
      method: 'POST',
      body: JSON.stringify({
        name: TEST_WORLD_NAME,
        description: 'API integration test world for agent operations',
        turnLimit: 20
      })
    });

    assert(createWorldResult.status === 201, 'Test world creation should succeed');
    worldCreated = true;
    log('Test world created', { name: createWorldResult.data.name, id: createWorldResult.data.id });

    // Step 2: Test agent creation via API
    console.log('\n2. Testing agent creation via API...');
    const createAgentResult = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_NAME)}/agents`, {
      method: 'POST',
      body: JSON.stringify({
        name: TEST_AGENT_NAME,
        systemPrompt: 'You are a helpful test agent for API integration testing.',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022'
      })
    });

    assert(createAgentResult.status === 201, 'Agent creation should return 201 status');
    assert(createAgentResult.data !== undefined, 'Agent creation should return agent data');
    assert(createAgentResult.data.name === TEST_AGENT_NAME, 'Created agent should have correct name');
    assert(createAgentResult.data.systemPrompt === 'You are a helpful test agent for API integration testing.', 'Created agent should have correct systemPrompt');

    agentCreated = true;
    log('Created agent via API', {
      name: createAgentResult.data.name,
      id: createAgentResult.data.id,
      worldName: createAgentResult.data.worldName,
      llmProvider: createAgentResult.data.llmProvider
    });

    // Step 3: Test getting world with agents
    console.log('\n3. Testing world retrieval with agents...');
    const getWorldResult = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_NAME)}`);

    assert(getWorldResult.status === 200, 'World GET should return 200 status');
    assert(Array.isArray(getWorldResult.data.agents), 'World should have agents array');
    assert(getWorldResult.data.agents.length === 1, 'World should have exactly 1 agent');

    const agentInWorld = getWorldResult.data.agents[0];
    assert(agentInWorld.name === TEST_AGENT_NAME, 'Agent in world should have correct name');
    assert(agentInWorld.provider === 'anthropic', 'Agent should have correct LLM provider');

    log('World with agents retrieved', {
      worldName: getWorldResult.data.name,
      agentCount: getWorldResult.data.agents.length,
      agentName: agentInWorld.name,
      agentProvider: agentInWorld.provider
    });

    // Step 4: Test agent update
    console.log('\n4. Testing agent update via API...');
    const updateAgentResult = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_NAME)}/agents/${encodeURIComponent(TEST_AGENT_NAME)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        systemPrompt: 'You are an updated test agent with new instructions.',
        model: 'claude-3-5-haiku-20241022'
      })
    });

    assert(updateAgentResult.status === 200, 'Agent update should return 200 status');
    assert(updateAgentResult.data !== undefined, 'Agent update should return updated agent data');
    assert(updateAgentResult.data.systemPrompt === 'You are an updated test agent with new instructions.', 'Updated agent should have new systemPrompt');
    assert(updateAgentResult.data.model === 'claude-3-5-haiku-20241022', 'Updated agent should have new model');
    assert(updateAgentResult.data.name === TEST_AGENT_NAME, 'Updated agent should preserve name');

    log('Agent updated via API', {
      name: updateAgentResult.data.name,
      newPrompt: updateAgentResult.data.systemPrompt?.substring(0, 50) + '...',
      newModel: updateAgentResult.data.model
    });

    // Step 5: Test partial agent update
    console.log('\n5. Testing partial agent update...');
    const partialUpdateResult = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_NAME)}/agents/${encodeURIComponent(TEST_AGENT_NAME)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        provider: 'openai'
      })
    });

    assert(partialUpdateResult.status === 200, 'Partial update should succeed');
    assert(partialUpdateResult.data.provider === 'openai', 'Partial update should change provider');
    assert(partialUpdateResult.data.systemPrompt === 'You are an updated test agent with new instructions.', 'Partial update should preserve systemPrompt');

    log('Partial update verified', {
      newProvider: partialUpdateResult.data.provider,
      systemPromptPreserved: partialUpdateResult.data.systemPrompt?.substring(0, 30) + '...'
    });

    // Step 6: Test memory operations
    console.log('\n6. Testing memory operations...');

    // First, add some memory content by creating a chat message (simulate memory usage)
    // Since memory operations depend on actual chat activity, we'll test the clear endpoint

    const clearMemoryResult = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_NAME)}/agents/${encodeURIComponent(TEST_AGENT_NAME)}/memory`, {
      method: 'DELETE'
    });

    assert(clearMemoryResult.status === 200 || clearMemoryResult.status === 204, 'Memory clear should succeed');

    log('Memory operations tested', {
      clearStatus: clearMemoryResult.status,
      agentName: TEST_AGENT_NAME
    });

    // Step 7: Test error conditions
    console.log('\n7. Testing error conditions...');

    // Duplicate agent creation
    const duplicateAgentResult = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_NAME)}/agents`, {
      method: 'POST',
      body: JSON.stringify({
        name: TEST_AGENT_NAME, // This should already exist
        systemPrompt: 'Duplicate test'
      })
    });
    assert(duplicateAgentResult.status === 409, 'Duplicate agent creation should return 409 conflict');
    assert(duplicateAgentResult.data.code === 'AGENT_EXISTS', 'Should return AGENT_EXISTS error code');

    // Non-existent agent update
    const nonExistentAgentUpdate = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_NAME)}/agents/non-existent-agent-12345`, {
      method: 'PATCH',
      body: JSON.stringify({
        systemPrompt: 'New prompt'
      })
    });
    assert(nonExistentAgentUpdate.status === 404, 'Non-existent agent update should return 404');

    // Invalid agent creation
    const invalidAgentResult = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_NAME)}/agents`, {
      method: 'POST',
      body: JSON.stringify({
        name: '', // Invalid empty name
      })
    });
    assert(invalidAgentResult.status === 400, 'Invalid agent data should return 400');

    // Agent creation in non-existent world
    const invalidWorldAgent = await apiCall('/worlds/non-existent-world-12345/agents', {
      method: 'POST',
      body: JSON.stringify({
        name: 'test-agent-invalid-world',
        systemPrompt: 'Test prompt'
      })
    });
    assert(invalidWorldAgent.status === 404 || invalidWorldAgent.status === 400, 'Agent creation in non-existent world should fail');

    log('Error conditions tested', {
      duplicateAgent: duplicateAgentResult.status,
      nonExistentUpdate: nonExistentAgentUpdate.status,
      invalidCreation: invalidAgentResult.status,
      invalidWorld: invalidWorldAgent.status
    });

    // Step 8: Test agent deletion
    console.log('\n8. Testing agent deletion via API...');
    const deleteAgentResult = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_NAME)}/agents/${encodeURIComponent(TEST_AGENT_NAME)}`, {
      method: 'DELETE'
    });

    assert(deleteAgentResult.status === 204, 'Agent deletion should return 204 status');
    log('Agent deleted via API', { status: deleteAgentResult.status });

    // Step 9: Verify agent deletion
    console.log('\n9. Verifying agent deletion...');
    const verifyDeletionResult = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_NAME)}`);

    assert(verifyDeletionResult.status === 200, 'World GET should still work after agent deletion');
    assert(verifyDeletionResult.data.agents.length === 0, 'World should have no agents after deletion');

    log('Agent deletion verified', {
      worldAgentCount: verifyDeletionResult.data.agents.length,
      agentDeleted: true
    });

    agentCreated = false; // Mark as cleaned up

    console.log('\n' + '='.repeat(70));
    console.log(boldGreen('API Agent Integration Test completed successfully!'));
    console.log(green('All agent CRUD operations working correctly via HTTP API.'));

  } catch (error) {
    console.error(boldRed('API Agent Integration Test failed:'), error);
    throw error;
  } finally {
    // Cleanup test data if it still exists
    if (agentCreated || worldCreated) {
      try {
        await cleanupTestData();
        console.log(cyan('Cleanup: Test data deleted'));
      } catch (cleanupError) {
        console.log(red('Cleanup failed:'), cleanupError);
      }
    }
  }
}

// Run the test
runApiAgentTests().catch((error) => {
  console.error(boldRed('Test execution failed:'), error);
  process.exit(1);
});
