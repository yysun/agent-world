/**
 * Subscribers Module
 * 
 * Provides event subscription handlers for agents and world.
 * Handles message routing, tool result processing, and world activity tracking.
 * 
 * Features:
 * - Agent message subscription with automatic response processing
 * - Tool message subscription with security checks
 * - World message subscription for title generation (idle and no-activity user-message fallback)
 * - World activity listener for chat title updates on idle
 * - In-flight title generation guard to avoid duplicate concurrent updates per chat
 * 
 * Dependencies (Layer 6):
 * - types.ts (Layer 1)
 * - publishers.ts (Layer 3)
 * - persistence.ts, memory-manager.ts (Layer 4)
 * - orchestrator.ts (Layer 5)
 * - utils.ts, logger.ts
 * - storage (runtime)
 * 
 * Changes:
 * - 2026-02-19: Moved chat-title update notifications from `system` to chat `crud` update events.
 * - 2026-02-13: Added no-activity user-message fallback title scheduling to cover edited chats with no agent response.
 * - 2026-02-13: Switched title commit path to compare-and-set storage update to avoid concurrent overwrite races.
 * - 2026-02-13: Added conditional commit checks and in-flight dedupe for idle title updates.
 * - 2026-02-13: Made idle title updates chat-scoped with captured `targetChatId` to prevent cross-session renames.
 * - 2026-02-08: Removed legacy manual tool-intervention request handling from message subscription
 * - 2025-11-09: Extracted from events.ts for modular architecture
 */

import type {
  World,
  Agent,
  WorldMessageEvent,
  StorageAPI
} from '../types.js';
import { parseMessageContent } from '../message-prep.js';
import { extractParagraphBeginningMentions } from '../utils.js';
import { createCategoryLogger } from '../logger.js';
import { createStorageWithWrappers } from '../storage/storage-factory.js';
import {
  publishCRUDEvent,
  subscribeToMessages
} from './publishers.js';
import {
  saveIncomingMessageToMemory,
  resetLLMCallCountIfNeeded,
  generateChatTitleFromMessages
} from './memory-manager.js';
import { processAgentMessage, shouldAgentRespond } from './orchestrator.js';
import { isDefaultChatTitle, NEW_CHAT_TITLE } from '../chat-constants.js';

const loggerAgent = createCategoryLogger('agent');
const loggerChatTitle = createCategoryLogger('chattitle');
const titleGenerationInFlight = new Set<string>();
const titleGenerationTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Storage wrapper instance - initialized lazily
let storageWrappers: StorageAPI | null = null;
async function getStorageWrappers(): Promise<StorageAPI> {
  if (!storageWrappers) {
    storageWrappers = await createStorageWithWrappers();
  }
  return storageWrappers!;
}

function getTitleGenerationKey(worldId: string, chatId: string): string {
  return `${worldId}:${chatId}`;
}

function isHumanSender(sender?: string): boolean {
  const normalized = String(sender ?? '').trim().toLowerCase();
  return normalized === 'human' || normalized.startsWith('user');
}

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

function scheduleNoActivityTitleUpdate(world: World, chatId: string, content: string): void {
  const key = getTitleGenerationKey(world.id, chatId);
  const existingTimer = titleGenerationTimers.get(key);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(async () => {
    titleGenerationTimers.delete(key);
    if (world.isProcessing) {
      return;
    }
    await tryGenerateAndApplyTitle(world, chatId, content, 'message-no-activity');
  }, 120);

  titleGenerationTimers.set(key, timer);
}

async function commitChatTitleIfDefault(
  world: World,
  chatId: string,
  nextTitle: string
): Promise<boolean> {
  const storage = await getStorageWrappers();

  if (typeof storage.updateChatNameIfCurrent === 'function') {
    return storage.updateChatNameIfCurrent(world.id, chatId, NEW_CHAT_TITLE, nextTitle);
  }

  // Legacy fallback when storage backend does not provide compare-and-set helper.
  const persistedChat = await storage.loadChatData(world.id, chatId);
  if (!persistedChat || !isDefaultChatTitle(persistedChat.name)) {
    return false;
  }

  const updated = await storage.updateChatData(world.id, chatId, { name: nextTitle });
  return !!updated;
}

async function tryGenerateAndApplyTitle(
  world: World,
  targetChatId: string,
  content: string,
  source: 'idle' | 'message-no-activity'
): Promise<void> {
  const inFlightKey = getTitleGenerationKey(world.id, targetChatId);
  if (titleGenerationInFlight.has(inFlightKey)) {
    loggerChatTitle.debug('Skipping title update because generation is already in flight', {
      worldId: world.id,
      chatId: targetChatId,
      source
    });
    return;
  }

  const chat = world.chats.get(targetChatId);
  if (!chat || !isDefaultChatTitle(chat.name)) {
    return;
  }

  titleGenerationInFlight.add(inFlightKey);

  try {
    const title = await generateChatTitleFromMessages(world, content, targetChatId);
    if (!title) {
      return;
    }

    // Re-check in-memory state before commit.
    const currentChat = world.chats.get(targetChatId);
    if (!currentChat || !isDefaultChatTitle(currentChat.name)) {
      loggerChatTitle.debug('Skipping title commit because in-memory chat title is no longer default', {
        worldId: world.id,
        chatId: targetChatId,
        source,
        currentName: currentChat?.name
      });
      return;
    }

    const committed = await commitChatTitleIfDefault(world, targetChatId, title);
    if (!committed) {
      loggerChatTitle.debug('Skipping title commit because persisted chat title no longer matches default', {
        worldId: world.id,
        chatId: targetChatId,
        source
      });
      return;
    }

    currentChat.name = title;
    publishCRUDEvent(world, 'update', 'chat', targetChatId, {
      id: targetChatId,
      name: title,
      source
    }, targetChatId);
  } finally {
    titleGenerationInFlight.delete(inFlightKey);
  }
}

/**
 * Agent subscription with automatic message processing
 */
export function subscribeAgentToMessages(world: World, agent: Agent): () => void {
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

    // Process message if agent should respond
    loggerAgent.debug('Checking if agent should respond', { agentId: agent.id, sender: routedMessageEvent.sender });
    const shouldRespond = await shouldAgentRespond(world, agent, routedMessageEvent);

    if (shouldRespond) {
      // Save incoming messages to agent memory only when they plan to respond
      await saveIncomingMessageToMemory(world, agent, routedMessageEvent);

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
  return subscribeToMessages(world, async (event: WorldMessageEvent) => {
    const targetChatId = event.chatId ?? world.currentChatId ?? null;
    if (!targetChatId) return;
    if (!isHumanSender(event.sender)) return;

    const chat = world.chats.get(targetChatId);
    if (!chat || !isDefaultChatTitle(chat.name)) return;

    scheduleNoActivityTitleUpdate(world, targetChatId, event.content || '');
  });
}

/**
 * Setup world activity listener for chat title updates
 * Triggers title generation when world becomes idle (pendingOperations === 0)
 */
export function setupWorldActivityListener(world: World): () => void {
  const handler = async (event: any) => {
    // Only update title when world becomes idle (all agents done)
    if (event.type === 'idle' && event.pendingOperations === 0) {
      const targetChatId = world.currentChatId;
      if (!targetChatId) return;
      try {
        await tryGenerateAndApplyTitle(world, targetChatId, '', 'idle');
      } catch (err) {
        loggerChatTitle.warn('Activity-based title update failed', { error: err instanceof Error ? err.message : err });
      }
    }
  };

  world.eventEmitter.on('world', handler);
  return () => {
    world.eventEmitter.off('world', handler);
    for (const [key, timer] of titleGenerationTimers.entries()) {
      if (!key.startsWith(`${world.id}:`)) {
        continue;
      }
      clearTimeout(timer);
      titleGenerationTimers.delete(key);
    }
  };
}
