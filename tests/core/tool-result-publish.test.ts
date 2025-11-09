/**
 * Unit tests for publishToolResult API
 * 
 * Tests:
 * - Message structure validation
 * - role='tool' format
 * - tool_call_id presence
 * - Content format (JSON stringified)
 * - Message event emission
 * - Integration with parseMessageContent
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { publishToolResult } from '../../core/events/index.js';
import { parseMessageContent } from '../../core/message-prep.js';
import type { World, ToolResultData } from '../../core/types.js';
import { EventEmitter } from 'events';

describe('publishToolResult', () => {
  let world: World;
  let eventEmitterSpy: any;

  beforeEach(() => {
    const eventEmitter = new EventEmitter();
    eventEmitterSpy = vi.spyOn(eventEmitter, 'emit');

    world = {
      id: 'test-world',
      name: 'Test World',
      turnLimit: 5,
      currentChatId: 'test-chat',
      createdAt: new Date(),
      lastUpdated: new Date(),
      totalAgents: 0,
      totalMessages: 0,
      eventEmitter,
      agents: new Map(),
      chats: new Map(),
    };
  });

  it('should construct proper tool message structure', () => {
    const toolData: ToolResultData = {
      tool_call_id: 'call_123',
      decision: 'approve',
      scope: 'session',
      toolName: 'shell_cmd',
      toolArgs: { command: 'ls -la' },
      workingDirectory: '/home/user'
    };

    publishToolResult(world, 'agent-1', toolData);

    // Tool messages use enhanced protocol (__type: 'tool_result') and are NOT prepended with @mention
    // They are routed via tool_call_id instead
    expect(eventEmitterSpy).toHaveBeenCalledWith('message', expect.objectContaining({
      sender: 'human',
      content: expect.stringContaining('__type')
    }));
  });

  it('should create message with role="tool"', () => {
    const toolData: ToolResultData = {
      tool_call_id: 'call_456',
      decision: 'deny',
      toolName: 'shell_cmd'
    };

    const messageEvent = publishToolResult(world, 'agent-2', toolData);

    // Parse the enhanced protocol content
    const parsed = parseMessageContent(messageEvent.content, 'user');

    expect(parsed.message.role).toBe('tool');
  });

  it('should include tool_call_id in message', () => {
    const toolData: ToolResultData = {
      tool_call_id: 'call_789',
      decision: 'approve',
      toolName: 'shell_cmd'
    };

    const messageEvent = publishToolResult(world, 'agent-3', toolData);
    const parsed = parseMessageContent(messageEvent.content, 'user');

    expect(parsed.message).toHaveProperty('tool_call_id', 'call_789');
  });

  it('should format content as JSON string', () => {
    const toolData: ToolResultData = {
      tool_call_id: 'call_abc',
      decision: 'approve',
      scope: 'once',
      toolName: 'shell_cmd',
      toolArgs: { command: 'pwd' }
    };

    const messageEvent = publishToolResult(world, 'agent-4', toolData);
    const parsed = parseMessageContent(messageEvent.content, 'user');

    // Content should be parseable JSON
    expect(() => JSON.parse(parsed.message.content)).not.toThrow();

    const contentData = JSON.parse(parsed.message.content);
    expect(contentData.decision).toBe('approve');
    expect(contentData.scope).toBe('once');
    expect(contentData.toolName).toBe('shell_cmd');
  });

  it('should emit message event', () => {
    const toolData: ToolResultData = {
      tool_call_id: 'call_xyz',
      decision: 'deny',
      toolName: 'shell_cmd'
    };

    publishToolResult(world, 'agent-5', toolData);

    expect(eventEmitterSpy).toHaveBeenCalledWith('message', expect.any(Object));
    expect(eventEmitterSpy).toHaveBeenCalledTimes(1);
  });

  it('should include messageId in returned event', () => {
    const toolData: ToolResultData = {
      tool_call_id: 'call_def',
      decision: 'approve',
      toolName: 'shell_cmd'
    };

    const messageEvent = publishToolResult(world, 'agent-6', toolData);

    expect(messageEvent.messageId).toBeDefined();
    expect(typeof messageEvent.messageId).toBe('string');
    expect(messageEvent.messageId.length).toBeGreaterThan(0);
  });

  it('should be parseable by parseMessageContent', () => {
    const toolData: ToolResultData = {
      tool_call_id: 'call_ghi',
      decision: 'approve',
      scope: 'session',
      toolName: 'shell_cmd',
      toolArgs: { command: 'echo test' },
      workingDirectory: '/tmp'
    };

    const messageEvent = publishToolResult(world, 'agent-7', toolData);
    const parsed = parseMessageContent(messageEvent.content, 'user');

    expect(parsed.targetAgentId).toBe('agent-7');
    expect(parsed.message.role).toBe('tool');
    expect(parsed.message.tool_call_id).toBe('call_ghi');

    // Content has the nested data (without tool_call_id, which is in outer structure)
    const contentData = JSON.parse(parsed.message.content);
    expect(contentData).toEqual({
      decision: toolData.decision,
      scope: toolData.scope,
      toolName: toolData.toolName,
      toolArgs: toolData.toolArgs,
      workingDirectory: toolData.workingDirectory
    });
  });

  it('should handle minimal tool data', () => {
    const toolData: ToolResultData = {
      tool_call_id: 'call_min',
      decision: 'deny',
      toolName: 'shell_cmd'
    };

    const messageEvent = publishToolResult(world, 'agent-8', toolData);
    const parsed = parseMessageContent(messageEvent.content, 'user');

    expect(parsed.message.role).toBe('tool');
    expect(parsed.message.tool_call_id).toBe('call_min');

    const contentData = JSON.parse(parsed.message.content);
    expect(contentData.decision).toBe('deny');
    expect(contentData.scope).toBeUndefined();
    expect(contentData.toolArgs).toBeUndefined();
  });

  it('should use world.currentChatId for chatId', () => {
    world.currentChatId = 'specific-chat-123';

    const toolData: ToolResultData = {
      tool_call_id: 'call_jkl',
      decision: 'approve',
      toolName: 'shell_cmd'
    };

    const messageEvent = publishToolResult(world, 'agent-9', toolData);

    expect(messageEvent.chatId).toBe('specific-chat-123');
  });

  it('should handle complex toolArgs', () => {
    const toolData: ToolResultData = {
      tool_call_id: 'call_complex',
      decision: 'approve',
      scope: 'session',
      toolName: 'shell_cmd',
      toolArgs: {
        command: 'npm test',
        cwd: '/project',
        env: { NODE_ENV: 'test' }
      },
      workingDirectory: '/project/subdir'
    };

    const messageEvent = publishToolResult(world, 'agent-10', toolData);
    const parsed = parseMessageContent(messageEvent.content, 'user');

    const contentData = JSON.parse(parsed.message.content);
    expect(contentData.toolArgs).toEqual({
      command: 'npm test',
      cwd: '/project',
      env: { NODE_ENV: 'test' }
    });
  });
});
