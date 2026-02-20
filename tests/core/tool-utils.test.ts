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
 *
 * Recent changes:
 * - 2026-02-20: Added alias normalization coverage for `create_agent` (`auto-reply` and `next agent` variants).
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { filterAndHandleEmptyNamedFunctionCalls, validateToolParameters } from '../../core/tool-utils.js';
import type { World, Agent } from '../../core/types.js';
import { LLMProvider } from '../../core/types.js';
import { EventEmitter } from 'events';
import * as events from '../../core/events/index.js';

// Mock publishToolEvent
vi.mock('../../core/events/index.js', () => ({
  publishToolEvent: vi.fn(),
}));

describe('Tool Utils - filterAndHandleEmptyNamedFunctionCalls', () => {
  let mockWorld: World;
  let mockAgent: Agent;
  const testMessageId = 'msg-test-123';

  beforeEach(() => {
    vi.clearAllMocks();

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
      testMessageId
    );

    expect(result.validCalls).toHaveLength(2);
    expect(result.toolResults).toHaveLength(0);
    expect(events.publishToolEvent).not.toHaveBeenCalled();
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
      testMessageId
    );

    expect(result.validCalls).toHaveLength(0);
    expect(result.toolResults).toHaveLength(1);
  });

  test('should filter out calls with no function property', () => {
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
      functionCalls as any,
      mockWorld,
      mockAgent,
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
      testMessageId
    );

    expect(events.publishToolEvent).toHaveBeenCalledTimes(1);
    expect(events.publishToolEvent).toHaveBeenCalledWith(mockWorld, {
      agentName: 'test-agent',
      type: 'tool-error',
      messageId: testMessageId,
      toolExecution: {
        toolName: '',
        toolCallId: 'call-bad',
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
      testMessageId
    );

    expect(result.validCalls).toHaveLength(2);
    expect(result.validCalls[0].function?.name).toBe('validTool');
    expect(result.validCalls[1].function?.name).toBe('anotherValid');

    expect(result.toolResults).toHaveLength(2);
    expect(result.toolResults[0].tool_call_id).toBe('call-invalid-1');
    expect(result.toolResults[1].tool_call_id).toBe('call-invalid-2');

    expect(events.publishToolEvent).toHaveBeenCalledTimes(2);
  });

  test('should handle empty functionCalls array', () => {
    const result = filterAndHandleEmptyNamedFunctionCalls(
      [],
      mockWorld,
      mockAgent,
      testMessageId
    );

    expect(result.validCalls).toHaveLength(0);
    expect(result.toolResults).toHaveLength(0);
    expect(events.publishToolEvent).not.toHaveBeenCalled();
  });

  test('should not throw if publishToolEvent fails', () => {
    // Make publishToolEvent throw an error
    vi.mocked(events.publishToolEvent).mockImplementationOnce(() => {
      throw new Error('Tool event publish failed');
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
        testMessageId
      );
    }).not.toThrow();
  });

  test('should use agent.name as fallback for agentName in tool event', () => {
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
      testMessageId
    );

    expect(events.publishToolEvent).toHaveBeenCalledWith(mockWorld, expect.objectContaining({
      agentName: 'FallbackName',
    }));
  });
});

describe('Tool Utils - validateToolParameters', () => {
  test('normalizes list_files directory alias to path', () => {
    const schema = {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
      additionalProperties: false,
    };

    const validation = validateToolParameters({ directory: '.' }, schema, 'list_files');

    expect(validation.valid).toBe(true);
    expect(validation.correctedArgs).toEqual({ path: '.' });
  });

  test('normalizes grep directory alias to directoryPath', () => {
    const schema = {
      type: 'object',
      properties: {
        query: { type: 'string' },
        directoryPath: { type: 'string' },
      },
      required: ['query'],
      additionalProperties: false,
    };

    const validation = validateToolParameters({ query: 'foo', directory: './core' }, schema, 'grep');

    expect(validation.valid).toBe(true);
    expect(validation.correctedArgs).toEqual({ query: 'foo', directoryPath: './core' });
  });

  test('still fails when required path is absent and no alias is provided', () => {
    const schema = {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
      additionalProperties: false,
    };

    const validation = validateToolParameters({}, schema, 'list_files');

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain("Required parameter 'path' is missing or empty");
  });

  test('normalizes create_agent aliases for autoReply and nextAgent', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        autoReply: { type: 'boolean' },
        nextAgent: { type: 'string' },
      },
      required: ['name'],
      additionalProperties: false,
    };

    const validation = validateToolParameters(
      { name: 'Router', 'auto-reply': false, 'next agent': 'reviewer' },
      schema,
      'create_agent',
    );

    expect(validation.valid).toBe(true);
    expect(validation.correctedArgs).toEqual({
      name: 'Router',
      autoReply: false,
      nextAgent: 'reviewer',
    });
  });

  test('keeps canonical create_agent keys when aliases are also present', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        autoReply: { type: 'boolean' },
        nextAgent: { type: 'string' },
      },
      required: ['name'],
      additionalProperties: false,
    };

    const validation = validateToolParameters(
      {
        name: 'Router',
        autoReply: true,
        'auto-reply': false,
        nextAgent: 'human',
        'next agent': 'reviewer',
      },
      schema,
      'create_agent',
    );

    expect(validation.valid).toBe(true);
    expect(validation.correctedArgs).toEqual({
      name: 'Router',
      autoReply: true,
      nextAgent: 'human',
    });
  });
});
