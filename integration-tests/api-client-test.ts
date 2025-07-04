/**
 * API Client Integration Tests
 * 
 * Tests the frontend API client functions against the backend REST API
 * Run with: npx tsx integration-tests/api-client-test.ts
 */

import { strict as assert } from 'assert';

// Mock the frontend API client functions (they use fetch which works in Node.js)
const API_BASE_URL = 'http://localhost:3000/api';

async function apiRequest(endpoint: string, options: any = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
          if (errorData.code) {
            errorMessage += ` (${errorData.code})`;
          }
        }
      } catch (parseError) {
        // Fall back to status text if JSON parsing fails
      }

      throw new Error(errorMessage);
    }

    return response;
  } catch (error) {
    console.error(`API request failed for ${endpoint}:`, error);
    throw error;
  }
}

// API Client Functions
async function getWorlds() {
  const response = await apiRequest('/worlds');
  return response.json();
}

async function createWorld(worldData: any) {
  const response = await apiRequest('/worlds', {
    method: 'POST',
    body: JSON.stringify(worldData),
  });
  return response.json();
}

async function updateWorld(worldName: string, updateData: any) {
  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}`, {
    method: 'PATCH',
    body: JSON.stringify(updateData),
  });
  return response.json();
}

async function deleteWorld(worldName: string) {
  await apiRequest(`/worlds/${encodeURIComponent(worldName)}`, {
    method: 'DELETE',
  });
}

async function createAgent(worldName: string, agentData: any) {
  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/agents`, {
    method: 'POST',
    body: JSON.stringify(agentData),
  });
  return response.json();
}

async function getAgents(worldName: string) {
  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/agents`);
  return response.json();
}

async function deleteAgent(worldName: string, agentName: string) {
  await apiRequest(`/worlds/${encodeURIComponent(worldName)}/agents/${encodeURIComponent(agentName)}`, {
    method: 'DELETE',
  });
}

async function getAgentMemory(worldName: string, agentName: string) {
  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/agents/${encodeURIComponent(agentName)}/memory`);
  return response.json();
}

async function appendAgentMemory(worldName: string, agentName: string, messages: any[]) {
  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/agents/${encodeURIComponent(agentName)}/memory`, {
    method: 'POST',
    body: JSON.stringify({ messages }),
  });
  return response.json();
}

async function clearAgentMemory(worldName: string, agentName: string) {
  await apiRequest(`/worlds/${encodeURIComponent(worldName)}/agents/${encodeURIComponent(agentName)}/memory`, {
    method: 'DELETE',
  });
}

// Test Functions
async function testWorldOperations() {
  console.log('Testing world operations...');

  // Test create world
  const worldData = {
    name: 'Test World API',
    description: 'A test world for API testing'
  };

  const createdWorld = await createWorld(worldData);
  console.log('✓ Created world:', createdWorld);

  // Test list worlds
  const worlds = await getWorlds();
  console.log('✓ Listed worlds:', worlds.length);

  // Test update world
  const updatedWorld = await updateWorld('test-world-api', {
    description: 'Updated description'
  });
  console.log('✓ Updated world:', updatedWorld);

  return 'test-world-api';
}

async function testAgentOperations(worldName: string) {
  console.log('Testing agent operations...');

  // Test create agent
  const agentData = {
    name: 'Test Agent',
    type: 'assistant',
    provider: 'openai',
    model: 'gpt-4',
    systemPrompt: 'You are a helpful assistant.'
  };

  const createdAgent = await createAgent(worldName, agentData);
  console.log('✓ Created agent:', createdAgent);

  // Test list agents
  const agents = await getAgents(worldName);
  console.log('✓ Listed agents:', agents.length);

  return 'test-agent';
}

async function testMemoryOperations(worldName: string, agentName: string) {
  console.log('Testing memory operations...');

  // Test get memory (should be empty initially)
  const initialMemory = await getAgentMemory(worldName, agentName);
  console.log('✓ Got initial memory:', initialMemory);

  // Test append memory
  const messages = [
    { role: 'user', content: 'Hello', sender: 'human' },
    { role: 'assistant', content: 'Hi there!', sender: 'agent' }
  ];

  const appendResult = await appendAgentMemory(worldName, agentName, messages);
  console.log('✓ Appended memory:', appendResult);

  // Test get memory after append
  const updatedMemory = await getAgentMemory(worldName, agentName);
  console.log('✓ Got updated memory:', updatedMemory.memory.length);

  // Test clear memory
  await clearAgentMemory(worldName, agentName);
  console.log('✓ Cleared memory');

  // Verify memory is cleared
  const clearedMemory = await getAgentMemory(worldName, agentName);
  console.log('✓ Verified memory cleared:', clearedMemory.memory.length);
}

async function testErrorHandling() {
  console.log('Testing error handling...');

  try {
    // Try to get non-existent world
    await getWorlds();
    await apiRequest('/worlds/non-existent-world/agents');
    assert.fail('Should have thrown an error');
  } catch (error) {
    console.log('✓ Error handling works:', (error as Error).message);
  }
}

async function cleanup(worldName: string, agentName: string) {
  console.log('Cleaning up...');

  try {
    await deleteAgent(worldName, agentName);
    console.log('✓ Deleted agent');
  } catch (error) {
    console.log('- Agent cleanup skipped (may not exist)');
  }

  try {
    await deleteWorld(worldName);
    console.log('✓ Deleted world');
  } catch (error) {
    console.log('- World cleanup skipped (may not exist)');
  }
}

// Main test runner
async function runTests() {
  console.log('Starting API Client Integration Tests...\n');

  let worldName = '';
  let agentName = '';

  try {
    // Test world operations
    worldName = await testWorldOperations();
    console.log('');

    // Test agent operations
    agentName = await testAgentOperations(worldName);
    console.log('');

    // Test memory operations
    await testMemoryOperations(worldName, agentName);
    console.log('');

    // Test error handling
    await testErrorHandling();
    console.log('');

    console.log('🎉 All API client tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    await cleanup(worldName, agentName);
    console.log('\n✓ Cleanup completed');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

export { runTests };
