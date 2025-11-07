/**
 * Event Metadata Calculation Helpers
 * 
 * Pure functions that calculate enhanced metadata for message and tool events.
 * These functions analyze the world state, message content, and agent configurations
 * to determine ownership, recipients, threading, and message classification.
 * 
 * Features:
 * - calculateOwnerAgentIds: Determine which agents should have message in memory
 * - calculateRecipientAgentId: Identify intended recipient from @mentions
 * - calculateMessageDirection: Classify as outgoing/incoming/broadcast
 * - calculateIsMemoryOnly: Detect cross-agent messages (saved but no response)
 * - calculateIsCrossAgentMessage: Identify agent-to-agent communication
 * - calculateThreadMetadata: Compute thread depth and root with cycle detection
 * 
 * All functions are pure - no side effects, deterministic output, easy to test.
 * 
 * Implementation: 2025-11-07
 * - Clean build approach with complete metadata from creation
 * - Supports human broadcasts, @mention targeting, and cross-agent messaging
 * - Thread depth calculation with circular reference protection
 */

import type { World, WorldMessageEvent, AgentMessage } from './types.js';

/**
 * Calculate which agents should have this message in their memory
 * 
 * Rules:
 * - Human messages: All agents receive (broadcast)
 * - Agent messages with @mention: Only recipient gets it
 * - Agent messages without @mention: All agents get it (broadcast)
 * - Cross-agent messages: Both sender and recipient
 */
export function calculateOwnerAgentIds(
  world: World,
  message: WorldMessageEvent
): string[] {
  const isHuman = message.sender === 'human' || message.sender === 'user';

  // Human messages go to all agents
  if (isHuman) {
    return Array.from(world.agents.keys());
  }

  // Agent message - check for @mention
  const mentionMatch = message.content.match(/@(\S+)/);
  if (mentionMatch) {
    const targetAgentName = mentionMatch[1];
    const targetAgent = Array.from(world.agents.values()).find(
      a => a.name.toLowerCase() === targetAgentName.toLowerCase()
    );

    if (targetAgent) {
      // Cross-agent message: both sender and recipient
      return [message.sender, targetAgent.id];
    }
  }

  // Agent broadcast - all agents
  return Array.from(world.agents.keys());
}

/**
 * Calculate the intended recipient from @mentions
 * Returns agentId if found, null for broadcast
 */
export function calculateRecipientAgentId(
  world: World,
  message: WorldMessageEvent
): string | null {
  const mentionMatch = message.content.match(/@(\S+)/);
  if (!mentionMatch) return null;

  const targetAgentName = mentionMatch[1];
  const targetAgent = Array.from(world.agents.values()).find(
    a => a.name.toLowerCase() === targetAgentName.toLowerCase()
  );

  return targetAgent?.id ?? null;
}

/**
 * Calculate message direction from agent's perspective
 * 
 * - outgoing: Agent is sender
 * - incoming: Agent is recipient (has @mention)
 * - broadcast: No specific recipient
 */
export function calculateMessageDirection(
  world: World,
  message: WorldMessageEvent
): 'outgoing' | 'incoming' | 'broadcast' {
  const isHuman = message.sender === 'human' || message.sender === 'user';

  if (isHuman) {
    return 'broadcast'; // Human messages are always broadcast
  }

  const recipientId = calculateRecipientAgentId(world, message);
  if (recipientId) {
    return 'incoming'; // Has specific recipient
  }

  return 'broadcast'; // Agent broadcast to all
}

/**
 * Calculate if message is memory-only (cross-agent, no response expected)
 * 
 * Memory-only messages:
 * - Agent messages with @mention (cross-agent communication)
 * - Saved to recipient's memory but doesn't trigger response
 */
export function calculateIsMemoryOnly(
  world: World,
  message: WorldMessageEvent
): boolean {
  const isHuman = message.sender === 'human' || message.sender === 'user';
  if (isHuman) return false; // Human messages always trigger responses

  const recipientId = calculateRecipientAgentId(world, message);
  return recipientId !== null; // Has @mention = memory-only
}

/**
 * Calculate if message is agent-to-agent communication
 */
export function calculateIsCrossAgentMessage(
  world: World,
  message: WorldMessageEvent
): boolean {
  const isHuman = message.sender === 'human' || message.sender === 'user';
  if (isHuman) return false;

  const recipientId = calculateRecipientAgentId(world, message);
  return recipientId !== null;
}

/**
 * Calculate thread metadata: root ID, depth, and circular reference detection
 * 
 * Returns:
 * - threadRootId: ID of root message (null if this is root)
 * - threadDepth: 0 for root, 1 for reply, 2 for reply-to-reply, etc.
 * - isReply: true if replyToMessageId is set
 */
export function calculateThreadMetadata(
  message: WorldMessageEvent,
  allMessages: AgentMessage[]
): {
  threadRootId: string | null;
  threadDepth: number;
  isReply: boolean;
} {
  const isReply = !!message.replyToMessageId;

  if (!isReply) {
    return {
      threadRootId: null,
      threadDepth: 0,
      isReply: false
    };
  }

  // Traverse up the reply chain to find root
  const visited = new Set<string>([message.messageId]);
  let currentId = message.replyToMessageId;
  let depth = 1;

  while (currentId) {
    // Circular reference detection
    if (visited.has(currentId)) {
      console.warn(`Circular thread reference detected: ${Array.from(visited).join(' -> ')} -> ${currentId}`);
      return {
        threadRootId: message.replyToMessageId ?? null, // Treat immediate parent as root
        threadDepth: 1,
        isReply: true
      };
    }

    visited.add(currentId);

    // Find parent message
    const parent = allMessages.find(m => m.messageId === currentId);
    if (!parent || !parent.replyToMessageId) {
      // Found root or missing parent
      return {
        threadRootId: currentId,
        threadDepth: depth,
        isReply: true
      };
    }

    currentId = parent.replyToMessageId;
    depth++;

    // Safety limit to prevent infinite loops
    if (depth > 100) {
      console.warn(`Thread depth exceeds 100 levels, stopping traversal`);
      return {
        threadRootId: currentId,
        threadDepth: depth,
        isReply: true
      };
    }
  }

  return {
    threadRootId: currentId ?? message.replyToMessageId ?? null,
    threadDepth: depth,
    isReply: true
  };
}
