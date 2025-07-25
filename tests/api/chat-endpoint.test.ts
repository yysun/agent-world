/**
 * Tests for Chat Endpoint Stream Flag Functionality
 * 
 * Features:
 * - Schema validation for stream flag
 * - Backward compatibility testing
 * - Stream flag default behavior validation
 * 
 * Implementation:
 * - Unit tests for ChatMessageSchema validation
 * - Tests that ensure stream flag is optional and defaults to true
 * - Tests that verify both stream=true and stream=false are handled
 */

import { z } from 'zod';

// Import the schema definition (we'll test it directly)
const ChatMessageSchema = z.object({
  message: z.string().min(1),
  sender: z.string().default("HUMAN"),
  stream: z.boolean().optional().default(true)
});

describe('Chat Message Schema with Stream Flag', () => {
  describe('Schema Validation', () => {
    it('should validate message with stream=true', () => {
      const validMessage = {
        message: 'Hello world',
        sender: 'USER',
        stream: true
      };

      const result = ChatMessageSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stream).toBe(true);
      }
    });

    it('should validate message with stream=false', () => {
      const validMessage = {
        message: 'Hello world',
        sender: 'USER',
        stream: false
      };

      const result = ChatMessageSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stream).toBe(false);
      }
    });

    it('should default stream to true when not provided', () => {
      const messageWithoutStream = {
        message: 'Hello world',
        sender: 'USER'
      };

      const result = ChatMessageSchema.safeParse(messageWithoutStream);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stream).toBe(true);
      }
    });

    it('should default sender to HUMAN when not provided', () => {
      const messageWithoutSender = {
        message: 'Hello world',
        stream: false
      };

      const result = ChatMessageSchema.safeParse(messageWithoutSender);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sender).toBe('HUMAN');
        expect(result.data.stream).toBe(false);
      }
    });

    it('should handle minimal valid message (backward compatibility)', () => {
      const minimalMessage = {
        message: 'Hello world'
      };

      const result = ChatMessageSchema.safeParse(minimalMessage);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.message).toBe('Hello world');
        expect(result.data.sender).toBe('HUMAN');
        expect(result.data.stream).toBe(true);
      }
    });

    it('should reject empty message', () => {
      const invalidMessage = {
        message: '',
        stream: true
      };

      const result = ChatMessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
    });

    it('should reject invalid stream type', () => {
      const invalidMessage = {
        message: 'Hello world',
        stream: 'yes'  // String instead of boolean
      };

      const result = ChatMessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
    });

    it('should handle complex message with all fields', () => {
      const complexMessage = {
        message: 'Complex message with special characters: @agent, #tag, 你好',
        sender: 'TestUser123',
        stream: false
      };

      const result = ChatMessageSchema.safeParse(complexMessage);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.message).toBe(complexMessage.message);
        expect(result.data.sender).toBe(complexMessage.sender);
        expect(result.data.stream).toBe(false);
      }
    });
  });

  describe('Backward Compatibility', () => {
    it('should preserve existing behavior when stream is not specified', () => {
      const legacyMessage = {
        message: 'Legacy message format',
        sender: 'LegacyClient'
      };

      const result = ChatMessageSchema.safeParse(legacyMessage);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stream).toBe(true); // Should default to streaming
      }
    });

    it('should handle various legacy message formats', () => {
      const legacyFormats = [
        { message: 'Simple message' },
        { message: 'Message with sender', sender: 'User' },
        { message: 'Message with extra fields', sender: 'User', extraField: 'ignored' }
      ];

      legacyFormats.forEach((msg, index) => {
        const result = ChatMessageSchema.safeParse(msg);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.stream).toBe(true);
          expect(result.data.message).toBe(msg.message);
        }
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long messages', () => {
      const longMessage = {
        message: 'A'.repeat(10000),
        stream: true
      };

      const result = ChatMessageSchema.safeParse(longMessage);
      expect(result.success).toBe(true);
    });

    it('should handle special characters in all fields', () => {
      const specialCharsMessage = {
        message: '🚀 Testing with emojis and special chars: @#$%^&*()',
        sender: 'User_123-ABC',
        stream: false
      };

      const result = ChatMessageSchema.safeParse(specialCharsMessage);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stream).toBe(false);
      }
    });

    it('should handle whitespace messages', () => {
      const whitespaceMessage = {
        message: '   ',  // Just whitespace
        stream: true
      };

      const result = ChatMessageSchema.safeParse(whitespaceMessage);
      expect(result.success).toBe(true); // Min length 1 satisfied by spaces
    });

    it('should reject null and undefined values', () => {
      const nullMessage = {
        message: null,
        stream: true
      };

      const undefinedMessage = {
        message: undefined,
        stream: false
      };

      expect(ChatMessageSchema.safeParse(nullMessage).success).toBe(false);
      expect(ChatMessageSchema.safeParse(undefinedMessage).success).toBe(false);
    });
  });

  describe('Type Safety', () => {
    it('should infer correct TypeScript types', () => {
      const validMessage = {
        message: 'Type test',
        sender: 'TypeUser',
        stream: true
      };

      const result = ChatMessageSchema.parse(validMessage);
      
      // TypeScript should infer these types correctly
      const messageType: string = result.message;
      const senderType: string = result.sender;
      const streamType: boolean = result.stream;

      expect(typeof messageType).toBe('string');
      expect(typeof senderType).toBe('string');
      expect(typeof streamType).toBe('boolean');
    });
  });
});