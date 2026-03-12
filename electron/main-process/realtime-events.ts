/**
 * Electron Realtime Event and Subscription Runtime
 *
 * Features:
 * - Tracks chat and world subscriptions for realtime message delivery.
 * - Forwards chat/tool/SSE/log events to the renderer process.
 * - Supports world-subscription refresh and chat-listener rebind flow.
 *
 * Implementation Notes:
 * - Keeps subscription state isolated from higher-level IPC handlers.
 * - Uses dependency injection for window lookup and world subscription API.
 *
 * Recent Changes:
 * - 2026-03-10: Runtime HITL replay now tracks emitted toolCallIds so the persisted-message replay cannot overwrite correct option IDs with re-derived opt_N values.
 * - 2026-03-06: Enforced explicit chat-scoped realtime forwarding for SSE/tool/activity/system/HITL replay paths; removed subscription-chat fallback rebinding.
 * - 2026-02-26: Replaced realtime console traces/warnings/errors with categorized injected logger calls.
 * - 2026-02-25: Added runtime pending-HITL replay on chat subscription so prompts created before renderer listener attach are re-delivered deterministically.
 * - 2026-02-24: Switched HITL restore dispatch to persisted message reconstruction (`getMemory` + request/response pairing helper).
 * - 2026-02-24: Replaced HITL replay dependency with pending-prompt read model dispatch over tool events.
 * - 2026-02-24: Restored strict chat-scoped SSE/tool filtering after source-side chatId guarantees were added to streaming emitters.
 * - 2026-02-20: Added chat-scoped HITL prompt replay safeguards for prompt delivery during subscription attach timing races.
 * - 2026-02-16: Fixed activity events (response-start, idle) being filtered out when subscription has a chatId — activity events are world-level and carry no chatId.
 * - 2026-02-13: Added system-event forwarding for chat-title update notifications to renderer subscribers.
 * - 2026-02-13: Preserved unsubscribe tombstones across runtime resets and lifecycle cleanup to keep subscription IDs non-reusable.
 * - 2026-02-13: Moved reused-subscription validation ahead of world subscription to prevent invalid subscribe side effects.
 * - 2026-02-13: Duplicate/reused subscription IDs now raise explicit subscribe errors for callers.
 * - 2026-02-13: Reset now clears subscription-version metadata to avoid growth across runtime resets.
 * - 2026-02-13: Enforced non-reusable chat `subscriptionId` behavior after unsubscribe within the active runtime.
 * - 2026-02-13: Hardened chat subscription lifecycle with versioned stale-subscribe guards and reset snapshot cleanup to prevent stream pollution during races.
 * - 2026-02-12: Extracted realtime subscription/log-stream orchestration from `electron/main.ts`.
 */

import {
  serializeRealtimeActivityEvent,
  serializeRealtimeLogEvent,
  serializeRealtimeMessageEvent,
  serializeRealtimeSSEEvent,
  serializeRealtimeSystemEvent,
  serializeRealtimeToolEvent
} from './message-serialization.js';

interface MainWindowLike {
  isDestroyed: () => boolean;
  webContents: {
    isDestroyed?: () => boolean;
    send: (channel: string, payload: unknown) => void;
  };
}

interface WorldSubscriptionLike {
  world: {
    eventEmitter: {
      on: (event: string, listener: (event: unknown) => void) => void;
      off: (event: string, listener: (event: unknown) => void) => void;
    };
  };
  unsubscribe: () => Promise<void>;
  refresh: () => Promise<void>;
}

interface LoggerLike {
  debug: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
}

const NOOP_LOGGER: LoggerLike = {
  debug: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

interface CreateRealtimeEventsRuntimeDependencies {
  getMainWindow: () => MainWindowLike | null;
  chatEventChannel: string;
  addLogStreamCallback: (callback: (logEvent: unknown) => void) => () => void;
  subscribeWorld: (worldId: string, options: Record<string, unknown>) => Promise<WorldSubscriptionLike | null>;
  ensureCoreReady: () => Promise<void> | void;
  getMemory?: (worldId: string, chatId: string | null) => Promise<any[] | null>;
  listPendingHitlPromptEvents?: (world: any, chatId?: string | null) => Array<{ chatId: string | null; prompt: Record<string, unknown> }>;
  listPendingHitlPromptEventsFromMessages?: (messages: any[], chatId?: string | null) => Array<{ chatId: string | null; prompt: Record<string, unknown> }>;
  stopAllHeartbeatJobs?: () => void;
  loggerRealtime?: LoggerLike;
}

interface ChatEventSubscription {
  version: number;
  worldId: string;
  chatId: string | null;
  unsubscribe: () => void;
}

export interface RealtimeEventsRuntime {
  subscribeToLogEvents: () => void;
  unsubscribeFromLogEvents: () => void;
  clearChatEventSubscriptions: () => void;
  subscribeChatEvents: (payload: unknown) => Promise<Record<string, unknown>>;
  unsubscribeChatEvents: (payload: unknown) => { unsubscribed: boolean; subscriptionId: string };
  ensureWorldSubscribed: (worldId: string) => Promise<unknown>;
  refreshWorldSubscription: (worldId: string) => Promise<string | null>;
  resetRuntimeSubscriptions: () => Promise<void>;
  removeWorldSubscriptions: (worldId: string) => Promise<void>;
}

export function createRealtimeEventsRuntime(
  dependencies: CreateRealtimeEventsRuntimeDependencies
): RealtimeEventsRuntime {
  const {
    getMainWindow,
    chatEventChannel,
    addLogStreamCallback,
    subscribeWorld,
    ensureCoreReady,
    getMemory,
    listPendingHitlPromptEvents,
    listPendingHitlPromptEventsFromMessages,
    stopAllHeartbeatJobs,
    loggerRealtime = NOOP_LOGGER
  } = dependencies;

  const chatEventSubscriptions = new Map<string, ChatEventSubscription>();
  const chatEventSubscriptionVersions = new Map<string, number>();
  const worldSubscriptions = new Map<string, WorldSubscriptionLike>();
  const canceledSubscriptionIds = new Set<string>();
  let logStreamUnsubscribe: (() => void) | null = null;

  function sendRealtimeEventToRenderer(payload: unknown) {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const webContents = mainWindow.webContents;
    if (!webContents) return;
    if (typeof webContents.isDestroyed === 'function' && webContents.isDestroyed()) return;
    try {
      webContents.send(chatEventChannel, payload);
    } catch (error) {
      // Guard against "Object has been destroyed" when renderer exits mid-send.
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Object has been destroyed')) return;
      throw error;
    }
  }

  function subscribeToLogEvents() {
    if (logStreamUnsubscribe) {
      logStreamUnsubscribe();
      logStreamUnsubscribe = null;
    }

    logStreamUnsubscribe = addLogStreamCallback((logEvent) => {
      sendRealtimeEventToRenderer(serializeRealtimeLogEvent(logEvent));
    });
  }

  function unsubscribeFromLogEvents() {
    if (logStreamUnsubscribe) {
      logStreamUnsubscribe();
      logStreamUnsubscribe = null;
    }
  }

  function toSubscriptionId(payload: any) {
    const raw = payload?.subscriptionId;
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw.trim();
    }
    return 'default';
  }

  function removeChatEventSubscription(subscriptionId: string) {
    const existing = chatEventSubscriptions.get(subscriptionId);
    if (existing?.unsubscribe) {
      existing.unsubscribe();
    }
    chatEventSubscriptions.delete(subscriptionId);
  }

  function removeChatEventSubscriptionIfCurrent(subscriptionId: string, expected: ChatEventSubscription) {
    const existing = chatEventSubscriptions.get(subscriptionId);
    if (!existing || existing !== expected) return;
    existing.unsubscribe();
    chatEventSubscriptions.delete(subscriptionId);
  }

  function nextSubscriptionVersion(subscriptionId: string) {
    const nextVersion = (chatEventSubscriptionVersions.get(subscriptionId) ?? 0) + 1;
    chatEventSubscriptionVersions.set(subscriptionId, nextVersion);
    return nextVersion;
  }

  function isSubscriptionVersionCurrent(subscriptionId: string, expectedVersion: number) {
    return chatEventSubscriptionVersions.get(subscriptionId) === expectedVersion;
  }

  function clearChatEventSubscriptions() {
    for (const subscriptionId of chatEventSubscriptions.keys()) {
      removeChatEventSubscription(subscriptionId);
    }
    chatEventSubscriptionVersions.clear();
  }

  async function ensureWorldSubscribed(worldId: string): Promise<unknown> {
    if (worldSubscriptions.has(worldId)) {
      const existing = worldSubscriptions.get(worldId);
      if (!existing) throw new Error('Subscription not found');
      return existing.world;
    }

    const subscription = await subscribeWorld(worldId, { isOpen: true });
    if (!subscription) {
      throw new Error(`Failed to subscribe to world: ${worldId}`);
    }

    worldSubscriptions.set(worldId, subscription);
    return subscription.world;
  }

  async function subscribeChatEvents(payload: any): Promise<Record<string, unknown>> {
    await ensureCoreReady();
    const subscriptionId = toSubscriptionId(payload);
    const subscriptionVersion = nextSubscriptionVersion(subscriptionId);
    const worldId = String(payload?.worldId || '');
    const chatId = payload?.chatId ? String(payload.chatId) : null;

    if (!isSubscriptionVersionCurrent(subscriptionId, subscriptionVersion)) {
      return { subscribed: false, canceled: true, stale: true, subscriptionId, worldId, chatId };
    }

    if (canceledSubscriptionIds.has(subscriptionId)) {
      throw new Error(`Subscription ID '${subscriptionId}' cannot be reused after unsubscribe.`);
    }

    const existing = chatEventSubscriptions.get(subscriptionId);
    if (existing && existing.worldId === worldId && existing.chatId === chatId) {
      return { subscribed: true, subscriptionId, worldId, chatId };
    }

    removeChatEventSubscription(subscriptionId);
    if (
      !isSubscriptionVersionCurrent(subscriptionId, subscriptionVersion) ||
      canceledSubscriptionIds.has(subscriptionId)
    ) {
      return { subscribed: false, canceled: true, stale: true, subscriptionId, worldId, chatId };
    }

    const world = (await ensureWorldSubscribed(worldId)) as any;
    if (
      !isSubscriptionVersionCurrent(subscriptionId, subscriptionVersion) ||
      canceledSubscriptionIds.has(subscriptionId)
    ) {
      return { subscribed: false, canceled: true, stale: true, subscriptionId, worldId, chatId };
    }

    const messageHandler = (event: any) => {
      const eventChatId = event?.chatId ? String(event.chatId) : null;
      if (chatId && eventChatId !== chatId) return;
      const serializedEvent = serializeRealtimeMessageEvent(worldId, event);
      if (!serializedEvent) return;
      sendRealtimeEventToRenderer({
        ...serializedEvent,
        subscriptionId
      });
    };

    const sseHandler = (event: any) => {
      const eventChatId = event?.chatId ? String(event.chatId) : null;
      if (!eventChatId) return;
      if (chatId && eventChatId !== chatId) return;
      sendRealtimeEventToRenderer({
        ...serializeRealtimeSSEEvent(worldId, eventChatId, event),
        subscriptionId
      });
    };

    const worldHandler = (event: any) => {
      const eventType = event?.type || '';
      if (!eventType.startsWith('tool-') && eventType !== 'response-start' && eventType !== 'response-end' && eventType !== 'idle') {
        return;
      }
      const eventChatId = event?.chatId ? String(event.chatId) : null;
      if (eventType.startsWith('tool-')) {
        if (!eventChatId) return;
        if (chatId && eventChatId !== chatId) return;
        sendRealtimeEventToRenderer({
          ...serializeRealtimeToolEvent(worldId, eventChatId, event),
          subscriptionId
        });
        return;
      }

      if (!eventChatId) return;
      if (chatId && eventChatId !== chatId) return;

      sendRealtimeEventToRenderer({
        ...serializeRealtimeActivityEvent(worldId, eventChatId, event),
        subscriptionId
      });
    };

    const systemHandler = (event: any) => {
      const eventChatId = event?.chatId ? String(event.chatId) : null;
      if (!eventChatId) return;
      if (chatId && eventChatId !== chatId) return;
      sendRealtimeEventToRenderer({
        ...serializeRealtimeSystemEvent(worldId, eventChatId, event),
        subscriptionId
      });
    };

    world.eventEmitter.on('message', messageHandler);
    world.eventEmitter.on('sse', sseHandler);
    world.eventEmitter.on('world', worldHandler);
    world.eventEmitter.on('system', systemHandler);
    const subscription: ChatEventSubscription = {
      version: subscriptionVersion,
      worldId,
      chatId,
      unsubscribe: () => {
        world.eventEmitter.off('message', messageHandler);
        world.eventEmitter.off('sse', sseHandler);
        world.eventEmitter.off('world', worldHandler);
        world.eventEmitter.off('system', systemHandler);
      }
    };
    chatEventSubscriptions.set(subscriptionId, subscription);

    if (
      canceledSubscriptionIds.has(subscriptionId) ||
      !isSubscriptionVersionCurrent(subscriptionId, subscriptionVersion)
    ) {
      removeChatEventSubscriptionIfCurrent(subscriptionId, subscription);
      return { subscribed: false, canceled: true, stale: true, subscriptionId, worldId, chatId };
    }

    // Track toolCallIds emitted by the live runtime map so the persisted-message
    // replay does not overwrite them with re-derived opt_1/opt_2 IDs.
    const runtimeEmittedRequestIds = new Set<string>();

    if (chatId && typeof listPendingHitlPromptEvents === 'function') {
      try {
        const runtimePendingPrompts = listPendingHitlPromptEvents(world, chatId);
        loggerRealtime.debug('Replaying runtime pending HITL prompts', {
          worldId,
          chatId,
          pendingPromptCount: Array.isArray(runtimePendingPrompts) ? runtimePendingPrompts.length : 0,
          subscriptionId
        });
        for (const pending of runtimePendingPrompts || []) {
          const prompt = pending?.prompt && typeof pending.prompt === 'object'
            ? pending.prompt
            : null;
          if (!prompt) {
            continue;
          }

          const toolCallId = String(prompt.toolCallId || prompt.requestId || '').trim();
          const requestId = String(prompt.requestId || '').trim();
          const toolName = String(prompt.toolName || 'human_intervention_request').trim() || 'human_intervention_request';
          if (!toolCallId || !requestId) {
            continue;
          }

          const pendingChatId = typeof pending?.chatId === 'string' ? pending.chatId.trim() : '';
          if (!pendingChatId) {
            continue;
          }

          runtimeEmittedRequestIds.add(requestId);
          sendRealtimeEventToRenderer({
            ...serializeRealtimeToolEvent(worldId, pendingChatId, {
              type: 'tool-progress',
              chatId: pendingChatId,
              toolExecution: {
                toolName,
                toolCallId,
                metadata: {
                  hitlPrompt: {
                    ...prompt,
                    chatId: pendingChatId,
                  },
                },
              },
            }),
            subscriptionId,
          });
        }
      } catch (error) {
        const warningMessage = `Failed to replay runtime pending HITL prompts for world '${worldId}' chat '${chatId}': ${error instanceof Error ? error.message : String(error)}`;
        loggerRealtime.warn(warningMessage, {
          worldId,
          chatId,
          subscriptionId
        });
      }
    }

    if (chatId && typeof getMemory === 'function' && typeof listPendingHitlPromptEventsFromMessages === 'function') {
      try {
        const persistedMessages = await getMemory(worldId, chatId);
        const pendingPrompts = listPendingHitlPromptEventsFromMessages(persistedMessages || [], chatId);
        loggerRealtime.debug('Replaying persisted pending HITL prompts', {
          worldId,
          chatId,
          pendingPromptCount: pendingPrompts.length,
          subscriptionId
        });
        for (const pending of pendingPrompts) {
          const prompt = pending?.prompt && typeof pending.prompt === 'object'
            ? pending.prompt
            : null;
          if (!prompt) {
            continue;
          }

          const toolCallId = String(prompt.toolCallId || prompt.requestId || '').trim();
          const requestId = String(prompt.requestId || '').trim();
          const toolName = String(prompt.toolName || 'human_intervention_request').trim() || 'human_intervention_request';
          if (!toolCallId || !requestId) {
            continue;
          }

          // Skip if the live runtime map already emitted this prompt with correct option IDs.
          if (runtimeEmittedRequestIds.has(requestId)) {
            continue;
          }

          const pendingChatId = typeof pending?.chatId === 'string' ? pending.chatId.trim() : '';
          if (!pendingChatId) {
            continue;
          }

          sendRealtimeEventToRenderer({
            ...serializeRealtimeToolEvent(worldId, pendingChatId, {
              type: 'tool-progress',
              chatId: pendingChatId,
              toolExecution: {
                toolName,
                toolCallId,
                metadata: {
                  hitlPrompt: {
                    ...prompt,
                    chatId: pendingChatId,
                  },
                },
              },
            }),
            subscriptionId,
          });
        }
      } catch (error) {
        const warningMessage = `Failed to reconstruct pending HITL prompts for world '${worldId}' chat '${chatId}': ${error instanceof Error ? error.message : String(error)}`;
        loggerRealtime.warn(warningMessage, {
          worldId,
          chatId,
          subscriptionId
        });
      }
    }

    return { subscribed: true, subscriptionId, worldId, chatId };
  }

  function unsubscribeChatEvents(payload: unknown) {
    const subscriptionId = toSubscriptionId(payload as any);
    nextSubscriptionVersion(subscriptionId);
    canceledSubscriptionIds.add(subscriptionId);
    removeChatEventSubscription(subscriptionId);
    return { unsubscribed: true, subscriptionId };
  }

  async function refreshWorldSubscription(worldId: string): Promise<string | null> {
    const subscription = worldSubscriptions.get(worldId);
    if (!subscription) return null;

    const subscriptionsToRestore = Array.from(chatEventSubscriptions.entries())
      .filter(([, value]) => value.worldId === worldId)
      .map(([subscriptionId, value]) => ({
        subscriptionId,
        chatId: value.chatId
      }));

    for (const { subscriptionId } of subscriptionsToRestore) {
      removeChatEventSubscription(subscriptionId);
    }

    try {
      await subscription.refresh();
    } catch (error) {
      const warningMessage = `Failed to refresh world subscription for '${worldId}': ${error instanceof Error ? error.message : String(error)}`;
      loggerRealtime.warn(warningMessage, { worldId });
      return warningMessage;
    }

    const restoreFailures: { subscriptionId: string; message: string }[] = [];
    for (const { subscriptionId, chatId } of subscriptionsToRestore) {
      if (canceledSubscriptionIds.has(subscriptionId)) continue;
      try {
        await subscribeChatEvents({ subscriptionId, worldId, chatId });
      } catch (error) {
        restoreFailures.push({
          subscriptionId,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (restoreFailures.length > 0) {
      const failedSubscriptionIds = restoreFailures.map((item) => item.subscriptionId).join(', ');
      const details = restoreFailures.map((item) => `${item.subscriptionId}: ${item.message}`).join('; ');
      const warningMessage = `Failed to restore chat subscriptions for world '${worldId}' [${failedSubscriptionIds}]. Details: ${details}`;
      loggerRealtime.warn(warningMessage, {
        worldId,
        failedSubscriptionIds,
        failureCount: restoreFailures.length
      });
      return warningMessage;
    }

    return null;
  }

  async function removeWorldSubscriptions(worldId: string) {
    for (const [subscriptionId, subscription] of chatEventSubscriptions.entries()) {
      if (subscription.worldId === worldId) {
        removeChatEventSubscription(subscriptionId);
      }
    }

    const worldSubscription = worldSubscriptions.get(worldId);
    if (worldSubscription) {
      try {
        await worldSubscription.unsubscribe();
      } finally {
        worldSubscriptions.delete(worldId);
      }
    }
  }

  async function resetRuntimeSubscriptions() {
    const chatSubscriptionSnapshot = Array.from(chatEventSubscriptions.entries());
    const worldSubscriptionSnapshot = Array.from(worldSubscriptions.entries());

    for (const [subscriptionId, subscription] of chatSubscriptionSnapshot) {
      removeChatEventSubscriptionIfCurrent(subscriptionId, subscription);
    }

    for (const [worldId, subscription] of worldSubscriptionSnapshot) {
      if (worldSubscriptions.get(worldId) === subscription) {
        worldSubscriptions.delete(worldId);
      }
      try {
        await subscription.unsubscribe();
      } catch (error) {
        loggerRealtime.error('Failed to unsubscribe world during realtime reset', {
          worldId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }


    stopAllHeartbeatJobs?.();
    // Keep tombstones so unsubscribed IDs remain non-reusable after resets.
    chatEventSubscriptionVersions.clear();
  }

  return {
    subscribeToLogEvents,
    unsubscribeFromLogEvents,
    clearChatEventSubscriptions,
    subscribeChatEvents,
    unsubscribeChatEvents,
    ensureWorldSubscribed,
    refreshWorldSubscription,
    removeWorldSubscriptions,
    resetRuntimeSubscriptions
  };
}
