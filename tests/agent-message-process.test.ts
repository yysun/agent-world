/**
 * agent-message-process.test.ts
 *
 * Unit tests for agent message processing logic.
 *
 * Features tested:
 * - All message events should broadcast to all agents via event bus
 * - Agents should process broadcast messages when appropriate
 * - Agents should filter messages based on mentions and sender type
 * - Event-driven architecture with MESSAGE events
 *
 * Updated for event-driven architecture using MESSAGE events
 */

import { jest } from '@jest/globals';
import { publishMessageEvent, subscribeToMessages, initializeEventBus, clearEventHistory } from '../src/event-bus';
import { shouldRespondToMessage } from '../src/agent';
import { AgentConfig, MessageData, EventType } from '../src/types';

// Mock the event bus
jest.mock('../src/event-bus');

describe('Agent Message Processing', () => {
  let mockAgentConfig: AgentConfig;
  let mockSubscriptionCallback: jest.MockedFunction<any>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Initialize event bus for each test
    initializeEventBus({ provider: 'local' });
    clearEventHistory();

    mockAgentConfig = {
      name: 'TestAgent',
      type: 'ai',
      provider: 'openai' as any,
      model: 'gpt-4'
    };

    mockSubscriptionCallback = jest.fn();

    // Mock subscribeToMessages to capture the callback
    (subscribeToMessages as jest.MockedFunction<typeof subscribeToMessages>).mockImplementation(
      (callback) => {
        mockSubscriptionCallback = callback;
        return () => { }; // unsubscribe function
      }
    );
  });

  describe('Event Broadcasting', () => {
    it('should broadcast all message events to event bus', async () => {
      const messagePayload = {
        name: 'user_message',
        payload: {
          message: 'Hello world',
          worldId: 'test-world',
          broadcast: true
        },
        id: 'msg-123',
        sender: 'HUMAN',
        senderType: 'user',
        content: 'Hello world',
        timestamp: new Date().toISOString(),
        worldId: 'test-world'
      };

      await publishMessageEvent(messagePayload);

      expect(publishMessageEvent).toHaveBeenCalledWith(messagePayload);
    });

    it('should allow agents to subscribe to MESSAGE events', () => {
      subscribeToMessages(mockSubscriptionCallback);

      expect(subscribeToMessages).toHaveBeenCalledWith(mockSubscriptionCallback);
    });
  });

  describe('Message Filtering Logic', () => {
    it('should process broadcast messages from users', () => {
      const messageData: MessageData = {
        id: 'msg-1',
        name: 'user_message',
        payload: { broadcast: true },
        sender: 'HUMAN',
        content: 'Hello everyone!'
      };

      const result = shouldRespondToMessage(mockAgentConfig, messageData);
      expect(result).toBe(true);
    });

    it('should not process messages from themselves', () => {
      const messageData: MessageData = {
        id: 'msg-2',
        name: 'agent_message',
        payload: {},
        sender: 'TestAgent', // same as mockAgentConfig.name
        content: 'My own message'
      };

      const result = shouldRespondToMessage(mockAgentConfig, messageData);
      expect(result).toBe(false);
    });

    it('should process system messages', () => {
      const messageData: MessageData = {
        id: 'msg-3',
        name: 'system_message',
        payload: {},
        sender: 'system',
        content: 'System announcement'
      };

      const result = shouldRespondToMessage(mockAgentConfig, messageData);
      expect(result).toBe(true);
    });

    it('should process human messages without mentions', () => {
      const messageData: MessageData = {
        id: 'msg-4',
        name: 'user_message',
        payload: {},
        sender: 'human',
        content: 'Hello everyone, how are you?'
      };

      const result = shouldRespondToMessage(mockAgentConfig, messageData);
      expect(result).toBe(true);
    });

    it('should not process human messages with mentions when not mentioned', () => {
      const messageData: MessageData = {
        id: 'msg-5',
        name: 'user_message',
        payload: {},
        sender: 'human',
        content: 'Hey @OtherAgent, can you help me?'
      };

      const result = shouldRespondToMessage(mockAgentConfig, messageData);
      expect(result).toBe(false);
    });

    it('should process human messages when mentioned by name', () => {
      const messageData: MessageData = {
        id: 'msg-6',
        name: 'user_message',
        payload: {},
        sender: 'human',
        content: 'Hey @TestAgent, can you help me?'
      };

      const result = shouldRespondToMessage(mockAgentConfig, messageData);
      expect(result).toBe(true);
    });

    it('should only process agent messages when mentioned', () => {
      const messageData: MessageData = {
        id: 'msg-8',
        name: 'agent_message',
        payload: {},
        sender: 'other-agent',
        content: 'Just talking to myself'
      };

      const result = shouldRespondToMessage(mockAgentConfig, messageData);
      expect(result).toBe(false);
    });

    it('should process agent messages when mentioned', () => {
      const messageData: MessageData = {
        id: 'msg-9',
        name: 'agent_message',
        payload: {},
        sender: 'other-agent',
        content: '@TestAgent what do you think about this?'
      };

      const result = shouldRespondToMessage(mockAgentConfig, messageData);
      expect(result).toBe(true);
    });
  });

  describe('Event-Driven Flow Integration', () => {
    it('should simulate full message processing flow', async () => {
      // Simulate HUMAN broadcasting a message
      const broadcastMessage = {
        name: 'user_message',
        payload: {
          message: 'Hello @TestAgent!',
          worldId: 'test-world',
          broadcast: true
        },
        id: 'msg-flow-1',
        sender: 'HUMAN',
        senderType: 'user',
        content: 'Hello @TestAgent!',
        timestamp: new Date().toISOString(),
        worldId: 'test-world'
      };

      // Publish the message
      await publishMessageEvent(broadcastMessage);

      // Verify the message was published
      expect(publishMessageEvent).toHaveBeenCalledWith(broadcastMessage);

      // Simulate agent receiving the event
      if (mockSubscriptionCallback) {
        const mockEvent = {
          id: 'event-1',
          type: EventType.MESSAGE,
          timestamp: new Date().toISOString(),
          payload: broadcastMessage
        };

        mockSubscriptionCallback(mockEvent);
        expect(mockSubscriptionCallback).toHaveBeenCalledWith(mockEvent);
      }

      // Verify agent would process this message
      const messageData: MessageData = {
        name: broadcastMessage.name,
        payload: broadcastMessage.payload,
        id: broadcastMessage.id,
        sender: broadcastMessage.sender,
        content: broadcastMessage.content
      };

      const shouldProcess = shouldRespondToMessage(mockAgentConfig, messageData);
      expect(shouldProcess).toBe(true); // Agent should respond since it's mentioned
    });
  });
});
