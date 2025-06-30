/**
 * Test LLM Call Tracking and Auto-Save Features
 * 
 * This test verifies:
 * 1. LLM call count increments and saves to disk
 * 2. Turn limit reset saves to disk
 * 3. Memory auto-save after message additions
 * 4. Agent state persistence after various operations
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Agent, AgentMessage, LLMProvider } from './core/types';
import { saveAgentToDisk, loadAgentFromDisk, saveAgentMemoryToDisk } from './core/agent-storage';
import { EventEmitter } from 'events';

// Test configuration
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_ROOT_PATH = path.join(__dirname, 'test-data');
const TEST_WORLD_ID = 'test-world';
const TEST_AGENT_ID = 'test-agent';

// Mock world for testing (simplified version with only needed properties)
interface MockWorld {
  id: string;
  name: string;
  description?: string;
  rootPath: string;
  eventEmitter: EventEmitter;
  agents: Map<string, Agent>;
  turnLimit: number;
}

function createMockWorld(): MockWorld {
  return {
    id: TEST_WORLD_ID,
    name: 'Test World',
    description: 'Test world for LLM tracking',
    rootPath: TEST_ROOT_PATH,
    eventEmitter: new EventEmitter(),
    agents: new Map(),
    turnLimit: 3
  };
}

// Mock agent for testing
function createMockAgent(): Agent {
  return {
    id: TEST_AGENT_ID,
    name: 'Test Agent',
    type: 'assistant',
    status: 'active',
    provider: LLMProvider.OPENAI,
    model: 'gpt-4',
    systemPrompt: 'You are a test agent.',
    temperature: 0.7,
    maxTokens: 100,
    createdAt: new Date(),
    lastActive: new Date(),
    llmCallCount: 0,
    memory: []
  };
}

// Test utilities
async function setupTest(): Promise<void> {
  // Clean up test directory
  try {
    await fs.rm(TEST_ROOT_PATH, { recursive: true, force: true });
  } catch (error) {
    // Directory doesn't exist, which is fine
  }

  // Create test directory structure
  await fs.mkdir(path.join(TEST_ROOT_PATH, TEST_WORLD_ID, 'agents'), { recursive: true });
}

async function cleanupTest(): Promise<void> {
  try {
    await fs.rm(TEST_ROOT_PATH, { recursive: true, force: true });
  } catch (error) {
    console.warn('Failed to cleanup test directory:', error);
  }
}

async function readAgentFile(fileName: string): Promise<any> {
  const filePath = path.join(TEST_ROOT_PATH, TEST_WORLD_ID, 'agents', TEST_AGENT_ID, fileName);
  const content = await fs.readFile(filePath, 'utf8');
  return fileName.endsWith('.json') ? JSON.parse(content) : content;
}

async function fileExists(fileName: string): Promise<boolean> {
  try {
    const filePath = path.join(TEST_ROOT_PATH, TEST_WORLD_ID, 'agents', TEST_AGENT_ID, fileName);
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Test functions
async function testLLMCallCountTracking(): Promise<void> {
  console.log('\n=== Testing LLM Call Count Tracking ===');

  const agent = createMockAgent();

  // Save initial agent
  await saveAgentToDisk(TEST_ROOT_PATH, TEST_WORLD_ID, agent);
  console.log('✓ Initial agent saved');

  // Verify initial state
  let savedConfig = await readAgentFile('config.json');
  console.log(`Initial LLM call count: ${savedConfig.llmCallCount}`);
  if (savedConfig.llmCallCount !== 0) {
    throw new Error('Initial LLM call count should be 0');
  }

  // Simulate LLM call
  agent.llmCallCount++;
  agent.lastLLMCall = new Date();
  await saveAgentToDisk(TEST_ROOT_PATH, TEST_WORLD_ID, agent);
  console.log('✓ LLM call count incremented and saved');

  // Verify LLM call count was saved
  savedConfig = await readAgentFile('config.json');
  console.log(`Updated LLM call count: ${savedConfig.llmCallCount}`);
  if (savedConfig.llmCallCount !== 1) {
    throw new Error('LLM call count should be 1 after increment');
  }

  if (!savedConfig.lastLLMCall) {
    throw new Error('lastLLMCall should be set');
  }

  console.log('✓ LLM call tracking test passed');
}

async function testTurnLimitReset(): Promise<void> {
  console.log('\n=== Testing Turn Limit Reset ===');

  const agent = createMockAgent();
  agent.llmCallCount = 3; // Set to turn limit

  // Save agent with turn limit reached
  await saveAgentToDisk(TEST_ROOT_PATH, TEST_WORLD_ID, agent);
  console.log('✓ Agent saved with LLM call count at turn limit');

  // Verify turn limit state
  let savedConfig = await readAgentFile('config.json');
  console.log(`LLM call count before reset: ${savedConfig.llmCallCount}`);
  if (savedConfig.llmCallCount !== 3) {
    throw new Error('LLM call count should be 3 before reset');
  }

  // Simulate turn limit reset (human message received)
  agent.llmCallCount = 0;
  await saveAgentToDisk(TEST_ROOT_PATH, TEST_WORLD_ID, agent);
  console.log('✓ Turn limit reset and saved');

  // Verify reset was saved
  savedConfig = await readAgentFile('config.json');
  console.log(`LLM call count after reset: ${savedConfig.llmCallCount}`);
  if (savedConfig.llmCallCount !== 0) {
    throw new Error('LLM call count should be 0 after reset');
  }

  console.log('✓ Turn limit reset test passed');
}

async function testMemoryAutoSave(): Promise<void> {
  console.log('\n=== Testing Memory Auto-Save ===');

  const agent = createMockAgent();

  // Save initial agent
  await saveAgentToDisk(TEST_ROOT_PATH, TEST_WORLD_ID, agent);
  console.log('✓ Initial agent saved');

  // Verify initial memory
  let savedMemory = await readAgentFile('memory.json');
  console.log(`Initial memory length: ${savedMemory.length}`);
  if (savedMemory.length !== 0) {
    throw new Error('Initial memory should be empty');
  }

  // Add message to memory
  const userMessage: AgentMessage = {
    role: 'user',
    content: 'Hello, test agent!',
    sender: 'human',
    createdAt: new Date()
  };

  agent.memory.push(userMessage);
  await saveAgentMemoryToDisk(TEST_ROOT_PATH, TEST_WORLD_ID, agent.id, agent.memory);
  console.log('✓ User message added to memory and saved');

  // Verify memory was saved
  savedMemory = await readAgentFile('memory.json');
  console.log(`Memory length after user message: ${savedMemory.length}`);
  if (savedMemory.length !== 1) {
    throw new Error('Memory should contain 1 message after user message');
  }

  if (savedMemory[0].content !== 'Hello, test agent!') {
    throw new Error('Saved message content should match');
  }

  // Add assistant response to memory
  const assistantMessage: AgentMessage = {
    role: 'assistant',
    content: 'Hello! How can I help you?',
    createdAt: new Date()
  };

  agent.memory.push(assistantMessage);
  await saveAgentMemoryToDisk(TEST_ROOT_PATH, TEST_WORLD_ID, agent.id, agent.memory);
  console.log('✓ Assistant response added to memory and saved');

  // Verify memory was saved
  savedMemory = await readAgentFile('memory.json');
  console.log(`Memory length after assistant response: ${savedMemory.length}`);
  if (savedMemory.length !== 2) {
    throw new Error('Memory should contain 2 messages after assistant response');
  }

  if (savedMemory[1].content !== 'Hello! How can I help you?') {
    throw new Error('Saved assistant message content should match');
  }

  console.log('✓ Memory auto-save test passed');
}

async function testAgentPersistence(): Promise<void> {
  console.log('\n=== Testing Agent State Persistence ===');

  const agent = createMockAgent();

  // Set various state
  agent.llmCallCount = 2;
  agent.lastLLMCall = new Date();
  agent.lastActive = new Date();
  agent.memory = [
    { role: 'user', content: 'Test message 1', createdAt: new Date() },
    { role: 'assistant', content: 'Test response 1', createdAt: new Date() }
  ];

  // Save agent
  await saveAgentToDisk(TEST_ROOT_PATH, TEST_WORLD_ID, agent);
  console.log('✓ Agent with full state saved');

  // Load agent back
  const loadedAgent = await loadAgentFromDisk(TEST_ROOT_PATH, TEST_WORLD_ID, agent.id);
  if (!loadedAgent) {
    throw new Error('Failed to load agent from disk');
  }

  console.log('✓ Agent loaded from disk');

  // Verify all state was preserved
  if (loadedAgent.llmCallCount !== 2) {
    throw new Error(`LLM call count mismatch: expected 2, got ${loadedAgent.llmCallCount}`);
  }

  if (!loadedAgent.lastLLMCall) {
    throw new Error('lastLLMCall should be preserved');
  }

  if (loadedAgent.memory.length !== 2) {
    throw new Error(`Memory length mismatch: expected 2, got ${loadedAgent.memory.length}`);
  }

  if (loadedAgent.memory[0].content !== 'Test message 1') {
    throw new Error('First memory message content should be preserved');
  }

  if (loadedAgent.memory[1].content !== 'Test response 1') {
    throw new Error('Second memory message content should be preserved');
  }

  console.log('✓ Agent state persistence test passed');
}

async function testFileStructure(): Promise<void> {
  console.log('\n=== Testing File Structure ===');

  const agent = createMockAgent();
  agent.memory = [{ role: 'user', content: 'Test', createdAt: new Date() }];

  // Save agent
  await saveAgentToDisk(TEST_ROOT_PATH, TEST_WORLD_ID, agent);
  console.log('✓ Agent saved');

  // Verify all expected files exist
  const configExists = await fileExists('config.json');
  const memoryExists = await fileExists('memory.json');
  const promptExists = await fileExists('system-prompt.md');

  console.log(`Config file exists: ${configExists}`);
  console.log(`Memory file exists: ${memoryExists}`);
  console.log(`System prompt file exists: ${promptExists}`);

  if (!configExists) {
    throw new Error('config.json should exist');
  }

  if (!memoryExists) {
    throw new Error('memory.json should exist');
  }

  if (!promptExists) {
    throw new Error('system-prompt.md should exist');
  }

  // Verify file contents
  const config = await readAgentFile('config.json');
  const memory = await readAgentFile('memory.json');
  const prompt = await readAgentFile('system-prompt.md');

  if (config.id !== TEST_AGENT_ID) {
    throw new Error('Config should contain correct agent ID');
  }

  if (memory.length !== 1) {
    throw new Error('Memory should contain test message');
  }

  if (!prompt.includes('test agent')) {
    throw new Error('System prompt should contain agent description');
  }

  console.log('✓ File structure test passed');
}

// Main test runner
async function runTests(): Promise<void> {
  console.log('Starting LLM Call Tracking and Auto-Save Tests...');

  try {
    await setupTest();
    console.log('✓ Test environment setup complete');

    await testLLMCallCountTracking();
    await testTurnLimitReset();
    await testMemoryAutoSave();
    await testAgentPersistence();
    await testFileStructure();

    console.log('\n🎉 All tests passed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    await cleanupTest();
    console.log('✓ Test environment cleaned up');
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

export { runTests };
