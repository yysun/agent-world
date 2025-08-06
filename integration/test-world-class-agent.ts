/**
 * Integration Test: WorldClass Agent CRUD Operations
 *
 * Features:
 * - Tests WorldClass agent management methods using OOP interface
 * - Covers: agent creation, retrieval, update, listing, memory clearing, deletion
 * - Validates WorldClass wrapper consistency with core functions
 * - Tests agent lifecycle management through class methods
 *
 * Implementation:
 * - Uses WorldClass instead of direct core function calls
 * - Tests comprehensive agent operations including memory management
 * - Validates agent parameter handling and updates
 * - Designed as standalone TypeScript program with npx tsx
 *
 * Changes:
 * - Focused on WorldClass agent CRUD operations
 * - Tests agent lifecycle through class interface
 * - Validates agent parameter validation and updates
 * - Uses consistent test patterns from existing integration tests
 */

import {
  createWorld,
  disableStreaming,
} from '../core/index.js';
import { WorldClass } from '../core/world-class.js';
import type { CreateWorldParams, CreateAgentParams, UpdateAgentParams } from '../core/types.js';
import { LLMProvider } from '../core/types.js';
import { boldRed, boldGreen, boldYellow, red, green, yellow, cyan, log, assert } from './utils.js';

const ROOT_PATH = '.';

async function runWorldClassAgentTest(): Promise<void> {
  let worldClass: WorldClass | null = null;

  try {
    console.log('Starting Integration Test: WorldClass Agent CRUD Operations');
    console.log('='.repeat(70));

    disableStreaming();

    // Step 1: Create test world using core function
    console.log('\n1. Creating test world for agent operations...');
    const createWorldParams: CreateWorldParams = {
      name: 'Test World Class Agents',
      description: 'A test world for WorldClass agent integration testing',
      turnLimit: 15
    };

    const createdWorld = await createWorld(ROOT_PATH, createWorldParams);
    assert(createdWorld !== null, 'World should be created successfully');
    log('Created world', {
      id: createdWorld!.id,
      name: createdWorld!.name
    });

    // Step 2: Initialize WorldClass instance
    console.log('\n2. Initializing WorldClass instance...');
    worldClass = new WorldClass(ROOT_PATH, createdWorld!.id);
    log('WorldClass initialized for world', worldClass.id);

    // Step 3: Test creating an agent
    console.log('\n3. Testing WorldClass createAgent method...');
    const createAgentParams: CreateAgentParams = {
      name: 'Test Assistant',
      type: 'assistant',
      provider: LLMProvider.ANTHROPIC,
      model: 'claude-3-haiku-20240307',
      systemPrompt: 'You are a helpful AI assistant for testing purposes.',
      temperature: 0.7,
      maxTokens: 1000
    };

    const createdAgent = await worldClass.createAgent(createAgentParams);
    assert(createdAgent !== null, 'Agent should be created successfully');
    assert(createdAgent.name === createAgentParams.name, 'Agent name should match');
    assert(createdAgent.type === createAgentParams.type, 'Agent type should match');
    assert(createdAgent.provider === createAgentParams.provider, 'Agent provider should match');
    assert(createdAgent.model === createAgentParams.model, 'Agent model should match');
    log('Created agent', {
      id: createdAgent.id,
      name: createdAgent.name,
      type: createdAgent.type,
      provider: createdAgent.provider
    });

    // Step 4: Test getting the agent
    console.log('\n4. Testing WorldClass getAgent method...');
    const retrievedAgent = await worldClass.getAgent(createdAgent.id);
    assert(retrievedAgent !== null, 'Agent should be retrievable');
    assert(retrievedAgent!.id === createdAgent.id, 'Retrieved agent ID should match');
    assert(retrievedAgent!.name === createdAgent.name, 'Retrieved agent name should match');
    log('Retrieved agent', {
      id: retrievedAgent!.id,
      name: retrievedAgent!.name,
      systemPrompt: retrievedAgent!.systemPrompt?.substring(0, 50) + '...'
    });

    // Step 5: Test listing agents
    console.log('\n5. Testing WorldClass listAgents method...');
    const agentList = await worldClass.listAgents();
    assert(Array.isArray(agentList), 'List agents should return array');
    assert(agentList.length === 1, 'Should have exactly one agent');
    assert(agentList[0].id === createdAgent.id, 'Listed agent should match created agent');
    log('Agent list', {
      count: agentList.length,
      agents: agentList.map(a => ({ id: a.id, name: a.name }))
    });

    // Step 6: Test updating the agent
    console.log('\n6. Testing WorldClass updateAgent method...');
    const updateAgentParams: UpdateAgentParams = {
      name: 'Updated Test Assistant',
      systemPrompt: 'You are an updated helpful AI assistant for testing purposes.',
      temperature: 0.5,
      status: 'active'
    };

    const updatedAgent = await worldClass.updateAgent(createdAgent.id, updateAgentParams);
    assert(updatedAgent !== null, 'Agent update should succeed');
    assert(updatedAgent!.name === updateAgentParams.name, 'Agent name should be updated');
    assert(updatedAgent!.systemPrompt === updateAgentParams.systemPrompt, 'Agent system prompt should be updated');
    assert(updatedAgent!.temperature === updateAgentParams.temperature, 'Agent temperature should be updated');
    log('Updated agent', {
      id: updatedAgent!.id,
      name: updatedAgent!.name,
      temperature: updatedAgent!.temperature,
      systemPrompt: updatedAgent!.systemPrompt?.substring(0, 50) + '...'
    });

    // Step 7: Create a second agent for testing multiple agents
    console.log('\n7. Creating second agent for multiple agent testing...');
    const secondAgentParams: CreateAgentParams = {
      name: 'Test Researcher',
      type: 'researcher',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'You are a research assistant specialized in finding information.',
      temperature: 0.3
    };

    const secondAgent = await worldClass.createAgent(secondAgentParams);
    assert(secondAgent !== null, 'Second agent should be created successfully');
    log('Created second agent', {
      id: secondAgent.id,
      name: secondAgent.name,
      type: secondAgent.type
    });

    // Step 8: Test listing multiple agents
    console.log('\n8. Testing multiple agents listing...');
    const multipleAgentsList = await worldClass.listAgents();
    assert(multipleAgentsList.length === 2, 'Should have exactly two agents');
    log('Multiple agents list', {
      count: multipleAgentsList.length,
      agents: multipleAgentsList.map(a => ({ id: a.id, name: a.name, type: a.type }))
    });

    // Step 9: Test clearing agent memory
    console.log('\n9. Testing WorldClass clearAgentMemory method...');
    const clearedAgent = await worldClass.clearAgentMemory(createdAgent.id);
    assert(clearedAgent !== null, 'Agent memory clearing should succeed');
    assert(clearedAgent!.id === createdAgent.id, 'Cleared agent ID should match');
    log('Cleared agent memory', {
      id: clearedAgent!.id,
      name: clearedAgent!.name
    });

    // Step 10: Test getting non-existent agent
    console.log('\n10. Testing getAgent with non-existent agent...');
    const nonExistentAgent = await worldClass.getAgent('non-existent-agent');
    assert(nonExistentAgent === null, 'Non-existent agent should return null');
    console.log(green('✅ Non-existent agent correctly returns null'));

    // Step 11: Test deleting an agent
    console.log('\n11. Testing WorldClass deleteAgent method...');
    const deleteResult = await worldClass.deleteAgent(secondAgent.id);
    assert(deleteResult === true, 'Agent deletion should return true');
    log('Agent deleted successfully', deleteResult);

    // Step 12: Verify agent deletion
    console.log('\n12. Verifying agent deletion...');
    const agentsAfterDelete = await worldClass.listAgents();
    assert(agentsAfterDelete.length === 1, 'Should have one agent after deletion');
    assert(agentsAfterDelete[0].id === createdAgent.id, 'Remaining agent should be the first one');

    const deletedAgent = await worldClass.getAgent(secondAgent.id);
    assert(deletedAgent === null, 'Deleted agent should not be retrievable');
    log('Agents after deletion', {
      count: agentsAfterDelete.length,
      remaining: agentsAfterDelete.map(a => ({ id: a.id, name: a.name }))
    });

    // Step 13: Test updating non-existent agent
    console.log('\n13. Testing updateAgent with non-existent agent...');
    const nonExistentUpdate = await worldClass.updateAgent('non-existent-agent', { name: 'Should Fail' });
    assert(nonExistentUpdate === null, 'Updating non-existent agent should return null');
    console.log(green('✅ Non-existent agent update correctly returns null'));

    // Step 14: Test deleting non-existent agent
    console.log('\n14. Testing deleteAgent with non-existent agent...');
    const nonExistentDelete = await worldClass.deleteAgent('non-existent-agent');
    assert(nonExistentDelete === false, 'Deleting non-existent agent should return false');
    console.log(green('✅ Non-existent agent deletion correctly returns false'));

    console.log('\n' + '='.repeat(70));
    console.log(boldGreen('Integration test completed successfully!'));
    console.log(green('All WorldClass agent CRUD operations working correctly.'));

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
  } finally {
    // Cleanup test world
    if (worldClass) {
      try {
        await worldClass.delete();
        console.log(cyan('Cleanup: Test world deleted successfully'));
      } catch (cleanupError) {
        console.log(red('Final cleanup failed:'), cleanupError);
      }
    }
  }
}

// Run the test
runWorldClassAgentTest();
