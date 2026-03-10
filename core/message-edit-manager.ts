/**
 * Message Edit Manager Module
 *
 * Purpose: Message editing, removal, timestamp-based cutoff, migration, and error
 * logging for the user message edit feature.
 *
 * Key features:
 * - migrateMessageIds: Idempotent migration that assigns stable nanoid values to
 *   messages that pre-date the per-message ID feature.
 * - removeMessagesFrom: Multi-pass cutoff deletion — discovers the earliest timestamp
 *   of the target message across all agents, then removes that message and all later
 *   messages from every agent's memory in the target chat.
 * - editUserMessage: Combined remove + resubmit operation with title-reset / rollback
 *   semantics and active subscription preference.
 * - logEditError / getEditErrors: Persist/load a bounded (100-entry) error log using
 *   StorageAPI optional saveEditErrors/loadEditErrors methods.
 * - syncRuntimeAgentMemoryFromStorage: Re-hydrate in-memory agent.memory from storage
 *   after edit; exported for use in managers.ts activateChatResources.
 *
 * Notes:
 * - migrateMessageIds and removeMessagesFrom avoid calling getWorld() entirely; they
 *   use storageWrappers!.worldExists() + storageWrappers!.listAgents() to prevent a
 *   static cycle with managers.ts.
 * - editUserMessage needs the full runtime World object for subscription + event wiring,
 *   so it uses a dynamic import of getWorld from managers.js.
 * - subscription.js imports managers.ts, so all getActiveSubscribedWorld calls remain
 *   dynamic imports.
 * - logEditError / getEditErrors no longer use raw fs.* or path.*; they route through
 *   StorageAPI optional methods with a [] fallback when unavailable.
 *
 * Recent Changes:
 * - 2026-03-10: Narrowed edit/delete cleanup to the removed tail only; no longer clears unrelated queued turns, and now drops persisted post-cutoff chat events so stale system errors do not reappear after refresh.
 * - 2026-03-10: Routed edit resubmission through the canonical queue-backed `enqueueAndProcessUserTurn` path.
 * - 2026-03-09: Extracted from managers.ts as part of god-module decomposition.
 *   - logEditError/getEditErrors switched from raw fs I/O to StorageAPI optional methods.
 *   - migrateMessageIds/removeMessagesFrom: replaced getWorld()+listAgents() with
 *     storageWrappers!.worldExists() + storageWrappers!.listAgents() to break the cycle.
 *   - syncRuntimeAgentMemoryFromStorage promoted to export.
 */
import { storageWrappers, ensureInitialization, getResolvedWorldId } from './storage-init.js';
import { NEW_CHAT_TITLE, isDefaultChatTitle } from './chat-constants.js';
import { clearPendingHitlRequestsForChat } from './hitl.js';
import { clearChatSkillApprovals } from './load-skill-tool.js';
import { stopMessageProcessing } from './message-processing-control.js';
import { createCategoryLogger } from './logger.js';
import {
  subscribeAgentToMessages,
  subscribeWorldToMessages,
  setupWorldActivityListener,
} from './events/index.js';
import { nanoid } from 'nanoid';
import type {
  World, Agent, AgentMessage, RemovalResult, EditErrorLog,
} from './types.js';
import type { StoredEvent } from './storage/eventStorage/types.js';

const logger = createCategoryLogger('core.managers');

// ─── Runtime agent memory sync ────────────────────────────────────────────────

/**
 * Re-hydrate in-memory agent.memory from storage for every agent in a world.
 * Called after removeMessagesFrom to ensure the runtime view is consistent.
 */
export async function syncRuntimeAgentMemoryFromStorage(world: World, worldId: string): Promise<void> {
  if (!world?.agents || world.agents.size === 0) return;
  if (typeof (storageWrappers as any)?.loadAgent !== 'function') return;

  for (const runtimeAgent of world.agents.values()) {
    const persistedAgent = await storageWrappers!.loadAgent(worldId, runtimeAgent.id);
    runtimeAgent.memory = Array.isArray(persistedAgent?.memory)
      ? [...persistedAgent!.memory]
      : [];
  }
}

// ─── Title reset helpers (private) ───────────────────────────────────────────

function extractGeneratedChatTitleFromSystemPayload(payload: any): string | null {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.eventType !== 'chat-title-updated') return null;
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  return title || null;
}

type EditResubmissionTitleResetResult =
  | { resetApplied: false; previousTitle: null }
  | { resetApplied: true; previousTitle: string };

type EditResubmissionTitleResetCandidate = {
  currentTitle: string;
};

function isHumanMessageIdOwner(message: Partial<AgentMessage> | null | undefined): boolean {
  const sender = String(message?.sender || '').trim().toLowerCase();
  const role = String(message?.role || '').trim().toLowerCase();
  return sender === 'human'
    || sender === 'user'
    || sender.startsWith('user')
    || role === 'user';
}

function isHumanMessageEventPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const record = payload as Record<string, unknown>;
  const sender = String(record.sender || '').trim().toLowerCase();
  const role = String(record.role || '').trim().toLowerCase();
  return sender === 'human'
    || sender === 'user'
    || sender.startsWith('user')
    || role === 'user';
}

function isSystemErrorEventPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const record = payload as Record<string, unknown>;
  const eventType = String(record.eventType || record.type || '').trim().toLowerCase();
  return eventType === 'error';
}

async function removeOrphanedSystemErrorEvents(
  worldId: string,
  chatId: string,
  eventStorage: {
    getEventsByWorldAndChat?: (
      worldId: string,
      chatId: string | null,
      options?: { order?: 'asc' | 'desc' }
    ) => Promise<StoredEvent[]>;
    deleteEventsByIds?: (ids: string[]) => Promise<number>;
  },
): Promise<void> {
  if (!eventStorage.getEventsByWorldAndChat || !eventStorage.deleteEventsByIds) {
    return;
  }

  const [chatEvents, currentMemory] = await Promise.all([
    eventStorage.getEventsByWorldAndChat(worldId, chatId, { order: 'asc' }),
    storageWrappers!.getMemory(worldId, chatId),
  ]);

  const survivingUserMessageIds = new Set(
    (Array.isArray(currentMemory) ? currentMemory : [])
      .filter((message) => isHumanMessageIdOwner(message))
      .map((message) => String(message?.messageId || '').trim())
      .filter(Boolean)
  );

  let latestUserMessageId: string | null = null;
  const orphanedSystemErrorIds = new Set<string>();

  for (const event of Array.isArray(chatEvents) ? chatEvents : []) {
    if (String(event?.type || '').trim().toLowerCase() === 'message') {
      if (!isHumanMessageEventPayload(event?.payload)) {
        continue;
      }
      latestUserMessageId = String(event?.id || '').trim() || null;
      continue;
    }

    if (String(event?.type || '').trim().toLowerCase() !== 'system') {
      continue;
    }

    if (!isSystemErrorEventPayload(event?.payload)) {
      continue;
    }

    const eventId = String(event?.id || '').trim();
    if (!eventId) {
      continue;
    }

    if (!latestUserMessageId || !survivingUserMessageIds.has(latestUserMessageId)) {
      orphanedSystemErrorIds.add(eventId);
    }
  }

  if (orphanedSystemErrorIds.size > 0) {
    await eventStorage.deleteEventsByIds(Array.from(orphanedSystemErrorIds));
  }
}

async function removeTrimmedQueueRowsAndEvents(
  worldId: string,
  chatId: string,
  cutoffTimestamp: number,
  removedMessageIds: Set<string>,
): Promise<void> {
  const normalizedRemovedIds = new Set(
    Array.from(removedMessageIds).map((id) => String(id || '').trim()).filter(Boolean)
  );

  if (typeof storageWrappers!.getQueuedMessages === 'function' && typeof storageWrappers!.removeQueuedMessage === 'function') {
    const queuedMessages = await storageWrappers!.getQueuedMessages(worldId, chatId);
    for (const queuedMessage of queuedMessages) {
      const queuedMessageId = String(queuedMessage?.messageId || '').trim();
      if (!queuedMessageId) {
        continue;
      }
      if (normalizedRemovedIds.has(queuedMessageId)) {
        await storageWrappers!.removeQueuedMessage(queuedMessageId);
      }
    }
  }

  const eventStorage = (storageWrappers as any)?.eventStorage as {
    getEventsByWorldAndChat?: (worldId: string, chatId: string | null) => Promise<StoredEvent[]>;
    deleteEventsByIds?: (ids: string[]) => Promise<number>;
  } | null;
  if (!eventStorage?.getEventsByWorldAndChat || !eventStorage?.deleteEventsByIds) {
    return;
  }

  const chatEvents = await eventStorage.getEventsByWorldAndChat(worldId, chatId);
  const staleEventIds = chatEvents
    .filter((event) => {
      const eventCreatedAt = event?.createdAt ? new Date(event.createdAt).getTime() : Number.NaN;
      return Number.isFinite(eventCreatedAt) && eventCreatedAt >= cutoffTimestamp;
    })
    .map((event) => String(event?.id || '').trim())
    .filter(Boolean);

  if (staleEventIds.length > 0) {
    await eventStorage.deleteEventsByIds(staleEventIds);
  }

  await removeOrphanedSystemErrorEvents(worldId, chatId, eventStorage);
}

async function getAutoGeneratedChatTitleResetCandidate(
  world: World,
  chatId: string
): Promise<EditResubmissionTitleResetCandidate | null> {
  const chat = world.chats.get(chatId) ?? await storageWrappers!.loadChatData(world.id, chatId);
  if (!chat) return null;

  const currentTitle = String(chat.name || '').trim();
  if (!currentTitle || isDefaultChatTitle(currentTitle)) {
    return null;
  }

  const eventStorage = world.eventStorage;
  if (!eventStorage) {
    return null;
  }

  let latestGeneratedTitle: string | null = null;
  try {
    const systemEvents = await eventStorage.getEventsByWorldAndChat(world.id, chatId, {
      types: ['system'],
      order: 'desc',
      limit: 25,
    });

    for (const event of systemEvents) {
      const generatedTitle = extractGeneratedChatTitleFromSystemPayload(event?.payload);
      if (generatedTitle) {
        latestGeneratedTitle = generatedTitle;
        break;
      }
    }
  } catch (error) {
    logger.debug('Skipping auto-title reset because system events could not be queried', {
      worldId: world.id,
      chatId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  if (!latestGeneratedTitle || latestGeneratedTitle !== currentTitle) {
    return null;
  }

  return { currentTitle };
}

async function resetAutoGeneratedChatTitleForEditResubmission(
  world: World,
  chatId: string,
  candidate: EditResubmissionTitleResetCandidate | null,
): Promise<EditResubmissionTitleResetResult> {
  if (!candidate) {
    return { resetApplied: false, previousTitle: null };
  }

  const currentTitle = candidate.currentTitle;
  let resetSucceeded = false;
  if (typeof storageWrappers!.updateChatNameIfCurrent === 'function') {
    resetSucceeded = await storageWrappers!.updateChatNameIfCurrent(
      world.id,
      chatId,
      currentTitle,
      NEW_CHAT_TITLE
    );
  } else {
    const updated = await storageWrappers!.updateChatData(world.id, chatId, { name: NEW_CHAT_TITLE });
    resetSucceeded = !!updated;
  }

  if (!resetSucceeded) {
    return { resetApplied: false, previousTitle: null };
  }

  const runtimeChat = world.chats.get(chatId);
  if (runtimeChat) {
    runtimeChat.name = NEW_CHAT_TITLE;
  }

  return { resetApplied: true, previousTitle: currentTitle };
}

async function rollbackAutoGeneratedChatTitleResetAfterFailedResubmission(
  world: World,
  chatId: string,
  previousTitle: string
): Promise<void> {
  const normalizedPreviousTitle = String(previousTitle || '').trim();
  if (!normalizedPreviousTitle || isDefaultChatTitle(normalizedPreviousTitle)) {
    return;
  }

  let restored = false;
  if (typeof storageWrappers!.updateChatNameIfCurrent === 'function') {
    restored = await storageWrappers!.updateChatNameIfCurrent(
      world.id,
      chatId,
      NEW_CHAT_TITLE,
      normalizedPreviousTitle
    );
  } else {
    const persistedChat = await storageWrappers!.loadChatData(world.id, chatId);
    if (persistedChat && isDefaultChatTitle(persistedChat.name)) {
      const updated = await storageWrappers!.updateChatData(world.id, chatId, { name: normalizedPreviousTitle });
      restored = !!updated;
    }
  }

  if (!restored) {
    return;
  }

  const runtimeChat = world.chats.get(chatId);
  if (runtimeChat && isDefaultChatTitle(runtimeChat.name)) {
    runtimeChat.name = normalizedPreviousTitle;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Migrate messages to include messageId for user message edit feature.
 * Automatically detects storage type and handles both file and SQL storage.
 * Idempotent — safe to run multiple times.
 *
 * @param worldId - World ID to migrate messages for
 * @returns Number of messages migrated
 */
export async function migrateMessageIds(worldId: string): Promise<number> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  // Avoid calling getWorld to prevent a static cycle; existence check is enough.
  const worldExists = await storageWrappers!.worldExists(resolvedWorldId);
  if (!worldExists) {
    throw new Error(`World '${worldId}' not found`);
  }

  let totalMigrated = 0;

  // Get all agents in the world
  const agents = await storageWrappers!.listAgents(resolvedWorldId);

  // Get all chats for the world
  const chats = await storageWrappers!.listChats(resolvedWorldId);

  // Migrate messages for each chat
  for (const chat of chats) {
    const chatId = chat.id;

    // Get all memory for this chat
    const memory = await storageWrappers!.getMemory(resolvedWorldId, chatId);

    if (!memory || memory.length === 0) {
      continue;
    }

    // Check which messages need messageId
    let needsMigration = false;
    const updatedMemory: AgentMessage[] = [];

    for (const message of memory) {
      if (!message.messageId) {
        needsMigration = true;
        updatedMemory.push({
          ...message,
          messageId: nanoid(10),
        });
        totalMigrated++;
      } else {
        updatedMemory.push(message);
      }
    }

    // If any messages were updated, save the entire memory back
    if (needsMigration) {
      // For each agent, update their memory with the migrated messages
      for (const agent of agents) {
        const agentMessages = updatedMemory.filter(m => m.agentId === agent.id);
        if (agentMessages.length > 0) {
          await storageWrappers!.saveAgentMemory(resolvedWorldId, agent.id, agentMessages);
        }
      }
    }
  }

  logger.info(`Migrated ${totalMigrated} messages with messageId for world '${resolvedWorldId}'`);
  return totalMigrated;
}

/**
 * Remove a message and all subsequent messages from all agents in a world.
 * Used for user message editing feature.
 *
 * @param worldId - World ID
 * @param messageId - ID of the message to remove (and all after it)
 * @param chatId - Chat ID to filter messages
 * @returns RemovalResult with per-agent removal details
 */
export async function removeMessagesFrom(
  worldId: string,
  messageId: string,
  chatId: string
): Promise<RemovalResult> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  // Avoid calling getWorld to prevent a static cycle; existence check is enough.
  const worldExists = await storageWrappers!.worldExists(resolvedWorldId);
  if (!worldExists) {
    throw new Error(`World '${worldId}' not found`);
  }

  // Get all agents
  const agents = await storageWrappers!.listAgents(resolvedWorldId);

  // Track results per agent
  const processedAgents: string[] = [];
  const failedAgents: Array<{ agentId: string; error: string }> = [];
  let messagesRemovedTotal = 0;
  let foundTargetInAnyAgent = false;
  let targetTimestampValue: number | null = null;
  const loadedAgentsById = new Map<string, Agent>();
  const removedMessageIds = new Set<string>();

  const toTimestamp = (value: unknown): number => {
    if (value instanceof Date) {
      return value.getTime();
    }

    if (value) {
      const parsed = new Date(value as string).getTime();
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return Date.now();
  };

  // First pass: load each agent and discover the deletion cutoff timestamp
  for (const agent of agents) {
    try {
      const fullAgent = await storageWrappers!.loadAgent(resolvedWorldId, agent.id);
      if (!fullAgent || !fullAgent.memory || fullAgent.memory.length === 0) {
        continue;
      }

      loadedAgentsById.set(agent.id, fullAgent);

      // Find the target message in this chat for global cutoff derivation
      const targetMsg = fullAgent.memory.find(m => m.messageId === messageId && m.chatId === chatId);

      if (targetMsg) {
        foundTargetInAnyAgent = true;
        const candidateTimestamp = toTimestamp(targetMsg.createdAt);
        if (targetTimestampValue === null || candidateTimestamp < targetTimestampValue) {
          targetTimestampValue = candidateTimestamp;
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      failedAgents.push({
        agentId: agent.id,
        error: errorMsg,
      });
    }
  }

  if (!foundTargetInAnyAgent || targetTimestampValue === null) {
    const notFoundFailures = agents.length > 0
      ? [
        ...failedAgents,
        { agentId: 'all', error: `Message with ID '${messageId}' not found in chat '${chatId}'` },
      ]
      : failedAgents;

    return {
      success: false,
      messageId,
      totalAgents: agents.length,
      processedAgents,
      failedAgents: notFoundFailures,
      messagesRemovedTotal,
      requiresRetry: false,
      resubmissionStatus: 'skipped',
      newMessageId: undefined,
    };
  }

  // Second pass: apply cutoff to all agents in the target chat
  for (const agent of agents) {
    if (failedAgents.some(entry => entry.agentId === agent.id)) {
      continue;
    }

    const fullAgent = loadedAgentsById.get(agent.id);
    if (!fullAgent || !Array.isArray(fullAgent.memory) || fullAgent.memory.length === 0) {
      processedAgents.push(agent.id);
      continue;
    }

    try {
      const messagesToKeep = fullAgent.memory.filter(m => {
        if (m.chatId !== chatId) {
          return true;
        }

        const msgTimestamp = toTimestamp(m.createdAt);
        return msgTimestamp < targetTimestampValue!;
      });

      const removedCount = fullAgent.memory.length - messagesToKeep.length;

      if (removedCount === 0) {
        processedAgents.push(agent.id);
        continue;
      }

      for (const removedMessage of fullAgent.memory) {
        if (removedMessage.chatId !== chatId) {
          continue;
        }

        const removedTimestamp = toTimestamp(removedMessage.createdAt);
        if (removedTimestamp < targetTimestampValue!) {
          continue;
        }

        const removedMessageId = String(removedMessage.messageId || '').trim();
        if (removedMessageId) {
          removedMessageIds.add(removedMessageId);
        }
      }

      await storageWrappers!.saveAgentMemory(resolvedWorldId, agent.id, messagesToKeep);

      messagesRemovedTotal += removedCount;
      processedAgents.push(agent.id);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      failedAgents.push({
        agentId: agent.id,
        error: errorMsg,
      });
    }
  }

  logger.info('Message removal completed', {
    messageId,
    success: failedAgents.length === 0,
    totalAgents: agents.length,
    processedAgents: processedAgents.length,
    failedAgents: failedAgents.length,
    messagesRemovedTotal,
  });

  if (failedAgents.length === 0) {
    await removeTrimmedQueueRowsAndEvents(resolvedWorldId, chatId, targetTimestampValue!, removedMessageIds);
    const { getActiveSubscribedWorld } = await import('./subscription.js');
    const activeWorld = getActiveSubscribedWorld(resolvedWorldId, chatId);
    const remainingQueueRows = await storageWrappers!.getQueuedMessages?.(resolvedWorldId, chatId);
    if (remainingQueueRows?.some((row) => row.status === 'queued')) {
      if (activeWorld && !activeWorld._queuedChatIds) {
        activeWorld._queuedChatIds = new Set();
      }
      activeWorld?._queuedChatIds?.add(chatId);
    } else {
      activeWorld?._queuedChatIds?.delete(chatId);
    }
  }

  return {
    success: failedAgents.length === 0,
    messageId,
    totalAgents: agents.length,
    processedAgents,
    failedAgents,
    messagesRemovedTotal,
    requiresRetry: failedAgents.length > 0,
    resubmissionStatus: 'skipped', // Updated by editUserMessage
    newMessageId: undefined,
  };
}

/**
 * Edit a user message by removing it and all subsequent messages, then resubmitting
 * with new content. Combines removal and resubmission in a single operation with
 * comprehensive error tracking.
 *
 * @param worldId - World ID
 * @param messageId - ID of the message to edit
 * @param newContent - New message content
 * @param chatId - Chat ID for the message
 * @param targetWorld - Optional pre-resolved world (avoids extra lookup)
 * @returns RemovalResult with removal and resubmission details
 */
export async function editUserMessage(
  worldId: string,
  messageId: string,
  newContent: string,
  chatId: string,
  targetWorld?: World
): Promise<RemovalResult> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  const { getActiveSubscribedWorld } = await import('./subscription.js');
  const activeSubscribedWorld = getActiveSubscribedWorld(resolvedWorldId, chatId) || targetWorld || null;
  const world = activeSubscribedWorld || await (async () => {
    const { getWorld } = await import('./managers.js');
    return getWorld(resolvedWorldId);
  })();
  if (!world) {
    throw new Error(`World '${worldId}' not found`);
  }

  // Always cancel any in-flight or queued LLM work for this chat before
  // resubmitting an edited message. This covers both registered agent
  // processing handles (stopMessageProcessing aborts those) AND title
  // generation calls that go through the global llmQueue without
  // registering in activeProcessingByChat (so hasActiveChatMessageProcessing
  // returns false even when title gen is the active queue item). Leaving the
  // guard would cause the agent's resubmission LLM call to queue behind an
  // active title gen call, producing "no response" until title gen finishes.
  stopMessageProcessing(resolvedWorldId, chatId);

  // Clear cached skill approvals and orphaned HITL requests so the
  // resubmitted message triggers fresh HITL prompts instead of silently
  // reusing stale session-level approvals from the previous processing run.
  clearChatSkillApprovals(resolvedWorldId, chatId);
  clearPendingHitlRequestsForChat(resolvedWorldId, chatId);

  const titleResetCandidate = await getAutoGeneratedChatTitleResetCandidate(world, chatId);

  // Step 1: Remove the message and all subsequent messages
  const removalResult = await removeMessagesFrom(resolvedWorldId, messageId, chatId);

  if (!removalResult.success) {
    return removalResult;
  }

  await syncRuntimeAgentMemoryFromStorage(activeSubscribedWorld || world, resolvedWorldId);

  // Step 2: Reset auto-generated chat title so post-resubmission title generation can run again.
  const titleResetResult = await resetAutoGeneratedChatTitleForEditResubmission(world, chatId, titleResetCandidate);

  const worldForResubmission = activeSubscribedWorld || world;

  if (!activeSubscribedWorld) {
    for (const agent of worldForResubmission.agents.values()) {
      subscribeAgentToMessages(worldForResubmission, agent);
    }
    subscribeWorldToMessages(worldForResubmission);
    setupWorldActivityListener(worldForResubmission);
  }

  // Step 3: Attempt resubmission using the canonical queue-backed send path
  try {
    const { enqueueAndProcessUserTurn } = await import('./managers.js');
    const queuedMessage = await enqueueAndProcessUserTurn(
      resolvedWorldId,
      chatId,
      newContent,
      'human',
      worldForResubmission,
      { source: 'retry' },
    );
    const newMessageId = String(queuedMessage?.messageId || '').trim();
    if (!newMessageId) {
      throw new Error('Queue-backed edit resubmission did not return a queued messageId.');
    }

    logger.info(`Resubmitted edited message to world '${resolvedWorldId}' with new messageId '${newMessageId}'`);

    return {
      ...removalResult,
      resubmissionStatus: 'success',
      newMessageId,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (titleResetResult.resetApplied) {
      try {
        await rollbackAutoGeneratedChatTitleResetAfterFailedResubmission(
          worldForResubmission,
          chatId,
          titleResetResult.previousTitle
        );
      } catch (rollbackError) {
        logger.warn('Failed to rollback auto-generated title reset after edit resubmission failure', {
          worldId: resolvedWorldId,
          chatId,
          rollbackError: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        });
      }
    }
    logger.error(`Failed to resubmit message to world '${resolvedWorldId}': ${errorMsg}`);
    return {
      ...removalResult,
      resubmissionStatus: 'failed',
      resubmissionError: errorMsg,
    };
  }
}

/**
 * Log an error from a message edit operation for troubleshooting and retry.
 * Stores errors via StorageAPI optional saveEditErrors method. Keeps only the
 * last 100 errors. Falls back silently when storage method is unavailable.
 *
 * @param worldId - World ID
 * @param errorLog - EditErrorLog to persist
 */
export async function logEditError(worldId: string, errorLog: EditErrorLog): Promise<void> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  try {
    const errors: EditErrorLog[] = await storageWrappers!.loadEditErrors?.(resolvedWorldId) ?? [];

    errors.push(errorLog);

    const trimmed = errors.length > 100 ? errors.slice(-100) : errors;

    await storageWrappers!.saveEditErrors?.(resolvedWorldId, trimmed);
    logger.debug(`Logged edit error for world '${resolvedWorldId}'`);
  } catch (error) {
    logger.error(`Failed to log edit error for world '${resolvedWorldId}': ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Get edit error logs for a world.
 *
 * @param worldId - World ID
 * @returns Array of EditErrorLog entries
 */
export async function getEditErrors(worldId: string): Promise<EditErrorLog[]> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  try {
    return await storageWrappers!.loadEditErrors?.(resolvedWorldId) ?? [];
  } catch (error) {
    logger.error(`Failed to read edit errors for world '${resolvedWorldId}': ${error instanceof Error ? error.message : error}`);
    return [];
  }
}
