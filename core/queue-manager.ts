/**
 * Queue Manager Module
 *
 * Purpose: Complete message queue management for per-chat ordered message dispatch.
 *
 * Key features:
 * - Per-chat FIFO queue with pause/resume/stop/clear lifecycle
 * - Explicit-recovery failure handling for user-authored turns
 * - Responder preflight: checks eligible agents before marking a row 'sending';
 *   performs a single runtime refresh attempt when no responders are found
 * - No-response timeout fallback: escalates to durable error if no response-start
 *   event arrives within QUEUE_NO_RESPONSE_FALLBACK_MS
 * - World-advance event listener chaining: next queue item is triggered when the
 *   current chat's processing goes idle
 * - Startup recovery: stale 'sending' rows are reset on module init
 * - Queue state is scoped per-world+chat (no cross-world leakage)
 *
 * Notes:
 * - subscription.js imports managers.ts, so getActiveSubscribedWorld must stay
 *   a dynamic import here to avoid a static circular dependency.
 * - getWorld from managers.ts is also a dynamic import (managers re-exports this module).
 * - All other dependencies (events/index.js, storage-init.ts, etc.) are static.
 *
 * Recent Changes:
 * - 2026-03-22: Made queue dispatch failure messages user-facing and mention-aware so
 *   missing targeted agents surface as "no agent '@name' found in this world" instead of
 *   exposing the internal `no-responder-preflight` reason code.
 * - 2026-03-14: Allowed `world` sender messages onto the queue so scheduled/system-originated
 *   world prompts use the same ordered ingress and mention preflight rules as human turns.
 * - 2026-03-12: Registered queue advance listeners in the detachable listener map so sequential queued
 *   turns in the same chat can reattach completion cleanup after the previous turn finishes.
 * - 2026-03-10: Treat unresolved persisted HITL prompts as explicit recovery boundaries during stale `sending` recovery so restore does not replay turns that are already waiting for approval.
 * - 2026-03-10: Queue dispatch failures that occur before streaming starts now publish a durable structured `system/error` artifact so failed turns remain visible in the transcript.
 * - 2026-03-10: Split queue-backed user submission from immediate non-user dispatch; queue APIs are now user-turn-only by contract.
 * - 2026-03-10: Removed memory-based restore resend and automatic queue backoff replay for failed user turns.
 * - 2026-03-09: Extracted from managers.ts as part of god-module decomposition.
 *   - triggerPendingUserMessageResume moved here (uses queue infrastructure).
 *   - autoPauseQueueForChat / clearQueuePauseForChat exported for managers.ts use.
 */
import { storageWrappers, ensureInitialization, getResolvedWorldId } from './storage-init.js';
import { RELIABILITY_CONFIG } from './reliability-config.js';
import { createCategoryLogger } from './logger.js';
import * as utils from './utils.js';
import { hasActiveChatMessageProcessing } from './message-processing-control.js';
import {
  publishMessageWithId,
  publishMessage,
  publishEvent,
  subscribeAgentToMessages,
  subscribeWorldToMessages,
  setupWorldActivityListener,
} from './events/index.js';
import { listPendingHitlPromptEventsFromMessages } from './hitl.js';
import { nanoid } from 'nanoid';
import type {
  World, Agent, QueuedMessage, StorageAPI, WorldMessageEvent,
} from './types.js';

const loggerQueue = createCategoryLogger('message.queue');

// ─── Queue management state ──────────────────────────────────────────────────
// keyed by `${worldId}:${chatId}`
const inFlightQueueResumeKeys = new Set<string>();
export const pausedQueues = new Set<string>();
const queueListenerActive = new Set<string>();
const queueAdvanceListeners = new Map<string, (payload: any) => void>();
const queueResponderRefreshAttempted = new Set<string>();
const QUEUE_NO_RESPONSE_FALLBACK_MS = RELIABILITY_CONFIG.queue.noResponseFallbackMs;

type QueueDispatchState = {
  messageId: string;
  responseStarted: boolean;
  dispatchedAt: number;
};
const queueDispatchStateByChat = new Map<string, QueueDispatchState>();

type QueueAgentStatusSnapshot = {
  queueChatId: string;
  totalAgents: number;
  activeAgents: number;
  autoReplyEnabledAgents: number;
  subscribedAgentCount: number;
  messageListenerCount: number;
  worldListenerCount: number;
  sseListenerCount: number;
  mainAgent: string | null;
  resolvedMainAgentId: string | null;
  paragraphMentions: string[];
  anyMentions: string[];
  effectiveMentions: string[];
  eligibleResponderAgentIds: string[];
  eligibleResponderCount: number;
  reasonHint: string | null;
};

type QueueStorageOperations = Required<Pick<
  StorageAPI,
  'getQueuedMessages' |
  'addQueuedMessage' |
  'updateMessageQueueStatus' |
  'incrementQueueMessageRetry' |
  'removeQueuedMessage'
>>;

// ─── Internal helpers ─────────────────────────────────────────────────────────

function getQueueKey(worldId: string, chatId: string): string {
  return `${worldId}:${chatId}`;
}

function getQueueMessageKey(worldId: string, chatId: string, messageId: string): string {
  return `${worldId}:${chatId}:${messageId}`;
}

function clearQueueResponderRefreshAttempt(worldId: string, chatId: string, messageId: string): void {
  queueResponderRefreshAttempted.delete(getQueueMessageKey(worldId, chatId, messageId));
}

export function getQueueStorageOrThrow(caller: string): QueueStorageOperations {
  const missingMethods: string[] = [];
  if (!storageWrappers?.getQueuedMessages) missingMethods.push('getQueuedMessages');
  if (!storageWrappers?.addQueuedMessage) missingMethods.push('addQueuedMessage');
  if (!storageWrappers?.updateMessageQueueStatus) missingMethods.push('updateMessageQueueStatus');
  if (!storageWrappers?.incrementQueueMessageRetry) missingMethods.push('incrementQueueMessageRetry');
  if (!storageWrappers?.removeQueuedMessage) missingMethods.push('removeQueuedMessage');

  if (missingMethods.length > 0) {
    throw new Error(
      `${caller}: queue storage backend missing required operations (${missingMethods.join(', ')}).`
    );
  }

  return storageWrappers as QueueStorageOperations;
}

function detachQueueAdvanceListener(world: World, chatId: string): void {
  const listenerKey = getQueueKey(world.id, chatId);
  const listener = queueAdvanceListeners.get(listenerKey);
  if (!listener) return;
  world.eventEmitter.removeListener('world', listener);
  queueAdvanceListeners.delete(listenerKey);
  queueListenerActive.delete(listenerKey);
}

function normalizeQueueMentionToken(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function resolveQueueMainAgentId(world: World): string | null {
  const rawMainAgent = String(world.mainAgent || '').trim();
  if (!rawMainAgent) return null;

  const normalizedMainAgent = normalizeQueueMentionToken(rawMainAgent);
  if (!normalizedMainAgent) return null;
  const agentMap = world?.agents instanceof Map ? world.agents : new Map<string, Agent>();
  if (agentMap.has(normalizedMainAgent)) return normalizedMainAgent;

  for (const agent of agentMap.values()) {
    const normalizedAgentId = normalizeQueueMentionToken(agent.id);
    const normalizedAgentName = normalizeQueueMentionToken(agent.name || '');
    if (normalizedAgentId === normalizedMainAgent || normalizedAgentName === normalizedMainAgent) {
      return agent.id;
    }
  }
  return null;
}

function collectQueueAgentStatus(
  world: World,
  chatId: string,
  content: string,
  sender: string,
): QueueAgentStatusSnapshot {
  const agentMap = world?.agents instanceof Map ? world.agents : new Map<string, Agent>();
  const agents = Array.from(agentMap.values());
  const totalAgents = agents.length;
  const activeAgents = agents.filter((agent) => agent.status === 'active').length;
  const autoReplyEnabledAgents = agents.filter((agent) => agent.autoReply !== false).length;
  const subscribedAgentCount = world?._agentUnsubscribers instanceof Map
    ? world._agentUnsubscribers.size
    : 0;
  const messageListenerCount = typeof world?.eventEmitter?.listenerCount === 'function'
    ? world.eventEmitter.listenerCount('message')
    : 0;
  const worldListenerCount = typeof world?.eventEmitter?.listenerCount === 'function'
    ? world.eventEmitter.listenerCount('world')
    : 0;
  const sseListenerCount = typeof world?.eventEmitter?.listenerCount === 'function'
    ? world.eventEmitter.listenerCount('sse')
    : 0;

  const paragraphMentions = utils.extractParagraphBeginningMentions(content || '');
  const anyMentions = utils.extractMentions(content || '');
  const isUserSender = isUserQueueSender(sender);
  const resolvedMainAgentId = resolveQueueMainAgentId(world);
  const effectiveMentions = paragraphMentions.length === 0 && isUserSender && resolvedMainAgentId
    ? [normalizeQueueMentionToken(resolvedMainAgentId)]
    : paragraphMentions.map((mention) => normalizeQueueMentionToken(mention));

  let eligibleResponderAgentIds: string[] = [];
  if (!isUserSender) {
    eligibleResponderAgentIds = agents
      .map((agent) => String(agent.id || '').trim())
      .filter((agentId) => agentId.length > 0);
  } else if (effectiveMentions.length === 0 && anyMentions.length > 0) {
    eligibleResponderAgentIds = [];
  } else if (effectiveMentions.length === 0) {
    eligibleResponderAgentIds = agents
      .map((agent) => String(agent.id || '').trim())
      .filter((agentId) => agentId.length > 0);
  } else {
    eligibleResponderAgentIds = agents
      .filter((agent) => {
        const normalizedAgentId = String(agent.id || '').toLowerCase().replace(/\s+/g, '-');
        return effectiveMentions.includes(normalizedAgentId);
      })
      .map((agent) => String(agent.id || '').trim())
      .filter((agentId) => agentId.length > 0);
  }

  let reasonHint: string | null = null;
  if (totalAgents === 0) {
    reasonHint = 'no-agents-loaded';
  } else if (messageListenerCount === 0) {
    reasonHint = 'no-message-listeners';
  } else if (subscribedAgentCount === 0) {
    reasonHint = 'no-agent-subscribers';
  } else if (eligibleResponderAgentIds.length === 0) {
    reasonHint = 'no-eligible-responders-for-message';
  }

  return {
    queueChatId: chatId,
    totalAgents,
    activeAgents,
    autoReplyEnabledAgents,
    subscribedAgentCount,
    messageListenerCount,
    worldListenerCount,
    sseListenerCount,
    mainAgent: String(world.mainAgent || '').trim() || null,
    resolvedMainAgentId,
    paragraphMentions,
    anyMentions,
    effectiveMentions,
    eligibleResponderAgentIds,
    eligibleResponderCount: eligibleResponderAgentIds.length,
    reasonHint,
  };
}

function hasQueueResponderAvailability(status: QueueAgentStatusSnapshot): boolean {
  return status.eligibleResponderCount > 0;
}

async function refreshQueueRespondersFromStorage(world: World): Promise<void> {
  if (!storageWrappers?.listAgents) {
    throw new Error('refreshQueueRespondersFromStorage: listAgents is unavailable.');
  }

  if (world?._agentUnsubscribers instanceof Map) {
    for (const unsubscribe of world._agentUnsubscribers.values()) {
      try {
        unsubscribe();
      } catch {
        // best effort cleanup
      }
    }
    world._agentUnsubscribers.clear();
  }

  const persistedAgents = await storageWrappers.listAgents(world.id);
  world.agents = new Map((persistedAgents || []).map((agent: Agent) => [agent.id, agent]));

  for (const agent of world.agents.values()) {
    subscribeAgentToMessages(world, agent);
  }
  subscribeWorldToMessages(world);
  setupWorldActivityListener(world);
}

async function runQueueResponderPreflight(
  world: World,
  chatId: string,
  queuedMessage: Pick<QueuedMessage, 'messageId' | 'content' | 'sender'>,
): Promise<{ ready: boolean; agentStatus: QueueAgentStatusSnapshot; refreshed: boolean }> {
  let agentStatus = collectQueueAgentStatus(world, chatId, queuedMessage.content, queuedMessage.sender);
  if (hasQueueResponderAvailability(agentStatus)) {
    return { ready: true, agentStatus, refreshed: false };
  }

  const messageKey = getQueueMessageKey(world.id, chatId, queuedMessage.messageId);
  if (queueResponderRefreshAttempted.has(messageKey)) {
    return { ready: false, agentStatus, refreshed: false };
  }
  queueResponderRefreshAttempted.add(messageKey);

  loggerQueue.warn('Queue responder preflight detected no eligible responders; attempting one runtime refresh', {
    worldId: world.id,
    chatId,
    messageId: queuedMessage.messageId,
    agentStatus,
  });

  try {
    await refreshQueueRespondersFromStorage(world);
  } catch (error) {
    loggerQueue.warn('Queue responder preflight refresh failed', {
      worldId: world.id,
      chatId,
      messageId: queuedMessage.messageId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  agentStatus = collectQueueAgentStatus(world, chatId, queuedMessage.content, queuedMessage.sender);
  if (hasQueueResponderAvailability(agentStatus)) {
    return { ready: true, agentStatus, refreshed: true };
  }

  return { ready: false, agentStatus, refreshed: true };
}

type StaleSendingRecoveryDecision =
  | { action: 'recover'; reason: string }
  | { action: 'mark-error'; reason: string };

async function resolveStaleSendingRecoveryDecision(
  world: World,
  chatId: string,
  messageId: string,
): Promise<StaleSendingRecoveryDecision> {
  const eventStorage = world.eventStorage;
  if (!eventStorage || typeof eventStorage.getEventsByWorldAndChat !== 'function') {
    return {
      action: 'recover',
      reason: 'no-event-storage',
    };
  }

  const latestMessageEvents = await eventStorage.getEventsByWorldAndChat(world.id, chatId, {
    types: ['message'],
    order: 'desc',
    limit: 1,
  });
  const latestMessageEvent = latestMessageEvents[0] ?? null;
  if (!latestMessageEvent || typeof latestMessageEvent.seq !== 'number') {
    return {
      action: 'recover',
      reason: 'message-event-missing',
    };
  }

  if (String(latestMessageEvent.id || '').trim() !== messageId) {
    return {
      action: 'mark-error',
      reason: `superseded-by-message:${String(latestMessageEvent.id || '').trim() || 'unknown'}`,
    };
  }

  const currentMemory = typeof storageWrappers?.getMemory === 'function'
    ? await storageWrappers.getMemory(world.id, chatId)
    : [];
  const pendingHitlPrompts = listPendingHitlPromptEventsFromMessages(
    Array.isArray(currentMemory) ? currentMemory : [],
    chatId,
  );
  if (pendingHitlPrompts.length > 0) {
    return {
      action: 'mark-error',
      reason: `pending-hitl:${pendingHitlPrompts[0]?.prompt?.requestId || 'unknown'}`,
    };
  }

  const latestSseEvents = await eventStorage.getEventsByWorldAndChat(world.id, chatId, {
    types: ['sse'],
    order: 'desc',
    limit: 1,
  });
  const latestPostMessageSse = latestSseEvents[0] ?? null;
  if (
    !latestPostMessageSse
    || typeof latestPostMessageSse.seq !== 'number'
    || latestPostMessageSse.seq <= latestMessageEvent.seq
  ) {
    return {
      action: 'recover',
      reason: 'no-post-message-sse',
    };
  }

  const latestSseType = String(latestPostMessageSse.payload?.type || '').trim().toLowerCase();
  if (latestSseType === 'error' || latestSseType === 'end') {
    return {
      action: 'mark-error',
      reason: `terminal-sse:${latestSseType}`,
    };
  }

  return {
    action: 'recover',
    reason: latestSseType === 'start' ? 'interrupted-after-start' : `non-terminal-sse:${latestSseType || 'unknown'}`,
  };
}

async function handleQueueDispatchFailure(
  world: World,
  chatId: string,
  messageId: string,
  reason: string,
  context?: { content?: string; sender?: string },
): Promise<void> {
  const queueKey = getQueueKey(world.id, chatId);
  clearQueueResponderRefreshAttempt(world.id, chatId, messageId);
  queueDispatchStateByChat.delete(queueKey);
  detachQueueAdvanceListener(world, chatId);
  const agentStatus = collectQueueAgentStatus(
    world,
    chatId,
    String(context?.content || ''),
    String(context?.sender || 'human'),
  );

  let queueStorage: QueueStorageOperations;
  try {
    queueStorage = getQueueStorageOrThrow('handleQueueDispatchFailure');
  } catch (error) {
    loggerQueue.error('Queue dispatch failure could not be recorded', {
      worldId: world.id,
      chatId,
      messageId,
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  try {
    const newRetryCount = await queueStorage.incrementQueueMessageRetry(messageId);
    await queueStorage.updateMessageQueueStatus(messageId, 'error');
    world._queuedChatIds?.delete(chatId);
    publishEvent(world, 'system', {
      type: 'error',
      eventType: 'error',
      message: formatQueueDispatchFailureMessage(reason, agentStatus),
      triggeringMessageId: messageId,
      failureKind: 'queue-dispatch',
    }, chatId);
    loggerQueue.warn('Queue dispatch failed; message marked error for explicit recovery', {
      worldId: world.id,
      chatId,
      messageId,
      reason,
      retryCount: newRetryCount,
      agentStatus,
    });
  } catch (retryErr) {
    loggerQueue.error('Failed to handle queue dispatch retry transition', {
      worldId: world.id,
      chatId,
      messageId,
      reason,
      error: String(retryErr),
    });
  }
}

function formatQueueDispatchFailureMessage(
  reason: string,
  agentStatus: QueueAgentStatusSnapshot,
): string {
  const messagePrefix = 'Queue failed to dispatch user message';

  if (reason !== 'no-responder-preflight') {
    return `${messagePrefix}: ${reason}.`;
  }

  const targetedAgent = String(
    agentStatus.paragraphMentions[0]
    || agentStatus.effectiveMentions[0]
    || agentStatus.anyMentions[0]
    || ''
  ).trim();

  if (targetedAgent) {
    return `${messagePrefix}: no agent "@${targetedAgent}" found in this world.`;
  }

  if (agentStatus.totalAgents === 0) {
    return `${messagePrefix}: this world has no agents available.`;
  }

  if (agentStatus.reasonHint === 'no-agent-subscribers' || agentStatus.reasonHint === 'no-message-listeners') {
    return `${messagePrefix}: this world is not ready to receive messages yet.`;
  }

  return `${messagePrefix}: no available agent could respond.`;
}

function attachQueueAdvanceListener(world: World, chatId: string): void {
  const listenerKey = getQueueKey(world.id, chatId);
  if (queueListenerActive.has(listenerKey)) return;
  queueListenerActive.add(listenerKey);

  function onWorldActivity(payload: any): void {
    if (payload.chatId !== chatId) return;
    const queueDispatchState = queueDispatchStateByChat.get(listenerKey);
    if (payload.type === 'response-start') {
      if (queueDispatchState) {
        queueDispatchState.responseStarted = true;
      }
      return;
    }
    if (payload.type !== 'idle' && payload.type !== 'response-end') return;
    const activeChatIds: string[] = payload.activeChatIds || [];
    if (activeChatIds.includes(chatId)) return; // this chat is still processing

    // Chat processing just completed — clean up listener
    detachQueueAdvanceListener(world, chatId);

    void (async () => {
      const inFlightMessageId = queueDispatchStateByChat.get(listenerKey)?.messageId || null;
      queueDispatchStateByChat.delete(listenerKey);
      try {
        if (!inFlightMessageId) {
          loggerQueue.warn('Queue completion observed without tracked in-flight message', {
            worldId: world.id,
            chatId,
          });
          return;
        }

        const queueStorage = getQueueStorageOrThrow('attachQueueAdvanceListener');
        const messages = await queueStorage.getQueuedMessages(world.id, chatId);
        const sendingMsg = messages?.find((m: QueuedMessage) => m.messageId === inFlightMessageId && m.status === 'sending');
        if (sendingMsg) {
          // Successful completion — remove from queue (message now lives in agent_memory)
          await queueStorage.removeQueuedMessage(sendingMsg.messageId);
          clearQueueResponderRefreshAttempt(world.id, chatId, sendingMsg.messageId);
          // Safety: ensure chatId is not left in the queued cache
          world._queuedChatIds?.delete(chatId);
        } else {
          loggerQueue.warn('Queue completion observed but no matching sending row found', {
            worldId: world.id,
            chatId,
            messageId: inFlightMessageId,
          });
        }
      } catch (err) {
        loggerQueue.warn('Failed to mark queued message complete', {
          worldId: world.id,
          chatId,
          messageId: inFlightMessageId,
          error: String(err),
        });
      }
      // Chain: trigger the next queued message
      triggerPendingQueueResume(world, chatId);
    })();
  }

  queueAdvanceListeners.set(listenerKey, onWorldActivity);
  world.eventEmitter.on('world', onWorldActivity);
}

/**
 * Guardrail for worlds/chats where a queued human message is published but no
 * responder starts processing. In that case no world idle/response-end event is
 * emitted, so we transition the queue row to explicit recovery error state.
 */
function scheduleQueueNoResponseFallback(world: World, chatId: string, messageId: string): void {
  setTimeout(() => {
    void (async () => {
      try {
        const queueStorage = getQueueStorageOrThrow('scheduleQueueNoResponseFallback');
        const queueKey = getQueueKey(world.id, chatId);
        const queueDispatchState = queueDispatchStateByChat.get(queueKey);
        if (!queueDispatchState || queueDispatchState.messageId !== messageId) return;
        if (queueDispatchState.responseStarted) {
          loggerQueue.debug('Queue fallback skipped because response-start was observed', {
            worldId: world.id,
            chatId,
            messageId,
            agentStatus: collectQueueAgentStatus(world, chatId, '', 'human'),
          });
          return;
        }
        if (hasActiveChatMessageProcessing(world.id, chatId)) return;

        const messages = await queueStorage.getQueuedMessages(world.id, chatId);
        const sendingMessage = messages?.find((m: QueuedMessage) => m.messageId === messageId && m.status === 'sending');
        if (!sendingMessage) return;

        await handleQueueDispatchFailure(world, chatId, messageId, 'no-response-timeout', {
          content: sendingMessage.content,
          sender: sendingMessage.sender,
        });
        loggerQueue.warn('Queue fallback marked message error after no responder start', {
          worldId: world.id,
          chatId,
          messageId,
          agentStatus: collectQueueAgentStatus(
            world,
            chatId,
            sendingMessage.content,
            sendingMessage.sender,
          ),
        });
      } catch (err) {
        loggerQueue.warn('Queue fallback cleanup failed', {
          worldId: world.id,
          chatId,
          messageId,
          error: String(err),
        });
      }
    })();
  }, QUEUE_NO_RESPONSE_FALLBACK_MS);
}

/**
 * Core queue processing trigger. Finds the next 'queued' message for the chat,
 * marks it 'sending', and publishes it. Registers a world-activity listener to
 * chain to the next message after response completion.
 *
 * Guards: pause flag, active-processing check, per-chat dedup.
 */
export function triggerPendingQueueResume(
  world: World,
  chatId: string,
  options?: {
    recoverStaleSending?: boolean;
  }
): void {
  if (!chatId) return;

  const queueKey = getQueueKey(world.id, chatId);

  if (pausedQueues.has(queueKey)) {
    loggerQueue.debug('Queue processing skipped: paused', { worldId: world.id, chatId });
    return;
  }

  if (hasActiveChatMessageProcessing(world.id, chatId)) {
    // An agent is actively processing — the advance listener will pick up when done
    return;
  }

  if (inFlightQueueResumeKeys.has(queueKey)) {
    return;
  }

  inFlightQueueResumeKeys.add(queueKey);

  void (async () => {
    let nextMessage: QueuedMessage | undefined;
    const recoverStaleSending = options?.recoverStaleSending === true;
    try {
      const queueStorage = getQueueStorageOrThrow('triggerPendingQueueResume');
      let messages = await queueStorage.getQueuedMessages(world.id, chatId);
      const staleSendingMessages = recoverStaleSending
        ? messages?.filter((m: QueuedMessage) => m.status === 'sending') ?? []
        : [];

      if (staleSendingMessages.length > 0) {
        loggerQueue.warn('Detected stale sending queue messages during resume; evaluating recovery state', {
          worldId: world.id,
          chatId,
          count: staleSendingMessages.length,
          messageIds: staleSendingMessages.map((m: QueuedMessage) => m.messageId),
        });

        for (const staleMessage of staleSendingMessages) {
          const decision = await resolveStaleSendingRecoveryDecision(world, chatId, staleMessage.messageId);
          if (decision.action === 'mark-error') {
            await queueStorage.updateMessageQueueStatus(staleMessage.messageId, 'error');
            loggerQueue.debug('Marked stale sending queue message error during resume', {
              worldId: world.id,
              chatId,
              messageId: staleMessage.messageId,
              reason: decision.reason,
            });
            continue;
          }

          await queueStorage.updateMessageQueueStatus(staleMessage.messageId, 'queued');
          loggerQueue.debug('Recovered stale sending queue message back to queued during resume', {
            worldId: world.id,
            chatId,
            messageId: staleMessage.messageId,
            reason: decision.reason,
          });
        }

        messages = await queueStorage.getQueuedMessages(world.id, chatId);
      }

      nextMessage = messages?.find((m: QueuedMessage) => m.status === 'queued');

      if (!nextMessage) {
        loggerQueue.debug('No queued messages remaining', { worldId: world.id, chatId });
        return;
      }

      const preflight = await runQueueResponderPreflight(world, chatId, {
        messageId: nextMessage.messageId,
        content: nextMessage.content,
        sender: nextMessage.sender,
      });
      if (!preflight.ready) {
        await handleQueueDispatchFailure(world, chatId, nextMessage.messageId, 'no-responder-preflight', {
          content: nextMessage.content,
          sender: nextMessage.sender,
        });
        loggerQueue.warn('Queue dispatch blocked: no eligible responders after preflight refresh; moved to explicit recovery error state', {
          worldId: world.id,
          chatId,
          messageId: nextMessage.messageId,
          refreshed: preflight.refreshed,
          reason: 'no-responder-preflight',
          agentStatus: preflight.agentStatus,
        });
        clearQueueResponderRefreshAttempt(world.id, chatId, nextMessage.messageId);
        return;
      }

      await queueStorage.updateMessageQueueStatus(nextMessage.messageId, 'sending');
      // Remove from queued cache: this chat is now transitioning to active processing
      world._queuedChatIds?.delete(chatId);
      queueDispatchStateByChat.set(queueKey, {
        messageId: nextMessage.messageId,
        responseStarted: false,
        dispatchedAt: Date.now(),
      });

      // Register listener BEFORE publishing so the idle event is never missed
      attachQueueAdvanceListener(world, chatId);

      loggerQueue.debug('Publishing queued message', {
        worldId: world.id,
        chatId,
        messageId: nextMessage.messageId,
        agentStatus: preflight.agentStatus,
      });

      publishMessageWithId(world, nextMessage.content, nextMessage.sender, nextMessage.messageId, chatId);
      scheduleQueueNoResponseFallback(world, chatId, nextMessage.messageId);
    } catch (error) {
      if (nextMessage?.messageId) {
        void handleQueueDispatchFailure(
          world,
          chatId,
          nextMessage.messageId,
          error instanceof Error ? error.message : String(error),
          {
            content: nextMessage.content,
            sender: nextMessage.sender,
          },
        );
      }
      loggerQueue.warn('Failed to publish queued message', {
        worldId: world.id,
        chatId,
        messageId: nextMessage?.messageId ?? null,
        error: error instanceof Error ? error.message : String(error),
        agentStatus: nextMessage
          ? collectQueueAgentStatus(world, chatId, nextMessage.content, nextMessage.sender)
          : collectQueueAgentStatus(world, chatId, '', 'human'),
      });
    } finally {
      inFlightQueueResumeKeys.delete(queueKey);
    }
  })();
}

/**
 * Synchronously add the old chat's queue to the paused set on chat switch.
 * Called by managers.ts restoreChat.
 */
export function autoPauseQueueForChat(worldId: string, chatId: string): void {
  pausedQueues.add(getQueueKey(worldId, chatId));
}

/**
 * Clear the pause flag for a chat (used when activating/restoring a chat).
 */
export function clearQueuePauseForChat(worldId: string, chatId: string): void {
  pausedQueues.delete(getQueueKey(worldId, chatId));
}

// ─── Sender classification helper ─────────────────────────────────────────────

function isUserQueueSender(sender: string): boolean {
  const normalized = String(sender || '').trim().toLowerCase();
  return normalized === 'human' || normalized === 'world' || normalized.startsWith('user');
}

async function resolveRuntimeWorldForChat(
  worldId: string,
  chatId: string,
  targetWorld?: World | null,
): Promise<World | null> {
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const { getActiveSubscribedWorld } = await import('./subscription.js');
  return (
    getActiveSubscribedWorld(resolvedWorldId, chatId) ||
    targetWorld ||
    await (async () => {
      const { getWorld } = await import('./managers.js');
      return getWorld(resolvedWorldId);
    })()
  );
}

// ─── Public Queue API ─────────────────────────────────────────────────────────

/**
 * Add a message to the queue for a chat. Returns the created QueuedMessage or null.
 */
export async function addToQueue(
  worldId: string,
  chatId: string,
  content: string,
  sender: string,
  options?: {
    triggerProcessing?: boolean;
    targetWorld?: World | null;
    source?: 'direct' | 'queue' | 'retry';
    preassignedMessageId?: string;
  }
): Promise<QueuedMessage | null> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  const queueStorage = getQueueStorageOrThrow('addToQueue');

  const messageId = String(options?.preassignedMessageId || '').trim() || `msg-${Date.now()}-${nanoid(6)}`;
  await queueStorage.addQueuedMessage(resolvedWorldId, chatId, messageId, content.trim(), sender || 'human');

  const messages = await queueStorage.getQueuedMessages(resolvedWorldId, chatId);
  const queuedMessage = messages?.find((m: QueuedMessage) => m.messageId === messageId) ?? null;
  if (!queuedMessage) {
    throw new Error(`addToQueue: failed to persist queue row for message '${messageId}'.`);
  }

  // Always look up the runtime world so we can update the _queuedChatIds cache
  const { getActiveSubscribedWorld } = await import('./subscription.js');
  const runtimeWorld =
    getActiveSubscribedWorld(resolvedWorldId, chatId) ||
    options?.targetWorld ||
    await (async () => {
      const { getWorld } = await import('./managers.js');
      return getWorld(resolvedWorldId);
    })();
  if (runtimeWorld) {
    if (!runtimeWorld._queuedChatIds) runtimeWorld._queuedChatIds = new Set();
    runtimeWorld._queuedChatIds.add(chatId);
    if (options?.triggerProcessing ?? true) {
      triggerPendingQueueResume(runtimeWorld, chatId);
    }
  }

  return queuedMessage;
}

/**
 * Runtime-start recovery hook.
 * Resets interrupted `sending` queue rows back to `queued`.
 */
export async function recoverQueueSendingMessages(): Promise<number> {
  await ensureInitialization();
  return await storageWrappers?.recoverSendingMessages?.() ?? 0;
}

/**
 * Immediate dispatch helper for non-user chat messages.
 */
export async function dispatchImmediateChatMessage(
  worldId: string,
  chatId: string,
  content: string,
  sender: string,
  targetWorld?: World | null,
  options?: {
    source?: 'direct' | 'queue' | 'retry';
    preassignedMessageId?: string;
  }
): Promise<WorldMessageEvent> {
  const targetChatId = String(chatId || '').trim();
  if (!targetChatId) {
    throw new Error('dispatchImmediateChatMessage: chatId is required for immediate dispatch.');
  }

  const resolvedWorldId = await getResolvedWorldId(worldId);
  const runtimeWorld = await resolveRuntimeWorldForChat(resolvedWorldId, targetChatId, targetWorld);
  if (!runtimeWorld) {
    throw new Error(`dispatchImmediateChatMessage: world not found for immediate dispatch (${resolvedWorldId}).`);
  }

  const forcedMessageId = String(options?.preassignedMessageId || '').trim();
  if (forcedMessageId) {
    return publishMessageWithId(runtimeWorld, content, sender, forcedMessageId, targetChatId);
  }
  return publishMessage(runtimeWorld, content, sender, targetChatId);
}

/**
 * External user-send ingress helper.
 * Queue-backed submission is restricted to user-authored turns only.
 */
export async function enqueueAndProcessUserTurn(
  worldId: string,
  chatId: string,
  content: string,
  sender: string,
  targetWorld?: World | null,
  options?: {
    source?: 'direct' | 'queue' | 'retry';
    preassignedMessageId?: string;
  }
): Promise<QueuedMessage | null> {
  const targetChatId = String(chatId || '').trim();
  if (!targetChatId) {
    throw new Error('enqueueAndProcessUserTurn: chatId is required for user message dispatch.');
  }
  if (!isUserQueueSender(sender)) {
    throw new Error(`enqueueAndProcessUserTurn: sender '${sender}' is not a queue-eligible user sender.`);
  }

  return addToQueue(worldId, targetChatId, content, sender, {
    triggerProcessing: true,
    targetWorld,
    source: options?.source,
    preassignedMessageId: options?.preassignedMessageId,
  });
}

/**
 * Return all queue messages (queued, sending, error) for a chat.
 */
export async function getQueueMessages(worldId: string, chatId: string): Promise<QueuedMessage[]> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  if (!storageWrappers?.getQueuedMessages) return [];
  return storageWrappers.getQueuedMessages(resolvedWorldId, chatId);
}

/**
 * Remove a specific message from the queue by messageId.
 */
export async function removeFromQueue(worldId: string, messageId: string): Promise<void> {
  await ensureInitialization();
  await storageWrappers?.removeQueuedMessage?.(messageId);
}

/**
 * Pause queue processing for a chat. Current in-flight message completes normally.
 */
export async function pauseChatQueue(worldId: string, chatId: string): Promise<void> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  pausedQueues.add(`${resolvedWorldId}:${chatId}`);
  loggerQueue.debug('Queue paused by user', { worldId: resolvedWorldId, chatId });
}

/**
 * Resume queue processing for a chat. Clears the pause flag and triggers the next item.
 */
export async function resumeChatQueue(worldId: string, chatId: string): Promise<void> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  pausedQueues.delete(`${resolvedWorldId}:${chatId}`);

  const { getActiveSubscribedWorld } = await import('./subscription.js');
  const world = getActiveSubscribedWorld(resolvedWorldId, chatId) ||
    await (async () => {
      const { getWorld } = await import('./managers.js');
      return getWorld(resolvedWorldId);
    })();
  if (world) {
    triggerPendingQueueResume(world, chatId, { recoverStaleSending: true });
  }
  loggerQueue.debug('Queue resumed by user', { worldId: resolvedWorldId, chatId });
}

/**
 * Stop queue processing: cancel remaining queued messages and set pause flag.
 * The current in-flight message completes normally.
 */
export async function stopChatQueue(worldId: string, chatId: string): Promise<void> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);

  // Cancel all remaining 'queued' rows
  await storageWrappers?.cancelQueuedMessages?.(resolvedWorldId, chatId);

  // Prevent any follow-up trigger
  pausedQueues.add(`${resolvedWorldId}:${chatId}`);

  // Update queued chat ID cache
  const { getActiveSubscribedWorld } = await import('./subscription.js');
  getActiveSubscribedWorld(resolvedWorldId, chatId)?._queuedChatIds?.delete(chatId);

  loggerQueue.debug('Queue stopped by user', { worldId: resolvedWorldId, chatId });
}

/**
 * Clear the entire queue for a chat (removes all queue rows including cancelled/error).
 */
export async function clearChatQueue(worldId: string, chatId: string): Promise<void> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  await storageWrappers?.deleteQueueForChat?.(resolvedWorldId, chatId);
  pausedQueues.delete(`${resolvedWorldId}:${chatId}`);

  // Update queued chat ID cache
  const { getActiveSubscribedWorld } = await import('./subscription.js');
  getActiveSubscribedWorld(resolvedWorldId, chatId)?._queuedChatIds?.delete(chatId);
}

/**
 * Reset a failed queue message (status='error') back to 'queued' with retry_count=0,
 * then trigger queue processing. Allows the user to manually retry after automatic
 * retries have been exhausted.
 */
export async function retryQueueMessage(worldId: string, messageId: string, chatId: string): Promise<void> {
  await ensureInitialization();
  const resolvedWorldId = await getResolvedWorldId(worldId);
  if (!storageWrappers?.resetQueueMessageForRetry) return;
  // Reset status to 'queued' and retry_count to 0 so automatic retry logic applies fresh
  await storageWrappers.resetQueueMessageForRetry(messageId);
  const { getActiveSubscribedWorld } = await import('./subscription.js');
  const world = getActiveSubscribedWorld(resolvedWorldId, chatId) ||
    await (async () => {
      const { getWorld } = await import('./managers.js');
      return getWorld(resolvedWorldId);
    })();
  if (!world) return;
  triggerPendingQueueResume(world, chatId);
}
