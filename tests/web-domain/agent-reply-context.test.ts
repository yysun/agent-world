/**
 * Agent Reply Context Display - Manual Test
 * 
 * This test creates mock messages to verify the enhanced agent reply context
 * display functionality shows proper reply targets.
 */

import { describe, test, expect } from 'vitest';
import type { Message } from '../../web/src/types';
import { SenderType, getSenderType } from '../../web/src/utils/sender-type';

describe('Agent Reply Context Display', () => {
  // Mock the helper function as it would be defined in world-chat.tsx
  const getReplyTarget = (message: Message, allMessages: Message[]): string | null => {
    if (!message.replyToMessageId) return null;

    const parentMessage = allMessages.find(m => m.messageId === message.replyToMessageId);
    if (!parentMessage) return null;

    const senderType = getSenderType(parentMessage.sender);
    return senderType === SenderType.HUMAN ? 'human' : parentMessage.sender;
  };

  // Mock the display label generation logic
  const generateDisplayLabel = (message: Message, allMessages: Message[]): string => {
    const senderType = getSenderType(message.sender);
    const isIncomingMessage = message.type === 'user' || message.type === 'human';
    const isReplyMessage = isIncomingMessage && message.replyToMessageId;

    if (senderType === SenderType.HUMAN) {
      return 'From: human';
    } else if (senderType === SenderType.AGENT) {
      if (isReplyMessage || message.type === 'assistant' || message.type === 'agent') {
        const replyTarget = getReplyTarget(message, allMessages);
        if (replyTarget) {
          return `Agent: ${message.sender} (reply to ${replyTarget})`;
        } else {
          return `Agent: ${message.sender} (reply)`;
        }
      }
      return `Agent: ${message.sender}`;
    } else {
      return message.sender;
    }
  };

  test('should show human reply target for agent replying to human', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        type: 'user',
        sender: 'human',
        text: 'Hi there',
        createdAt: new Date(),
        messageId: 'backend-msg-1'
      },
      {
        id: 'msg-2',
        type: 'assistant',
        sender: 'a1',
        text: 'Hello back!',
        createdAt: new Date(),
        messageId: 'backend-msg-2',
        replyToMessageId: 'backend-msg-1'
      }
    ];

    const displayLabel = generateDisplayLabel(messages[1], messages);
    expect(displayLabel).toBe('Agent: a1 (reply to human)');
  });

  test('should show agent reply target for agent replying to agent', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        type: 'assistant',
        sender: 'a1',
        text: 'Hello, other agent!',
        createdAt: new Date(),
        messageId: 'backend-msg-1'
      },
      {
        id: 'msg-2',
        type: 'assistant',
        sender: 'a2',
        text: 'Hello back, a1!',
        createdAt: new Date(),
        messageId: 'backend-msg-2',
        replyToMessageId: 'backend-msg-1'
      }
    ];

    const displayLabel = generateDisplayLabel(messages[1], messages);
    expect(displayLabel).toBe('Agent: a2 (reply to a1)');
  });

  test('should fall back to generic reply when parent message not found', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        type: 'assistant',
        sender: 'a1',
        text: 'Reply to missing message',
        createdAt: new Date(),
        messageId: 'backend-msg-1',
        replyToMessageId: 'non-existent-msg'
      }
    ];

    const displayLabel = generateDisplayLabel(messages[0], messages);
    expect(displayLabel).toBe('Agent: a1 (reply)');
  });

  test('should show generic agent label for non-reply messages', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        type: 'user', // Cross-agent incoming message without reply
        sender: 'a1',
        text: 'Cross-agent message',
        createdAt: new Date(),
        messageId: 'backend-msg-1'
        // No replyToMessageId
      }
    ];

    const displayLabel = generateDisplayLabel(messages[0], messages);
    expect(displayLabel).toBe('Agent: a1');
  });

  test('should handle human messages correctly', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        type: 'user',
        sender: 'human',
        text: 'Human message',
        createdAt: new Date(),
        messageId: 'backend-msg-1'
      }
    ];

    const displayLabel = generateDisplayLabel(messages[0], messages);
    expect(displayLabel).toBe('From: human');
  });
});