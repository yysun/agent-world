/**
 * Unified Managers Module - World, Agent, and Chat Management
 *
 * Provides complete lifecycle management for worlds, agents, and chat sessions with:
 * - EventEmitter integration for runtime world instances
 * - Memory management with archiving and restoration capabilities
 * - Chat session management with auto-save and title generation
 * - Automatic ID normalization to kebab-case for consistency
 * - Environment-aware storage operations through storage-factory
 * - Agent message management with automatic agentId assignment
 *
 * Queue management, message editing, and storage initialization are handled by
 * dedicated sub-modules (queue-manager.ts, message-edit-manager.ts, storage-init.ts)
 * whose public APIs are re-exported here for backward compatibility.
 *
 * API: World (create/get/update/delete/list), Agent (create/get/update/delete/list/updateMemory/clearMemory),
 * Chat (newChat/listChats/deleteChat/restoreChat),
 * re-exports: migrateMessageIds, removeMessagesFrom, editUserMessage, logEditError, getEditErrors,
 *             addToQueue, enqueueAndProcessUserTurn, dispatchImmediateChatMessage, getQueueMessages,
 *             pauseChatQueue, resumeChatQueue, stopChatQueue, clearChatQueue, retryQueueMessage,
 *             recoverQueueSendingMessages
 *
 * Implementation Details:
 * - Ensures all agent messages include agentId for proper export functionality
 * - Compatible with both SQLite and memory storage backends
 * - Automatic agent identification for message source tracking
 *
 * Recent Changes:
 * - 2026-03-10: Renamed queue-backed ingress to `enqueueAndProcessUserTurn` and split non-user immediate dispatch into `dispatchImmediateChatMessage`.
 * - 2026-03-10: Removed restore-time user-last resend from persisted chat memory; queue-owned rows are now the only automatic resume authority.
 * - 2026-03-10: Added `restoreChat(..., { suppressAutoResume: true })` support for edit/delete mutation flows so failed last-turn messages are not replayed before mutation.
 * - 2026-03-09: God-module decomposition — extracted queue management (queue-manager.ts),
 *   message edit/migration logic (message-edit-manager.ts), and storage singleton +
 *   identifier resolution (storage-init.ts) into focused sub-modules. managers.ts reduced
 *   from 2928 → 1300 lines; all public exports preserved via re-exports.
 * - 2026-03-09: Added `activateChatResources` helper to consolidate the resource-reactivation
 *   sequence (memory sync, skill approvals, HITL replay, queue resume) shared between the
 *   two branches of `restoreChat`.
 * - 2026-03-09: Added SSE terminal-state guard in `triggerPendingLastMessageResume` to prevent
 *   infinite auto-resume loops when the last SSE event is already terminal.
 * - 2026-03-06: Moved chat-selection runtime control flow onto explicit/persisted chat helpers.
 * - 2026-03-06: Removed runtime `world.currentChatId` fallback from exported chat-memory helpers.
 * - 2026-02-20: Added `claimAgentCreationSlot` / `allowWhileWorldProcessing` for approval-gated tool calls.
 * - 2026-02-16: Added `branchChatFromMessage` to create a new chat branched from an assistant message and copy source-chat history up to the target message.
 * - 2026-02-14: Updated `editUserMessage` to be fully core-managed for clear+resend behavior without client-side subscription refresh logic.
 *   - Edit resubmission now prefers active subscribed world runtimes.
 *   - Removed current-session gating checks and always resubmits to the provided `chatId`.
 *   - Synchronizes runtime agent memory from storage after removal before resubmission.
 * - 2026-02-13: Added world-level `mainAgent` routing config and agent-level `autoReply` toggle support.
 * - 2026-02-13: Moved edit-resubmission title-regeneration reset into core `editUserMessage` so all clients share the same behavior.
 *   - Auto-generated chat titles are reset to `New Chat` before edit resubmission only when the latest persisted
 *     `chat-title-updated` payload title still matches the current chat name.
 * - 2026-02-13: Centralized default chat-title semantics via shared chat constants.
 *   - Uses a single `NEW_CHAT_TITLE` source for reusable chat detection and creation paths.
 * - 2026-02-12: Hardened `getMemory` to auto-migrate legacy messages missing `messageId` before returning memory payloads.
 *   - Detects missing IDs, runs idempotent `migrateMessageIds`, and re-reads memory.
 *   - Ensures message-list consumers receive canonical `messageId` values from core.
 * - 2026-02-11: Made `deleteWorld` side-effect-free by removing `getWorld` usage.
 *   - `deleteWorld` now avoids world runtime hydration/chat creation paths during deletion.
 *   - Cleanup hooks are invoked only if present on directly loaded world data.
 *
 * Changes:
 * - 2026-02-10: Added agent identifier resolution across manager APIs.
 *   - Agent operations now accept either stored agent ID or agent name.
 *   - Fallback lookup resolves renamed agents where `id` and `toKebabCase(name)` differ.
 * - 2026-02-10: Added world identifier resolution across manager APIs.
 *   - World operations now accept either stored world ID or world name.
 *   - Fallback lookup resolves renamed worlds where `id` and `toKebabCase(name)` differ.
 *   - List APIs return normalized world IDs for consistent client routing.
 * - 2025-10-26: Consolidated message publishing - removed resubmitMessageToWorld
 *   - Added chatId to WorldMessageEvent and publishMessage parameters
 *   - editUserMessage now calls publishMessage directly with validation
 *   - Simplified API by removing redundant resubmit wrapper function
 * - 2025-10-25: Fixed messageId bug in editUserMessage resubmission
 *   - Bug: Generated unused messageId instead of capturing actual from publishMessage
 *   - Fix: Use messageEvent.messageId from publishMessage return value
 *   - Impact: Prevents "undefined" string serialization in JSON responses
 * - 2025-10-21: Added message ID migration and user message edit feature (Phases 1 & 2)
 *   - migrateMessageIds: Auto-assign IDs to existing messages (idempotent)
 *   - removeMessagesFrom: Remove target + subsequent messages by timestamp
 *   - editUserMessage: Combined removal + resubmission operation
 *   - logEditError/getEditErrors: Error persistence in edit-errors.json
 *
 * Note: Export functionality has been moved to core/export.ts
 */
// Core module imports
import { createCategoryLogger, initializeLogger } from './logger.js';
import { EventEmitter } from 'events';
import { type StorageAPI } from './storage/storage-factory.js';
import * as utils from './utils.js';
import { nanoid } from 'nanoid';
import { NEW_CHAT_TITLE, isDefaultChatTitle } from './chat-constants.js';
import { hasActiveChatMessageProcessing } from './message-processing-control.js';
import { replayPendingHitlRequests, listPendingHitlPromptEventsFromMessages } from './hitl.js';
import { clearChatSkillApprovals, reconstructSkillApprovalsFromMessages } from './load-skill-tool.js';
import { resumePendingToolCallsForChat } from './events/memory-manager.js';
import { stopWorldRuntimesByWorldId } from './world-registry.js';
import {
  storageWrappers,
  ensureInitialization,
  getResolvedWorldId,
  getResolvedAgentId,
} from './storage-init.js';
import {
  triggerPendingQueueResume,
  autoPauseQueueForChat,
  clearQueuePauseForChat,
} from './queue-manager.js';
import {
  syncRuntimeAgentMemoryFromStorage,
  migrateMessageIds,
} from './message-edit-manager.js';

// Type imports
import type {
  World, CreateWorldParams, UpdateWorldParams, Agent, CreateAgentParams, UpdateAgentParams,
  AgentMessage, Chat, CreateChatParams, UpdateChatParams, WorldChat, LLMProvider,
} from './types.js';

// Per-module state
const logger = createCategoryLogger('core.managers');
const loggerRestore = createCategoryLogger('chat.restore');
const loggerRestoreResume = createCategoryLogger('chat.restore.resume');
const inFlightToolResumeKeys = new Set<string>();

type CreateAgentOptions = {
  allowWhileWorldProcessing?: boolean;
  /** Set to true when the creation slot was already claimed via claimAgentCreationSlot(). */
  slotAlreadyClaimed?: boolean;
};

export type ChatActivationSnapshot = {
  world: World;
  chatId: string;
  memory: AgentMessage[];
  hitlPrompts: Array<{ chatId: string | null; prompt: Record<string, unknown> }>;
};

export type RestoreChatOptions = {
  suppressAutoResume?: boolean;
};

function triggerPendingToolCallResume(world: World, chatId: string, targetAssistantMessageId?: string): void {
  if (!chatId) {
    return;
  }

  if (hasActiveChatMessageProcessing(world.id, chatId)) {
    return;
  }

  const resumeKey = `${world.id}:${chatId}`;
  if (inFlightToolResumeKeys.has(resumeKey)) {
    return;
  }

  inFlightToolResumeKeys.add(resumeKey);
  void (async () => {
    try {
      const resumedCount = await resumePendingToolCallsForChat(world, chatId, targetAssistantMessageId);
      loggerRestoreResume.debug('Attempted pending tool-call resume after chat restore', {
        worldId: world.id,
        chatId,
        targetAssistantMessageId: targetAssistantMessageId || null,
        resumedCount,
      });
      if (resumedCount > 0) {
        loggerRestoreResume.debug('Resumed pending persisted tool calls after chat restore', {
          worldId: world.id,
          chatId,
          targetAssistantMessageId,
          resumedCount,
        });
      }
    } catch (error) {
      loggerRestoreResume.warn('Failed to resume pending persisted tool calls after chat restore', {
        worldId: world.id,
        chatId,
        targetAssistantMessageId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      inFlightToolResumeKeys.delete(resumeKey);
    }
  })();
}

function hasPendingToolCallsOnLastAssistantMessage(lastMessage: AgentMessage, chatMemory: AgentMessage[]): boolean {
  if (lastMessage.role !== 'assistant' || !Array.isArray(lastMessage.tool_calls) || lastMessage.tool_calls.length === 0) {
    return false;
  }

  const completedToolCallIds = new Set<string>();
  for (const message of chatMemory) {
    if (message.role !== 'tool' || typeof message.tool_call_id !== 'string') {
      continue;
    }
    const toolCallId = message.tool_call_id.trim();
    if (toolCallId) {
      completedToolCallIds.add(toolCallId);
    }
  }

  for (const toolCall of lastMessage.tool_calls) {
    const toolCallId = String((toolCall as any)?.id || '').trim();
    if (!toolCallId) {
      continue;
    }
    if (!completedToolCallIds.has(toolCallId)) {
      return true;
    }
  }

  return false;
}

function triggerPendingToolCallResumeFromLastMessage(world: World, chatId: string): void {
  if (!chatId) {
    return;
  }

  void (async () => {
    try {
      const chatMemory = await storageWrappers!.getMemory(world.id, chatId);
      if (!chatMemory || chatMemory.length === 0) {
        return;
      }

      const lastMessage = chatMemory[chatMemory.length - 1];
      if (!hasPendingToolCallsOnLastAssistantMessage(lastMessage, chatMemory)) {
        return;
      }

      loggerRestoreResume.debug('Detected pending tool-call-last message during chat-restore inspection', {
        worldId: world.id,
        chatId,
        messageId: lastMessage.messageId || null,
      });
      triggerPendingToolCallResume(world, chatId, lastMessage.messageId);
    } catch (error) {
      loggerRestoreResume.warn('Failed to inspect last message for pending tool-call resume during chat restore', {
        worldId: world.id,
        chatId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
}

// TOCTOU guard: prevents two concurrent createAgent calls from both passing the
// `agentExists` check before either write lands. Maps worldId → Set<agentId>.
const pendingAgentCreates = new Map<string, Set<string>>();

export type ClaimAgentCreationSlotResult =
  | { claimed: true; release: () => void }
  | { claimed: false; reason: 'already_pending' | 'already_exists'; name: string };

/**
 * Pre-claim an agent creation slot before showing an approval dialog.
 * Prevents race conditions where two concurrent create_agent tool calls both
 * pass approval before either calls createAgent.
 * Returns a release() function that MUST be called if createAgent is not called.
 * createAgent({ slotAlreadyClaimed: true }) also cleans up the slot itself,
 * so calling release() after createAgent is safe (idempotent).
 */
export async function claimAgentCreationSlot(
  worldId: string,
  agentName: string,
): Promise<ClaimAgentCreationSlotResult> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const agentId = utils.toKebabCase(agentName);

  const worldPending = pendingAgentCreates.get(resolvedWorldId) ?? new Set<string>();
  if (!pendingAgentCreates.has(resolvedWorldId)) {
    pendingAgentCreates.set(resolvedWorldId, worldPending);
  }

  if (worldPending.has(agentId)) {
    return { claimed: false, reason: 'already_pending', name: agentName };
  }

  const exists = await storageWrappers!.agentExists(resolvedWorldId, agentId);
  if (exists) {
    return { claimed: false, reason: 'already_exists', name: agentName };
  }

  worldPending.add(agentId);

  return {
    claimed: true,
    release: () => {
      worldPending.delete(agentId);
      if (worldPending.size === 0) {
        pendingAgentCreates.delete(resolvedWorldId);
      }
    },
  };
}

/**
 * Create new world with configuration and automatically create a new chat
 */
export async function createWorld(params: CreateWorldParams): Promise<World | null> {
  await ensureInitialization();

  const worldId = utils.toKebabCase(params.name);

  const exists = await storageWrappers!.worldExists(worldId);
  if (exists) {
    throw new Error(`World with name '${params.name}' already exists`);
  }

  const worldData: World = {
    id: worldId,
    name: params.name,
    description: params.description,
    turnLimit: params.turnLimit || 5,
    mainAgent: params.mainAgent ? String(params.mainAgent).trim() : null,
    chatLLMProvider: params.chatLLMProvider,
    chatLLMModel: params.chatLLMModel,
    mcpConfig: params.mcpConfig,
    variables: params.variables,
    heartbeatEnabled: params.heartbeatEnabled === true,
    heartbeatInterval: params.heartbeatInterval ? String(params.heartbeatInterval).trim() : null,
    heartbeatPrompt: params.heartbeatPrompt ? String(params.heartbeatPrompt) : null,
    createdAt: new Date(),
    lastUpdated: new Date(),
    totalAgents: 0,
    totalMessages: 0,
    eventEmitter: new EventEmitter(),
    agents: new Map<string, Agent>(),
    chats: new Map<string, Chat>(),
    eventStorage: (storageWrappers as any)?.eventStorage,
  };

  // Setup event persistence
  if (worldData.eventStorage) {
    const { setupEventPersistence, setupWorldActivityListener } = await import('./events/index.js');
    worldData._eventPersistenceCleanup = setupEventPersistence(worldData);
    worldData._activityListenerCleanup = setupWorldActivityListener(worldData);
  }

  await storageWrappers!.saveWorld(worldData);

  // Automatically create a new chat for the world
  const world = await getWorld(worldId);
  if (world) {
    await newChat(worldId);
    return await getWorld(worldId);
  }

  return world;
}

/**
 * Update world configuration
 */
export async function updateWorld(worldId: string, updates: UpdateWorldParams): Promise<World | null> {
  await ensureInitialization();

  const resolvedWorldId = await getResolvedWorldId(worldId);
  const existingData = await storageWrappers!.loadWorld(resolvedWorldId);

  if (!existingData) {
    return null;
  }

  const normalizedUpdates: UpdateWorldParams = {
    ...updates,
    ...(updates.mainAgent !== undefined ? { mainAgent: updates.mainAgent ? String(updates.mainAgent).trim() : null } : {})
  };

  const updatedData: World = {
    ...existingData,
    ...normalizedUpdates,
    lastUpdated: new Date()
  };

  await storageWrappers!.saveWorld(updatedData);
  return getWorld(resolvedWorldId);
}

async function getPersistedCurrentChatId(worldId: string): Promise<string | null> {
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const worldData = await storageWrappers!.loadWorld(resolvedWorldId);
  const chatId = String(worldData?.currentChatId || '').trim();
  return chatId || null;
}

async function setPersistedCurrentChatId(worldId: string, chatId: string | null): Promise<void> {
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const worldData = await storageWrappers!.loadWorld(resolvedWorldId);
  if (!worldData) {
    return;
  }

  const normalizedChatId = String(chatId || '').trim() || null;
  const existingChatId = String(worldData.currentChatId || '').trim() || null;
  if (existingChatId === normalizedChatId) {
    return;
  }

  await storageWrappers!.saveWorld({
    ...worldData,
    currentChatId: normalizedChatId,
    lastUpdated: new Date(),
  });
}

/**
 * Set the raw .env-style variables text for a world
 */
export async function setWorldVariablesText(worldId: string, variablesText: string): Promise<World | null> {
  await ensureInitialization();
  return updateWorld(worldId, { variables: variablesText });
}

/**
 * Get the raw .env-style variables text for a world
 */
export async function getWorldVariablesText(worldId: string): Promise<string> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const world = await storageWrappers!.loadWorld(resolvedWorldId);
  if (!world) {
    return '';
  }
  return typeof world.variables === 'string' ? world.variables : '';
}

/**
 * Get parsed environment map from world variables text
 */
export async function getWorldEnvMap(worldId: string): Promise<Record<string, string>> {
  await ensureInitialization();
  const variablesText = await getWorldVariablesText(worldId);
  return utils.parseEnvText(variablesText);
}

/**
 * Get a single env value from world variables text
 */
export async function getWorldEnvValue(worldId: string, key: string): Promise<string | undefined> {
  await ensureInitialization();
  if (!key) {
    return undefined;
  }
  const envMap = await getWorldEnvMap(worldId);
  return envMap[key];
}

/**
 * Delete world and all associated data
 */
export async function deleteWorld(worldId: string): Promise<boolean> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  // Side-effect-free cleanup path: avoid getWorld() because it can hydrate runtime state.
  const worldData = await storageWrappers!.loadWorld(resolvedWorldId);
  if (worldData?._eventPersistenceCleanup) {
    worldData._eventPersistenceCleanup();
  }
  if (worldData?._activityListenerCleanup) {
    worldData._activityListenerCleanup();
  }

  const result = await storageWrappers!.deleteWorld(resolvedWorldId);
  // Stop any active runtime so subsequent subscriptions get a fresh world
  // instead of reusing state from the deleted incarnation.
  await stopWorldRuntimesByWorldId(resolvedWorldId);
  return result;
}

/**
 * Get all world IDs and basic information
 */
export async function listWorlds(): Promise<World[]> {
  await ensureInitialization();

  const allWorldData = await storageWrappers!.listWorlds();

  const worldsWithAgentCount = await Promise.all(
    allWorldData.map(async (data: World) => {
      try {
        const normalizedId = utils.toKebabCase(data.id || data.name || '');
        const agents = await storageWrappers!.listAgents(data.id);
        return { ...data, id: normalizedId || data.id, agentCount: agents.length };
      } catch (error) {
        const normalizedId = utils.toKebabCase(data.id || data.name || '');
        return { ...data, id: normalizedId || data.id, agentCount: 0 };
      }
    })
  );

  return worldsWithAgentCount;
}

/**
 * Get world configuration and create runtime instance, creating a new chat if none exist
 */
export async function getWorld(worldId: string): Promise<World | null> {
  await ensureInitialization();

  const resolvedWorldId = await getResolvedWorldId(worldId);

  logger.debug('getWorldConfig called', {
    originalWorldId: worldId,
    resolvedWorldId
  });

  const worldData = await storageWrappers!.loadWorld(resolvedWorldId);

  logger.debug('loadWorld result', {
    worldFound: !!worldData,
    worldId: worldData?.id,
    worldName: worldData?.name
  });

  if (!worldData) {
    logger.debug('World not found, returning null');
    return null;
  }

  let agents = await storageWrappers!.listAgents(resolvedWorldId);
  let chats = await storageWrappers!.listChats(resolvedWorldId);

  // If there are no chats, create a new one
  if (chats.length === 0) {
    logger.debug('No chats found for world, creating new chat');
    await newChat(resolvedWorldId);
    chats = await storageWrappers!.listChats(resolvedWorldId);
  }

  const world: World = {
    ...worldData,
    eventEmitter: new EventEmitter(),
    agents: new Map(agents.map((agent: Agent) => [agent.id, agent])),
    chats: new Map(chats.map((chat: Chat) => [chat.id, chat])),
    eventStorage: (storageWrappers as any)?.eventStorage,
    _eventPersistenceCleanup: undefined, // Will be set by setupEventPersistence
    _activityListenerCleanup: undefined, // Will be set by setupWorldActivityListener
  };

  // Setup event persistence and activity listener
  if (world.eventStorage) {
    const { setupEventPersistence, setupWorldActivityListener } = await import('./events/index.js');
    world._eventPersistenceCleanup = setupEventPersistence(world);
    world._activityListenerCleanup = setupWorldActivityListener(world);
  }

  // Initialize queued chat set; per-chat seeding deferred to explicit queue operations
  world._queuedChatIds = new Set<string>();

  return world;
}

/**
 * Create new agent with configuration and system prompt
 */
export async function createAgent(
  worldId: string,
  params: CreateAgentParams,
  options: CreateAgentOptions = {},
): Promise<Agent> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  // Check if world is processing to prevent agent creation during concurrent chat sessions
  const { getActiveSubscribedWorld } = await import('./subscription.js');
  const activeSubscribedWorld = getActiveSubscribedWorld(resolvedWorldId);
  const world = activeSubscribedWorld || await getWorld(resolvedWorldId);
  if (world?.isProcessing && !options.allowWhileWorldProcessing) {
    throw new Error('Cannot create agent while world is processing');
  }

  const agentId = params.id || utils.toKebabCase(params.name);

  // Resolve the pending-creates Set (needed in finally regardless of who claimed it).
  const worldPending = pendingAgentCreates.get(resolvedWorldId) ?? new Set<string>();
  if (!pendingAgentCreates.has(resolvedWorldId)) {
    pendingAgentCreates.set(resolvedWorldId, worldPending);
  }

  if (!options.slotAlreadyClaimed) {
    // TOCTOU guard: claim the slot before the async agentExists check.
    // Skipped when the caller already claimed the slot via claimAgentCreationSlot().
    if (worldPending.has(agentId)) {
      throw new Error(`Agent '${agentId}' is already being created`);
    }
    worldPending.add(agentId);
  }

  try {
    const exists = await storageWrappers!.agentExists(resolvedWorldId, agentId);
    if (exists) {
      throw new Error(`Agent with ID '${agentId}' already exists`);
    }

    const now = new Date();
    const agent: Agent = {
      id: agentId,
      name: params.name,
      type: params.type,
      autoReply: params.autoReply ?? true,
      status: 'inactive',
      provider: params.provider,
      model: params.model,
      systemPrompt: params.systemPrompt,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      createdAt: now,
      lastActive: now,
      llmCallCount: 0,
      memory: [],
    };

    await storageWrappers!.saveAgent(resolvedWorldId, agent);

    if (world) {
      world.agents.set(agent.id, agent);
    }

    return agent;
  } finally {
    // Clean up the slot whether it was claimed here or via claimAgentCreationSlot().
    worldPending.delete(agentId);
    if (worldPending.size === 0) {
      pendingAgentCreates.delete(resolvedWorldId);
    }
  }
}

/**
 * Load agent by ID with full configuration and memory
 */
export async function getAgent(worldId: string, agentId: string): Promise<Agent | null> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const resolvedAgentId = await getResolvedAgentId(resolvedWorldId, agentId);

  const agentData = await storageWrappers!.loadAgent(resolvedWorldId, resolvedAgentId);
  if (!agentData) return null;

  return agentData;
}

/**
 * Update agent configuration and/or memory
 */
export async function updateAgent(worldId: string, agentId: string, updates: UpdateAgentParams): Promise<Agent | null> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const resolvedAgentId = await getResolvedAgentId(resolvedWorldId, agentId);

  // Check if world is processing to prevent agent modification during concurrent chat sessions
  const { getActiveSubscribedWorld } = await import('./subscription.js');
  const activeSubscribedWorld = getActiveSubscribedWorld(resolvedWorldId);
  const world = activeSubscribedWorld || await getWorld(resolvedWorldId);
  if (world?.isProcessing) {
    throw new Error('Cannot update agent while world is processing');
  }

  const existingAgentData = await storageWrappers!.loadAgent(resolvedWorldId, resolvedAgentId);

  if (!existingAgentData) {
    return null;
  }

  const updatedAgent: Agent = {
    ...existingAgentData,
    name: updates.name || existingAgentData.name,
    type: updates.type || existingAgentData.type,
    autoReply: updates.autoReply !== undefined ? updates.autoReply : (existingAgentData.autoReply ?? true),
    status: updates.status || existingAgentData.status,
    provider: updates.provider || existingAgentData.provider,
    model: updates.model || existingAgentData.model,
    systemPrompt: updates.systemPrompt !== undefined ? updates.systemPrompt : existingAgentData.systemPrompt,
    temperature: updates.temperature !== undefined ? updates.temperature : existingAgentData.temperature,
    maxTokens: updates.maxTokens !== undefined ? updates.maxTokens : existingAgentData.maxTokens,
    lastActive: new Date()
  };

  await storageWrappers!.saveAgent(resolvedWorldId, updatedAgent);

  if (world) {
    const runtimeAgent = world.agents.get(resolvedAgentId);
    if (runtimeAgent) {
      Object.assign(runtimeAgent, updatedAgent);
      world.agents.set(resolvedAgentId, runtimeAgent);
    } else {
      world.agents.set(resolvedAgentId, updatedAgent);
    }
  }

  return updatedAgent;
}

/**
 * Delete agent and all associated data
 */
export async function deleteAgent(worldId: string, agentId: string): Promise<boolean> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const resolvedAgentId = await getResolvedAgentId(resolvedWorldId, agentId);

  // Check if world is processing to prevent agent deletion during concurrent chat sessions
  const { getActiveSubscribedWorld } = await import('./subscription.js');
  const activeSubscribedWorld = getActiveSubscribedWorld(resolvedWorldId);
  const world = activeSubscribedWorld || await getWorld(resolvedWorldId);
  if (world?.isProcessing) {
    throw new Error('Cannot delete agent while world is processing');
  }

  const success = await storageWrappers!.deleteAgent(resolvedWorldId, resolvedAgentId);

  if (success && world) {
    // Remove the agent's message listener BEFORE removing from the agents map
    // to prevent the stale closure from continuing to process messages.
    const unsubscribe = world._agentUnsubscribers?.get(resolvedAgentId);
    if (unsubscribe) {
      unsubscribe();
      world._agentUnsubscribers!.delete(resolvedAgentId);
    }
    world.agents.delete(resolvedAgentId);
  }

  return success;
}

/**
 * Get all agent IDs and basic information
 */
export async function listAgents(worldId: string): Promise<Agent[]> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  return await storageWrappers!.listAgents(resolvedWorldId);
}

/**
 * Add messages to agent memory
 */
export async function updateAgentMemory(worldId: string, agentId: string, messages: AgentMessage[]): Promise<Agent | null> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const resolvedAgentId = await getResolvedAgentId(resolvedWorldId, agentId);

  // Check if world is processing to prevent memory modification during concurrent chat sessions
  const world = await getWorld(resolvedWorldId);
  if (world?.isProcessing) {
    throw new Error('Cannot update agent memory while world is processing');
  }

  const existingAgentData = await storageWrappers!.loadAgent(resolvedWorldId, resolvedAgentId);

  if (!existingAgentData) {
    return null;
  }

  // Ensure messages have the agentId set
  const messagesWithAgentId = messages.map(msg => ({
    ...msg,
    agentId: resolvedAgentId
  }));

  const updatedAgent: Agent = {
    ...existingAgentData,
    memory: [...existingAgentData.memory, ...messagesWithAgentId],
    lastActive: new Date()
  };

  await storageWrappers!.saveAgentMemory(resolvedWorldId, resolvedAgentId, updatedAgent.memory);
  await storageWrappers!.saveAgent(resolvedWorldId, updatedAgent);
  return updatedAgent;
}

/**
 * Clear agent memory and reset LLM call count
 */
export async function clearAgentMemory(worldId: string, agentId: string): Promise<Agent | null> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const resolvedAgentId = await getResolvedAgentId(resolvedWorldId, agentId);

  // Check if world is processing to prevent memory clearing during concurrent chat sessions
  const world = await getWorld(resolvedWorldId);
  if (world?.isProcessing) {
    throw new Error('Cannot clear agent memory while world is processing');
  }

  logger.debug('Core clearAgentMemory called', {
    worldId,
    resolvedWorldId,
    originalAgentId: agentId,
    resolvedAgentId
  });

  const existingAgentData = await storageWrappers!.loadAgent(resolvedWorldId, resolvedAgentId);

  logger.debug('loadAgent result', {
    agentFound: !!existingAgentData,
    agentName: existingAgentData?.name,
    memoryLength: existingAgentData?.memory?.length || 0,
    currentLLMCallCount: existingAgentData?.llmCallCount || 0
  });

  if (!existingAgentData) {
    logger.debug('Agent not found on disk, returning null');
    return null;
  }

  if (existingAgentData.memory && existingAgentData.memory.length > 0) {
    try {
      logger.debug('Archiving existing memory');
      await storageWrappers!.archiveMemory(resolvedWorldId, resolvedAgentId, existingAgentData.memory);
      logger.debug('Memory archived successfully');
    } catch (error) {
      logger.error('Failed to archive memory', { resolvedAgentId, error: error instanceof Error ? error.message : error });
    }
  }

  const updatedAgent: Agent = {
    ...existingAgentData,
    memory: [],
    llmCallCount: 0,
    lastActive: new Date()
  };

  logger.debug('Saving cleared memory to disk');

  await storageWrappers!.saveAgentMemory(resolvedWorldId, resolvedAgentId, []);
  await storageWrappers!.saveAgent(resolvedWorldId, updatedAgent);

  logger.debug('Memory and LLM call count cleared and saved successfully', {
    resolvedAgentId,
    newLLMCallCount: updatedAgent.llmCallCount
  });
  return updatedAgent;
}

/**
 * Create new chat data entry with optional world snapshot
 */
async function createChat(worldId: string, params: CreateChatParams): Promise<Chat> {
  await ensureInitialization();

  const chatId = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date();

  const chatData: Chat = {
    id: chatId,
    worldId,
    name: NEW_CHAT_TITLE,
    description: params.description,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  };

  await storageWrappers!.saveChatData(worldId, chatData);

  const world = await getWorld(worldId);
  if (world) {
    world.chats.set(chatData.id, chatData);
  }

  return chatData;
}

/**
 * Create a new chat and optionally set it as current for a world
 */
export async function newChat(worldId: string): Promise<World | null> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  const chats = await listChats(resolvedWorldId);
  const existingChat = chats.find(chat => isDefaultChatTitle(chat.name));

  // Only reuse existing "New Chat" if it's empty (has no messages)
  if (existingChat) {
    const messages = await storageWrappers!.getMemory(resolvedWorldId, existingChat.id);
    if (messages.length === 0) {
      await setPersistedCurrentChatId(resolvedWorldId, existingChat.id);
      return await getWorld(resolvedWorldId);
    }
    // If chat has messages, fall through to create a new one
  }

  const chatData = await createChat(resolvedWorldId, {
    name: NEW_CHAT_TITLE,
    captureChat: false
  });
  await setPersistedCurrentChatId(resolvedWorldId, chatData.id);
  return await getWorld(resolvedWorldId);
}

/**
 * Create a branched chat from a source chat up to (and including) the provided message.
 */
export async function branchChatFromMessage(
  worldId: string,
  sourceChatId: string,
  messageId: string
): Promise<{ world: World; newChatId: string; copiedMessageCount: number }> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const normalizedSourceChatId = String(sourceChatId || '').trim();
  const normalizedMessageId = String(messageId || '').trim();

  if (!normalizedSourceChatId) {
    throw new Error('Source chat ID is required.');
  }

  if (!normalizedMessageId) {
    throw new Error('Message ID is required.');
  }

  const sourceChat = await storageWrappers!.loadChatData(resolvedWorldId, normalizedSourceChatId);
  if (!sourceChat) {
    throw new Error(`Source chat not found: ${normalizedSourceChatId}`);
  }

  const sourceMessages = await storageWrappers!.getMemory(resolvedWorldId, normalizedSourceChatId);
  const targetIndex = sourceMessages.findIndex((entry) =>
    String(entry?.messageId || '') === normalizedMessageId &&
    String(entry?.chatId || '') === normalizedSourceChatId
  );

  if (targetIndex < 0) {
    throw new Error(`Message not found in source chat: ${normalizedMessageId}`);
  }

  const targetMessage = sourceMessages[targetIndex];
  const targetRole = String(targetMessage?.role || '').trim().toLowerCase();
  const targetSender = String(targetMessage?.sender || '').trim().toLowerCase();
  const targetContent = String(targetMessage?.content || '').trim().toLowerCase();
  const hasToolCalls = Array.isArray((targetMessage as any)?.tool_calls) && (targetMessage as any).tool_calls.length > 0;
  const hasToolCallId = Boolean((targetMessage as any)?.tool_call_id);
  const hasToolCallStatus = Boolean((targetMessage as any)?.toolCallStatus);
  const isSystemOrToolSender = targetSender === 'system' || targetSender === 'tool';
  const isErrorLikeAssistantMessage = targetContent.startsWith('[error]') || targetContent.startsWith('error:');

  if (
    targetRole !== 'assistant' ||
    isSystemOrToolSender ||
    hasToolCalls ||
    hasToolCallId ||
    hasToolCallStatus ||
    isErrorLikeAssistantMessage
  ) {
    throw new Error('Can only branch from assistant messages.');
  }

  const toEpochMillis = (value: unknown): number => {
    if (value instanceof Date) {
      return value.getTime();
    }
    if (value) {
      const parsed = new Date(String(value)).getTime();
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return Date.now();
  };

  const cutoffTimestamp = toEpochMillis(targetMessage?.createdAt);

  const updatedWorld = await newChat(resolvedWorldId);
  const newChatId = await getPersistedCurrentChatId(resolvedWorldId);
  if (!updatedWorld || !newChatId) {
    throw new Error('Failed to create branch chat.');
  }

  let copiedMessageCount = 0;
  const agents = await listAgents(resolvedWorldId);

  try {
    for (const agent of agents) {
      const loadedAgent = await storageWrappers!.loadAgent(resolvedWorldId, agent.id);
      if (!loadedAgent || !Array.isArray(loadedAgent.memory)) {
        continue;
      }

      const sourceAgentMessages = loadedAgent.memory.filter(
        (entry) => String(entry?.chatId || '') === normalizedSourceChatId
      );
      if (sourceAgentMessages.length === 0) {
        continue;
      }

      const branchMessages: AgentMessage[] = [];
      let reachedTarget = false;

      for (const sourceEntry of sourceAgentMessages) {
        branchMessages.push({
          ...sourceEntry,
          chatId: newChatId
        });
        if (String(sourceEntry?.messageId || '') === normalizedMessageId) {
          reachedTarget = true;
          break;
        }
      }

      const effectiveBranchMessages = reachedTarget
        ? branchMessages
        : sourceAgentMessages
          .filter((entry) => toEpochMillis(entry?.createdAt) <= cutoffTimestamp)
          .map((entry) => ({
            ...entry,
            chatId: newChatId
          }));

      if (effectiveBranchMessages.length === 0) {
        continue;
      }

      copiedMessageCount += effectiveBranchMessages.length;
      await storageWrappers!.saveAgentMemory(
        resolvedWorldId,
        loadedAgent.id,
        [...loadedAgent.memory, ...effectiveBranchMessages]
      );
    }
  } catch (error) {
    try {
      await deleteChat(resolvedWorldId, newChatId);
    } catch (rollbackError) {
      logger.error('Failed to rollback branched chat after copy error', {
        worldId: resolvedWorldId,
        newChatId,
        rollbackError: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
      });
    }
    throw error;
  }

  return {
    world: updatedWorld,
    newChatId,
    copiedMessageCount
  };
}

export async function listChats(worldId: string): Promise<Chat[]> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  return await storageWrappers!.listChats(resolvedWorldId);
}

export async function updateChat(worldId: string, chatId: string, updates: UpdateChatParams): Promise<Chat | null> {
  await ensureInitialization();

  const resolvedWorldId = await getResolvedWorldId(worldId);
  const chat = await storageWrappers!.updateChatData(resolvedWorldId, chatId, updates);

  if (!chat) {
    return null;
  }

  // When a chat is updated we refresh the cached world representation
  const world = await getWorld(resolvedWorldId);
  if (world && world.chats.has(chatId)) {
    world.chats.set(chatId, {
      ...world.chats.get(chatId)!,
      ...chat
    });
  }

  return chat;
}

export async function deleteChat(worldId: string, chatId: string): Promise<boolean> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  // First, delete all agent memory items associated with this chat
  const deletedMemoryCount = await storageWrappers!.deleteMemoryByChatId(resolvedWorldId, chatId);
  logger.debug('Deleted memory items for chat', { worldId, resolvedWorldId, chatId, deletedMemoryCount });

  const persistedCurrentChatId = await getPersistedCurrentChatId(resolvedWorldId);
  // Get the world to update in-memory chat cache only
  const world = await getWorld(resolvedWorldId);
  const shouldSetNewCurrentChat = persistedCurrentChatId === chatId;

  // Then delete the chat itself
  const chatDeleted = await storageWrappers!.deleteChatData(resolvedWorldId, chatId);

  // Remove from world's in-memory chat map
  if (chatDeleted && world) {
    world.chats.delete(chatId);
  }

  // If this was the current chat, set a fallback current chat
  if (shouldSetNewCurrentChat && chatDeleted) {
    const remainingChats = await storageWrappers!.listChats(resolvedWorldId);
    if (remainingChats.length > 0) {
      // Set the most recently updated chat as current
      const latestChat = remainingChats.sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0];
      await setPersistedCurrentChatId(resolvedWorldId, latestChat.id);
    } else {
      // No chats left, create a new one
      logger.debug('No chats remaining after deletion, creating new chat');
      await newChat(resolvedWorldId);
    }
  }

  return chatDeleted;
}

async function activateChatResources(
  world: World,
  resolvedWorldId: string,
  chatId: string,
  options?: RestoreChatOptions
): Promise<void> {
  await syncRuntimeAgentMemoryFromStorage(world, resolvedWorldId);
  loggerRestore.debug('Restore chat memory sync complete', { worldId: world.id, chatId });
  const memoryForApprovals = await storageWrappers!.getMemory(resolvedWorldId, chatId);
  clearChatSkillApprovals(resolvedWorldId, chatId);
  reconstructSkillApprovalsFromMessages(resolvedWorldId, chatId, Array.isArray(memoryForApprovals) ? memoryForApprovals : []);
  const { getActiveSubscribedWorld } = await import('./subscription.js');
  const runtimeWorld = getActiveSubscribedWorld(resolvedWorldId, chatId) || world;
  replayPendingHitlRequests(runtimeWorld, chatId);
  loggerRestore.debug('Restore chat pending HITL replay triggered', { worldId: world.id, chatId });
  if (options?.suppressAutoResume === true) {
    loggerRestore.debug('Restore chat auto-resume suppressed for mutation flow', {
      worldId: world.id,
      chatId,
    });
    return;
  }
  triggerPendingToolCallResumeFromLastMessage(runtimeWorld, chatId);
  clearQueuePauseForChat(runtimeWorld.id, chatId);
  triggerPendingQueueResume(runtimeWorld, chatId, { recoverStaleSending: true });
}

export async function restoreChat(worldId: string, chatId: string, options?: RestoreChatOptions): Promise<World | null> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const restoreStartedAt = Date.now();

  loggerRestore.debug('Restore chat started', {
    worldId: resolvedWorldId,
    requestedChatId: chatId,
  });

  let world = await getWorld(resolvedWorldId);
  const persistedCurrentChatId = await getPersistedCurrentChatId(resolvedWorldId);
  if (!world) {
    loggerRestore.debug('Restore chat aborted: world missing', {
      worldId: resolvedWorldId,
      requestedChatId: chatId,
    });
    return null;
  }

  if (persistedCurrentChatId === chatId) {
    loggerRestore.debug('Restore chat detected already-current chat', {
      worldId: world.id,
      chatId,
      action: 'sync-memory+resume',
    });
    await activateChatResources(world, resolvedWorldId, chatId, options);
    loggerRestore.debug('Restore chat resume inspection triggered', {
      worldId: world.id,
      chatId,
      elapsedMs: Date.now() - restoreStartedAt,
    });
    return world;
  }

  const runtimeChatExists = world.chats.has(chatId);
  const persistedChatExists = runtimeChatExists
    ? true
    : !!(await storageWrappers!.loadChatData(resolvedWorldId, chatId));

  if (!persistedChatExists) {
    loggerRestore.debug('Restore chat aborted: chat missing', {
      worldId: resolvedWorldId,
      requestedChatId: chatId,
      runtimeChatExists,
    });
    return null;
  }

  // Auto-pause the old chat's queue when switching away (FR-8 safety)
  const previousChatId = persistedCurrentChatId;
  if (previousChatId && previousChatId !== chatId) {
    autoPauseQueueForChat(resolvedWorldId, previousChatId);
    loggerRestore.debug('Auto-paused queue for previous chat on switch', {
      worldId: resolvedWorldId,
      previousChatId,
      newChatId: chatId,
    });
  }

  loggerRestore.debug('Restore chat switching current chat', {
    worldId: resolvedWorldId,
    fromChatId: previousChatId,
    toChatId: chatId,
  });
  await setPersistedCurrentChatId(resolvedWorldId, chatId);
  world = await getWorld(resolvedWorldId);
  if (world) {
    await activateChatResources(world, resolvedWorldId, chatId, options);
    loggerRestore.debug('Restore chat resume inspection triggered', {
      worldId: world.id,
      chatId,
      elapsedMs: Date.now() - restoreStartedAt,
    });
  } else {
    loggerRestore.warn('Restore chat update-world returned null', {
      worldId: resolvedWorldId,
      requestedChatId: chatId,
      elapsedMs: Date.now() - restoreStartedAt,
    });
  }

  loggerRestore.debug('Restore chat completed', {
    worldId: resolvedWorldId,
    requestedChatId: chatId,
    restoredCurrentChatId: await getPersistedCurrentChatId(resolvedWorldId),
    elapsedMs: Date.now() - restoreStartedAt,
  });
  return world;
}

export async function activateChatWithSnapshot(worldId: string, chatId: string): Promise<ChatActivationSnapshot | null> {
  const world = await restoreChat(worldId, chatId);
  if (!world) {
    return null;
  }

  const resolvedChatId = String(chatId || '').trim();
  if (!resolvedChatId) {
    return null;
  }

  const memory = await storageWrappers!.getMemory(world.id, resolvedChatId);
  const safeMemory = Array.isArray(memory) ? memory : [];

  // Message-authoritative: pending HITL state is derived from persisted messages only.
  // Runtime pending map serves transport/notification purposes; the snapshot always uses
  // messages as the single source of truth (AD-1, AD-4).
  const hitlPrompts = listPendingHitlPromptEventsFromMessages(safeMemory, resolvedChatId);

  loggerRestore.debug('Activate chat snapshot assembled', {
    worldId: world.id,
    chatId: resolvedChatId,
    memoryCount: safeMemory.length,
    hitlPromptCount: hitlPrompts.length,
  });

  return {
    world,
    chatId: resolvedChatId,
    memory: safeMemory,
    hitlPrompts,
  };
}

export async function getMemory(worldId: string, chatId: string): Promise<AgentMessage[] | null> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  let world = await getWorld(resolvedWorldId);
  if (!world) {
    return null;
  }

  const resolvedChatId = String(chatId || '').trim();
  if (!resolvedChatId) {
    throw new Error('getMemory: chatId is required.');
  }
  const memory = await storageWrappers!.getMemory(resolvedWorldId, resolvedChatId);

  // Auto-repair legacy memories so downstream clients can rely on messageId without UI fallbacks.
  if (memory.some(message => !message.messageId)) {
    logger.warn('Detected messages without messageId in getMemory; running migration', {
      worldId: resolvedWorldId,
      chatId: resolvedChatId
    });

    await migrateMessageIds(resolvedWorldId);
    return await storageWrappers!.getMemory(resolvedWorldId, resolvedChatId);
  }

  return memory;
}

// Re-exports from extracted modules
export { migrateMessageIds, removeMessagesFrom, editUserMessage, logEditError, getEditErrors } from './message-edit-manager.js';
export { addToQueue, recoverQueueSendingMessages, enqueueAndProcessUserTurn, dispatchImmediateChatMessage, getQueueMessages, removeFromQueue, pauseChatQueue, resumeChatQueue, stopChatQueue, clearChatQueue, retryQueueMessage } from './queue-manager.js';
