/**
 * Cross-Agent Threading Integration Tests
 * 
 * Tests the complete flow of replyToMessageId preservation across agents
 * when messages are saved to multiple agents' memory.
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { saveIncomingMessageToMemory } from '../../../core/events.js';
import { LLMProvider, type World, type Agent, type WorldMessageEvent } from '../../../core/types.js';
import { EventEmitter } from 'events';

// Skip complex mocking for now - just test the core logic
jest.mock('../../../core/storage/storage-factory.js');

describe('Cross-Agent Threading Integration', () => {
  let mockWorld: World;
  let agentA1: Agent;
  let agentA2: Agent;

  beforeEach(() => {
    mockWorld = {
      id: 'test-world',
      name: 'Test World',
      description: 'Test',
      currentChatId: 'chat-123',
      agents: new Map(),
      chats: new Map(),
      createdAt: new Date(),
      lastUpdated: new Date(),
      turnLimit: 5,
      totalAgents: 2,
      totalMessages: 0,
      isProcessing: false,
      eventEmitter: new EventEmitter()
    };

    agentA1 = {
      id: 'a1',
      name: 'Agent A1',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      status: 'active',
      memory: [],
      createdAt: new Date(),
      lastActive: new Date(),
      llmCallCount: 0
    };

    agentA2 = {
      id: 'a2',
      name: 'Agent A2',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      status: 'active',
      memory: [],
      createdAt: new Date(),
      lastActive: new Date(),
      llmCallCount: 0
    };
  });

  test('should preserve replyToMessageId when saving cross-agent messages', async () => {
    // This test validates the fix in saveIncomingMessageToMemory function
    // where replyToMessageId was being lost for cross-agent messages

    // 1. Human message saved to both agents
    const humanMessage: WorldMessageEvent = {
      content: '@a1 tell @a2 hello',
      sender: 'HUMAN',
      messageId: 'msg-human-1',
      timestamp: new Date()
    };

    await saveIncomingMessageToMemory(mockWorld, agentA1, humanMessage);
    await saveIncomingMessageToMemory(mockWorld, agentA2, humanMessage);

    // 2. A1's reply message sent to a2 (cross-agent message)
    const a1ReplyMessage: WorldMessageEvent = {
      content: '@a2 hello there!',
      sender: 'a1',
      messageId: 'msg-a1-reply-1',
      replyToMessageId: 'msg-human-1', // CRITICAL: This should be preserved
      timestamp: new Date()
    };

    // 3. Save a1's reply to a2's memory - this is where the bug was
    await saveIncomingMessageToMemory(mockWorld, agentA2, a1ReplyMessage);

    // 4. Verify threading is preserved
    expect(agentA2.memory).toHaveLength(2); // Human message + a1's reply

    const a1MessageInA2Memory = agentA2.memory.find(m => m.sender === 'a1');
    expect(a1MessageInA2Memory).toBeDefined();

    // This is the key assertion - before the fix, this would be undefined
    expect(a1MessageInA2Memory?.replyToMessageId).toBe('msg-human-1'); // Threading preserved!
    expect(a1MessageInA2Memory?.messageId).toBe('msg-a1-reply-1');
    expect(a1MessageInA2Memory?.sender).toBe('a1');
    expect(a1MessageInA2Memory?.role).toBe('user'); // Cross-agent messages saved as user role
  });

  test('should handle messages without replyToMessageId (root messages)', async () => {
    // Test that messages without threading info still work
    const rootMessage: WorldMessageEvent = {
      content: 'Root message without threading',
      sender: 'a1',
      messageId: 'msg-root',
      // No replyToMessageId
      timestamp: new Date()
    };

    await saveIncomingMessageToMemory(mockWorld, agentA2, rootMessage);

    expect(agentA2.memory).toHaveLength(1);
    const savedMessage = agentA2.memory[0];
    expect(savedMessage.replyToMessageId).toBeUndefined();
    expect(savedMessage.messageId).toBe('msg-root');
  });

  test('should support the exact export scenario that was failing', async () => {
    // Simulate the exact scenario from the user's export issue
    // where messages showed "incoming from" instead of "reply"

    // 1. Human message to a1
    const humanMessage: WorldMessageEvent = {
      content: '@a1 tell @a2 a good word',
      sender: 'HUMAN',
      messageId: 'UZxAs6pWWELjov6oJerk_',
      timestamp: new Date('2025-10-27T03:43:28.163Z')
    };
    await saveIncomingMessageToMemory(mockWorld, agentA1, humanMessage);

    // 2. A1's message sent to a2 (this is the critical cross-agent message)
    const a1ToA2Message: WorldMessageEvent = {
      content: '@a2, here\'s a good word for you: radiant!',
      sender: 'a1',
      messageId: 'YLh3Do2_HDEymz4iCuHv2',
      replyToMessageId: 'UZxAs6pWWELjov6oJerk_', // CRITICAL: Should be preserved
      timestamp: new Date('2025-10-27T03:43:30.268Z')
    };
    await saveIncomingMessageToMemory(mockWorld, agentA2, a1ToA2Message);

    // 3. Verify a1's message in a2's memory has threading preserved
    const a1MessageInA2 = agentA2.memory.find(m => m.sender === 'a1' && m.role === 'user');
    expect(a1MessageInA2).toBeDefined();
    expect(a1MessageInA2?.replyToMessageId).toBe('UZxAs6pWWELjov6oJerk_');

    // This message should now be detectable as a reply (has replyToMessageId)
    // so export logic will show "Agent: a1 (reply)" instead of "Agent: a2 (incoming from a1)"
    expect(a1MessageInA2?.role).toBe('user');
    expect(a1MessageInA2?.sender).toBe('a1');
    expect(a1MessageInA2?.replyToMessageId).toBeDefined(); // Has threading = it's a reply!
  });
});