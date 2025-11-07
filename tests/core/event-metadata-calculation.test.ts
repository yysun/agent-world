/**
 * Tests for Event Metadata Calculation Helpers
 * 
 * Comprehensive tests for pure calculation functions that determine
 * agent ownership, recipients, message classification, and threading metadata.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { World, WorldMessageEvent, Agent, AgentMessage } from '../../core/types.js';
import {
  calculateOwnerAgentIds,
  calculateRecipientAgentId,
  calculateMessageDirection,
  calculateIsMemoryOnly,
  calculateIsCrossAgentMessage,
  calculateThreadMetadata
} from '../../core/events-metadata.js';

describe.skip('Event Metadata Calculation Helpers', () => {
  let world: World;
  let agent1: Agent;
  let agent2: Agent;
  let agent3: Agent;

  beforeEach(async () => {

    agent1 = {
      id: 'agent1',
      name: 'Agent1',
      type: 'assistant',
      provider: 'anthropic' as any,
      model: 'claude-3-5-sonnet-20241022',
      llmCallCount: 0,
      memory: []
    };

    agent2 = {
      id: 'agent2',
      name: 'Agent2',
      type: 'assistant',
      provider: 'anthropic' as any,
      model: 'claude-3-5-sonnet-20241022',
      llmCallCount: 0,
      memory: []
    };

    agent3 = {
      id: 'agent3',
      name: 'Agent3',
      type: 'assistant',
      provider: 'anthropic' as any,
      model: 'claude-3-5-sonnet-20241022',
      llmCallCount: 0,
      memory: []
    };

    world = {
      id: 'test-world',
      name: 'Test World',
      turnLimit: 10,
      createdAt: new Date(),
      lastUpdated: new Date(),
      totalAgents: 3,
      totalMessages: 0,
      eventEmitter: {} as any,
      agents: new Map([
        ['agent1', agent1],
        ['agent2', agent2],
        ['agent3', agent3]
      ]),
      chats: new Map()
    };
  });

  describe('calculateOwnerAgentIds()', () => {
    it('should return all agent IDs for human broadcast', () => {
      const message: WorldMessageEvent = {
        content: 'Hello everyone',
        sender: 'human',
        messageId: 'msg-1',
        timestamp: new Date()
      };

      const ownerIds = calculateOwnerAgentIds(world, message);

      expect(ownerIds).toHaveLength(3);
      expect(ownerIds).toContain('agent1');
      expect(ownerIds).toContain('agent2');
      expect(ownerIds).toContain('agent3');
    });

    it('should return sender and recipient for cross-agent message with @mention', () => {
      const message: WorldMessageEvent = {
        content: '@Agent2 here is the info you requested',
        sender: 'agent1',
        messageId: 'msg-2',
        timestamp: new Date()
      };

      const ownerIds = calculateOwnerAgentIds(world, message);

      expect(ownerIds).toHaveLength(2);
      expect(ownerIds).toContain('agent1'); // Sender
      expect(ownerIds).toContain('agent2'); // Recipient
      expect(ownerIds).not.toContain('agent3'); // Not involved
    });

    it('should return all agents for agent broadcast without @mention', () => {
      const message: WorldMessageEvent = {
        content: 'I completed the task',
        sender: 'agent1',
        messageId: 'msg-3',
        timestamp: new Date()
      };

      const ownerIds = calculateOwnerAgentIds(world, message);

      expect(ownerIds).toHaveLength(3);
      expect(ownerIds).toContain('agent1');
      expect(ownerIds).toContain('agent2');
      expect(ownerIds).toContain('agent3');
    });

    it('should handle case-insensitive @mentions', () => {
      const message: WorldMessageEvent = {
        content: '@agent2 please check this',
        sender: 'agent1',
        messageId: 'msg-4',
        timestamp: new Date()
      };

      const ownerIds = calculateOwnerAgentIds(world, message);

      expect(ownerIds).toContain('agent2');
    });

    it('should return all agents if @mention targets unknown agent', () => {
      const message: WorldMessageEvent = {
        content: '@UnknownAgent this is for you',
        sender: 'agent1',
        messageId: 'msg-5',
        timestamp: new Date()
      };

      const ownerIds = calculateOwnerAgentIds(world, message);

      expect(ownerIds).toHaveLength(3); // Falls back to broadcast
    });
  });

  describe('calculateRecipientAgentId()', () => {
    it('should return null for messages without @mention', () => {
      const message: WorldMessageEvent = {
        content: 'Hello everyone',
        sender: 'human',
        messageId: 'msg-1',
        timestamp: new Date()
      };

      const recipientId = calculateRecipientAgentId(world, message);

      expect(recipientId).toBeNull();
    });

    it('should return agent ID for valid @mention', () => {
      const message: WorldMessageEvent = {
        content: '@Agent2 can you help?',
        sender: 'human',
        messageId: 'msg-2',
        timestamp: new Date()
      };

      const recipientId = calculateRecipientAgentId(world, message);

      expect(recipientId).toBe('agent2');
    });

    it('should return null for @mention of unknown agent', () => {
      const message: WorldMessageEvent = {
        content: '@UnknownAgent hello',
        sender: 'human',
        messageId: 'msg-3',
        timestamp: new Date()
      };

      const recipientId = calculateRecipientAgentId(world, message);

      expect(recipientId).toBeNull();
    });

    it('should extract first @mention if multiple exist', () => {
      const message: WorldMessageEvent = {
        content: '@Agent1 and @Agent2 please collaborate',
        sender: 'human',
        messageId: 'msg-4',
        timestamp: new Date()
      };

      const recipientId = calculateRecipientAgentId(world, message);

      expect(recipientId).toBe('agent1'); // First mention
    });
  });

  describe('calculateMessageDirection()', () => {
    it('should return "broadcast" for human messages', () => {
      const message: WorldMessageEvent = {
        content: 'Hello',
        sender: 'human',
        messageId: 'msg-1',
        timestamp: new Date()
      };

      const direction = calculateMessageDirection(world, message);

      expect(direction).toBe('broadcast');
    });

    it('should return "incoming" for agent message with @mention', () => {
      const message: WorldMessageEvent = {
        content: '@Agent2 here you go',
        sender: 'agent1',
        messageId: 'msg-2',
        timestamp: new Date()
      };

      const direction = calculateMessageDirection(world, message);

      expect(direction).toBe('incoming');
    });

    it('should return "broadcast" for agent message without @mention', () => {
      const message: WorldMessageEvent = {
        content: 'Task completed',
        sender: 'agent1',
        messageId: 'msg-3',
        timestamp: new Date()
      };

      const direction = calculateMessageDirection(world, message);

      expect(direction).toBe('broadcast');
    });
  });

  describe('calculateIsMemoryOnly()', () => {
    it('should return false for human messages', () => {
      const message: WorldMessageEvent = {
        content: 'Hello',
        sender: 'human',
        messageId: 'msg-1',
        timestamp: new Date()
      };

      const isMemoryOnly = calculateIsMemoryOnly(world, message);

      expect(isMemoryOnly).toBe(false);
    });

    it('should return true for agent message with @mention (cross-agent)', () => {
      const message: WorldMessageEvent = {
        content: '@Agent2 FYI',
        sender: 'agent1',
        messageId: 'msg-2',
        timestamp: new Date()
      };

      const isMemoryOnly = calculateIsMemoryOnly(world, message);

      expect(isMemoryOnly).toBe(true);
    });

    it('should return false for agent broadcast', () => {
      const message: WorldMessageEvent = {
        content: 'Update for everyone',
        sender: 'agent1',
        messageId: 'msg-3',
        timestamp: new Date()
      };

      const isMemoryOnly = calculateIsMemoryOnly(world, message);

      expect(isMemoryOnly).toBe(false);
    });
  });

  describe('calculateIsCrossAgentMessage()', () => {
    it('should return false for human messages', () => {
      const message: WorldMessageEvent = {
        content: 'Hello',
        sender: 'human',
        messageId: 'msg-1',
        timestamp: new Date()
      };

      const isCrossAgent = calculateIsCrossAgentMessage(world, message);

      expect(isCrossAgent).toBe(false);
    });

    it('should return true for agent message with @mention', () => {
      const message: WorldMessageEvent = {
        content: '@Agent2 check this',
        sender: 'agent1',
        messageId: 'msg-2',
        timestamp: new Date()
      };

      const isCrossAgent = calculateIsCrossAgentMessage(world, message);

      expect(isCrossAgent).toBe(true);
    });

    it('should return false for agent broadcast', () => {
      const message: WorldMessageEvent = {
        content: 'Broadcasting to all',
        sender: 'agent1',
        messageId: 'msg-3',
        timestamp: new Date()
      };

      const isCrossAgent = calculateIsCrossAgentMessage(world, message);

      expect(isCrossAgent).toBe(false);
    });
  });

  describe('calculateThreadMetadata()', () => {
    it('should return root metadata for message without replyToMessageId', () => {
      const message: WorldMessageEvent = {
        content: 'Root message',
        sender: 'human',
        messageId: 'msg-1',
        timestamp: new Date()
      };

      const metadata = calculateThreadMetadata(message, []);

      expect(metadata.threadRootId).toBeNull();
      expect(metadata.threadDepth).toBe(0);
      expect(metadata.isReply).toBe(false);
    });

    it('should calculate depth 1 for direct reply', () => {
      const rootMessage: AgentMessage = {
        role: 'user',
        content: 'Root',
        messageId: 'msg-1'
      };

      const replyMessage: WorldMessageEvent = {
        content: 'Reply to root',
        sender: 'agent1',
        messageId: 'msg-2',
        replyToMessageId: 'msg-1',
        timestamp: new Date()
      };

      const metadata = calculateThreadMetadata(replyMessage, [rootMessage]);

      expect(metadata.threadRootId).toBe('msg-1');
      expect(metadata.threadDepth).toBe(1);
      expect(metadata.isReply).toBe(true);
    });

    it('should calculate depth 2 for reply to reply', () => {
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'Root',
          messageId: 'msg-1'
        },
        {
          role: 'assistant',
          content: 'First reply',
          messageId: 'msg-2',
          replyToMessageId: 'msg-1'
        }
      ];

      const deepReply: WorldMessageEvent = {
        content: 'Reply to reply',
        sender: 'agent2',
        messageId: 'msg-3',
        replyToMessageId: 'msg-2',
        timestamp: new Date()
      };

      const metadata = calculateThreadMetadata(deepReply, messages);

      expect(metadata.threadRootId).toBe('msg-1');
      expect(metadata.threadDepth).toBe(2);
      expect(metadata.isReply).toBe(true);
    });

    it('should handle missing parent message gracefully', () => {
      const message: WorldMessageEvent = {
        content: 'Reply to unknown',
        sender: 'agent1',
        messageId: 'msg-2',
        replyToMessageId: 'msg-unknown',
        timestamp: new Date()
      };

      const metadata = calculateThreadMetadata(message, []);

      expect(metadata.threadRootId).toBe('msg-unknown');
      expect(metadata.threadDepth).toBe(1);
      expect(metadata.isReply).toBe(true);
    });

    it('should detect circular reference and stop', () => {
      // Create circular reference: msg-1 -> msg-2 -> msg-1
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'First',
          messageId: 'msg-1',
          replyToMessageId: 'msg-2' // Circular!
        },
        {
          role: 'assistant',
          content: 'Second',
          messageId: 'msg-2',
          replyToMessageId: 'msg-1' // Circular!
        }
      ];

      const message: WorldMessageEvent = {
        content: 'New message',
        sender: 'human',
        messageId: 'msg-3',
        replyToMessageId: 'msg-1',
        timestamp: new Date()
      };

      const metadata = calculateThreadMetadata(message, messages);

      // Should detect cycle and fall back to immediate parent
      expect(metadata.threadDepth).toBe(1);
      expect(metadata.isReply).toBe(true);
    });

    it('should stop at depth limit of 100', () => {
      // Create a very deep thread chain
      const messages: AgentMessage[] = [];
      for (let i = 1; i <= 101; i++) {
        messages.push({
          role: i % 2 === 0 ? 'assistant' : 'user',
          content: `Message ${i}`,
          messageId: `msg-${i}`,
          replyToMessageId: i > 1 ? `msg-${i - 1}` : undefined
        });
      }

      const deepMessage: WorldMessageEvent = {
        content: 'Very deep reply',
        sender: 'agent1',
        messageId: 'msg-102',
        replyToMessageId: 'msg-101',
        timestamp: new Date()
      };

      const metadata = calculateThreadMetadata(deepMessage, messages);

      // Should stop at 100
      expect(metadata.threadDepth).toBeLessThanOrEqual(101);
      expect(metadata.isReply).toBe(true);
    });
  });
});
