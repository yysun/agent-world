/**
 * Message Manager Module - High-Level Message Broadcasting and Routing
 *
 * Features:
 * - High-level message broadcasting to all agents in a world
 * - Direct messaging to specific agents
 * - World lookup and validation
 * - Integration with World.eventEmitter system
 * - Message history placeholder for future features
 *
 * Core Functions:
 * - broadcastMessage: Send message to all agents in world
 * - sendDirectMessage: Send message to specific agent
 * - getWorldMessages: Get message history (placeholder)
 *
 * Implementation:
 * - Uses world-manager for world lookup
 * - Uses world-events for message publishing
 * - Validates world and agent existence
 * - Ready for message history implementation
 */

import { publishMessage } from './world-events.js';
import { getWorld } from './world-manager.js';
import { WorldMessageEvent } from './types.js';

/**
 * Broadcast message to all agents in a world
 */
export async function broadcastMessage(worldId: string, message: string, sender?: string): Promise<void> {
  const world = await getWorld(worldId);
  if (!world) {
    throw new Error(`World ${worldId} not found`);
  }

  publishMessage(world, message, sender || 'HUMAN');
}

/**
 * Send direct message to specific agent
 */
export async function sendDirectMessage(
  worldId: string,
  targetAgentId: string,
  message: string,
  sender?: string
): Promise<void> {
  const world = await getWorld(worldId);
  if (!world) {
    throw new Error(`World ${worldId} not found`);
  }

  const targetAgent = world.agents.get(targetAgentId);
  if (!targetAgent) {
    throw new Error(`Agent ${targetAgentId} not found in world ${worldId}`);
  }

  // Publish with target information for filtering
  publishMessage(world, `@${targetAgentId} ${message}`, sender || 'HUMAN');
}

/**
 * Get world message history (placeholder for future implementation)
 */
export async function getWorldMessages(worldId: string): Promise<WorldMessageEvent[]> {
  // Implementation depends on if you want to track message history
  // Could store in World object or separate storage
  return [];
}
