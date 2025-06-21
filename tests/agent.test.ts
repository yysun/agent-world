/*
 * Combined Agent Test
 * 
 * Tests individual agent functions to verify they work correctly
 * Combined from agent-basic.test.ts and agent-functions.test.ts
 */

import { 
  extractMentions, 
  isMentioned, 
  shouldRespondToMessage 
} from '../src/agent';
import type { AgentConfig, MessageData } from '../src/types';
import { LLMProvider } from '../src/types';

describe('Agent Functions', () => {
  const mockAgentConfig: AgentConfig = {
    id: 'test-agent',
    name: 'TestAgent',
    type: 'ai',
    provider: LLMProvider.OPENAI,
    model: 'gpt-3.5-turbo',
    personality: 'Helpful assistant',
    instructions: 'Be helpful and concise',
    temperature: 0.7,
    maxTokens: 1000
  };

  describe('Basic Functions', () => {
    it('should extract mentions correctly', () => {
      const mentions = extractMentions('Hello @alice and @bob, how are you?');
      expect(mentions).toEqual(['alice', 'bob']);
    });

    it('should handle empty content', () => {
      expect(extractMentions('')).toEqual([]);
      expect(extractMentions('@')).toEqual([]);
    });

    it('should check mentions correctly', () => {
      expect(isMentioned(mockAgentConfig, 'Hey @TestAgent')).toBe(true);
      expect(isMentioned(mockAgentConfig, 'Hey @test-agent')).toBe(true);
      expect(isMentioned(mockAgentConfig, 'Hey everyone')).toBe(false);
    });
  });

  describe('Message Filtering', () => {
    it('should detect when agent is mentioned', () => {
      expect(isMentioned(mockAgentConfig, 'Hey @TestAgent, help me')).toBe(true);
      expect(isMentioned(mockAgentConfig, 'Hey @test-agent, help me')).toBe(true);
      expect(isMentioned(mockAgentConfig, 'Hey everyone')).toBe(false);
    });

    it('should respond to human messages without mentions', () => {
      const messageData: MessageData = {
        name: 'human-message',
        payload: { content: 'Hello everyone' },
        id: 'msg-1',
        sender: 'human',
        content: 'Hello everyone'
      };

      expect(shouldRespondToMessage(mockAgentConfig, messageData)).toBe(true);
    });

    it('should respond to human messages with mentions', () => {
      const messageData: MessageData = {
        name: 'human-message',
        payload: { content: 'Hello @TestAgent' },
        id: 'msg-1',
        sender: 'human',
        content: 'Hello @TestAgent'
      };

      expect(shouldRespondToMessage(mockAgentConfig, messageData)).toBe(true);
    });

    it('should not respond to own messages', () => {
      const messageData: MessageData = {
        name: 'agent-message',
        payload: { content: 'I said something' },
        id: 'msg-1',
        sender: 'test-agent',
        content: 'I said something'
      };

      expect(shouldRespondToMessage(mockAgentConfig, messageData)).toBe(false);
    });

    it('should only respond to agent messages when mentioned', () => {
      const mentionedMessage: MessageData = {
        name: 'agent-message',
        payload: { content: 'Hey @TestAgent, help!' },
        id: 'msg-1',
        sender: 'other-agent',
        content: 'Hey @TestAgent, help!'
      };

      const unmentionedMessage: MessageData = {
        name: 'agent-message',
        payload: { content: 'Just talking to myself' },
        id: 'msg-2',
        sender: 'other-agent',
        content: 'Just talking to myself'
      };

      expect(shouldRespondToMessage(mockAgentConfig, mentionedMessage)).toBe(true);
      expect(shouldRespondToMessage(mockAgentConfig, unmentionedMessage)).toBe(false);
    });

    it('should always respond to system messages', () => {
      const systemMessage: MessageData = {
        name: 'system-message',
        payload: { content: 'System announcement' },
        id: 'msg-1',
        sender: 'system',
        content: 'System announcement'
      };

      expect(shouldRespondToMessage(mockAgentConfig, systemMessage)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty content gracefully', () => {
      expect(extractMentions('')).toEqual([]);
      expect(isMentioned(mockAgentConfig, '')).toBe(false);
    });

    it('should handle malformed mentions', () => {
      expect(extractMentions('@')).toEqual([]);
      expect(extractMentions('@ space')).toEqual([]);
      expect(extractMentions('@123validname')).toEqual(['123validname']);
    });

    it('should be case insensitive for mentions', () => {
      expect(isMentioned(mockAgentConfig, '@TESTAGENT')).toBe(true);
      expect(isMentioned(mockAgentConfig, '@testagent')).toBe(true);
    });
  });
});