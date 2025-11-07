/**
 * Tests for Event Validation
 * 
 * Tests the strict validation logic that ensures all events
 * have complete metadata before persistence.
 */

import { describe, it, expect } from 'vitest';
import type { StoredEvent } from '../../core/storage/eventStorage/types.js';
import { validateEventForPersistence, createDefaultMessageMetadata } from '../../core/storage/eventStorage/validation.js';

describe('Event Validation', () => {
  describe('validateEventForPersistence()', () => {
    it('should accept complete message metadata', () => {
      const event: StoredEvent = {
        id: 'msg-123',
        worldId: 'world-1',
        chatId: 'chat-1',
        type: 'message',
        payload: { content: 'Hello' },
        meta: {
          sender: 'human',
          chatId: 'chat-1',
          ownerAgentIds: ['agent1'],
          recipientAgentId: null,
          originalSender: null,
          deliveredToAgents: ['agent1'],
          messageDirection: 'broadcast',
          isMemoryOnly: false,
          isCrossAgentMessage: false,
          isHumanMessage: true,
          threadRootId: null,
          threadDepth: 0,
          isReply: false,
          hasReplies: false,
          requiresApproval: false,
          approvalScope: null,
          approvedAt: null,
          approvedBy: null,
          deniedAt: null,
          denialReason: null,
          llmTokensInput: null,
          llmTokensOutput: null,
          llmLatency: null,
          llmProvider: null,
          llmModel: null,
          hasToolCalls: false,
          toolCallCount: 0
        },
        createdAt: new Date()
      };

      expect(() => validateEventForPersistence(event)).not.toThrow();
    });

    it('should reject incomplete message metadata', () => {
      const event: StoredEvent = {
        id: 'msg-123',
        worldId: 'world-1',
        chatId: 'chat-1',
        type: 'message',
        payload: { content: 'Hello' },
        meta: {
          sender: 'human',
          chatId: 'chat-1'
          // Missing required fields
        },
        createdAt: new Date()
      };

      expect(() => validateEventForPersistence(event)).toThrow(
        'Invalid message event metadata'
      );
    });

    it('should accept complete tool metadata', () => {
      const event: StoredEvent = {
        id: 'tool-123',
        worldId: 'world-1',
        chatId: 'chat-1',
        type: 'tool',
        payload: { toolName: 'read_file' },
        meta: {
          agentName: 'agent1',
          toolType: 'read_file',
          ownerAgentId: 'agent1',
          triggeredByMessageId: 'msg-123',
          executionDuration: 150,
          resultSize: 1024,
          wasApproved: true
        },
        createdAt: new Date()
      };

      expect(() => validateEventForPersistence(event)).not.toThrow();
    });

    it('should reject incomplete tool metadata', () => {
      const event: StoredEvent = {
        id: 'tool-123',
        worldId: 'world-1',
        chatId: 'chat-1',
        type: 'tool',
        payload: { toolName: 'read_file' },
        meta: {
          agentName: 'agent1',
          toolType: 'read_file'
          // Missing ownerAgentId and triggeredByMessageId
        },
        createdAt: new Date()
      };

      expect(() => validateEventForPersistence(event)).toThrow(
        'Invalid tool event metadata'
      );
    });

    it('should allow other event types without strict validation', () => {
      const event: StoredEvent = {
        id: 'system-123',
        worldId: 'world-1',
        chatId: null,
        type: 'system',
        payload: { action: 'world_created' },
        meta: {},
        createdAt: new Date()
      };

      expect(() => validateEventForPersistence(event)).not.toThrow();
    });
  });

  describe('createDefaultMessageMetadata()', () => {
    it('should create valid defaults for human', () => {
      const metadata = createDefaultMessageMetadata('human');

      expect(metadata.sender).toBe('human');
      expect(metadata.isHumanMessage).toBe(true);
      expect(metadata.ownerAgentIds).toEqual([]);
      expect(metadata.messageDirection).toBe('broadcast');
      expect(metadata.threadDepth).toBe(0);
      expect(metadata.hasToolCalls).toBe(false);
      expect(metadata.toolCallCount).toBe(0);
    });

    it('should create valid defaults for agent', () => {
      const metadata = createDefaultMessageMetadata('agent1');

      expect(metadata.sender).toBe('agent1');
      expect(metadata.isHumanMessage).toBe(false);
      expect(metadata.ownerAgentIds).toEqual([]);
      expect(metadata.messageDirection).toBe('broadcast');
      expect(metadata.llmTokensInput).toBeNull();
      expect(metadata.llmTokensOutput).toBeNull();
    });
  });
});
