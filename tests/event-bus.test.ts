/*
 * Event Bus Tests - Unit tests for function-based event system
 * 
 * Features:
 * - Tests all core event bus functions
 * - Validates local provider functionality  
 * - Tests event filtering and routing
 * - Verifies statistics and history tracking
 * - Tests agent-specific subscriptions
 * - Validates topic-based publishing and subscribing
 * 
 * Logic:
 * - Uses Jest for testing framework
 * - Mocks external dependencies where needed
 * - Tests both success and error scenarios
 * - Validates event structure and validation
 * - Tests subscription/unsubscription lifecycle
 * 
 * Changes:
 * - Created comprehensive test suite for new event bus
 * - Covers all function-based API operations
 * - Tests provider pattern implementation
 * - Validates backward compatibility requirements
 */

import {
  initializeEventBus,
  publishEvent,
  publishMessageEvent,
  publishWorldEvent,
  publishSSE,
  subscribeToTopic,
  subscribeToAgent,
  subscribeToMessages,
  subscribeToWorld,
  subscribeToSSE,
  subscribeToAll,
  getEventHistory,
  getEventStats,
  clearEventHistory,
  TOPICS
} from '../src/event-bus';
import { EventType } from '../src/types';

describe('Event Bus', () => {
  beforeEach(() => {
    // Initialize with test configuration
    initializeEventBus({
      provider: 'local',
      maxEventHistory: 100,
      enableLogging: false // Disable logging in tests
    });

    // Clear history before each test
    clearEventHistory();
  });

  describe('Core Functions', () => {
    it('should publish and receive events', async () => {
      const events: any[] = [];

      const unsubscribe = subscribeToTopic(TOPICS.MESSAGES, (event) => {
        events.push(event);
      });

      const testEvent = {
        type: EventType.MESSAGE,
        payload: { content: 'test data', sender: 'test-agent' }
      };

      await publishEvent(TOPICS.MESSAGES, testEvent);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(EventType.MESSAGE);
      expect(events[0].payload).toEqual({ content: 'test data', sender: 'test-agent' });
      expect(events[0].id).toBeDefined();
      expect(events[0].timestamp).toBeDefined();

      unsubscribe();
    });

    it('should handle multiple subscribers', async () => {
      const events1: any[] = [];
      const events2: any[] = [];

      const unsub1 = subscribeToTopic(TOPICS.MESSAGES, (event) => events1.push(event));
      const unsub2 = subscribeToTopic(TOPICS.MESSAGES, (event) => events2.push(event));

      await publishMessageEvent({
        content: 'test data',
        sender: 'test-agent'
      });

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
      expect(events1[0].id).toBe(events2[0].id); // Same event

      unsub1();
      unsub2();
    });

    it('should unsubscribe correctly', async () => {
      const events: any[] = [];

      const unsubscribe = subscribeToTopic(TOPICS.MESSAGES, (event) => {
        events.push(event);
      });

      await publishMessageEvent({ content: 'test1', sender: 'HUMAN' });

      unsubscribe();

      await publishMessageEvent({ content: 'test2', sender: 'HUMAN' });

      expect(events).toHaveLength(1);
      expect(events[0].payload.content).toBe('test1');
    });
  });

  describe('Topic-Specific Functions', () => {
    it('should publish and subscribe to messages', async () => {
      const messages: any[] = [];

      const unsubscribe = subscribeToMessages((event) => {
        messages.push(event);
      });

      await publishMessageEvent({
        content: 'hello',
        sender: 'agent-1'
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe(EventType.MESSAGE);
      expect(messages[0].payload.content).toBe('hello');
      expect(messages[0].payload.sender).toBe('agent-1');

      unsubscribe();
    });

    it('should publish and subscribe to world events', async () => {
      const worldEvents: any[] = [];

      const unsubscribe = subscribeToWorld((event) => {
        worldEvents.push(event);
      });

      await publishWorldEvent({
        action: 'agent-created',
        agentName: 'Agent1'
      });

      expect(worldEvents).toHaveLength(1);
      expect(worldEvents[0].type).toBe(EventType.WORLD);
      expect(worldEvents[0].payload.action).toBe('agent-created');

      unsubscribe();
    });

    it('should publish and subscribe to SSE events', async () => {
      const sseEvents: any[] = [];

      const unsubscribe = subscribeToSSE((event) => {
        sseEvents.push(event);
      });

      await publishSSE({
        agentName: 'Agent1',
        type: 'chunk',
        content: 'Hello world',
        messageId: 'msg-1'
      });

      expect(sseEvents).toHaveLength(1);
      expect(sseEvents[0].type).toBe(EventType.SSE);
      expect(sseEvents[0].payload.content).toBe('Hello world');
      expect(sseEvents[0].payload.agentName).toBe('Agent1');

      unsubscribe();
    });
  });

  describe('Agent-Specific Subscriptions', () => {
    it('should route events to specific agents', async () => {
      const agent1Events: any[] = [];
      const agent2Events: any[] = [];

      const unsub1 = subscribeToAgent('Agent1', (event) => agent1Events.push(event));
      const unsub2 = subscribeToAgent('Agent2', (event) => agent2Events.push(event));

      // Send message from Agent1
      await publishMessageEvent({
        content: 'test message',
        sender: 'Agent1'
      });

      // Send SSE to Agent2
      await publishSSE({
        agentName: 'Agent2',
        type: 'chunk',
        content: 'hello'
      });

      expect(agent1Events).toHaveLength(1);
      expect(agent2Events).toHaveLength(1);

      expect(agent1Events[0].payload.sender).toBe('Agent1');
      expect(agent2Events[0].payload.agentName).toBe('Agent2');

      unsub1();
      unsub2();
    });
  });

  describe('Event Filtering', () => {
    it('should filter events by type', async () => {
      const messageEvents: any[] = [];

      const unsubscribe = subscribeToTopic(TOPICS.MESSAGES, (event) => {
        messageEvents.push(event);
      }, { types: [EventType.MESSAGE] });

      await publishMessageEvent({ content: 'msg data', sender: 'HUMAN' });
      await publishWorldEvent({ action: 'test' });

      expect(messageEvents).toHaveLength(1);
      expect(messageEvents[0].type).toBe(EventType.MESSAGE);

      unsubscribe();
    });

    it('should filter events by agent', async () => {
      const agentEvents: any[] = [];

      const unsubscribe = subscribeToAgent('Agent1', (event) => {
        agentEvents.push(event);
      });

      await publishMessageEvent({ content: 'test message 1', sender: 'Agent1' });
      await publishMessageEvent({ content: 'test message 2', sender: 'Agent2' });

      expect(agentEvents).toHaveLength(1);
      expect(agentEvents[0].payload.sender).toBe('Agent1');

      unsubscribe();
    });
  });

  describe('Event History', () => {
    it('should maintain event history', async () => {
      await publishMessageEvent({ content: 'test message 1', sender: 'Agent1' });
      await publishWorldEvent({ action: 'test1' });
      await publishSSE({ agentName: 'Agent1', type: 'chunk' });

      const history = getEventHistory();
      expect(history).toHaveLength(3);

      const messageEvents = getEventHistory({ types: [EventType.MESSAGE] });
      expect(messageEvents).toHaveLength(1);
      expect(messageEvents[0].payload.content).toBe('test message 1');
    });

    it('should limit event history size', async () => {
      // Initialize with small history limit
      initializeEventBus({
        provider: 'local',
        maxEventHistory: 2,
        enableLogging: false
      });

      await publishMessageEvent({ content: 'message 1', sender: 'agent-1' });
      await publishMessageEvent({ content: 'message 2', sender: 'agent-2' });
      await publishMessageEvent({ content: 'message 3', sender: 'agent-3' });

      const history = getEventHistory();
      expect(history).toHaveLength(2);
      expect(history[0].payload.content).toBe('message 2'); // First event dropped
      expect(history[1].payload.content).toBe('message 3');
    });

    it('should clear event history', async () => {
      await publishMessageEvent({ content: 'message 1', sender: 'agent-1' });
      await publishMessageEvent({ content: 'message 2', sender: 'agent-2' });

      expect(getEventHistory()).toHaveLength(2);

      clearEventHistory();

      expect(getEventHistory()).toHaveLength(0);
    });
  });

  describe('Event Statistics', () => {
    it('should track event statistics', async () => {
      await publishMessageEvent({ content: 'message 1', sender: 'agent-1' });
      await publishMessageEvent({ content: 'message 2', sender: 'agent-2' });
      await publishWorldEvent({ action: 'test' });

      const stats = getEventStats();
      expect(stats.totalEvents).toBe(3);
      expect(stats.eventsByType[EventType.MESSAGE]).toBe(2);
      expect(stats.eventsByType[EventType.WORLD]).toBe(1);
      expect(stats.eventsByType[EventType.SSE]).toBe(0);
      expect(stats.historySize).toBe(3);
    });
  });

  describe('Subscribe to All', () => {
    it('should subscribe to all event types', async () => {
      const allEvents: any[] = [];

      const unsubscribe = subscribeToAll((event) => {
        allEvents.push(event);
      });

      await publishMessageEvent({ content: 'test message', sender: 'Agent1' });
      await publishWorldEvent({ action: 'test' });
      await publishSSE({ agentName: 'Agent1', type: 'chunk' });

      expect(allEvents).toHaveLength(3);
      expect(allEvents[0].type).toBe(EventType.MESSAGE);
      expect(allEvents[1].type).toBe(EventType.WORLD);
      expect(allEvents[2].type).toBe(EventType.SSE);

      unsubscribe();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid event data', async () => {
      const invalidEvent = {
        type: 'INVALID_TYPE' as any,
        payload: { invalidField: 'test' } as any // Invalid payload structure
      };

      await expect(publishEvent(TOPICS.MESSAGES, invalidEvent))
        .rejects.toThrow();
    });
  });
});
