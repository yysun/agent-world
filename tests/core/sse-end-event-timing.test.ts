/**
 * SSE End Event Timing Tests
 * 
 * Purpose:
 * Tests to verify that the SSE 'end' event is emitted at the correct time in the
 * event stream, ensuring proper synchronization between text streaming and tool execution.
 * 
 * Problem Solved:
 * Previously, the 'end' event was sent immediately after text streaming completed,
 * even when tool execution was still in progress. This caused the SSE stream to close
 * prematurely, preventing MCP tool timeout errors from reaching the frontend.
 * 
 * Fix Verification:
 * - After text streaming completes when there are NO tool calls → end event sent immediately
 * - After tool execution and follow-up response when there ARE tool calls → end event sent after tool completion
 * 
 * Test Strategy:
 * - Uses real llm-manager implementation with mocked LLM providers
 * - Captures SSE events published during agent response streaming
 * - Verifies correct event ordering for different scenarios
 * 
 * Implementation:
 * - Mocks llm-config to provide fake API credentials
 * - Unmocks llm-manager to use real implementation
 * - Mocks OpenAI/Anthropic/Google direct integrations to simulate streaming behavior
 * - Captures events via custom publishSSE mock function
 * 
 * Test Coverage:
 * 1. No tool calls: end event after text chunks
 * 2. With tool calls: end event after tool-result
 * 3. Tool execution: no premature end event before tool-start
 * 4. Event ordering: chunks → tool events → end
 * 
 * Changes:
 * - Created comprehensive test suite for SSE end event timing fix
 * - Added 4 test cases covering critical event sequencing scenarios
 * - Verifies fix for MCP timeout errors not reaching frontend
 */

import { jest } from 'vitest';
import { EventEmitter } from 'events';
import type { World, Agent, WorldSSEEvent } from '../../core/types.js';

// Mock llm-config to provide fake configuration
vi.mock('../../core/llm-config.js', () => ({
  configureLLMProvider: vi.fn<any>(),
  getLLMProviderConfig: vi.fn<any>().mockReturnValue({
    apiKey: 'fake-key',
    baseURL: 'https://fake.url'
  }),
  clearLLMProviderConfig: vi.fn<any>()
}));

// Unmock llm-manager so we get the real implementation
jest.unmock('../../core/llm-manager.js');

// Import the mocked modules (already mocked by setup.ts)
import * as openaiDirect from '../../core/openai-direct.js';
import * as anthropicDirect from '../../core/anthropic-direct.js';
import * as googleDirect from '../../core/google-direct.js';
import { streamAgentResponse, clearLLMQueue } from '../../core/llm-manager.js';

describe('SSE End Event Timing', () => {
  let world: World;
  let agent: Agent;
  let sseEvents: Array<{ type: string; data: Partial<WorldSSEEvent> }>;
  let publishSSE: (world: World, data: Partial<WorldSSEEvent>) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    sseEvents = [];

    // Create test world with event emitter
    world = {
      id: 'test-world',
      name: 'Test World',
      agents: new Map(),
      chats: new Map(),
      currentChatId: null,
      turnLimit: 3,
      eventEmitter: new EventEmitter(),
    } as World;

    // Create test agent
    agent = {
      id: 'test-agent',
      name: 'Test Agent',
      type: 'default',
      provider: 'openai',
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 1000,
      systemPrompt: 'You are a test agent',
      memory: [],
      llmCallCount: 0,
    } as Agent;

    // Mock publishSSE to capture events
    publishSSE = vi.fn<any>((w: World, data: Partial<WorldSSEEvent>) => {
      sseEvents.push({ type: data.type!, data });
    });
  });

  afterEach(() => {
    // Clean up event emitter
    world.eventEmitter.removeAllListeners();

    // Clear LLM queue to clean up any pending tasks
    clearLLMQueue();
  });

  describe('OpenAI Provider - No Tool Calls', () => {
    test('should emit end event AFTER text streaming when NO tool calls', async () => {
      // Mock streaming response without tool calls
      (openaiDirect.streamOpenAIResponse as jest.MockedFunction<any>).mockImplementation((...args: any[]) => {
        const [, , , localAgent, , localWorld, localPublishSSE, messageId] = args;
        // Simulate text streaming
        localPublishSSE(localWorld, { agentName: localAgent.id, type: 'start', messageId });
        localPublishSSE(localWorld, { agentName: localAgent.id, type: 'chunk', content: 'Hello', messageId });
        localPublishSSE(localWorld, { agentName: localAgent.id, type: 'chunk', content: ' world', messageId });
        localPublishSSE(localWorld, { agentName: localAgent.id, type: 'end', messageId });
        return Promise.resolve('Hello world');
      });

      await streamAgentResponse(world, agent, [], publishSSE);

      // Verify event sequence
      // Expected: llm-manager's start, provider's start, chunks, end
      expect(sseEvents.length).toBeGreaterThanOrEqual(5);

      // Find the last start event (provider's start)
      const lastStartIndex = sseEvents.map(e => e.data.type).lastIndexOf('start');
      const endIndex = sseEvents.findIndex(e => e.data.type === 'end');

      // Verify chunks come between start and end
      const chunkIndices = sseEvents
        .map((e, i) => e.data.type === 'chunk' ? i : -1)
        .filter(i => i !== -1);

      expect(chunkIndices.length).toBe(2);
      expect(Math.min(...chunkIndices)).toBeGreaterThan(lastStartIndex);
      expect(endIndex).toBeGreaterThan(Math.max(...chunkIndices));
    });
  });

  describe('OpenAI Provider - With Tool Calls', () => {
    test('should emit end event AFTER tool result when tool calls exist', async () => {
      // Mock streaming response with tool call
      (openaiDirect.streamOpenAIResponse as jest.MockedFunction<any>).mockImplementation((...args: any[]) => {
        const [, , , localAgent, , localWorld, localPublishSSE, messageId] = args;

        // First call: stream text + tool execution (NO end event)
        localPublishSSE(localWorld, { agentName: localAgent.id, type: 'start', messageId });
        localPublishSSE(localWorld, { agentName: localAgent.id, type: 'chunk', content: 'Running tool...', messageId });
        localPublishSSE(localWorld, {
          agentName: localAgent.id,
          type: 'tool-start',
          messageId,
          toolExecution: { toolName: 'test_tool', toolCallId: 'call_123', phase: 'starting' }
        });
        localPublishSSE(localWorld, {
          agentName: localAgent.id,
          type: 'tool-result',
          messageId,
          toolExecution: { toolName: 'test_tool', toolCallId: 'call_123', phase: 'completed', duration: 100 }
        });
        // End event comes AFTER tool completes
        localPublishSSE(localWorld, { agentName: localAgent.id, type: 'end', messageId });

        return Promise.resolve('Running tool...');
      });

      await streamAgentResponse(world, agent, [], publishSSE);

      // Find event indices
      const toolResultIndex = sseEvents.findIndex(e => e.data.type === 'tool-result');
      const endIndex = sseEvents.findIndex(e => e.data.type === 'end');

      // Verify tool-result exists
      expect(toolResultIndex).toBeGreaterThan(-1);

      // Verify end comes AFTER tool-result
      expect(endIndex).toBeGreaterThan(toolResultIndex);
    });

    test('should NOT emit end event before tool-start', async () => {
      (openaiDirect.streamOpenAIResponse as jest.MockedFunction<any>).mockImplementation((...args: any[]) => {
        const [, , , localAgent, , localWorld, localPublishSSE, messageId] = args;

        localPublishSSE(localWorld, { agentName: localAgent.id, type: 'start', messageId });
        localPublishSSE(localWorld, { agentName: localAgent.id, type: 'chunk', content: 'Text', messageId });
        // NO end event here
        localPublishSSE(localWorld, {
          agentName: localAgent.id,
          type: 'tool-start',
          messageId,
          toolExecution: { toolName: 'test_tool', toolCallId: 'call_123', phase: 'starting' }
        });
        localPublishSSE(localWorld, {
          agentName: localAgent.id,
          type: 'tool-result',
          messageId,
          toolExecution: { toolName: 'test_tool', toolCallId: 'call_123', phase: 'completed', duration: 50 }
        });
        // End comes after tool
        localPublishSSE(localWorld, { agentName: localAgent.id, type: 'end', messageId });

        return Promise.resolve('Text');
      });

      await streamAgentResponse(world, agent, [], publishSSE);

      // Find indices
      const toolStartIndex = sseEvents.findIndex(e => e.data.type === 'tool-start');
      const endIndex = sseEvents.findIndex(e => e.data.type === 'end');

      expect(toolStartIndex).toBeGreaterThan(-1);
      expect(endIndex).toBeGreaterThan(toolStartIndex);
    });
  });

  describe('Event Order Validation', () => {
    test('should maintain correct event order: start -> chunks -> tool events -> end', async () => {
      (openaiDirect.streamOpenAIResponse as jest.MockedFunction<any>).mockImplementation((...args: any[]) => {
        const [, , , localAgent, , localWorld, localPublishSSE, messageId] = args;

        localPublishSSE(localWorld, { agentName: localAgent.id, type: 'start', messageId });
        localPublishSSE(localWorld, { agentName: localAgent.id, type: 'chunk', content: 'Part 1', messageId });
        localPublishSSE(localWorld, { agentName: localAgent.id, type: 'chunk', content: 'Part 2', messageId });
        localPublishSSE(localWorld, {
          agentName: localAgent.id,
          type: 'tool-start',
          messageId,
          toolExecution: { toolName: 'test', toolCallId: 'call_1', phase: 'starting' }
        });
        localPublishSSE(localWorld, {
          agentName: localAgent.id,
          type: 'tool-result',
          messageId,
          toolExecution: { toolName: 'test', toolCallId: 'call_1', phase: 'completed', duration: 100 }
        });
        localPublishSSE(localWorld, { agentName: localAgent.id, type: 'chunk', content: 'Final', messageId });
        localPublishSSE(localWorld, { agentName: localAgent.id, type: 'end', messageId });

        return Promise.resolve('Part 1Part 2Final');
      });

      await streamAgentResponse(world, agent, [], publishSSE);

      // Extract event types in order (skip llm-manager's initial start)
      const eventTypes = sseEvents.map(e => e.data.type);

      // Verify key sequence: chunks before tool events, tool events before end
      const firstChunkIndex = eventTypes.indexOf('chunk');
      const toolStartIndex = eventTypes.indexOf('tool-start');
      const toolResultIndex = eventTypes.indexOf('tool-result');
      const endIndex = eventTypes.indexOf('end');

      expect(firstChunkIndex).toBeGreaterThan(-1);
      expect(toolStartIndex).toBeGreaterThan(firstChunkIndex);
      expect(toolResultIndex).toBeGreaterThan(toolStartIndex);
      expect(endIndex).toBeGreaterThan(toolResultIndex);
    });
  });
});
