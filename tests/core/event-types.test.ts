/**
 * Event Types Enhancement Tests
 * 
 * Tests for enhanced EventType enum, EventPayloadMap, and TypedEventBridge
 * functionality. Validates type safety, backward compatibility, and performance.
 * 
 * Features tested:
 * - EventType enum string value compatibility
 * - EventPayloadMap type mapping accuracy
 * - TypedEventBridge functionality and zero overhead
 * - Compile-time type validation (via TypeScript compilation)
 * - Backward compatibility with existing string-based usage
 * 
 * @since 2025-10-30
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import {
  EventType,
  EventPayloadMap,
  createTypedEventBridge,
  WorldMessageEvent,
  WorldSSEEvent,
  WorldToolEvent,
  WorldSystemEvent,
  World
} from '../../core/types';

describe('Enhanced Event Types', () => {
  let mockWorld: World;
  let mockEventEmitter: EventEmitter;

  beforeEach(() => {
    mockEventEmitter = new EventEmitter();
    mockWorld = {
      id: 'test-world',
      name: 'Test World',
      eventEmitter: mockEventEmitter,
      agents: new Map(),
      chats: new Map(),
      turnLimit: 3,
      createdAt: new Date(),
      lastUpdated: new Date(),
      totalAgents: 0,
      totalMessages: 0
    } as World;
  });

  describe('EventType Enum', () => {
    it('should have correct string values for backward compatibility', () => {
      expect(EventType.MESSAGE).toBe('message');
      expect(EventType.SSE).toBe('sse');
      expect(EventType.WORLD).toBe('world');
      expect(EventType.SYSTEM).toBe('system');
    });

    it('should be usable as object keys', () => {
      const eventCounts = {
        [EventType.MESSAGE]: 0,
        [EventType.SSE]: 0,
        [EventType.WORLD]: 0,
        [EventType.SYSTEM]: 0
      };

      expect(eventCounts).toEqual({
        message: 0,
        sse: 0,
        world: 0,
        system: 0
      });
    });

    it('should work with EventEmitter string methods', () => {
      const handler = vi.fn();

      // Using enum values should work exactly like strings
      mockEventEmitter.on(EventType.MESSAGE, handler);
      mockEventEmitter.emit('message', { test: true });

      expect(handler).toHaveBeenCalledWith({ test: true });
    });
  });

  describe('EventPayloadMap Type Mapping', () => {
    it('should map MESSAGE to WorldMessageEvent structure', () => {
      const messagePayload: EventPayloadMap[EventType.MESSAGE] = {
        content: 'Hello world',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-123'
      };

      expect(messagePayload.content).toBe('Hello world');
      expect(messagePayload.sender).toBe('user');
      expect(messagePayload.messageId).toBe('msg-123');
      expect(messagePayload.timestamp).toBeInstanceOf(Date);
    });

    it('should map SSE to WorldSSEEvent structure', () => {
      const ssePayload: EventPayloadMap[EventType.SSE] = {
        agentName: 'test-agent',
        type: 'start',
        messageId: 'msg-123'
      };

      expect(ssePayload.agentName).toBe('test-agent');
      expect(ssePayload.type).toBe('start');
      expect(ssePayload.messageId).toBe('msg-123');
    });

    it('should map WORLD to WorldToolEvent structure', () => {
      const worldPayload: EventPayloadMap[EventType.WORLD] = {
        agentName: 'test-agent',
        type: 'tool-start',
        messageId: 'msg-123',
        toolExecution: {
          toolName: 'test-tool',
          toolCallId: 'call-123'
        }
      };

      expect(worldPayload.agentName).toBe('test-agent');
      expect(worldPayload.type).toBe('tool-start');
      expect(worldPayload.toolExecution.toolName).toBe('test-tool');
    });

    it('should map SYSTEM to WorldSystemEvent structure', () => {
      const systemPayload: EventPayloadMap[EventType.SYSTEM] = {
        content: 'System notification',
        timestamp: new Date(),
        messageId: 'sys-123'
      };

      expect(systemPayload.content).toBe('System notification');
      expect(systemPayload.timestamp).toBeInstanceOf(Date);
      expect(systemPayload.messageId).toBe('sys-123');
    });
  });

  describe('TypedEventBridge', () => {
    it('should create bridge without errors', () => {
      const bridge = createTypedEventBridge(mockWorld);

      expect(bridge).toBeDefined();
      expect(typeof bridge.emit).toBe('function');
      expect(typeof bridge.on).toBe('function');
      expect(typeof bridge.off).toBe('function');
    });

    it('should emit events with type safety', () => {
      const bridge = createTypedEventBridge(mockWorld);
      const handler = vi.fn();

      mockEventEmitter.on('message', handler);

      const messageEvent: WorldMessageEvent = {
        content: 'Test message',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-123'
      };

      const result = bridge.emit(EventType.MESSAGE, messageEvent);

      expect(result).toBe(true);
      expect(handler).toHaveBeenCalledWith(messageEvent);
    });

    it('should subscribe to events with type safety', () => {
      const bridge = createTypedEventBridge(mockWorld);
      const handler = vi.fn((payload: WorldMessageEvent) => { });

      const unsubscribe = bridge.on(EventType.MESSAGE, handler);

      const messageEvent: WorldMessageEvent = {
        content: 'Test message',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-123'
      };

      mockEventEmitter.emit('message', messageEvent);

      expect(handler).toHaveBeenCalledWith(messageEvent);
      expect(typeof unsubscribe).toBe('function');
    });

    it('should unsubscribe from events correctly', () => {
      const bridge = createTypedEventBridge(mockWorld);
      const handler = vi.fn((payload: WorldMessageEvent) => { });

      const unsubscribe = bridge.on(EventType.MESSAGE, handler);

      // Emit before unsubscribe
      mockEventEmitter.emit('message', { content: 'Test 1' });
      expect(handler).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      // Emit after unsubscribe
      mockEventEmitter.emit('message', { content: 'Test 2' });
      expect(handler).toHaveBeenCalledTimes(1); // Should not increase
    });

    it('should handle multiple event types correctly', () => {
      const bridge = createTypedEventBridge(mockWorld);
      const messageHandler = vi.fn();
      const systemHandler = vi.fn();

      bridge.on(EventType.MESSAGE, messageHandler);
      bridge.on(EventType.SYSTEM, systemHandler);

      // Emit message event
      bridge.emit(EventType.MESSAGE, {
        content: 'Test message',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-123'
      });

      // Emit system event
      bridge.emit(EventType.SYSTEM, {
        content: 'System notification',
        timestamp: new Date(),
        messageId: 'sys-123'
      });

      expect(messageHandler).toHaveBeenCalledTimes(1);
      expect(systemHandler).toHaveBeenCalledTimes(1);
    });

    it('should work alongside traditional EventEmitter usage', () => {
      const bridge = createTypedEventBridge(mockWorld);
      const bridgeHandler = vi.fn();
      const traditionalHandler = vi.fn();

      // Set up both typed and traditional handlers
      bridge.on(EventType.MESSAGE, bridgeHandler);
      mockEventEmitter.on('message', traditionalHandler);

      const messageEvent = {
        content: 'Test message',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-123'
      };

      // Emit using traditional method
      mockEventEmitter.emit('message', messageEvent);

      // Both handlers should be called
      expect(bridgeHandler).toHaveBeenCalledWith(messageEvent);
      expect(traditionalHandler).toHaveBeenCalledWith(messageEvent);
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain compatibility with existing string-based usage', () => {
      const handler = vi.fn();

      // Traditional string-based subscription
      mockEventEmitter.on('message', handler);

      // Emit using enum (should work)
      mockEventEmitter.emit(EventType.MESSAGE, { content: 'test' });

      expect(handler).toHaveBeenCalledWith({ content: 'test' });
    });

    it('should work with existing EventEmitter patterns', () => {
      const handlers = {
        message: vi.fn(),
        sse: vi.fn(),
        world: vi.fn(),
        system: vi.fn()
      };

      // Set up traditional handlers
      Object.entries(handlers).forEach(([event, handler]) => {
        mockEventEmitter.on(event, handler);
      });

      // Emit using enums
      mockEventEmitter.emit(EventType.MESSAGE, { test: 'message' });
      mockEventEmitter.emit(EventType.SSE, { test: 'sse' });
      mockEventEmitter.emit(EventType.WORLD, { test: 'world' });
      mockEventEmitter.emit(EventType.SYSTEM, { test: 'system' });

      // All handlers should be called
      Object.values(handlers).forEach(handler => {
        expect(handler).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Type Validation Scenarios', () => {
    it('should handle optional properties correctly', () => {
      const bridge = createTypedEventBridge(mockWorld);

      // WorldMessageEvent with optional properties
      const messageWithOptionals: WorldMessageEvent = {
        content: 'Test message',
        sender: 'user',
        timestamp: new Date(),
        messageId: 'msg-123',
        chatId: 'chat-456',
        replyToMessageId: 'msg-000'
      };

      expect(() => {
        bridge.emit(EventType.MESSAGE, messageWithOptionals);
      }).not.toThrow();
    });

    it('should handle WorldSSEEvent with all possible types', () => {
      const bridge = createTypedEventBridge(mockWorld);
      const handler = vi.fn();
      bridge.on(EventType.SSE, handler);

      const sseTypes: Array<WorldSSEEvent['type']> = ['start', 'chunk', 'end', 'error', 'log'];

      sseTypes.forEach(type => {
        const sseEvent: WorldSSEEvent = {
          agentName: 'test-agent',
          type,
          messageId: `msg-${type}`
        };

        expect(() => {
          bridge.emit(EventType.SSE, sseEvent);
        }).not.toThrow();
      });

      expect(handler).toHaveBeenCalledTimes(sseTypes.length);
    });

    it('should handle WorldToolEvent with all tool execution data', () => {
      const bridge = createTypedEventBridge(mockWorld);

      const toolEvent: WorldToolEvent = {
        agentName: 'test-agent',
        type: 'tool-result',
        messageId: 'msg-123',
        toolExecution: {
          toolName: 'test-tool',
          toolCallId: 'call-123',
          sequenceId: 'seq-456',
          duration: 1500,
          input: { query: 'test' },
          result: { data: 'result' },
          resultType: 'object',
          resultSize: 25,
          metadata: {
            serverName: 'test-server',
            transport: 'http',
            isStreaming: false
          }
        }
      };

      expect(() => {
        bridge.emit(EventType.WORLD, toolEvent);
      }).not.toThrow();
    });
  });
});