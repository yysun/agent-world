#!/usr/bin/env npx tsx

/**
 * Integration test for memory archiving functionality
 * Tests that clearing agent memory properly archives the existing memory
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { createAgent, clearAgentMemory, getAgent, updateAgentMemory } from '../core/agent-manager';
import { AgentMessage, LLMProvider } from '../core/types';

const TEST_ROOT_PATH = './test-data/archive-test';
const TEST_WORLD_ID = 'test-world';
const TEST_AGENT_ID = 'test-agent';

async function cleanupTestData() {
  try {
    await fs.rm(TEST_ROOT_PATH, { recursive: true, force: true });
  } catch {
    // Ignore if doesn't exist
  }
}

async function testMemoryArchiving() {
  console.log('🧪 Testing memory archiving functionality...');

  try {
    // Clean up any existing test data
    await cleanupTestData();

    // 1. Create a test agent
    console.log('📝 Creating test agent...');
    const agent = await createAgent(TEST_ROOT_PATH, TEST_WORLD_ID, {
      id: TEST_AGENT_ID,
      name: 'Test Agent',
      type: 'test',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'You are a test agent for archiving functionality.'
    });

    console.log('✅ Agent created successfully');

    // 2. Add some memory to the agent
    const testMessages: AgentMessage[] = [
      {
        role: 'user',
        content: 'Hello, can you help me with something?',
        sender: 'human',
        createdAt: new Date()
      },
      {
        role: 'assistant',
        content: 'Of course! I\'d be happy to help you.',
        createdAt: new Date()
      },
      {
        role: 'user',
        content: 'What is the weather like today?',
        sender: 'human',
        createdAt: new Date()
      },
      {
        role: 'assistant',
        content: 'I don\'t have access to real-time weather data, but I can help you find weather information.',
        createdAt: new Date()
      }
    ];

    console.log('💾 Adding test messages to agent memory...');
    const updatedAgent = await updateAgentMemory(TEST_ROOT_PATH, TEST_WORLD_ID, TEST_AGENT_ID, testMessages);

    if (!updatedAgent) {
      throw new Error('Failed to update agent memory');
    }

    console.log(`✅ Added ${testMessages.length} messages to agent memory`);

    // 3. Verify memory exists before clearing
    const agentBeforeClear = await getAgent(TEST_ROOT_PATH, TEST_WORLD_ID, TEST_AGENT_ID);
    if (!agentBeforeClear || agentBeforeClear.memory.length === 0) {
      throw new Error('Agent memory should not be empty before clearing');
    }

    console.log(`📊 Agent memory before clearing: ${agentBeforeClear.memory.length} messages`);

    // 4. Clear the agent memory (should archive first)
    console.log('🗂️  Clearing agent memory (with archiving)...');
    const clearedAgent = await clearAgentMemory(TEST_ROOT_PATH, TEST_WORLD_ID, TEST_AGENT_ID);

    if (!clearedAgent) {
      throw new Error('Failed to clear agent memory');
    }

    console.log('✅ Agent memory cleared successfully');

    // 5. Verify memory is empty after clearing
    if (clearedAgent.memory.length !== 0) {
      throw new Error(`Agent memory should be empty after clearing, but has ${clearedAgent.memory.length} messages`);
    }

    console.log('📊 Agent memory after clearing: 0 messages');

    // 6. Check that archive directory was created
    const agentDir = path.join(TEST_ROOT_PATH, TEST_WORLD_ID, 'agents', TEST_AGENT_ID);
    const archiveDir = path.join(agentDir, 'archive');

    try {
      const archiveFiles = await fs.readdir(archiveDir);
      const memoryArchives = archiveFiles.filter(file => file.startsWith('memory-') && file.endsWith('.json'));

      if (memoryArchives.length === 0) {
        throw new Error('No memory archive files found');
      }

      console.log(`📂 Found ${memoryArchives.length} archive file(s): ${memoryArchives.join(', ')}`);

      // 7. Verify archive content
      const latestArchive = memoryArchives.sort().pop()!;
      const archivePath = path.join(archiveDir, latestArchive);
      const archiveContent = JSON.parse(await fs.readFile(archivePath, 'utf8'));

      if (!Array.isArray(archiveContent) || archiveContent.length !== testMessages.length) {
        throw new Error(`Archive should contain ${testMessages.length} messages, but has ${archiveContent.length}`);
      }

      console.log(`✅ Archive contains ${archiveContent.length} messages as expected`);

      // 8. Verify archive content matches original messages
      for (let i = 0; i < testMessages.length; i++) {
        const original = testMessages[i];
        const archived = archiveContent[i];

        if (original.role !== archived.role || original.content !== archived.content) {
          throw new Error(`Message ${i} content mismatch between original and archive`);
        }
      }

      console.log('✅ Archive content matches original messages');

    } catch (error) {
      throw new Error(`Failed to access archive directory: ${error}`);
    }

    console.log('🎉 All tests passed! Memory archiving works correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    // Clean up test data
    await cleanupTestData();
    console.log('🧹 Test data cleaned up');
  }
}

// Run the test
testMemoryArchiving();
