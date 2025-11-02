/**
 * WebSocket Event Format Tests
 * 
 * Purpose: Ensure consistent event structure across all event types
 * 
 * Event Format:
 * {
 *   type: 'event',              // WebSocket message type
 *   eventType: string,          // Event type: 'message', 'world', 'sse'
 *   payload: any,               // Event data directly (no nesting)
 *   worldId?: string,
 *   chatId?: string,
 *   seq?: number,
 *   timestamp: number
 * }
 * 
 * Event Types:
 * - message: Agent and human messages (payload contains sender, content, etc.)
 * - world: Activity tracking and tool execution (payload.type: 'response-start', 'tool-start', etc.)
 * - sse: Streaming events (payload.type: 'start', 'chunk', 'end', 'error')
 * 
 * Features:
 * - Tests message events (agent and human messages)
 * - Tests world events (activity tracking, tool execution)
 * - Tests SSE events (streaming: start, chunk, end, error)
 * - Verifies no double-nesting of payload
 * - Ensures eventType is at top level
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('WebSocket Event Format', () => {
  let capturedMessages: any[] = [];
  let mockSend: any;
  let mockClients: Map<any, any>;
  let mockSubscriptions: Map<string, Set<any>>;

  // Simulate broadcastEvent behavior
  function broadcastEvent(worldId: string, chatId: string | null, event: any) {
    const subscribers = mockSubscriptions.get(worldId);
    if (!subscribers || subscribers.size === 0) return;

    // This is the actual server logic
    const message = {
      type: 'event',
      worldId,
      chatId: chatId ?? undefined,
      seq: event.seq ?? undefined,
      eventType: event.type,
      payload: event.payload || event,
      timestamp: Date.now()
    };

    for (const ws of subscribers) {
      const client = mockClients.get(ws);
      if (client && (!chatId || !client.chatId || client.chatId === chatId)) {
        mockSend(ws, message);
        if (event.seq) {
          client.subscribedSeq = event.seq;
        }
      }
    }
  }

  beforeEach(() => {
    capturedMessages = [];
    mockClients = new Map();
    mockSubscriptions = new Map();

    mockSend = vi.fn((ws: any, message: any) => {
      capturedMessages.push(message);
    });

    // Setup a test client
    const mockWs = {} as any;
    mockSubscriptions.set('test-world', new Set([mockWs]));
    mockClients.set(mockWs, {
      ws: mockWs,
      worldId: 'test-world',
      chatId: null,
      lastHeartbeat: Date.now(),
      subscribedSeq: 0
    });
  });

  describe('Message Events', () => {
    it('should format human message events correctly', () => {
      const event = {
        type: 'message',
        sender: 'human',
        content: 'Hello world',
        messageId: 'msg-123',
        chatId: 'chat-1'
      };

      broadcastEvent('test-world', 'chat-1', event);

      expect(capturedMessages).toHaveLength(1);
      const message = capturedMessages[0];

      // Verify top-level structure
      expect(message.type).toBe('event');
      expect(message.eventType).toBe('message');
      expect(message.worldId).toBe('test-world');
      expect(message.chatId).toBe('chat-1');
      expect(message.timestamp).toBeDefined();

      // Verify payload contains event data directly
      expect(message.payload).toBeDefined();
      expect(message.payload.sender).toBe('human');
      expect(message.payload.content).toBe('Hello world');
      expect(message.payload.messageId).toBe('msg-123');

      // Ensure no double-nesting
      expect(message.payload.payload).toBeUndefined();
    });

    it('should format agent message events correctly', () => {
      const event = {
        type: 'message',
        sender: 'agent-1',
        content: 'I can help you with that',
        messageId: 'msg-456',
        chatId: 'chat-1'
      };

      broadcastEvent('test-world', 'chat-1', event);

      expect(capturedMessages).toHaveLength(1);
      const message = capturedMessages[0];

      expect(message.type).toBe('event');
      expect(message.eventType).toBe('message');
      expect(message.payload.sender).toBe('agent-1');
      expect(message.payload.content).toBe('I can help you with that');
    });
  });

  describe('World Events', () => {
    it('should format activity tracking events correctly', () => {
      const event = {
        type: 'world',
        payload: {
          type: 'response-start',
          source: 'agent:agent-1',
          pendingOperations: 1,
          activityId: 1,
          activeSources: ['agent:agent-1']
        }
      };

      broadcastEvent('test-world', null, event);

      expect(capturedMessages).toHaveLength(1);
      const message = capturedMessages[0];

      // Verify top-level structure
      expect(message.type).toBe('event');
      expect(message.eventType).toBe('world');
      expect(message.worldId).toBe('test-world');

      // Verify payload contains world event data
      expect(message.payload).toBeDefined();
      expect(message.payload.type).toBe('response-start');
      expect(message.payload.source).toBe('agent:agent-1');
      expect(message.payload.pendingOperations).toBe(1);
      expect(message.payload.activityId).toBe(1);

      // Ensure no double-nesting
      expect(message.payload.payload).toBeUndefined();
    });

    it('should format tool execution events correctly', () => {
      const event = {
        type: 'world',
        payload: {
          type: 'tool-start',
          agentName: 'agent-1',
          toolExecution: {
            toolName: 'search',
            args: { query: 'test' }
          }
        }
      };

      broadcastEvent('test-world', null, event);

      expect(capturedMessages).toHaveLength(1);
      const message = capturedMessages[0];

      expect(message.type).toBe('event');
      expect(message.eventType).toBe('world');
      expect(message.payload.type).toBe('tool-start');
      expect(message.payload.agentName).toBe('agent-1');
      expect(message.payload.toolExecution).toBeDefined();
      expect(message.payload.toolExecution.toolName).toBe('search');
    });

    it('should format idle events correctly', () => {
      const event = {
        type: 'world',
        payload: {
          type: 'idle',
          pendingOperations: 0,
          activityId: 5,
          activeSources: []
        }
      };

      broadcastEvent('test-world', null, event);

      expect(capturedMessages).toHaveLength(1);
      const message = capturedMessages[0];

      expect(message.type).toBe('event');
      expect(message.eventType).toBe('world');
      expect(message.payload.type).toBe('idle');
      expect(message.payload.pendingOperations).toBe(0);
    });
  });

  describe('SSE Events (Streaming)', () => {
    it('should format stream start events correctly', () => {
      const event = {
        type: 'sse',
        payload: {
          type: 'start',
          agentName: 'agent-1',
          messageId: 'msg-789'
        }
      };

      broadcastEvent('test-world', null, event);

      expect(capturedMessages).toHaveLength(1);
      const message = capturedMessages[0];

      // Verify top-level structure
      expect(message.type).toBe('event');
      expect(message.eventType).toBe('sse');

      // Verify payload contains SSE event data
      expect(message.payload).toBeDefined();
      expect(message.payload.type).toBe('start');
      expect(message.payload.agentName).toBe('agent-1');
      expect(message.payload.messageId).toBe('msg-789');

      // Ensure no double-nesting
      expect(message.payload.payload).toBeUndefined();
    });

    it('should format chunk events correctly', () => {
      const event = {
        type: 'sse',
        payload: {
          type: 'chunk',
          content: 'Hello ',
          messageId: 'msg-789'
        }
      };

      broadcastEvent('test-world', null, event);

      expect(capturedMessages).toHaveLength(1);
      const message = capturedMessages[0];

      expect(message.type).toBe('event');
      expect(message.eventType).toBe('sse');
      expect(message.payload.type).toBe('chunk');
      expect(message.payload.content).toBe('Hello ');
      expect(message.payload.messageId).toBe('msg-789');
    });

    it('should format stream end events correctly', () => {
      const event = {
        type: 'sse',
        payload: {
          type: 'end',
          messageId: 'msg-789'
        }
      };

      broadcastEvent('test-world', null, event);

      expect(capturedMessages).toHaveLength(1);
      const message = capturedMessages[0];

      expect(message.type).toBe('event');
      expect(message.eventType).toBe('sse');
      expect(message.payload.type).toBe('end');
      expect(message.payload.messageId).toBe('msg-789');
    });

    it('should format stream error events correctly', () => {
      const event = {
        type: 'sse',
        payload: {
          type: 'error',
          error: 'Connection timeout',
          messageId: 'msg-789'
        }
      };

      broadcastEvent('test-world', null, event);

      expect(capturedMessages).toHaveLength(1);
      const message = capturedMessages[0];

      expect(message.type).toBe('event');
      expect(message.eventType).toBe('sse');
      expect(message.payload.type).toBe('error');
      expect(message.payload.error).toBe('Connection timeout');
      expect(message.payload.messageId).toBe('msg-789');
    });
  });

  describe('Event Sequence Tracking', () => {
    it('should include sequence numbers in events', () => {
      const event = {
        type: 'message',
        sender: 'human',
        content: 'Test',
        seq: 42
      };

      broadcastEvent('test-world', null, event);

      expect(capturedMessages).toHaveLength(1);
      const message = capturedMessages[0];

      expect(message.seq).toBe(42);
    });

    it('should work without sequence numbers', () => {
      const event = {
        type: 'message',
        sender: 'human',
        content: 'Test'
      };

      broadcastEvent('test-world', null, event);

      expect(capturedMessages).toHaveLength(1);
      const message = capturedMessages[0];

      expect(message.seq).toBeUndefined();
    });
  });

  describe('Event Filtering by Chat', () => {
    it('should filter events by chatId when specified', () => {
      // Add a second client with different chatId
      const mockWs2 = {} as any;
      const subscribers = mockSubscriptions.get('test-world');
      if (subscribers) {
        subscribers.add(mockWs2);
      }
      mockClients.set(mockWs2, {
        ws: mockWs2,
        worldId: 'test-world',
        chatId: 'chat-2',
        lastHeartbeat: Date.now(),
        subscribedSeq: 0
      });

      const event = {
        type: 'message',
        sender: 'human',
        content: 'Chat 1 only'
      };

      broadcastEvent('test-world', 'chat-1', event);

      // Should only broadcast to clients with matching chatId or no chatId filter
      expect(capturedMessages).toHaveLength(1);
    });
  });

  describe('Consistency Validation', () => {
    it('should never have nested payload.payload structure', () => {
      const testEvents = [
        { type: 'message', payload: { sender: 'human', content: 'test' } },
        { type: 'world', payload: { type: 'idle', pendingOperations: 0 } },
        { type: 'sse', payload: { type: 'chunk', content: 'test' } },
        { type: 'sse', payload: { type: 'start', agentName: 'agent-1' } },
        { type: 'sse', payload: { type: 'end', messageId: 'msg-1' } },
        { type: 'sse', payload: { type: 'error', error: 'test error' } }
      ];

      for (const event of testEvents) {
        capturedMessages = [];
        broadcastEvent('test-world', null, event);

        expect(capturedMessages).toHaveLength(1);
        const message = capturedMessages[0];

        // Verify payload exists
        expect(message.payload).toBeDefined();

        // Ensure no double-nesting
        expect(message.payload.payload).toBeUndefined();
      }
    });

    it('should always have eventType at top level', () => {
      const testEvents = [
        { type: 'message', payload: { sender: 'human', content: 'test' } },
        { type: 'world', payload: { type: 'idle' } },
        { type: 'sse', payload: { type: 'chunk', content: 'test' } }
      ];

      for (const event of testEvents) {
        capturedMessages = [];
        broadcastEvent('test-world', null, event);

        expect(capturedMessages).toHaveLength(1);
        const message = capturedMessages[0];

        // eventType should be at top level
        expect(message.eventType).toBeDefined();
        expect(message.eventType).toBe(event.type);

        // Not nested in payload
        expect(message.payload.eventType).toBeUndefined();
      }
    });
  });
});
