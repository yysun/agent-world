/**
 * Unit Tests for Main Realtime Events Runtime
 *
 * Features:
 * - Verifies race-safe chat subscription updates for identical subscription IDs.
 * - Verifies reset cleanup does not remove newly created subscriptions.
 * - Verifies renderer event forwarding remains scoped to the latest subscription state.
 *
 * Implementation Notes:
 * - Uses in-memory event emitters and dependency-injected runtime collaborators.
 * - Avoids Electron runtime and filesystem dependencies.
 *
 * Recent Changes:
 * - 2026-03-12: Added plain-text and message-fallback system-event forwarding coverage for selected-chat status parity.
 * - 2026-02-24: Reinstated strict chat-scope filtering coverage for unscoped SSE/tool events after source-side chatId streaming guarantees.
 * - 2026-02-20: Added coverage for chat-scoped HITL prompt delivery during chat subscription lifecycle transitions.
 * - 2026-02-16: Added coverage for world-level activity events forwarded to chat-scoped subscriptions.
 * - 2026-02-13: Updated system-event forwarding coverage to structured payload content.
 * - 2026-02-13: Added system-event forwarding coverage for chat title update notifications.
 * - 2026-02-13: Enforced strict non-reuse coverage across runtime resets.
 * - 2026-02-13: Added regression to ensure reused subscription IDs fail before world subscription side effects.
 * - 2026-02-13: Updated reuse behavior coverage to assert explicit errors for duplicate subscription IDs.
 * - 2026-02-13: Added reset metadata cleanup coverage for subscription-version tracking.
 * - 2026-02-13: Added coverage for non-reusable subscription IDs after explicit unsubscribe.
 * - 2026-02-13: Added regression coverage for stale subscribe races and in-flight reset isolation.
 */

import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createRealtimeEventsRuntime } from '../../../electron/main-process/realtime-events';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function createWorldSubscription(unsubscribePromise?: Promise<void>) {
  const eventEmitter = new EventEmitter();
  return {
    world: {
      eventEmitter
    },
    unsubscribe: vi.fn(async () => {
      if (unsubscribePromise) {
        await unsubscribePromise;
      }
    }),
    refresh: vi.fn(async () => { })
  };
}

describe('createRealtimeEventsRuntime', () => {
  it('keeps only the latest subscription when concurrent subscribe calls race', async () => {
    const send = vi.fn();
    const worldADeferred = createDeferred<ReturnType<typeof createWorldSubscription>>();
    const worldA = createWorldSubscription();
    const worldB = createWorldSubscription();

    const subscribeWorld = vi.fn(async (worldId: string) => {
      if (worldId === 'world-a') {
        return await worldADeferred.promise;
      }
      if (worldId === 'world-b') {
        return worldB;
      }
      return null;
    });

    const runtime = createRealtimeEventsRuntime({
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { send }
      }),
      chatEventChannel: 'chat:event',
      addLogStreamCallback: () => () => { },
      subscribeWorld,
      ensureCoreReady: async () => { }
    });

    const firstSubscribe = runtime.subscribeChatEvents({
      subscriptionId: 'sub-1',
      worldId: 'world-a',
      chatId: 'chat-1'
    });

    await Promise.resolve();

    const secondResult = await runtime.subscribeChatEvents({
      subscriptionId: 'sub-1',
      worldId: 'world-b',
      chatId: 'chat-1'
    });

    worldADeferred.resolve(worldA);
    const firstResult = await firstSubscribe;

    worldA.world.eventEmitter.emit('message', {
      messageId: 'm-a',
      sender: 'assistant',
      content: 'from-a',
      chatId: 'chat-1',
      timestamp: new Date('2026-02-13T00:00:00.000Z')
    });
    worldB.world.eventEmitter.emit('message', {
      messageId: 'm-b',
      sender: 'assistant',
      content: 'from-b',
      chatId: 'chat-1',
      timestamp: new Date('2026-02-13T00:00:01.000Z')
    });

    expect(firstResult).toMatchObject({
      subscribed: false,
      stale: true,
      subscriptionId: 'sub-1',
      worldId: 'world-a'
    });
    expect(secondResult).toMatchObject({
      subscribed: true,
      subscriptionId: 'sub-1',
      worldId: 'world-b'
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      'chat:event',
      expect.objectContaining({
        type: 'message',
        subscriptionId: 'sub-1',
        worldId: 'world-b'
      })
    );
  });

  it('does not clear newly subscribed listeners while reset is still unsubscribing older worlds', async () => {
    const send = vi.fn();
    const unsubscribeOldDeferred = createDeferred<void>();
    const oldWorldSubscription = createWorldSubscription(unsubscribeOldDeferred.promise);
    const newWorldSubscription = createWorldSubscription();
    let subscribeCallCount = 0;

    const subscribeWorld = vi.fn(async () => {
      subscribeCallCount += 1;
      return subscribeCallCount === 1 ? oldWorldSubscription : newWorldSubscription;
    });

    const runtime = createRealtimeEventsRuntime({
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { send }
      }),
      chatEventChannel: 'chat:event',
      addLogStreamCallback: () => () => { },
      subscribeWorld,
      ensureCoreReady: async () => { }
    });

    await runtime.subscribeChatEvents({
      subscriptionId: 'sub-old',
      worldId: 'world-1',
      chatId: 'chat-old'
    });

    const pendingReset = runtime.resetRuntimeSubscriptions();
    await Promise.resolve();

    await runtime.subscribeChatEvents({
      subscriptionId: 'sub-new',
      worldId: 'world-1',
      chatId: 'chat-new'
    });

    unsubscribeOldDeferred.resolve();
    await pendingReset;

    oldWorldSubscription.world.eventEmitter.emit('message', {
      messageId: 'm-old',
      sender: 'assistant',
      content: 'from-old',
      chatId: 'chat-new',
      timestamp: new Date('2026-02-13T00:00:02.000Z')
    });
    newWorldSubscription.world.eventEmitter.emit('message', {
      messageId: 'm-new',
      sender: 'assistant',
      content: 'from-new',
      chatId: 'chat-new',
      timestamp: new Date('2026-02-13T00:00:03.000Z')
    });

    expect(oldWorldSubscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscribeWorld).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      'chat:event',
      expect.objectContaining({
        type: 'message',
        subscriptionId: 'sub-new',
        worldId: 'world-1'
      })
    );
  });

  it('throws when reusing a subscriptionId after it has been unsubscribed', async () => {
    const subscribeWorld = vi.fn(async () => createWorldSubscription());
    const runtime = createRealtimeEventsRuntime({
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { send: vi.fn() }
      }),
      chatEventChannel: 'chat:event',
      addLogStreamCallback: () => () => { },
      subscribeWorld,
      ensureCoreReady: async () => { }
    });

    const firstResult = await runtime.subscribeChatEvents({
      subscriptionId: 'sub-reused',
      worldId: 'world-1',
      chatId: 'chat-1'
    });
    const unsubscribeResult = runtime.unsubscribeChatEvents({ subscriptionId: 'sub-reused' });
    const secondSubscribe = runtime.subscribeChatEvents({
      subscriptionId: 'sub-reused',
      worldId: 'world-1',
      chatId: 'chat-1'
    });

    expect(firstResult).toMatchObject({
      subscribed: true,
      subscriptionId: 'sub-reused'
    });
    expect(unsubscribeResult).toMatchObject({
      unsubscribed: true,
      subscriptionId: 'sub-reused'
    });
    await expect(secondSubscribe).rejects.toThrow(
      "Subscription ID 'sub-reused' cannot be reused after unsubscribe."
    );
    expect(subscribeWorld).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe to a new world when a reused subscriptionId is rejected', async () => {
    const subscribeWorld = vi.fn(async () => createWorldSubscription());
    const runtime = createRealtimeEventsRuntime({
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { send: vi.fn() }
      }),
      chatEventChannel: 'chat:event',
      addLogStreamCallback: () => () => { },
      subscribeWorld,
      ensureCoreReady: async () => { }
    });

    await runtime.subscribeChatEvents({
      subscriptionId: 'sub-reused-world',
      worldId: 'world-1',
      chatId: 'chat-1'
    });
    runtime.unsubscribeChatEvents({ subscriptionId: 'sub-reused-world' });

    await expect(
      runtime.subscribeChatEvents({
        subscriptionId: 'sub-reused-world',
        worldId: 'world-2',
        chatId: 'chat-2'
      })
    ).rejects.toThrow("Subscription ID 'sub-reused-world' cannot be reused after unsubscribe.");

    expect(subscribeWorld).toHaveBeenCalledTimes(1);
    expect(subscribeWorld).toHaveBeenCalledWith('world-1', { isOpen: true });
  });

  it('keeps reused subscriptionId rejected after runtime reset', async () => {
    const runtime = createRealtimeEventsRuntime({
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { send: vi.fn() }
      }),
      chatEventChannel: 'chat:event',
      addLogStreamCallback: () => () => { },
      subscribeWorld: async () => createWorldSubscription(),
      ensureCoreReady: async () => { }
    });

    await runtime.subscribeChatEvents({
      subscriptionId: 'sub-reset',
      worldId: 'world-1',
      chatId: 'chat-1'
    });
    runtime.unsubscribeChatEvents({ subscriptionId: 'sub-reset' });

    await runtime.resetRuntimeSubscriptions();

    await expect(
      runtime.subscribeChatEvents({
        subscriptionId: 'sub-reset',
        worldId: 'world-1',
        chatId: 'chat-1'
      })
    ).rejects.toThrow("Subscription ID 'sub-reset' cannot be reused after unsubscribe.");
  });

  it('forwards system events for subscribed chats', async () => {
    const send = vi.fn();
    const worldSubscription = createWorldSubscription();

    const runtime = createRealtimeEventsRuntime({
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { send }
      }),
      chatEventChannel: 'chat:event',
      addLogStreamCallback: () => () => { },
      subscribeWorld: async () => worldSubscription,
      ensureCoreReady: async () => { }
    });

    await runtime.subscribeChatEvents({
      subscriptionId: 'sub-system',
      worldId: 'world-1',
      chatId: 'chat-1'
    });

    worldSubscription.world.eventEmitter.emit('system', {
      content: {
        eventType: 'chat-title-updated',
        title: 'Scoped Chat Title',
        source: 'idle'
      },
      messageId: 'sys-1',
      timestamp: new Date('2026-02-13T00:00:00.000Z'),
      chatId: 'chat-1'
    });

    expect(send).toHaveBeenCalledWith(
      'chat:event',
      expect.objectContaining({
        type: 'system',
        subscriptionId: 'sub-system',
        worldId: 'world-1',
        chatId: 'chat-1',
        system: expect.objectContaining({
          eventType: 'chat-title-updated',
          messageId: 'sys-1',
          content: expect.objectContaining({
            title: 'Scoped Chat Title',
            source: 'idle'
          })
        })
      })
    );
  });

  it('forwards plain-text system events using message fallback content', async () => {
    const send = vi.fn();
    const worldSubscription = createWorldSubscription();

    const runtime = createRealtimeEventsRuntime({
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { send }
      }),
      chatEventChannel: 'chat:event',
      addLogStreamCallback: () => () => { },
      subscribeWorld: async () => worldSubscription,
      ensureCoreReady: async () => { }
    });

    await runtime.subscribeChatEvents({
      subscriptionId: 'sub-system-plain',
      worldId: 'world-1',
      chatId: 'chat-1'
    });

    worldSubscription.world.eventEmitter.emit('system', {
      message: 'Retrying in 2s.',
      messageId: 'sys-plain-1',
      timestamp: new Date('2026-03-12T00:00:00.000Z'),
      chatId: 'chat-1'
    });

    expect(send).toHaveBeenCalledWith(
      'chat:event',
      expect.objectContaining({
        type: 'system',
        subscriptionId: 'sub-system-plain',
        worldId: 'world-1',
        chatId: 'chat-1',
        system: expect.objectContaining({
          eventType: 'system',
          messageId: 'sys-plain-1',
          content: 'Retrying in 2s.',
        })
      })
    );
  });

  it('does not forward unscoped realtime events into chat-scoped subscription', async () => {
    const send = vi.fn();
    const worldSubscription = createWorldSubscription();

    const runtime = createRealtimeEventsRuntime({
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { send }
      }),
      chatEventChannel: 'chat:event',
      addLogStreamCallback: () => () => { },
      subscribeWorld: async () => worldSubscription,
      ensureCoreReady: async () => { }
    });

    await runtime.subscribeChatEvents({
      subscriptionId: 'sub-chat-scope',
      worldId: 'world-1',
      chatId: 'chat-1'
    });

    worldSubscription.world.eventEmitter.emit('message', {
      messageId: 'msg-unscoped',
      sender: 'human',
      content: 'unscoped user message'
    });
    worldSubscription.world.eventEmitter.emit('sse', {
      type: 'chunk',
      messageId: 'sse-1',
      agentName: 'assistant',
      content: 'unscoped'
    });
    worldSubscription.world.eventEmitter.emit('world', {
      type: 'tool-start',
      messageId: 'tool-1',
      toolExecution: { toolName: 'read_file', toolCallId: 'tool-1' }
    });
    worldSubscription.world.eventEmitter.emit('system', {
      content: { eventType: 'chat-title-updated', title: 'Unscoped' },
      messageId: 'sys-unscoped',
      timestamp: new Date('2026-02-13T00:00:00.000Z')
    });

    expect(send).not.toHaveBeenCalled();
  });

  it('ignores activity events without explicit chatId', async () => {
    const send = vi.fn();
    const worldSubscription = createWorldSubscription();

    const runtime = createRealtimeEventsRuntime({
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { send }
      }),
      chatEventChannel: 'chat:event',
      addLogStreamCallback: () => () => { },
      subscribeWorld: async () => worldSubscription,
      ensureCoreReady: async () => { }
    });

    await runtime.subscribeChatEvents({
      subscriptionId: 'sub-activity',
      worldId: 'world-1',
      chatId: 'chat-1'
    });

    worldSubscription.world.eventEmitter.emit('world', {
      type: 'response-start',
      pendingOperations: 1,
      activityId: 1,
      source: 'agent-1',
      activeSources: ['agent-1']
    });

    worldSubscription.world.eventEmitter.emit('world', {
      type: 'idle',
      pendingOperations: 0,
      activityId: 1,
      source: 'agent-1',
      activeSources: []
    });

    expect(send).not.toHaveBeenCalled();
  });

  it('filters out activity events explicitly scoped to a different chat', async () => {
    const send = vi.fn();
    const worldSubscription = createWorldSubscription();

    const runtime = createRealtimeEventsRuntime({
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { send }
      }),
      chatEventChannel: 'chat:event',
      addLogStreamCallback: () => () => { },
      subscribeWorld: async () => worldSubscription,
      ensureCoreReady: async () => { }
    });

    await runtime.subscribeChatEvents({
      subscriptionId: 'sub-scoped',
      worldId: 'world-1',
      chatId: 'chat-1'
    });

    // Activity event with a chatId for a different chat should be filtered
    worldSubscription.world.eventEmitter.emit('world', {
      type: 'response-start',
      pendingOperations: 1,
      activityId: 1,
      chatId: 'chat-other',
      source: 'agent-1',
      activeSources: ['agent-1']
    });

    expect(send).not.toHaveBeenCalled();
  });

  it('does not forward system events scoped to a different chat', async () => {
    const send = vi.fn();
    const worldSubscription = createWorldSubscription();

    const runtime = createRealtimeEventsRuntime({
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { send }
      }),
      chatEventChannel: 'chat:event',
      addLogStreamCallback: () => () => { },
      subscribeWorld: async () => worldSubscription,
      ensureCoreReady: async () => { }
    });

    await runtime.subscribeChatEvents({
      subscriptionId: 'sub-hitl',
      worldId: 'world-1',
      chatId: 'chat-1'
    });

    worldSubscription.world.eventEmitter.emit('system', {
      chatId: 'chat-2',
      content: {
        eventType: 'chat-title-updated',
        requestId: 'req-1',
        title: 'Approval required',
        options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }]
      },
      messageId: 'sys-hitl',
      timestamp: new Date('2026-02-20T00:00:00.000Z')
    });

    expect(send).not.toHaveBeenCalled();
  });

  it('does not forward unscoped system events to chat-scoped subscriptions', async () => {
    const send = vi.fn();
    const worldSubscription = createWorldSubscription();

    const runtime = createRealtimeEventsRuntime({
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { send }
      }),
      chatEventChannel: 'chat:event',
      addLogStreamCallback: () => () => { },
      subscribeWorld: async () => worldSubscription,
      ensureCoreReady: async () => { }
    });

    await runtime.subscribeChatEvents({
      subscriptionId: 'sub-hitl-unscoped',
      worldId: 'world-1',
      chatId: 'chat-1'
    });

    worldSubscription.world.eventEmitter.emit('system', {
      content: {
        eventType: 'chat-title-updated',
        requestId: 'req-1',
        title: 'Approval required',
        options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }]
      },
      messageId: 'sys-hitl-unscoped',
      timestamp: new Date('2026-02-20T00:00:00.000Z')
    });

    expect(send).not.toHaveBeenCalled();
  });

  it('dispatches pending HITL prompts from persisted messages as tool-progress events after chat subscription is attached', async () => {
    const send = vi.fn();
    const worldSubscription = createWorldSubscription();
    const getMemory = vi.fn(async () => ([
      { role: 'assistant', tool_calls: [{ id: 'req-replay-1', function: { name: 'human_intervention_request', arguments: '{"question":"Approve?","options":["Yes"]}' } }] }
    ]));
    const listPendingHitlPromptEventsFromMessages = vi.fn(() => ([
      {
        chatId: 'chat-1',
        prompt: {
          requestId: 'req-replay-1',
          title: 'Approval required',
          message: 'Approve?',
          options: [{ id: 'yes', label: 'Yes' }],
          defaultOptionId: 'yes',
          metadata: null,
          agentName: null,
          toolName: 'human_intervention_request',
          toolCallId: 'req-replay-1',
        }
      }
    ]));

    const runtime = createRealtimeEventsRuntime({
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { send }
      }),
      chatEventChannel: 'chat:event',
      addLogStreamCallback: () => () => { },
      subscribeWorld: async () => worldSubscription,
      ensureCoreReady: async () => { },
      getMemory,
      listPendingHitlPromptEventsFromMessages,
    });

    await runtime.subscribeChatEvents({
      subscriptionId: 'sub-replay',
      worldId: 'world-1',
      chatId: 'chat-1'
    });

    expect(getMemory).toHaveBeenCalledWith('world-1', 'chat-1');
    expect(listPendingHitlPromptEventsFromMessages).toHaveBeenCalledWith(expect.any(Array), 'chat-1');
    expect(send).toHaveBeenCalledWith(
      'chat:event',
      expect.objectContaining({
        type: 'tool',
        subscriptionId: 'sub-replay',
        worldId: 'world-1',
        chatId: 'chat-1',
        tool: expect.objectContaining({
          eventType: 'tool-progress'
        })
      })
    );
  });

  it('replays runtime pending HITL prompts on subscribe even without persisted-message reconstruction', async () => {
    const send = vi.fn();
    const worldSubscription = createWorldSubscription();
    const listPendingHitlPromptEvents = vi.fn(() => ([
      {
        chatId: 'chat-1',
        prompt: {
          requestId: 'req-runtime-1',
          title: 'Approval required',
          message: 'Run this skill?',
          options: [{ id: 'yes_once', label: 'Yes once' }, { id: 'no', label: 'No' }],
          defaultOptionId: 'no',
          metadata: { skillId: 'skill-creator' },
          agentName: 'qwen',
          toolName: 'load_skill',
          toolCallId: 'call_runtime_1',
        }
      }
    ]));

    const runtime = createRealtimeEventsRuntime({
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { send }
      }),
      chatEventChannel: 'chat:event',
      addLogStreamCallback: () => () => { },
      subscribeWorld: async () => worldSubscription,
      ensureCoreReady: async () => { },
      listPendingHitlPromptEvents,
    });

    await runtime.subscribeChatEvents({
      subscriptionId: 'sub-runtime-replay',
      worldId: 'world-1',
      chatId: 'chat-1'
    });

    expect(listPendingHitlPromptEvents).toHaveBeenCalledWith(worldSubscription.world, 'chat-1');
    expect(send).toHaveBeenCalledWith(
      'chat:event',
      expect.objectContaining({
        type: 'tool',
        subscriptionId: 'sub-runtime-replay',
        worldId: 'world-1',
        chatId: 'chat-1',
        tool: expect.objectContaining({
          eventType: 'tool-progress',
          toolUseId: 'call_runtime_1',
          toolName: 'load_skill',
          metadata: expect.objectContaining({
            hitlPrompt: expect.objectContaining({
              requestId: 'req-runtime-1',
              toolCallId: 'call_runtime_1',
            })
          })
        })
      })
    );
  });

  it('skips persisted-message HITL replay for toolCallIds already emitted by runtime map to preserve correct option IDs', async () => {
    const send = vi.fn();
    const worldSubscription = createWorldSubscription();

    // Runtime map has the correct option IDs (e.g. shell_cmd uses 'approve'/'deny')
    const listPendingHitlPromptEvents = vi.fn(() => ([
      {
        chatId: 'chat-1',
        prompt: {
          requestId: 'tc-shell-1',
          title: 'Approve risky shell command?',
          message: 'rm .e2e-hitl-delete-me.txt',
          options: [
            { id: 'approve', label: 'Approve' },
            { id: 'deny', label: 'Deny' },
          ],
          defaultOptionId: 'deny',
          metadata: { tool: 'shell_cmd' },
          agentName: 'assistant',
          toolName: 'shell_cmd',
          toolCallId: 'tc-shell-1',
        }
      }
    ]));

    // Persisted-message reconstruction re-derives IDs as opt_1/opt_2 for the same toolCallId
    const listPendingHitlPromptEventsFromMessages = vi.fn(() => ([
      {
        chatId: 'chat-1',
        prompt: {
          requestId: 'tc-shell-1',
          title: 'Human input required',
          message: 'rm .e2e-hitl-delete-me.txt',
          options: [
            { id: 'opt_1', label: 'Approve' },
            { id: 'opt_2', label: 'Deny' },
          ],
          defaultOptionId: 'opt_1',
          metadata: null,
          agentName: null,
          toolName: 'human_intervention_request',
          toolCallId: 'tc-shell-1',
        }
      }
    ]));

    const getMemory = vi.fn(async () => []);

    const runtime = createRealtimeEventsRuntime({
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { send }
      }),
      chatEventChannel: 'chat:event',
      addLogStreamCallback: () => () => { },
      subscribeWorld: async () => worldSubscription,
      ensureCoreReady: async () => { },
      getMemory,
      listPendingHitlPromptEvents,
      listPendingHitlPromptEventsFromMessages,
    });

    await runtime.subscribeChatEvents({
      subscriptionId: 'sub-dedup-test',
      worldId: 'world-1',
      chatId: 'chat-1'
    });

    // Exactly one event emitted (from runtime map, not duplicated by persisted-message path)
    const toolEvents = (send as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([, payload]: [string, any]) => payload?.type === 'tool'
    );
    expect(toolEvents).toHaveLength(1);

    // The emitted prompt must carry the correct IDs from the runtime map, not opt_1/opt_2
    const emittedPrompt = toolEvents[0][1].tool?.metadata?.hitlPrompt;
    expect(emittedPrompt?.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'approve' }),
      expect.objectContaining({ id: 'deny' }),
    ]));
    expect(emittedPrompt?.options.some((o: any) => o.id === 'opt_1')).toBe(false);
  });
});
