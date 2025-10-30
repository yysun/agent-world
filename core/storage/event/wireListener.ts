/**
 * Wire Listener for Event Storage
 * 
 * Helper to attach event listeners to world emitter for automatic event persistence.
 * 
 * Features:
 * - Listens to world emitter events (message, sse, world, system)
 * - Automatically saves events to storage
 * - Handles errors gracefully
 * - Returns cleanup function to remove listeners
 * 
 * Implementation:
 * - Subscribes to all event types
 * - Maps event payloads to EventRecord format
 * - Uses saveEvent for each event
 * - Includes chatId when available
 * 
 * Changes:
 * - 2025-10-30: Initial implementation
 */

import type { World } from '../../types.js';
import type { EventStorage } from './types.js';

/**
 * Wire event listeners to automatically save events to storage
 * 
 * @param world - World instance to listen to
 * @param storage - Event storage to save events to
 * @returns Cleanup function to remove listeners
 */
export function wireEventStorage(world: World, storage: EventStorage): () => void {
  const worldId = world.id;

  // Message events
  const messageHandler = async (event: any) => {
    try {
      await storage.saveEvent({
        worldId,
        chatId: event.chatId || null,
        type: 'message',
        payload: {
          content: event.content,
          sender: event.sender,
          messageId: event.messageId,
          replyToMessageId: event.replyToMessageId,
          timestamp: event.timestamp
        },
        meta: {
          eventType: 'message'
        }
      });
    } catch (error) {
      console.error('[wireEventStorage] Failed to save message event:', error);
    }
  };

  // SSE events
  const sseHandler = async (event: any) => {
    try {
      await storage.saveEvent({
        worldId,
        chatId: null, // SSE events don't have chatId in current implementation
        type: 'sse',
        payload: {
          agentName: event.agentName,
          type: event.type,
          content: event.content,
          error: event.error,
          messageId: event.messageId,
          usage: event.usage,
          logEvent: event.logEvent
        },
        meta: {
          eventType: 'sse'
        }
      });
    } catch (error) {
      console.error('[wireEventStorage] Failed to save SSE event:', error);
    }
  };

  // World/tool events
  const worldHandler = async (event: any) => {
    try {
      await storage.saveEvent({
        worldId,
        chatId: null, // World/tool events don't have chatId
        type: 'world',
        payload: {
          agentName: event.agentName,
          type: event.type,
          messageId: event.messageId,
          toolExecution: event.toolExecution
        },
        meta: {
          eventType: 'world'
        }
      });
    } catch (error) {
      console.error('[wireEventStorage] Failed to save world event:', error);
    }
  };

  // System events
  const systemHandler = async (event: any) => {
    try {
      await storage.saveEvent({
        worldId,
        chatId: null, // System events don't have chatId
        type: 'system',
        payload: {
          content: event.content,
          messageId: event.messageId,
          timestamp: event.timestamp
        },
        meta: {
          eventType: 'system'
        }
      });
    } catch (error) {
      console.error('[wireEventStorage] Failed to save system event:', error);
    }
  };

  // Attach listeners
  world.eventEmitter.on('message', messageHandler);
  world.eventEmitter.on('sse', sseHandler);
  world.eventEmitter.on('world', worldHandler);
  world.eventEmitter.on('system', systemHandler);

  // Return cleanup function
  return () => {
    world.eventEmitter.off('message', messageHandler);
    world.eventEmitter.off('sse', sseHandler);
    world.eventEmitter.off('world', worldHandler);
    world.eventEmitter.off('system', systemHandler);
  };
}

/**
 * Example usage:
 * 
 * ```typescript
 * import { createWorld } from './world.js';
 * import { createEventStorage } from './storage/event/index.js';
 * import { wireEventStorage } from './storage/event/wireListener.js';
 * 
 * const world = await createWorld({ name: 'My World' });
 * const storage = await createEventStorage({ type: 'memory' });
 * 
 * // Wire up event storage
 * const cleanup = wireEventStorage(world, storage);
 * 
 * // Events are now automatically saved
 * // ...
 * 
 * // Cleanup when done
 * cleanup();
 * ```
 */
