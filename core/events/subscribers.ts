/**
 * Subscribers Module
 *
 * Provides event subscription handlers for agents and world.
 * Handles message routing, tool result processing, and world activity tracking.
 *
 * Features:
 * - Agent message subscription with automatic response processing
 * - Tool message subscription with security checks
 * - World message subscription: idempotent wrapper for world-level message listeners.
 * - World activity listener: idempotent wrapper — no-op when setupEventPersistence has run;
 *   standalone fallback path delegates idle-title logic to title-scheduler.ts.
 *
 * Dependencies (Layer 6):
 * - types.ts (Layer 1)
 * - publishers.ts (Layer 3)
 * - persistence.ts, memory-manager.ts, title-scheduler.ts (Layer 4)
 * - orchestrator.ts (Layer 5)
 * - utils.ts, logger.ts
 *
 * Changes:
 * - 2026-03-10: Removed standalone world-message title scheduling so idle activity is the sole
 *   automatic chat-title trigger.
 * - 2026-03-06: Removed `world.currentChatId` fallback from world-message title scheduling; chat-scoped handlers now require explicit `event.chatId`.
 * - 2026-03-03: Removed private title-scheduling logic (moved to title-scheduler.ts Layer 4).
 *   subscribeWorldToMessages and setupWorldActivityListener are now idempotent wrappers that
 *   short-circuit when setupEventPersistence has already registered a combined handler.
 * - 2026-02-28: Made world message subscription idempotent.
 * - 2026-02-22: Persist incoming human messages to agent memory even when agents do not respond.
 * - 2026-02-20: Publish chat-title update notifications as structured `system` events.
 * - 2025-11-09: Extracted from events.ts for modular architecture.
 */

import type {
  World,
  Agent,
  WorldMessageEvent
} from '../types.js';
import { parseMessageContent } from '../message-prep.js';
import { extractParagraphBeginningMentions } from '../utils.js';
import { createCategoryLogger } from '../logger.js';
import { subscribeToMessages } from './publishers.js';
import {
  saveIncomingMessageToMemory,
  resetLLMCallCountIfNeeded
} from './memory-manager.js';
import { processAgentMessage, shouldAgentRespond } from './orchestrator.js';
import {
  isHumanSender,
  runIdleTitleUpdate,
  clearWorldTitleTimers
} from './title-scheduler.js';

const loggerAgent = createCategoryLogger('agent');

function toMentionToken(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function resolveWorldMainAgentMention(world: World): string | null {
  const raw = String(world.mainAgent || '').trim();
  if (!raw) return null;

  const normalized = toMentionToken(raw);
  if (!normalized) return null;

  if (world.agents.has(normalized)) return normalized;

  for (const agent of world.agents.values()) {
    if (toMentionToken(agent.id) === normalized || toMentionToken(agent.name) === normalized) {
      return agent.id;
    }
  }

  return null;
}

function applyMainAgentMentionRouting(world: World, messageEvent: WorldMessageEvent): WorldMessageEvent {
  if (!isHumanSender(messageEvent.sender)) {
    return messageEvent;
  }

  const mainAgent = resolveWorldMainAgentMention(world);
  if (!mainAgent) {
    return messageEvent;
  }

  const mentions = extractParagraphBeginningMentions(messageEvent.content || '');
  if (mentions.length > 0) {
    return messageEvent;
  }

  return {
    ...messageEvent,
    content: `@${mainAgent} ${messageEvent.content || ''}`.trim()
  };
}

/**
 * Agent subscription with automatic message processing
 */
export function subscribeAgentToMessages(world: World, agent: Agent): () => void {
  const existingUnsubscribe = world._agentUnsubscribers?.get(agent.id);
  if (typeof existingUnsubscribe === 'function') {
    try {
      existingUnsubscribe();
    } catch {
      // Best-effort cleanup before rebinding the same agent listener.
    }
  }

  const handler = async (messageEvent: WorldMessageEvent) => {
    const routedMessageEvent = applyMainAgentMentionRouting(world, messageEvent);

    loggerAgent.debug('[subscribeAgentToMessages] ENTRY - Agent received message', {
      agentId: agent.id,
      sender: routedMessageEvent.sender,
      messageId: routedMessageEvent.messageId,
      contentPreview: routedMessageEvent.content?.substring(0, 200)
    });

    if (!routedMessageEvent.messageId) {
      loggerAgent.error('Received message WITHOUT messageId', {
        agentId: agent.id,
        sender: routedMessageEvent.sender,
        worldId: world.id
      });
    }

    // Check if this is a tool result message
    // Parse enhanced format first to detect tool messages
    const { message: parsedMessage, targetAgentId } = parseMessageContent(routedMessageEvent.content, 'user');

    loggerAgent.debug('[subscribeAgentToMessages] After parseMessageContent', {
      agentId: agent.id,
      parsedRole: parsedMessage.role,
      targetAgentId,
      toolCallId: parsedMessage.role === 'tool' ? parsedMessage.tool_call_id : undefined,
      isToolMessage: parsedMessage.role === 'tool' && !!parsedMessage.tool_call_id
    });

    // Tool messages are now handled by subscribeAgentToToolMessages (separate handler)
    // This keeps the message handler focused on user/assistant/system messages only
    if (parsedMessage.role === 'tool') {
      loggerAgent.debug('[subscribeAgentToMessages] Skipping tool message - handled by tool handler', {
        agentId: agent.id,
        toolCallId: parsedMessage.tool_call_id
      });
      return;
    }

    // Skip messages from this agent itself
    if (routedMessageEvent.sender === agent.id) {
      loggerAgent.debug('Skipping own message in handler', { agentId: agent.id, sender: routedMessageEvent.sender });
      return;
    }

    // Reset LLM call count if needed (for human/system messages)
    await resetLLMCallCountIfNeeded(world, agent, routedMessageEvent);

    const isIncomingHumanMessage = isHumanSender(routedMessageEvent.sender);
    if (isIncomingHumanMessage) {
      await saveIncomingMessageToMemory(world, agent, routedMessageEvent);
    }

    // Process message if agent should respond
    loggerAgent.debug('Checking if agent should respond', { agentId: agent.id, sender: routedMessageEvent.sender });
    const shouldRespond = await shouldAgentRespond(world, agent, routedMessageEvent);

    if (shouldRespond) {
      if (!isIncomingHumanMessage) {
        await saveIncomingMessageToMemory(world, agent, routedMessageEvent);
      }

      loggerAgent.debug('Agent will respond - processing message', { agentId: agent.id, sender: routedMessageEvent.sender });
      await processAgentMessage(world, agent, routedMessageEvent);
    } else {
      loggerAgent.debug('Agent will NOT respond - skipping memory save and SSE publishing', {
        agentId: agent.id,
        sender: routedMessageEvent.sender
      });
    }
  };

  const unsubscribe = subscribeToMessages(world, handler);

  // Track the unsubscribe function so deleteAgent can remove this listener.
  if (!world._agentUnsubscribers) {
    world._agentUnsubscribers = new Map();
  }
  world._agentUnsubscribers.set(agent.id, unsubscribe);

  return unsubscribe;
}

/**
 * Subscribe world to messages with cleanup function
 */
export function subscribeWorldToMessages(world: World): () => void {
  if (typeof world._worldMessagesUnsubscriber === 'function') {
    return world._worldMessagesUnsubscriber;
  }

  const unsubscribe = subscribeToMessages(world, (_event: WorldMessageEvent) => {
    return;
  });

  const trackedUnsubscribe = () => {
    unsubscribe();
    clearWorldTitleTimers(world.id);
    if (world._worldMessagesUnsubscriber === trackedUnsubscribe) {
      world._worldMessagesUnsubscriber = undefined;
    }
  };

  world._worldMessagesUnsubscriber = trackedUnsubscribe;
  return trackedUnsubscribe;
}

/**
 * Setup world activity listener for idle-triggered chat title updates.
 * Idempotent — returns existing cleanup handle if setupEventPersistence already registered
 * a combined 'world' handler for this world.
 */
export function setupWorldActivityListener(world: World): () => void {
  if (typeof world._activityListenerCleanup === 'function') {
    return world._activityListenerCleanup;
  }

  // Standalone fallback: persistence is disabled, attach a lightweight idle handler.
  const handler = async (event: any) => {
    await runIdleTitleUpdate(world, event);
  };

  world.eventEmitter.on('world', handler);

  const cleanup = () => {
    world.eventEmitter.off('world', handler);
    clearWorldTitleTimers(world.id);
    if (world._activityListenerCleanup === cleanup) {
      world._activityListenerCleanup = undefined;
    }
  };

  world._activityListenerCleanup = cleanup;
  return cleanup;
}
