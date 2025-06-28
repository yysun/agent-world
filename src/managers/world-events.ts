/**
 * World Events Module - World.eventEmitter Event Functions
 *
 * Features:
 * - Direct World.eventEmitter event publishing and subscription
 * - Simple event protocol using 'message' and 'sse' events
 * - Natural event isolation per World instance
 * - Zero dependencies on existing event systems
 * - Type-safe event handling with proper interfaces
 *
 * Core Functions:
 * - publishMessage: Emit message events to World.eventEmitter
 * - subscribeToMessages: Subscribe to World.eventEmitter message events
 * - publishSSE: Emit SSE events for streaming responses
 * - subscribeToSSE: Subscribe to SSE streaming events
 * - broadcastToWorld: High-level message broadcasting
 *
 * Implementation:
 * - Uses World.eventEmitter.emit() and .on() directly
 * - No abstraction layers or complex providers
 * - Events are naturally scoped to World instance
 * - Ready for agent subscription and LLM integration
 */

import { World, Agent } from '../types.js';
import { generateId, WorldMessageEvent, WorldSSEEvent } from './utils.js';

/**
 * Message publishing using World.eventEmitter
 */
export function publishMessage(world: World, content: string, sender: string): void {
  const messageEvent: WorldMessageEvent = {
    content,
    sender,
    timestamp: new Date(),
    messageId: generateId()
  };
  world.eventEmitter.emit('message', messageEvent);
}

/**
 * Message subscription using World.eventEmitter
 */
export function subscribeToMessages(
  world: World,
  handler: (event: WorldMessageEvent) => void
): () => void {
  world.eventEmitter.on('message', handler);
  return () => world.eventEmitter.off('message', handler);
}

/**
 * SSE events using World.eventEmitter
 */
export function publishSSE(world: World, data: Partial<WorldSSEEvent>): void {
  const sseEvent: WorldSSEEvent = {
    agentName: data.agentName!,
    type: data.type!,
    content: data.content,
    error: data.error,
    messageId: data.messageId || generateId(),
    usage: data.usage
  };
  world.eventEmitter.emit('sse', sseEvent);
}

/**
 * SSE subscription using World.eventEmitter
 */
export function subscribeToSSE(
  world: World,
  handler: (event: WorldSSEEvent) => void
): () => void {
  world.eventEmitter.on('sse', handler);
  return () => world.eventEmitter.off('sse', handler);
}

/**
 * Broadcast message to all agents in world
 */
export function broadcastToWorld(world: World, message: string, sender?: string): void {
  publishMessage(world, message, sender || 'HUMAN');
}
