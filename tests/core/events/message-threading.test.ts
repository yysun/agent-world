/**
 * Message Threading Unit Tests
 * 
 * Unit tests for replyToMessageId field validation and thread traversal.
 * Integration tests that require LLM API calls have been moved to:
 * /integration/test-message-threading.ts
 */

import { describe, test, expect } from 'vitest';
import {
  validateMessageThreading,
  type AgentMessage
} from '../../../core/types.js';

describe('Message Threading', () => {
  describe('validateMessageThreading', () => {
    test('should allow valid threading', () => {
      const message: AgentMessage = {
        role: 'assistant',
        content: 'Reply',
        messageId: 'msg-2',
        replyToMessageId: 'msg-1'
      };

      const allMessages: AgentMessage[] = [
        { role: 'user', content: 'Question', messageId: 'msg-1' },
        message
      ];

      expect(() => validateMessageThreading(message, allMessages)).not.toThrow();
    });

    test('should reject self-referencing messages', () => {
      const message: AgentMessage = {
        role: 'assistant',
        content: 'Test',
        messageId: 'msg-1',
        replyToMessageId: 'msg-1' // Self-reference
      };

      expect(() => validateMessageThreading(message)).toThrow('cannot reply to itself');
    });

    test('should detect circular references (A→B→C→A)', () => {
      const messages: AgentMessage[] = [
        { role: 'user', content: 'A', messageId: 'msg-1', replyToMessageId: 'msg-3' },
        { role: 'user', content: 'B', messageId: 'msg-2', replyToMessageId: 'msg-1' },
        { role: 'user', content: 'C', messageId: 'msg-3', replyToMessageId: 'msg-2' }
      ];

      expect(() => validateMessageThreading(messages[0], messages))
        .toThrow('Circular reference detected');
    });

    test('should detect circular references (A→B→A)', () => {
      const messages: AgentMessage[] = [
        { role: 'user', content: 'A', messageId: 'msg-1', replyToMessageId: 'msg-2' },
        { role: 'user', content: 'B', messageId: 'msg-2', replyToMessageId: 'msg-1' }
      ];

      expect(() => validateMessageThreading(messages[0], messages))
        .toThrow('Circular reference detected');
    });

    test('should handle orphaned replies gracefully (missing parent)', () => {
      const message: AgentMessage = {
        role: 'assistant',
        content: 'Reply to deleted message',
        messageId: 'msg-2',
        replyToMessageId: 'msg-nonexistent'
      };

      const allMessages: AgentMessage[] = [message];

      // Should warn but not throw (parent might be in different chat)
      expect(() => validateMessageThreading(message, allMessages)).not.toThrow();
    });

    test('should validate multi-level threading correctly', () => {
      const messages: AgentMessage[] = [
        { role: 'user', content: 'Start', messageId: 'msg-1' },
        { role: 'assistant', content: 'Reply 1', messageId: 'msg-2', replyToMessageId: 'msg-1' },
        { role: 'user', content: 'Follow-up', messageId: 'msg-3', replyToMessageId: 'msg-2' },
        { role: 'assistant', content: 'Reply 2', messageId: 'msg-4', replyToMessageId: 'msg-3' }
      ];

      // All messages should validate correctly
      messages.forEach(msg => {
        expect(() => validateMessageThreading(msg, messages)).not.toThrow();
      });
    });

    test('should reject excessive thread depth (>100 levels)', () => {
      // Create a chain of 101 messages
      const messages: AgentMessage[] = [];
      for (let i = 0; i < 101; i++) {
        messages.push({
          role: 'user',
          content: `Message ${i}`,
          messageId: `msg-${i}`,
          replyToMessageId: i > 0 ? `msg-${i - 1}` : undefined
        });
      }

      // Last message in chain should exceed depth limit
      expect(() => validateMessageThreading(messages[100], messages))
        .toThrow('Thread depth exceeds maximum');
    });

    test('should allow messages without replyToMessageId (root messages)', () => {
      const message: AgentMessage = {
        role: 'user',
        content: 'Start conversation',
        messageId: 'msg-1'
        // No replyToMessageId - this is a root message
      };

      expect(() => validateMessageThreading(message, [])).not.toThrow();
    });

    test('should allow messages without messageId (legacy)', () => {
      const message: AgentMessage = {
        role: 'user',
        content: 'Legacy message',
        // No messageId - legacy message
        replyToMessageId: 'msg-1'
      };

      expect(() => validateMessageThreading(message, [])).not.toThrow();
    });
  });

  describe('Reply Detection', () => {
    test('should detect when message has reply', () => {
      const messages: AgentMessage[] = [
        { role: 'user', content: 'Question', messageId: 'msg-1' },
        { role: 'assistant', content: 'Answer', messageId: 'msg-2', replyToMessageId: 'msg-1' }
      ];

      // Check if msg-1 has a reply
      const hasReply = messages.some(m => m.replyToMessageId === 'msg-1');
      expect(hasReply).toBe(true);
    });

    test('should detect when message has NO reply', () => {
      const messages: AgentMessage[] = [
        { role: 'user', content: 'Question 1', messageId: 'msg-1' },
        { role: 'user', content: 'Question 2', messageId: 'msg-2' },
        { role: 'assistant', content: 'Answer to Q1', messageId: 'msg-3', replyToMessageId: 'msg-1' }
      ];

      // Check if msg-2 has a reply
      const hasReply = messages.some(m => m.replyToMessageId === 'msg-2');
      expect(hasReply).toBe(false); // msg-2 has no reply
    });

    test('should handle legacy messages without messageId', () => {
      const messages: AgentMessage[] = [
        { role: 'user', content: 'Legacy question' }, // No messageId
        { role: 'assistant', content: 'Answer', messageId: 'msg-2' }
      ];

      // Legacy messages can't be checked for replies
      const hasReply = messages.some(m => m.replyToMessageId === undefined);
      expect(hasReply).toBe(true); // Can't determine reply status
    });
  });

  describe('Thread Traversal', () => {
    test('should traverse thread from reply to root', () => {
      const messages: AgentMessage[] = [
        { role: 'user', content: 'Root', messageId: 'msg-1' },
        { role: 'assistant', content: 'Reply 1', messageId: 'msg-2', replyToMessageId: 'msg-1' },
        { role: 'user', content: 'Reply 2', messageId: 'msg-3', replyToMessageId: 'msg-2' },
        { role: 'assistant', content: 'Reply 3', messageId: 'msg-4', replyToMessageId: 'msg-3' }
      ];

      // Traverse from msg-4 to root
      const thread: AgentMessage[] = [];
      let current: AgentMessage | undefined = messages[3]; // Start at msg-4

      while (current) {
        thread.push(current);
        current = messages.find(m => m.messageId === current?.replyToMessageId);
      }

      expect(thread).toHaveLength(4);
      expect(thread[0].messageId).toBe('msg-4'); // Start
      expect(thread[3].messageId).toBe('msg-1'); // Root
    });

    test('should find all replies to a message', () => {
      const messages: AgentMessage[] = [
        { role: 'user', content: 'Question', messageId: 'msg-1' },
        { role: 'assistant', content: 'Reply from A', messageId: 'msg-2', replyToMessageId: 'msg-1' },
        { role: 'assistant', content: 'Reply from B', messageId: 'msg-3', replyToMessageId: 'msg-1' },
        { role: 'assistant', content: 'Reply from C', messageId: 'msg-4', replyToMessageId: 'msg-1' }
      ];

      // Find all replies to msg-1
      const replies = messages.filter(m => m.replyToMessageId === 'msg-1');

      expect(replies).toHaveLength(3);
      expect(replies.map(r => r.messageId)).toEqual(['msg-2', 'msg-3', 'msg-4']);
    });
  });

  describe('Edge Cases - Unit', () => {
    test('should handle empty memory', () => {
      const message: AgentMessage = {
        role: 'user',
        content: 'Test',
        messageId: 'msg-1'
      };

      // Validation with empty allMessages array
      expect(() => validateMessageThreading(message, [])).not.toThrow();
    });

    test('should handle missing messageId in validation', () => {
      const message: AgentMessage = {
        role: 'user',
        content: 'Test',
        replyToMessageId: 'msg-1'
        // No messageId
      };

      // Should not throw even without messageId
      expect(() => validateMessageThreading(message, [])).not.toThrow();
    });
  }); // End Edge Cases - Unit
});
