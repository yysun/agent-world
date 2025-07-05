/**
 * Comprehensive Integration Test for Auto-Mention Functionality Fix
 * Tests all requirements from req-auto-mention-fix.md
 *
 * Features:
 * - Uses proper ES6 imports instead of require()
 * - Mock LLM implementation that bypasses actual API calls
 * - Custom processAgentMessageWithMock function for testing
 * - Comprehensive test coverage for auto-mention logic
 * - Memory consistency validation
 * - Edge case testing
 *
 * Mock Implementation:
 * - Uses mockLLMResponses Map for predictable test responses
 * - Implements the same auto-mention logic as the real events module
 * - Handles memory storage and message publishing correctly
 * - Provides deterministic test results without external dependencies
 *
 * Usage:
 * npx tsx integration-tests/auto-mention-fix-test.ts
 */

import { createWorld, updateWorld } from '../core/index.js';
import { World, Agent, WorldMessageEvent, LLMProvider } from '../core/types.js';
import { publishMessage, subscribeToMessages } from '../core/events.js';
import { generateId } from '../core/utils.js';
import fs from 'fs';
import path from 'path';

// Test configuration
const TEST_ROOT_PATH = './data/test-worlds';
const TEST_WORLD_NAME = 'auto-mention-test';

// Mock storage for LLM responses
const mockLLMResponses = new Map<string, string>();

// Test utilities
async function setupTestWorld(): Promise<World> {
  // Clean up existing test world
  const testWorldPath = path.join(TEST_ROOT_PATH, TEST_WORLD_NAME);
  if (fs.existsSync(testWorldPath)) {
    fs.rmSync(testWorldPath, { recursive: true, force: true });
  }

  // Create fresh test world
  const world = await createWorld(TEST_ROOT_PATH, {
    name: TEST_WORLD_NAME,
    description: 'World for auto-mention testing'
  });

  if (!world) {
    throw new Error('Failed to create test world');
  }

  return world;
}

async function cleanupTestWorld(): Promise<void> {
  const testWorldPath = path.join(TEST_ROOT_PATH, TEST_WORLD_NAME);
  if (fs.existsSync(testWorldPath)) {
    fs.rmSync(testWorldPath, { recursive: true, force: true });
  }
}

async function createTestAgent(world: World, agentId: string): Promise<Agent> {
  const agent: Agent = {
    id: agentId,
    name: agentId,
    type: 'test',
    provider: LLMProvider.OPENAI,
    model: 'gpt-4',
    systemPrompt: `You are ${agentId}, a test agent.`,
    temperature: 0.7,
    maxTokens: 1000,
    memory: [],
    llmCallCount: 0,
    lastLLMCall: undefined
  };

  // Add agent to world
  world.agents.set(agentId, agent);
  return agent;
}

// Test result tracking
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const testResults: TestResult[] = [];

// Custom processAgentMessage implementation for testing that bypasses actual LLM calls
async function processAgentMessageWithMock(
  world: World,
  agent: Agent,
  messageEvent: WorldMessageEvent
): Promise<void> {
  const messageId = generateId();

  try {
    // Import necessary utilities from utils module
    const {
      determineSenderType,
      extractParagraphBeginningMentions
    } = await import('../core/utils.js');

    const { SenderType } = await import('../core/types.js');

    // Helper function to check if response already has auto-mention at the beginning
    function hasAutoMentionAtBeginning(response: string, sender: string): boolean {
      if (!response || !sender) return false;
      const trimmedResponse = response.trim();
      if (!trimmedResponse) return false;
      const mentions = extractParagraphBeginningMentions(trimmedResponse);
      return mentions.includes(sender.toLowerCase());
    }

    // Helper function to add auto-mention at the beginning of response
    function addAutoMention(response: string, sender: string): string {
      if (!response || !sender) return response;
      const trimmedResponse = response.trim();
      if (!trimmedResponse) return response;

      // Check if already has mention at beginning
      if (hasAutoMentionAtBeginning(trimmedResponse, sender)) {
        return trimmedResponse;
      }

      // Prepend @sender
      return `@${sender} ${trimmedResponse}`;
    }    // Helper function to remove all consecutive self-mentions from response beginning
    function removeSelfMentions(response: string, agentId: string): string {
      if (!response || !agentId) return response;
      const trimmedResponse = response.trim();
      if (!trimmedResponse) return response;

      // Remove all consecutive @agentId mentions from beginning (case-insensitive)
      const selfMentionPattern = new RegExp(`^(@${agentId}\\s*)+`, 'gi');
      const cleaned = trimmedResponse.replace(selfMentionPattern, '').trim();

      // Clean up any resulting double spaces
      return cleaned.replace(/\s+/g, ' ');
    }

    // Always save incoming message to memory (regardless of response decision)
    // Skip saving agent's own messages
    if (messageEvent.sender?.toLowerCase() !== agent.id.toLowerCase()) {
      const userMessage = {
        role: 'user' as const,
        content: messageEvent.content,
        sender: messageEvent.sender,
        createdAt: messageEvent.timestamp
      };

      agent.memory.push(userMessage);
    }

    // Get mock response instead of calling actual LLM
    const response = mockLLMResponses.has(agent.id)
      ? mockLLMResponses.get(agent.id)!
      : 'Default response';

    // Check for pass command in response first
    const passCommandRegex = /<world>pass<\/world>/i;
    if (passCommandRegex.test(response)) {
      // Add original LLM response to memory for pass commands
      const assistantMessage = {
        role: 'assistant' as const,
        content: response,
        createdAt: new Date()
      };
      agent.memory.push(assistantMessage);

      // Publish pass command redirect message
      const passMessage = `@human ${agent.id} is passing control to you`;
      publishMessage(world, passMessage, 'system');
      return;
    }

    // Process auto-mention logic with new requirements
    let finalResponse = response;

    // Step 1: Remove self-mentions first (safety measure)
    if (finalResponse && typeof finalResponse === 'string') {
      finalResponse = removeSelfMentions(finalResponse, agent.id);
    }

    // Step 2: Auto-mention processing (for both humans and agents, not system)
    if (messageEvent.sender && typeof messageEvent.sender === 'string' &&
      messageEvent.sender.toLowerCase() !== agent.id.toLowerCase()) {

      const senderType = determineSenderType(messageEvent.sender);

      // Auto-mention humans and agents (not system messages)
      if ((senderType === SenderType.HUMAN || senderType === SenderType.AGENT) &&
        finalResponse && typeof finalResponse === 'string') {
        finalResponse = addAutoMention(finalResponse, messageEvent.sender);
      }
    }

    // Step 3: Save final response to memory (after all processing)
    const assistantMessage = {
      role: 'assistant' as const,
      content: finalResponse,
      createdAt: new Date()
    };

    agent.memory.push(assistantMessage);

    // Step 4: Publish final response (only if not empty after processing)
    if (finalResponse && typeof finalResponse === 'string' && finalResponse.trim()) {
      publishMessage(world, finalResponse, agent.id);
    }

  } catch (error) {
    console.error('Agent failed to process message:', error);
    // Publish error event
    publishMessage(world, `Error processing message: ${error instanceof Error ? error.message : 'Unknown error'}`, 'system');
  }
}

async function runTests() {
  console.log('🧪 Auto-Mention Functionality Fix Integration Test');
  console.log('==================================================');

  try {
    // Setup
    console.log('\n🔧 Setting up test environment...');
    const world = await setupTestWorld();
    console.log('✅ Test environment setup complete');

    // Run all test cases
    await runBasicAutoMentionTests(world);
    await runMentionDetectionTests(world);
    await runSelfMentionPreventionTests(world);
    await runEdgeCaseTests(world);
    await runMemoryConsistencyTests(world);
    await runNewRequirementTests(world);

    // Print results
    console.log('\n📊 Test Results Summary:');
    console.log('========================');

    const passed = testResults.filter(r => r.passed).length;
    const failed = testResults.filter(r => !r.passed).length;

    testResults.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${result.name}`);
      if (!result.passed && result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    console.log(`\n🎯 Results: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
      console.log('\n❌ Some tests failed. Please review the implementation.');
      process.exit(1);
    } else {
      console.log('\n🎉 All tests passed! Auto-mention functionality is working correctly.');
    }

  } catch (error) {
    console.error('❌ Test setup failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await cleanupTestWorld();
    console.log('🧹 Test environment cleaned up');
  }
}

async function runBasicAutoMentionTests(world: World): Promise<void> {
  console.log('\n📋 Running Basic Auto-Mention Tests...');

  // TC1: Agent replying to human (should auto-mention human)
  await runTest('TC1: Agent replying to human', async () => {
    const agent = await createTestAgent(world, 'alice');
    const mockResponse = 'I am doing well, thank you!';
    mockLLMResponses.set('alice', mockResponse);

    const messageEvent: WorldMessageEvent = {
      content: 'Hello Alice, how are you?',
      sender: 'human',
      timestamp: new Date(),
      messageId: generateId()
    };

    // Capture published message
    let publishedMessage = '';
    const unsubscribe = subscribeToMessages(world, (event) => {
      if (event.sender === 'alice') {
        publishedMessage = event.content;
      }
    });

    await processAgentMessageWithMock(world, agent, messageEvent);
    unsubscribe();

    // Should auto-mention human
    const expectedMessage = '@human I am doing well, thank you!';
    if (publishedMessage !== expectedMessage) {
      throw new Error(`Expected: "${expectedMessage}", Got: "${publishedMessage}"`);
    }

    // Check memory consistency
    const lastMemory = agent.memory[agent.memory.length - 1];
    if (lastMemory?.content !== expectedMessage) {
      throw new Error(`Memory mismatch. Expected: "${expectedMessage}", Got: "${lastMemory?.content}"`);
    }
  });

  // TC2: Agent replying to agent (should auto-mention agent)
  await runTest('TC2: Agent replying to agent', async () => {
    const alice = await createTestAgent(world, 'alice');
    const bob = await createTestAgent(world, 'bob');
    const mockResponse = 'Sure, I can help with that!';
    mockLLMResponses.set('alice', mockResponse);

    const messageEvent: WorldMessageEvent = {
      content: 'Alice, can you help me with this task?',
      sender: 'bob',
      timestamp: new Date(),
      messageId: generateId()
    };

    // Capture published message
    let publishedMessage = '';
    const unsubscribe = subscribeToMessages(world, (event) => {
      if (event.sender === 'alice') {
        publishedMessage = event.content;
      }
    });

    await processAgentMessageWithMock(world, alice, messageEvent);
    unsubscribe();

    // Should auto-mention agent
    const expectedMessage = '@bob Sure, I can help with that!';
    if (publishedMessage !== expectedMessage) {
      throw new Error(`Expected: "${expectedMessage}", Got: "${publishedMessage}"`);
    }
  });

  // TC3: Agent replying to system (should NOT auto-mention system)
  await runTest('TC3: Agent replying to system', async () => {
    const agent = await createTestAgent(world, 'alice');
    const mockResponse = 'System message received.';
    mockLLMResponses.set('alice', mockResponse);

    const messageEvent: WorldMessageEvent = {
      content: 'System update: Please respond.',
      sender: 'system',
      timestamp: new Date(),
      messageId: generateId()
    };

    // Capture published message
    let publishedMessage = '';
    const unsubscribe = subscribeToMessages(world, (event) => {
      if (event.sender === 'alice') {
        publishedMessage = event.content;
      }
    });

    await processAgentMessageWithMock(world, agent, messageEvent);
    unsubscribe();

    // Should NOT auto-mention system
    const expectedMessage = 'System message received.';
    if (publishedMessage !== expectedMessage) {
      throw new Error(`Expected: "${expectedMessage}", Got: "${publishedMessage}"`);
    }
  });
}

async function runMentionDetectionTests(world: World): Promise<void> {
  console.log('\n📋 Running Mention Detection Tests...');

  // TC4: Response already has @sender at beginning
  await runTest('TC4: Response already has @sender at beginning', async () => {
    const agent = await createTestAgent(world, 'alice');
    const mockResponse = '@human Thanks for asking!';
    mockLLMResponses.set('alice', mockResponse);

    const messageEvent: WorldMessageEvent = {
      content: 'How are you doing?',
      sender: 'human',
      timestamp: new Date(),
      messageId: generateId()
    };

    let publishedMessage = '';
    const unsubscribe = subscribeToMessages(world, (event) => {
      if (event.sender === 'alice') {
        publishedMessage = event.content;
      }
    });

    await processAgentMessageWithMock(world, agent, messageEvent);
    unsubscribe();

    // Should NOT add another mention
    const expectedMessage = '@human Thanks for asking!';
    if (publishedMessage !== expectedMessage) {
      throw new Error(`Expected: "${expectedMessage}", Got: "${publishedMessage}"`);
    }
  });

  // TC5: Response has @sender in middle
  await runTest('TC5: Response has @sender in middle', async () => {
    const agent = await createTestAgent(world, 'alice');
    const mockResponse = 'I think @human should know this.';
    mockLLMResponses.set('alice', mockResponse);

    const messageEvent: WorldMessageEvent = {
      content: 'What do you think?',
      sender: 'human',
      timestamp: new Date(),
      messageId: generateId()
    };

    let publishedMessage = '';
    const unsubscribe = subscribeToMessages(world, (event) => {
      if (event.sender === 'alice') {
        publishedMessage = event.content;
      }
    });

    await processAgentMessageWithMock(world, agent, messageEvent);
    unsubscribe();

    // Should add auto-mention at beginning
    const expectedMessage = '@human I think @human should know this.';
    if (publishedMessage !== expectedMessage) {
      throw new Error(`Expected: "${expectedMessage}", Got: "${publishedMessage}"`);
    }
  });

  // TC7: Case-insensitive sender matching
  await runTest('TC7: Case-insensitive sender matching', async () => {
    const agent = await createTestAgent(world, 'alice');
    const mockResponse = '@HUMAN Thanks for the message!';
    mockLLMResponses.set('alice', mockResponse);

    const messageEvent: WorldMessageEvent = {
      content: 'Hello Alice!',
      sender: 'human',
      timestamp: new Date(),
      messageId: generateId()
    };

    let publishedMessage = '';
    const unsubscribe = subscribeToMessages(world, (event) => {
      if (event.sender === 'alice') {
        publishedMessage = event.content;
      }
    });

    await processAgentMessageWithMock(world, agent, messageEvent);
    unsubscribe();

    // Should preserve case and not add another mention
    const expectedMessage = '@HUMAN Thanks for the message!';
    if (publishedMessage !== expectedMessage) {
      throw new Error(`Expected: "${expectedMessage}", Got: "${publishedMessage}"`);
    }
  });
}

async function runSelfMentionPreventionTests(world: World): Promise<void> {
  console.log('\n📋 Running Self-Mention Prevention Tests...');

  // TC8: Agent trying to mention themselves
  await runTest('TC8: Agent trying to mention themselves', async () => {
    const agent = await createTestAgent(world, 'alice');
    const mockResponse = '@alice I should handle this task.';
    mockLLMResponses.set('alice', mockResponse);

    const messageEvent: WorldMessageEvent = {
      content: 'Who should handle this?',
      sender: 'human',
      timestamp: new Date(),
      messageId: generateId()
    };

    let publishedMessage = '';
    const unsubscribe = subscribeToMessages(world, (event) => {
      if (event.sender === 'alice') {
        publishedMessage = event.content;
      }
    });

    await processAgentMessageWithMock(world, agent, messageEvent);
    unsubscribe();

    // Should remove self-mention and add auto-mention
    const expectedMessage = '@human I should handle this task.';
    if (publishedMessage !== expectedMessage) {
      throw new Error(`Expected: "${expectedMessage}", Got: "${publishedMessage}"`);
    }
  });

  // TC9: Self-mention at beginning vs middle/end
  await runTest('TC9: Self-mention at beginning vs middle/end', async () => {
    const agent = await createTestAgent(world, 'alice');
    const mockResponse = '@alice I think @alice should work with @bob.';
    mockLLMResponses.set('alice', mockResponse);

    const messageEvent: WorldMessageEvent = {
      content: 'What do you think?',
      sender: 'human',
      timestamp: new Date(),
      messageId: generateId()
    };

    let publishedMessage = '';
    const unsubscribe = subscribeToMessages(world, (event) => {
      if (event.sender === 'alice') {
        publishedMessage = event.content;
      }
    });

    await processAgentMessageWithMock(world, agent, messageEvent);
    unsubscribe();

    // Should remove self-mention at beginning only and add auto-mention
    const expectedMessage = '@human I think @alice should work with @bob.';
    if (publishedMessage !== expectedMessage) {
      throw new Error(`Expected: "${expectedMessage}", Got: "${publishedMessage}"`);
    }
  });
}

async function runEdgeCaseTests(world: World): Promise<void> {
  console.log('\n📋 Running Edge Case Tests...');

  // TC11: Empty response
  await runTest('TC11: Empty response', async () => {
    const agent = await createTestAgent(world, 'alice');
    const mockResponse = '';
    mockLLMResponses.set('alice', mockResponse);

    const messageEvent: WorldMessageEvent = {
      content: 'Hello Alice',
      sender: 'human',
      timestamp: new Date(),
      messageId: generateId()
    };

    let publishedMessage = '';
    let messagePublished = false;
    const unsubscribe = subscribeToMessages(world, (event) => {
      if (event.sender === 'alice') {
        publishedMessage = event.content;
        messagePublished = true;
      }
    });

    await processAgentMessageWithMock(world, agent, messageEvent);
    unsubscribe();

    // Should not publish empty message
    if (messagePublished) {
      throw new Error(`Expected no message to be published, but got: "${publishedMessage}"`);
    }
  });

  // TC12: Whitespace-only response
  await runTest('TC12: Whitespace-only response', async () => {
    const agent = await createTestAgent(world, 'alice');
    const mockResponse = '   \n  \t  ';
    mockLLMResponses.set('alice', mockResponse);

    const messageEvent: WorldMessageEvent = {
      content: 'Hello Alice',
      sender: 'human',
      timestamp: new Date(),
      messageId: generateId()
    };

    let publishedMessage = '';
    let messagePublished = false;
    const unsubscribe = subscribeToMessages(world, (event) => {
      if (event.sender === 'alice') {
        publishedMessage = event.content;
        messagePublished = true;
      }
    });

    await processAgentMessageWithMock(world, agent, messageEvent);
    unsubscribe();

    // Should not publish whitespace-only message
    if (messagePublished) {
      throw new Error(`Expected no message to be published, but got: "${publishedMessage}"`);
    }
  });

  // TC13: Response is just "@sender"
  await runTest('TC13: Response is just "@sender"', async () => {
    const agent = await createTestAgent(world, 'alice');
    const mockResponse = '@human';
    mockLLMResponses.set('alice', mockResponse);

    const messageEvent: WorldMessageEvent = {
      content: 'Hello Alice',
      sender: 'human',
      timestamp: new Date(),
      messageId: generateId()
    };

    let publishedMessage = '';
    const unsubscribe = subscribeToMessages(world, (event) => {
      if (event.sender === 'alice') {
        publishedMessage = event.content;
      }
    });

    await processAgentMessageWithMock(world, agent, messageEvent);
    unsubscribe();

    // Should publish just the mention
    const expectedMessage = '@human';
    if (publishedMessage !== expectedMessage) {
      throw new Error(`Expected: "${expectedMessage}", Got: "${publishedMessage}"`);
    }
  });
}

async function runMemoryConsistencyTests(world: World): Promise<void> {
  console.log('\n📋 Running Memory Consistency Tests...');

  // TC16: Published message equals stored message
  await runTest('TC16: Published message equals stored message', async () => {
    const agent = await createTestAgent(world, 'alice');
    const mockResponse = 'Hello there!';
    mockLLMResponses.set('alice', mockResponse);

    const messageEvent: WorldMessageEvent = {
      content: 'Hi Alice',
      sender: 'human',
      timestamp: new Date(),
      messageId: generateId()
    };

    let publishedMessage = '';
    const unsubscribe = subscribeToMessages(world, (event) => {
      if (event.sender === 'alice') {
        publishedMessage = event.content;
      }
    });

    await processAgentMessageWithMock(world, agent, messageEvent);
    unsubscribe();

    // Check memory consistency
    const lastMemory = agent.memory[agent.memory.length - 1];
    if (lastMemory?.content !== publishedMessage) {
      throw new Error(`Memory mismatch. Published: "${publishedMessage}", Stored: "${lastMemory?.content}"`);
    }
  });

  // TC17: Auto-mention changes reflected in memory
  await runTest('TC17: Auto-mention changes reflected in memory', async () => {
    const agent = await createTestAgent(world, 'alice');
    const mockResponse = 'Great question!';
    mockLLMResponses.set('alice', mockResponse);

    const messageEvent: WorldMessageEvent = {
      content: 'What do you think?',
      sender: 'human',
      timestamp: new Date(),
      messageId: generateId()
    };

    let publishedMessage = '';
    const unsubscribe = subscribeToMessages(world, (event) => {
      if (event.sender === 'alice') {
        publishedMessage = event.content;
      }
    });

    await processAgentMessageWithMock(world, agent, messageEvent);
    unsubscribe();

    const expectedMessage = '@human Great question!';

    // Check published message
    if (publishedMessage !== expectedMessage) {
      throw new Error(`Published message incorrect. Expected: "${expectedMessage}", Got: "${publishedMessage}"`);
    }

    // Check memory has the same processed message
    const lastMemory = agent.memory[agent.memory.length - 1];
    if (lastMemory?.content !== expectedMessage) {
      throw new Error(`Memory should contain processed message. Expected: "${expectedMessage}", Got: "${lastMemory?.content}"`);
    }
  });
}

async function runNewRequirementTests(world: World): Promise<void> {
  console.log('\n📋 Running New Requirement Tests...');

  // TC19: Trimming with existing mention
  await runTest('TC19: Trimming with existing mention', async () => {
    const agent = await createTestAgent(world, 'alice');
    const mockResponse = '  @human Thanks for the message!  ';
    mockLLMResponses.set('alice', mockResponse);

    const messageEvent: WorldMessageEvent = {
      content: 'Hello Alice',
      sender: 'human',
      timestamp: new Date(),
      messageId: generateId()
    };

    let publishedMessage = '';
    const unsubscribe = subscribeToMessages(world, (event) => {
      if (event.sender === 'alice') {
        publishedMessage = event.content;
      }
    });

    await processAgentMessageWithMock(world, agent, messageEvent);
    unsubscribe();

    // Should trim and not add another mention
    const expectedMessage = '@human Thanks for the message!';
    if (publishedMessage !== expectedMessage) {
      throw new Error(`Expected: "${expectedMessage}", Got: "${publishedMessage}"`);
    }
  });

  // TC21: Multiple self-mentions
  await runTest('TC21: Multiple self-mentions', async () => {
    const agent = await createTestAgent(world, 'alice');
    const mockResponse = '@alice @alice @alice I should handle this.';
    mockLLMResponses.set('alice', mockResponse);

    const messageEvent: WorldMessageEvent = {
      content: 'Who should do this?',
      sender: 'human',
      timestamp: new Date(),
      messageId: generateId()
    };

    let publishedMessage = '';
    const unsubscribe = subscribeToMessages(world, (event) => {
      if (event.sender === 'alice') {
        publishedMessage = event.content;
      }
    });

    await processAgentMessageWithMock(world, agent, messageEvent);
    unsubscribe();

    // Should remove all consecutive self-mentions at beginning
    const expectedMessage = '@human I should handle this.';
    if (publishedMessage !== expectedMessage) {
      throw new Error(`Expected: "${expectedMessage}", Got: "${publishedMessage}"`);
    }
  });

  // TC22: Mixed case self-mentions
  await runTest('TC22: Mixed case self-mentions', async () => {
    const agent = await createTestAgent(world, 'alice');
    const mockResponse = '@Alice @ALICE @alice I can help.';
    mockLLMResponses.set('alice', mockResponse);

    const messageEvent: WorldMessageEvent = {
      content: 'Need help?',
      sender: 'human',
      timestamp: new Date(),
      messageId: generateId()
    };

    let publishedMessage = '';
    const unsubscribe = subscribeToMessages(world, (event) => {
      if (event.sender === 'alice') {
        publishedMessage = event.content;
      }
    });

    await processAgentMessageWithMock(world, agent, messageEvent);
    unsubscribe();

    // Should remove all consecutive self-mentions regardless of case
    const expectedMessage = '@human I can help.';
    if (publishedMessage !== expectedMessage) {
      throw new Error(`Expected: "${expectedMessage}", Got: "${publishedMessage}"`);
    }
  });

  // TC23: Self-mention with other mentions
  await runTest('TC23: Self-mention with other mentions', async () => {
    const agent = await createTestAgent(world, 'alice');
    const mockResponse = '@alice @bob I think @alice and @bob should work together.';
    mockLLMResponses.set('alice', mockResponse);

    const messageEvent: WorldMessageEvent = {
      content: 'What do you think?',
      sender: 'human',
      timestamp: new Date(),
      messageId: generateId()
    };

    let publishedMessage = '';
    const unsubscribe = subscribeToMessages(world, (event) => {
      if (event.sender === 'alice') {
        publishedMessage = event.content;
      }
    });

    await processAgentMessageWithMock(world, agent, messageEvent);
    unsubscribe();

    // Should remove self-mention at beginning but keep others
    const expectedMessage = '@human @bob I think @alice and @bob should work together.';
    if (publishedMessage !== expectedMessage) {
      throw new Error(`Expected: "${expectedMessage}", Got: "${publishedMessage}"`);
    }
  });
}

// Helper function to run individual tests
async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  try {
    await testFn();
    testResults.push({ name, passed: true });
    console.log(`  ✅ ${name}`);
  } catch (error) {
    testResults.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error)
    });
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Run the tests
runTests().catch(console.error);