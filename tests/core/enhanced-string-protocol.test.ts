/**
 * Integration test for Enhanced String Protocol
 * 
 * Verifies:
 * 1. parseMessageContent() converts __type markers to OpenAI format
 * 2. Agent memory stores OpenAI ChatMessage format
 * 3. Backward compatibility with regular text messages
 * 4. Integration with saveIncomingMessageToMemory()
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createWorld, createAgent } from '../../core/managers.js';
import { parseMessageContent } from '../../core/message-prep.js';
import { saveIncomingMessageToMemory } from '../../core/events.js';
import type { World, Agent, WorldMessageEvent } from '../../core/types.js';

describe('Enhanced String Protocol - Integration', () => {
  let world: World;
  let agent: Agent;

  beforeEach(async () => {
    // Create unique world each time (timestamp + random to avoid parallel test collisions)
    const worldName = `test-protocol-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const createdWorld = await createWorld({ name: worldName });
    if (!createdWorld) throw new Error('Failed to create world');
    world = createdWorld;

    agent = await createAgent(world.id, {
      name: 'TestAgent',
      type: 'assistant',
      provider: 'openai' as any,
      model: 'gpt-4',
      systemPrompt: 'You are a test agent'
    });
  });

  describe('Parser Unit Tests', () => {
    it('should parse tool_result format to OpenAI ChatMessage', () => {
      const enhancedMessage = JSON.stringify({
        __type: 'tool_result',
        tool_call_id: 'approval_shell_cmd_123',
        content: JSON.stringify({
          decision: 'approve',
          scope: 'session',
          toolName: 'shell_cmd'
        })
      });

      const { message: parsedMessage, targetAgentId } = parseMessageContent(enhancedMessage, 'user');

      expect(parsedMessage.role).toBe('tool');
      expect(parsedMessage.tool_call_id).toBe('approval_shell_cmd_123');
      expect(parsedMessage.content).toBe(JSON.stringify({
        decision: 'approve',
        scope: 'session',
        toolName: 'shell_cmd'
      }));
    });

    it('should handle backward compatibility with regular text messages', () => {
      const textMessage = 'Hello, agent!';
      const { message: parsedMessage, targetAgentId } = parseMessageContent(textMessage, 'user');

      expect(parsedMessage.role).toBe('user');
      expect(parsedMessage.content).toBe('Hello, agent!');
    });

    it('should handle legacy approval text format (deprecated)', () => {
      const legacyMessage = 'approve shell_cmd for session';
      const { message: parsedMessage, targetAgentId } = parseMessageContent(legacyMessage, 'user');

      // Should be treated as regular user message
      expect(parsedMessage.role).toBe('user');
      expect(parsedMessage.content).toBe('approve shell_cmd for session');
    });

    it('should handle tool_result with missing tool_call_id', () => {
      const invalidMessage = JSON.stringify({
        __type: 'tool_result',
        content: 'some content'
      });

      const { message: parsedMessage, targetAgentId } = parseMessageContent(invalidMessage, 'user');

      // Should fall back to regular user message
      expect(parsedMessage.role).toBe('user');
      expect(parsedMessage.content).toBe(invalidMessage);
    });

    it('should handle JSON without __type marker', () => {
      const jsonMessage = JSON.stringify({ foo: 'bar', value: 123 });
      const { message: parsedMessage, targetAgentId } = parseMessageContent(jsonMessage, 'user');

      // Should be treated as regular text content
      expect(parsedMessage.role).toBe('user');
      expect(parsedMessage.content).toBe(jsonMessage);
    });

    it('should handle empty enhanced message content', () => {
      const emptyMessage = JSON.stringify({
        __type: 'tool_result',
        tool_call_id: 'test_empty',
        content: ''
      });

      const { message: parsedMessage, targetAgentId } = parseMessageContent(emptyMessage, 'user');

      expect(parsedMessage.role).toBe('tool');
      expect(parsedMessage.tool_call_id).toBe('test_empty');
      expect(parsedMessage.content).toBe('');
    });

    it('should extract agentId from enhanced string format', () => {
      const enhancedMessage = JSON.stringify({
        __type: 'tool_result',
        agentId: 'a1',
        tool_call_id: 'approval_test_789',
        content: JSON.stringify({ decision: 'approve', scope: 'session' })
      });

      const { message: parsedMessage, targetAgentId } = parseMessageContent(enhancedMessage, 'user');

      expect(parsedMessage.role).toBe('tool');
      expect(parsedMessage.tool_call_id).toBe('approval_test_789');
      expect(targetAgentId).toBe('a1');
    });

    it('should return undefined targetAgentId when agentId is not present', () => {
      const enhancedMessage = JSON.stringify({
        __type: 'tool_result',
        tool_call_id: 'test_no_agent',
        content: 'test content'
      });

      const { message: parsedMessage, targetAgentId } = parseMessageContent(enhancedMessage, 'user');

      expect(parsedMessage.role).toBe('tool');
      expect(targetAgentId).toBeUndefined();
    });

    it('should not extract agentId from regular text messages', () => {
      const textMessage = 'Hello, agent!';
      const { message: parsedMessage, targetAgentId } = parseMessageContent(textMessage, 'user');

      expect(parsedMessage.role).toBe('user');
      expect(parsedMessage.content).toBe('Hello, agent!');
      expect(targetAgentId).toBeUndefined();
    });
  });

  describe('Memory Integration Tests', () => {
    it('should save enhanced string format as OpenAI ChatMessage in agent.memory', async () => {
      // Enhanced format message
      const enhancedMessage = JSON.stringify({
        __type: 'tool_result',
        tool_call_id: 'approval_shell_cmd_456',
        content: JSON.stringify({
          decision: 'approve',
          scope: 'session',
          toolName: 'shell_cmd'
        })
      });

      // Simulate saving to memory (what saveIncomingMessageToMemory does)
      const messageEvent: WorldMessageEvent = {
        content: enhancedMessage,
        sender: 'HUMAN',
        timestamp: new Date(),
        messageId: 'test-msg-1',
        chatId: world.currentChatId
      };

      await saveIncomingMessageToMemory(world, agent, messageEvent);

      // Verify agent.memory has OpenAI format
      const memory = agent.memory;
      expect(memory.length).toBeGreaterThan(0);

      const toolMessage = memory[memory.length - 1];
      expect(toolMessage.role).toBe('tool');
      expect(toolMessage.tool_call_id).toBe('approval_shell_cmd_456');
      expect(toolMessage.sender).toBe('HUMAN');
    });

    it('should save regular text as user message in agent.memory', async () => {
      const textMessage = 'Hello, agent!';

      // Save to memory
      const messageEvent: WorldMessageEvent = {
        content: textMessage,
        sender: 'HUMAN',
        timestamp: new Date(),
        messageId: 'test-msg-2',
        chatId: world.currentChatId
      };

      await saveIncomingMessageToMemory(world, agent, messageEvent);

      const memory = agent.memory;
      const userMessage = memory[memory.length - 1];

      expect(userMessage.role).toBe('user');
      expect(userMessage.content).toBe('Hello, agent!');
      expect(userMessage.sender).toBe('HUMAN');
    });
  });
});
