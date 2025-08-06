/**
 * API Integration Test: Duplicate Name Validation
 *
 * Features:
 * - Tests duplicate name prevention for worlds and agents
 * - Covers edge cases like case sensitivity, whitespace, and kebab-case conversion
 * - Validates proper error codes and messages
 * - Tests duplicate checking across different scenarios
 *
 * Implementation:
 * - Uses fetch() to call actual HTTP API at localhost:8080
 * - Tests both world and agent duplicate scenarios
 * - Comprehensive response validation with proper error codes
 * - Isolated test execution with thorough cleanup
 *
 * Test Coverage:
 * - World duplicate names (exact match, case variations, spacing)
 * - Agent duplicate names within same world
 * - Cross-world agent names (should be allowed)
 * - Kebab-case ID collision detection
 * - Error response validation
 */

import { API_BASE_URL, boldRed, boldGreen, boldYellow, red, green, yellow, cyan, log, assert, apiCall } from '../utils.js';

const TEST_WORLD_1 = `dup-test-world-1-${Date.now()}`;
const TEST_WORLD_2 = `dup-test-world-2-${Date.now()}`;
const TEST_AGENT_1 = `dup-test-agent-1-${Date.now()}`;
const TEST_AGENT_2 = `dup-test-agent-2-${Date.now()}`;

async function cleanupTestData(): Promise<void> {
  // Clean up agents first
  const agents = [TEST_AGENT_1, TEST_AGENT_2];
  const worlds = [TEST_WORLD_1, TEST_WORLD_2];

  // Delete agents from all worlds
  for (const world of worlds) {
    for (const agent of agents) {
      await apiCall(`/worlds/${encodeURIComponent(world)}/agents/${encodeURIComponent(agent)}`, {
        method: 'DELETE'
      });
    }
  }

  // Delete test worlds
  for (const world of worlds) {
    await apiCall(`/worlds/${encodeURIComponent(world)}`, {
      method: 'DELETE'
    });
  }

  // Clean up any worlds that might have been created during testing
  const extraWorldsToClean = [
    'Test World',
    'test-world',
    'TEST WORLD',
    '  Test World  ',
    TEST_WORLD_1.toUpperCase(),
    TEST_WORLD_1.toLowerCase()
  ];

  for (const worldName of extraWorldsToClean) {
    await apiCall(`/worlds/${encodeURIComponent(worldName)}`, {
      method: 'DELETE'
    });
  }
}

async function runDuplicateNameTests(): Promise<void> {
  let worldsCreated: string[] = [];
  let agentsCreated: { world: string; agent: string }[] = [];

  try {
    console.log('Starting API Integration Test: Duplicate Name Validation');
    console.log('='.repeat(70));

    // Cleanup any existing test data first
    await cleanupTestData();

    // SECTION 1: World Duplicate Name Tests
    console.log('\n=== WORLD DUPLICATE NAME TESTS ===\n');

    // Step 1: Create first test world
    console.log('1. Creating first test world...');
    const world1Result = await apiCall('/worlds', {
      method: 'POST',
      body: JSON.stringify({
        name: TEST_WORLD_1,
        description: 'First test world for duplicate checking'
      })
    });

    console.log('Debug: World creation result:', {
      status: world1Result.status,
      data: world1Result.data,
      error: world1Result.error
    });

    assert(world1Result.status === 201, 'First world creation should succeed');
    worldsCreated.push(TEST_WORLD_1);
    log('First world created', {
      name: world1Result.data.name,
      id: world1Result.data.id
    });

    // Step 2: Try to create world with exact same name
    console.log('\n2. Testing exact duplicate world name...');
    const exactDuplicateResult = await apiCall('/worlds', {
      method: 'POST',
      body: JSON.stringify({
        name: TEST_WORLD_1,
        description: 'Duplicate world - should fail'
      })
    });

    assert(exactDuplicateResult.status === 409, 'Exact duplicate world name should return 409');
    assert(exactDuplicateResult.data.code === 'WORLD_EXISTS', 'Should return WORLD_EXISTS error code');
    assert(exactDuplicateResult.data.error.includes('already exists'), 'Error message should mention already exists');
    log('Exact duplicate correctly rejected', {
      status: exactDuplicateResult.status,
      code: exactDuplicateResult.data.code
    });

    // Step 3: Test case variations (should still fail due to kebab-case normalization)
    console.log('\n3. Testing case variation duplicate...');
    const caseVariationResult = await apiCall('/worlds', {
      method: 'POST',
      body: JSON.stringify({
        name: TEST_WORLD_1.toUpperCase(),
        description: 'Case variation - should fail'
      })
    });

    assert(caseVariationResult.status === 409, 'Case variation should also be rejected');
    assert(caseVariationResult.data.code === 'WORLD_EXISTS', 'Should return WORLD_EXISTS error code');
    log('Case variation correctly rejected', {
      original: TEST_WORLD_1,
      variation: TEST_WORLD_1.toUpperCase(),
      status: caseVariationResult.status
    });

    // Step 4: Test whitespace variation (should still fail)
    console.log('\n4. Testing whitespace variation duplicate...');
    const whitespaceVariationResult = await apiCall('/worlds', {
      method: 'POST',
      body: JSON.stringify({
        name: `  ${TEST_WORLD_1}  `,
        description: 'Whitespace variation - should fail'
      })
    });

    assert(whitespaceVariationResult.status === 409, 'Whitespace variation should also be rejected');
    log('Whitespace variation correctly rejected', {
      status: whitespaceVariationResult.status
    });

    // Step 5: Create second world with different name
    console.log('\n5. Creating second world with different name...');
    const world2Result = await apiCall('/worlds', {
      method: 'POST',
      body: JSON.stringify({
        name: TEST_WORLD_2,
        description: 'Second test world - should succeed'
      })
    });

    assert(world2Result.status === 201, 'Different world name should succeed');
    worldsCreated.push(TEST_WORLD_2);
    log('Second world created successfully', {
      name: world2Result.data.name
    });

    // SECTION 2: Agent Duplicate Name Tests
    console.log('\n=== AGENT DUPLICATE NAME TESTS ===\n');

    // Step 6: Create first agent in first world
    console.log('6. Creating first agent in first world...');
    const agent1Result = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_1)}/agents`, {
      method: 'POST',
      body: JSON.stringify({
        name: TEST_AGENT_1,
        systemPrompt: 'First test agent',
        provider: 'openai',
        model: 'gpt-4'
      })
    });

    assert(agent1Result.status === 201, 'First agent creation should succeed');
    agentsCreated.push({ world: TEST_WORLD_1, agent: TEST_AGENT_1 });
    log('First agent created', {
      name: agent1Result.data.name,
      world: TEST_WORLD_1
    });

    // Step 7: Try to create agent with same name in same world
    console.log('\n7. Testing duplicate agent name in same world...');
    const duplicateAgentResult = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_1)}/agents`, {
      method: 'POST',
      body: JSON.stringify({
        name: TEST_AGENT_1,
        systemPrompt: 'Duplicate agent - should fail'
      })
    });

    assert(duplicateAgentResult.status === 409, 'Duplicate agent name in same world should return 409');
    assert(duplicateAgentResult.data.code === 'AGENT_EXISTS', 'Should return AGENT_EXISTS error code');
    log('Duplicate agent correctly rejected', {
      status: duplicateAgentResult.status,
      code: duplicateAgentResult.data.code
    });

    // Step 8: Create agent with same name in different world (should succeed)
    console.log('\n8. Testing same agent name in different world...');
    const sameNameDiffWorldResult = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_2)}/agents`, {
      method: 'POST',
      body: JSON.stringify({
        name: TEST_AGENT_1, // Same name as agent in world 1
        systemPrompt: 'Same name different world - should succeed'
      })
    });

    assert(sameNameDiffWorldResult.status === 201, 'Same agent name in different world should succeed');
    agentsCreated.push({ world: TEST_WORLD_2, agent: TEST_AGENT_1 });
    log('Same agent name in different world allowed', {
      status: sameNameDiffWorldResult.status,
      world1Agent: TEST_AGENT_1,
      world2Agent: sameNameDiffWorldResult.data.name
    });

    // Step 9: Test agent case variation in same world
    console.log('\n9. Testing agent case variation in same world...');
    const agentCaseVariationResult = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_1)}/agents`, {
      method: 'POST',
      body: JSON.stringify({
        name: TEST_AGENT_1.toUpperCase(),
        systemPrompt: 'Case variation agent - should fail'
      })
    });

    // This should fail since agent names are case-sensitive and we check for exact duplicates
    assert(agentCaseVariationResult.status === 409, 'Agent case variation should be rejected');
    log('Agent case variation correctly rejected', {
      status: agentCaseVariationResult.status
    });

    // Step 10: Create different agent in first world
    console.log('\n10. Creating different agent in first world...');
    const differentAgentResult = await apiCall(`/worlds/${encodeURIComponent(TEST_WORLD_1)}/agents`, {
      method: 'POST',
      body: JSON.stringify({
        name: TEST_AGENT_2,
        systemPrompt: 'Different agent - should succeed'
      })
    });

    assert(differentAgentResult.status === 201, 'Different agent name should succeed');
    agentsCreated.push({ world: TEST_WORLD_1, agent: TEST_AGENT_2 });
    log('Different agent created successfully', {
      name: differentAgentResult.data.name
    });

    // SECTION 3: Edge Cases
    console.log('\n=== EDGE CASE TESTS ===\n');

    // Step 11: Test very similar world names
    console.log('11. Testing very similar world names...');
    const similarNameResult = await apiCall('/worlds', {
      method: 'POST',
      body: JSON.stringify({
        name: `${TEST_WORLD_1}-similar`,
        description: 'Similar but different name - should succeed'
      })
    });

    assert(similarNameResult.status === 201, 'Similar but different world name should succeed');
    worldsCreated.push(`${TEST_WORLD_1}-similar`);
    log('Similar world name allowed', {
      original: TEST_WORLD_1,
      similar: similarNameResult.data.name
    });

    // Step 12: Verify world state after all operations
    console.log('\n12. Verifying final world state...');
    const finalWorldsResult = await apiCall('/worlds');
    assert(finalWorldsResult.status === 200, 'World listing should succeed');

    const createdWorldCount = worldsCreated.length;
    const totalWorlds = finalWorldsResult.data.length;
    log('Final world verification', {
      createdWorlds: createdWorldCount,
      totalWorlds: totalWorlds,
      worldsCreated: worldsCreated
    });

    // Verify each created world exists
    for (const worldName of worldsCreated) {
      const worldCheckResult = await apiCall(`/worlds/${encodeURIComponent(worldName)}`);
      assert(worldCheckResult.status === 200, `World ${worldName} should exist`);

      if (worldCheckResult.data.agents) {
        const agentCount = worldCheckResult.data.agents.length;
        const expectedAgents = agentsCreated.filter(a => a.world === worldName);
        log(`World ${worldName} verification`, {
          agentCount: agentCount,
          expectedAgents: expectedAgents.length
        });
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log(boldGreen('Duplicate Name Validation Test completed successfully!'));
    console.log(green('All duplicate name checking is working correctly.'));
    console.log(green(`✓ World duplicates properly rejected (409 WORLD_EXISTS)`));
    console.log(green(`✓ Agent duplicates within world properly rejected (409 AGENT_EXISTS)`));
    console.log(green(`✓ Cross-world agent names allowed`));
    console.log(green(`✓ Case and whitespace variations properly handled`));

  } catch (error) {
    console.error('\n' + boldRed('Duplicate Name Test failed!'));
    console.error(red('Error details:'), error instanceof Error ? error.message : error);
    throw error;
  } finally {
    // Cleanup
    console.log('\n' + yellow('Cleaning up test data...'));
    await cleanupTestData();
    console.log(green('Cleanup completed.'));
  }
}

// Run if this file is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  runDuplicateNameTests().catch(console.error);
}

export { runDuplicateNameTests };
