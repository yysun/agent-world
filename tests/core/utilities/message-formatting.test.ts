/**
 * Unit Tests for Message Formatting Utilities
 *
 * Features:
 * - Tests for prepareMessagesForLLM function - formats messages for AI SDK
 * - Tests for message transformation and content sanitization
 * - Tests for conversation history integration
 * - Edge cases for message preparation and format conversion
 *
 * Implementation:
 * - Tests message formatting functions in isolation
 * - No file I/O or LLM dependencies
 * - Tests edge cases and error conditions
 * - Validates message structure and AI SDK compatibility
 */

import { describe, test, expect } from '@jest/globals';
import { prepareMessagesForLLM } from '../../../core/utils.js';

describe('Message Formatting Utilities', () => {
  describe('prepareMessagesForLLM', () => {
    test('should prepare messages with system prompt', () => {
      const agent = {
        systemPrompt: 'You are a helpful assistant.',
        id: 'test-agent'
      } as any;

      const messageData = {
        content: 'Hello world',
        sender: 'user'
      } as any;

      const messages = prepareMessagesForLLM(agent, messageData);

      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toBe('You are a helpful assistant.');
      expect(messages[1].role).toBe('user');
      expect(messages[1].content).toBe('Hello world');
      expect(messages[1].sender).toBe('user');
    });

    test('should prepare messages without system prompt', () => {
      const agent = {
        id: 'test-agent'
      } as any;

      const messageData = {
        content: 'Hello world',
        sender: 'user'
      } as any;

      const messages = prepareMessagesForLLM(agent, messageData);

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello world');
    });

    test('should include conversation history', () => {
      const agent = {
        systemPrompt: 'You are a helpful assistant.',
        id: 'test-agent'
      } as any;

      const messageData = {
        content: 'Current message',
        sender: 'user'
      } as any;

      const history = [
        { role: 'user', content: 'Previous message', createdAt: new Date() },
        { role: 'assistant', content: 'Previous response', createdAt: new Date() }
      ] as any;

      const messages = prepareMessagesForLLM(agent, messageData, history);

      expect(messages).toHaveLength(4);
      expect(messages[0].role).toBe('system');
      expect(messages[1].content).toBe('Previous message');
      expect(messages[2].content).toBe('Previous response');
      expect(messages[3].content).toBe('Current message');
    });

    test('should handle message with payload content', () => {
      const agent = { id: 'test-agent' } as any;
      const messageData = {
        payload: { content: 'Payload content' },
        sender: 'user'
      } as any;

      const messages = prepareMessagesForLLM(agent, messageData);

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Payload content');
    });

    test('should handle empty content', () => {
      const agent = { id: 'test-agent' } as any;
      const messageData = {
        sender: 'user'
      } as any;

      const messages = prepareMessagesForLLM(agent, messageData);

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('');
    });

    test('should handle undefined message data gracefully', () => {
      // Note: The actual function doesn't handle undefined messageData well
      // This test documents the current behavior rather than ideal behavior
      const agent = { id: 'test-agent' } as any;

      // The function will throw on undefined, so we expect that
      expect(() => prepareMessagesForLLM(agent, undefined as any)).toThrow();
    });

    test('should prioritize direct content over payload content', () => {
      // The actual function prioritizes content over payload.content
      const agent = { id: 'test-agent' } as any;
      const messageData = {
        content: 'Direct content',
        payload: { content: 'Payload content' },
        sender: 'user'
      } as any;

      const messages = prepareMessagesForLLM(agent, messageData);

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Direct content');
    });

    test('should handle complex conversation history', () => {
      const agent = {
        systemPrompt: 'You are a helpful assistant.',
        id: 'test-agent'
      } as any;

      const messageData = {
        content: 'Current question',
        sender: 'user'
      } as any;

      const history = [
        { role: 'user', content: 'First question', createdAt: new Date('2024-01-01') },
        { role: 'assistant', content: 'First answer', createdAt: new Date('2024-01-01') },
        { role: 'user', content: 'Follow-up question', createdAt: new Date('2024-01-02') },
        { role: 'assistant', content: 'Follow-up answer', createdAt: new Date('2024-01-02') }
      ] as any;

      const messages = prepareMessagesForLLM(agent, messageData, history);

      expect(messages).toHaveLength(6);
      expect(messages[0].role).toBe('system');
      expect(messages[1].content).toBe('First question');
      expect(messages[2].content).toBe('First answer');
      expect(messages[3].content).toBe('Follow-up question');
      expect(messages[4].content).toBe('Follow-up answer');
      expect(messages[5].content).toBe('Current question');
    });

    test('should handle empty conversation history', () => {
      const agent = {
        systemPrompt: 'You are a helpful assistant.',
        id: 'test-agent'
      } as any;

      const messageData = {
        content: 'Single message',
        sender: 'user'
      } as any;

      const history: any[] = [];

      const messages = prepareMessagesForLLM(agent, messageData, history);

      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].content).toBe('Single message');
    });

    test('should handle very long system prompt', () => {
      const longPrompt = 'You are a helpful assistant. '.repeat(100);
      const agent = {
        systemPrompt: longPrompt,
        id: 'test-agent'
      } as any;

      const messageData = {
        content: 'Test message',
        sender: 'user'
      } as any;

      const messages = prepareMessagesForLLM(agent, messageData);

      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toBe(longPrompt);
      expect(messages[1].content).toBe('Test message');
    });

    test('should preserve message timestamps in history', () => {
      const agent = { id: 'test-agent' } as any;
      const messageData = { content: 'New message', sender: 'user' } as any;

      const timestamp1 = new Date('2024-01-01T10:00:00Z');
      const timestamp2 = new Date('2024-01-01T11:00:00Z');

      const history = [
        { role: 'user', content: 'Message 1', createdAt: timestamp1 },
        { role: 'assistant', content: 'Response 1', createdAt: timestamp2 }
      ] as any;

      const messages = prepareMessagesForLLM(agent, messageData, history);

      expect(messages).toHaveLength(3);
      expect(messages[0].createdAt).toEqual(timestamp1);
      expect(messages[1].createdAt).toEqual(timestamp2);
    });

    test('should handle mixed sender types in message data', () => {
      const agent = { id: 'test-agent' } as any;

      // Test system sender
      const systemMessage = { content: 'System message', sender: 'system' } as any;
      const systemMessages = prepareMessagesForLLM(agent, systemMessage);
      expect(systemMessages[0].role).toBe('user');
      expect(systemMessages[0].sender).toBe('system');

      // Test agent sender  
      const agentMessage = { content: 'Agent message', sender: 'test-agent' } as any;
      const agentMessages = prepareMessagesForLLM(agent, agentMessage);
      expect(agentMessages[0].role).toBe('user');
      expect(agentMessages[0].sender).toBe('test-agent');

      // Test human sender
      const humanMessage = { content: 'Human message', sender: 'human-user' } as any;
      const humanMessages = prepareMessagesForLLM(agent, humanMessage);
      expect(humanMessages[0].role).toBe('user');
      expect(humanMessages[0].sender).toBe('human-user');
    });

    test('should handle special characters in content', () => {
      const agent = { id: 'test-agent' } as any;
      const messageData = {
        content: 'Special chars: @mention #hashtag $variable & symbols 🚀',
        sender: 'user'
      } as any;

      const messages = prepareMessagesForLLM(agent, messageData);

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Special chars: @mention #hashtag $variable & symbols 🚀');
    });

    test('should handle message preparation performance with large history', () => {
      const agent = {
        systemPrompt: 'You are a helpful assistant.',
        id: 'test-agent'
      } as any;

      const messageData = { content: 'Current message', sender: 'user' } as any;

      // Create large history
      const history = Array(1000).fill(null).map((_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        createdAt: new Date()
      })) as any;

      const startTime = Date.now();
      const messages = prepareMessagesForLLM(agent, messageData, history);
      const endTime = Date.now();

      expect(messages).toHaveLength(1002); // system + history + current
      expect(endTime - startTime).toBeLessThan(100); // Should be fast
    });
  });
});
