/**
 * Unit Tests for Tool Utilities Module
 *
 * Features:
 * - Tests filterAndHandleEmptyNamedFunctionCalls function
 * - Validates filtering of calls with empty or missing names
 * - Verifies tool result creation for invalid calls
 * - Ensures SSE events are published for errors
 *
 * Implementation:
 * - Tests with various invalid name scenarios (empty string, missing, whitespace)
 * - Tests with valid calls to ensure they pass through
 * - Tests with mixed valid and invalid calls
 * - Verifies tool_call_id handling with fallback
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { filterAndHandleEmptyNamedFunctionCalls } from '../../core/tool-utils.js';
import type { World, Agent, WorldSSEEvent } from '../../core/types.js';
import { LLMProvider } from '../../core/types.js';
import { EventEmitter } from 'events';

describe('Tool Utils - filterAndHandleEmptyNamedFunctionCalls', () => {
  let mockWorld: World;
  let mockAgent: Agent;
  let mockPublishSSE: jest.Mock<(world: World, data: Partial<WorldSSEEvent>) => void>;
  const testMessageId = 'msg-test-123';

  beforeEach(() => {
    mockWorld = {
      id: 'test-world',
      name: 'Test World',
      description: 'Test world for tool utils',
      turnLimit: 10,
      createdAt: new Date(),
      lastUpdated: new Date(),
      totalAgents: 0,
      totalMessages: 0,
      agents: new Map(),
      chats: new Map(),
      eventEmitter: new EventEmitter(),
    };

    mockAgent = {
      id: 'test-agent',
      name: 'Test Agent',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'You are a helpful assistant.',
      memory: [],
      llmCallCount: 0,
      createdAt: new Date(),
      lastActive: new Date(),
    };

    mockPublishSSE = jest.fn();
  });

  test('should return only valid calls when all have names', () => {
    const functionCalls = [
      {
        id: 'call-1',
        type: 'function',
        function: { name: 'validTool', arguments: '{}' },
      },
      {
        id: 'call-2',
        type: 'function',
        function: { name: 'anotherValidTool', arguments: '{}' },
      },
    ];

    const result = filterAndHandleEmptyNamedFunctionCalls(
      functionCalls,
      mockWorld,
      mockAgent,
      mockPublishSSE,
      testMessageId
    );

    expect(result.validCalls).toHaveLength(2);
    expect(result.toolResults).toHaveLength(0);
    expect(mockPublishSSE).not.toHaveBeenCalled();
  });

  test('should filter out calls with empty name string', () => {
    const functionCalls = [
      {
        id: 'call-1',
        type: 'function',
        function: { name: '', arguments: '{}' },
      },
    ];

    const result = filterAndHandleEmptyNamedFunctionCalls(
      functionCalls,
      mockWorld,
      mockAgent,
      mockPublishSSE,
      testMessageId
    );

    expect(result.validCalls).toHaveLength(0);
    expect(result.toolResults).toHaveLength(1);
  });

  test('should filter out calls with missing name', () => {
    const functionCalls = [
      {
        id: 'call-1',
        type: 'function',
        function: { arguments: '{}' },
      },
    ];

    const result = filterAndHandleEmptyNamedFunctionCalls(
      functionCalls,
      mockWorld,
      mockAgent,
      mockPublishSSE,
      testMessageId
    );

    expect(result.validCalls).toHaveLength(0);
    expect(result.toolResults).toHaveLength(1);
  });

  test('should filter out calls with whitespace-only name', () => {
    const functionCalls = [
      {
        id: 'call-1',
        type: 'function',
        function: { name: '   ', arguments: '{}' },
      },
    ];

    const result = filterAndHandleEmptyNamedFunctionCalls(
      functionCalls,
      mockWorld,
      mockAgent,
      mockPublishSSE,
      testMessageId
    );

    expect(result.validCalls).toHaveLength(0);
    expect(result.toolResults).toHaveLength(1);
  });

  test('should create tool result with role="tool" for invalid calls', () => {
    const functionCalls = [
      {
        id: 'call-invalid',
        type: 'function',
        function: { name: '', arguments: '{}' },
      },
    ];

    const result = filterAndHandleEmptyNamedFunctionCalls(
      functionCalls,
      mockWorld,
      mockAgent,
      mockPublishSSE,
      testMessageId
    );

    expect(result.toolResults).toHaveLength(1);
    expect(result.toolResults[0].role).toBe('tool');
    expect(result.toolResults[0].tool_call_id).toBe('call-invalid');
    expect(result.toolResults[0].content).toContain('Malformed tool call');
    expect(result.toolResults[0].content).toContain('empty or missing tool name');
  });

  test('should use fallback ID when call ID is missing', () => {
    const functionCalls = [
      {
        type: 'function',
        function: { name: '', arguments: '{}' },
      },
    ];

    const result = filterAndHandleEmptyNamedFunctionCalls(
      functionCalls,
      mockWorld,
      mockAgent,
      mockPublishSSE,
      testMessageId
    );

    expect(result.toolResults).toHaveLength(1);
    expect(result.toolResults[0].tool_call_id).toBeDefined();
    expect(result.toolResults[0].tool_call_id).toMatch(/^tc-/);
  });

  test('should publish tool-error SSE event for invalid calls', () => {
    const functionCalls = [
      {
        id: 'call-bad',
        type: 'function',
        function: { name: '', arguments: '{}' },
      },
    ];

    filterAndHandleEmptyNamedFunctionCalls(
      functionCalls,
      mockWorld,
      mockAgent,
      mockPublishSSE,
      testMessageId
    );

    expect(mockPublishSSE).toHaveBeenCalledTimes(1);
    expect(mockPublishSSE).toHaveBeenCalledWith(mockWorld, {
      agentName: 'test-agent',
      type: 'tool-error',
      messageId: testMessageId,
      toolExecution: {
        toolName: '',
        toolCallId: 'call-bad',
        phase: 'failed',
        error: 'empty tool name from LLM',
      },
    });
  });

  test('should handle mixed valid and invalid calls', () => {
    const functionCalls = [
      {
        id: 'call-valid',
        type: 'function',
        function: { name: 'validTool', arguments: '{}' },
      },
      {
        id: 'call-invalid-1',
        type: 'function',
        function: { name: '', arguments: '{}' },
      },
      {
        id: 'call-valid-2',
        type: 'function',
        function: { name: 'anotherValid', arguments: '{}' },
      },
      {
        id: 'call-invalid-2',
        type: 'function',
        function: { arguments: '{}' },
      },
    ];

    const result = filterAndHandleEmptyNamedFunctionCalls(
      functionCalls,
      mockWorld,
      mockAgent,
      mockPublishSSE,
      testMessageId
    );

    expect(result.validCalls).toHaveLength(2);
    expect(result.validCalls[0].function?.name).toBe('validTool');
    expect(result.validCalls[1].function?.name).toBe('anotherValid');

    expect(result.toolResults).toHaveLength(2);
    expect(result.toolResults[0].tool_call_id).toBe('call-invalid-1');
    expect(result.toolResults[1].tool_call_id).toBe('call-invalid-2');

    expect(mockPublishSSE).toHaveBeenCalledTimes(2);
  });

  test('should handle empty functionCalls array', () => {
    const result = filterAndHandleEmptyNamedFunctionCalls(
      [],
      mockWorld,
      mockAgent,
      mockPublishSSE,
      testMessageId
    );

    expect(result.validCalls).toHaveLength(0);
    expect(result.toolResults).toHaveLength(0);
    expect(mockPublishSSE).not.toHaveBeenCalled();
  });

  test('should not throw if publishSSE fails', () => {
    const failingPublishSSE = jest.fn(() => {
      throw new Error('SSE publish failed');
    });

    const functionCalls = [
      {
        id: 'call-1',
        type: 'function',
        function: { name: '', arguments: '{}' },
      },
    ];

    expect(() => {
      filterAndHandleEmptyNamedFunctionCalls(
        functionCalls,
        mockWorld,
        mockAgent,
        failingPublishSSE as any,
        testMessageId
      );
    }).not.toThrow();
  });

  test('should use agent.name as fallback for agentName in SSE', () => {
    const agentWithoutId = {
      ...mockAgent,
      id: '',
      name: 'FallbackName',
    };

    const functionCalls = [
      {
        id: 'call-1',
        type: 'function',
        function: { name: '', arguments: '{}' },
      },
    ];

    filterAndHandleEmptyNamedFunctionCalls(
      functionCalls,
      mockWorld,
      agentWithoutId,
      mockPublishSSE,
      testMessageId
    );

    expect(mockPublishSSE).toHaveBeenCalledWith(mockWorld, expect.objectContaining({
      agentName: 'FallbackName',
    }));
  });
});
