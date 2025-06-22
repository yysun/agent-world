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
  publishMessage,
  publishWorld,
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
        payload: { test: 'data' }
      };

      await publishEvent(TOPICS.MESSAGES, testEvent);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(EventType.MESSAGE);
      expect(events[0].payload).toEqual({ test: 'data' });
      expect(events[0].id).toBeDefined();
      expect(events[0].timestamp).toBeDefined();

      unsubscribe();
    });

    it('should handle multiple subscribers', async () => {
      const events1: any[] = [];
      const events2: any[] = [];

      const unsub1 = subscribeToTopic(TOPICS.MESSAGES, (event) => events1.push(event));
      const unsub2 = subscribeToTopic(TOPICS.MESSAGES, (event) => events2.push(event));

      await publishMessage({
        name: 'test',
        payload: 'data',
        id: 'test-id'
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

      await publishMessage({ name: 'test1', payload: 'data1', id: 'id1' });

      unsubscribe();

      await publishMessage({ name: 'test2', payload: 'data2', id: 'id2' });

      expect(events).toHaveLength(1);
      expect(events[0].payload.name).toBe('test1');
    });
  });

  describe('Topic-Specific Functions', () => {
    it('should publish and subscribe to messages', async () => {
      const messages: any[] = [];

      const unsubscribe = subscribeToMessages((event) => {
        messages.push(event);
      });

      await publishMessage({
        name: 'test-message',
        payload: { content: 'hello' },
        id: 'msg-1',
        agentId: 'agent-1'
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe(EventType.MESSAGE);
      expect(messages[0].payload.name).toBe('test-message');
      expect(messages[0].payload.agentId).toBe('agent-1');

      unsubscribe();
    });

    it('should publish and subscribe to world events', async () => {
      const worldEvents: any[] = [];

      const unsubscribe = subscribeToWorld((event) => {
        worldEvents.push(event);
      });

      await publishWorld({
        action: 'agent-created',
        agentId: 'agent-1'
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
        agentId: 'agent-1',
        type: 'response',
        content: 'Hello world',
        messageId: 'msg-1'
      });

      expect(sseEvents).toHaveLength(1);
      expect(sseEvents[0].type).toBe(EventType.SSE);
      expect(sseEvents[0].payload.content).toBe('Hello world');
      expect(sseEvents[0].payload.agentId).toBe('agent-1');

      unsubscribe();
    });
  });

  describe('Agent-Specific Subscriptions', () => {
    it('should route events to specific agents', async () => {
      const agent1Events: any[] = [];
      const agent2Events: any[] = [];

      const unsub1 = subscribeToAgent('agent-1', (event) => agent1Events.push(event));
      const unsub2 = subscribeToAgent('agent-2', (event) => agent2Events.push(event));

      // Send message from agent-1
      await publishMessage({
        name: 'test',
        payload: { data: 'test' },
        id: 'msg-1',
        agentId: 'agent-1',
        sender: 'agent-1'
      });

      // Send SSE to agent-2
      await publishSSE({
        agentId: 'agent-2',
        type: 'response',
        content: 'hello'
      });

      expect(agent1Events).toHaveLength(1);
      expect(agent2Events).toHaveLength(1);

      expect(agent1Events[0].payload.sender).toBe('agent-1');
      expect(agent2Events[0].payload.agentId).toBe('agent-2');

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

      await publishMessage({ name: 'msg', payload: 'data', id: 'id1' });
      await publishWorld({ action: 'test' });

      expect(messageEvents).toHaveLength(1);
      expect(messageEvents[0].type).toBe(EventType.MESSAGE);

      unsubscribe();
    });

    it('should filter events by agent', async () => {
      const agentEvents: any[] = [];

      const unsubscribe = subscribeToMessages((event) => {
        agentEvents.push(event);
      }, { agentId: 'agent-1' });

      await publishMessage({ name: 'msg1', payload: { data: 'test' }, id: 'id1', agentId: 'agent-1', sender: 'agent-1' });
      await publishMessage({ name: 'msg2', payload: { data: 'test' }, id: 'id2', agentId: 'agent-2', sender: 'agent-2' });

      expect(agentEvents).toHaveLength(1);
      expect(agentEvents[0].payload.sender).toBe('agent-1');

      unsubscribe();
    });
  });

  describe('Event History', () => {
    it('should maintain event history', async () => {
      await publishMessage({ name: 'msg1', payload: 'data1', id: 'id1' });
      await publishWorld({ action: 'test1' });
      await publishSSE({ agentId: 'agent-1', type: 'response' });

      const history = getEventHistory();
      expect(history).toHaveLength(3);

      const messageEvents = getEventHistory({ types: [EventType.MESSAGE] });
      expect(messageEvents).toHaveLength(1);
      expect(messageEvents[0].payload.name).toBe('msg1');
    });

    it('should limit event history size', async () => {
      // Initialize with small history limit
      initializeEventBus({
        provider: 'local',
        maxEventHistory: 2,
        enableLogging: false
      });

      await publishMessage({ name: 'msg1', payload: 'data', id: 'id1' });
      await publishMessage({ name: 'msg2', payload: 'data', id: 'id2' });
      await publishMessage({ name: 'msg3', payload: 'data', id: 'id3' });

      const history = getEventHistory();
      expect(history).toHaveLength(2);
      expect(history[0].payload.name).toBe('msg2'); // First event dropped
      expect(history[1].payload.name).toBe('msg3');
    });

    it('should clear event history', async () => {
      await publishMessage({ name: 'msg1', payload: 'data', id: 'id1' });
      await publishMessage({ name: 'msg2', payload: 'data', id: 'id2' });

      expect(getEventHistory()).toHaveLength(2);

      clearEventHistory();

      expect(getEventHistory()).toHaveLength(0);
    });
  });

  describe('Event Statistics', () => {
    it('should track event statistics', async () => {
      await publishMessage({ name: 'msg1', payload: 'data', id: 'id1' });
      await publishMessage({ name: 'msg2', payload: 'data', id: 'id2' });
      await publishWorld({ action: 'test' });

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

      await publishMessage({ name: 'msg', payload: 'data', id: 'id1' });
      await publishWorld({ action: 'test' });
      await publishSSE({ agentId: 'agent-1', type: 'response' });

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
        payload: {} // Empty object instead of null
      };

      await expect(publishEvent(TOPICS.MESSAGES, invalidEvent))
        .rejects.toThrow();
    });
  });
});
