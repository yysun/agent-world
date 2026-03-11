/**
 * Web World Update Generator Flow Tests
 *
 * Purpose:
 * - Verify generator-composed web update flows preserve optimistic and hydrated state transitions.
 *
 * Coverage:
 * - Ensures `send-message` yields optimistic state before SSE startup resolves.
 * - Ensures `create-new-chat` hydrates the newly created chat directly through init flow composition.
 *
 * Recent Changes:
 * - 2026-03-11: Added regression coverage for removing handler-to-handler `app.run(...)` chaining.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import api from '../../web/src/api';

vi.mock('../../web/src/utils/sse-client', async () => {
  const actual = await vi.importActual<typeof import('../../web/src/utils/sse-client')>('../../web/src/utils/sse-client');
  return {
    ...actual,
    sendChatMessage: vi.fn(),
  };
});

import * as SseClient from '../../web/src/utils/sse-client';
import { worldUpdateHandlers } from '../../web/src/pages/World.update';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function createBaseState(overrides: Record<string, unknown> = {}) {
  return {
    worldName: 'demo-world',
    userInput: 'Hello from web',
    messages: [],
    currentChat: { id: 'chat-1', name: 'Chat 1' },
    hitlPromptQueue: [],
    error: null,
    ...overrides,
  } as any;
}

describe('web/world-update generator flow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('yields optimistic send state before SSE startup completes', async () => {
    const deferred = createDeferred<() => void>();
    vi.mocked(SseClient.sendChatMessage).mockReturnValue(deferred.promise);

    const state = createBaseState();
    const updates = (worldUpdateHandlers['send-message'] as any)(state);

    const optimistic = await updates.next();
    expect(optimistic.value.isSending).toBe(true);
    expect(optimistic.value.userInput).toBe('');
    expect(optimistic.value.lastUserMessageText).toBe('Hello from web');
    expect(optimistic.value.messages).toHaveLength(1);
    expect(optimistic.value.messages[0]).toMatchObject({
      text: 'Hello from web',
      type: 'user',
      sender: 'human',
      userEntered: true,
    });

    deferred.resolve(() => undefined);

    const completed = await updates.next();
    expect(vi.mocked(SseClient.sendChatMessage)).toHaveBeenCalledWith('demo-world', 'Hello from web', {
      sender: 'HUMAN',
      chatId: 'chat-1',
    });
    expect(completed.value.isSending).toBe(false);
    expect(completed.value.messages).toHaveLength(1);
  });

  it('returns an error without inserting an optimistic message when no active chat is selected', async () => {
    const state = createBaseState({
      currentChat: null,
    });

    const updates = (worldUpdateHandlers['send-message'] as any)(state);
    const errored = await updates.next();

    expect(errored.value.error).toBe('Select a chat session before sending a message.');
    expect(errored.value.messages).toEqual([]);
    expect(vi.mocked(SseClient.sendChatMessage)).not.toHaveBeenCalled();
  });

  it('hydrates the created chat directly after chat creation succeeds', async () => {
    vi.spyOn(api, 'newChat').mockResolvedValue({
      success: true,
      chatId: 'chat-2',
      world: { id: 'demo-world' },
    } as any);
    vi.spyOn(api, 'getWorld').mockResolvedValue({
      id: 'demo-world',
      name: 'demo-world',
      currentChatId: 'chat-2',
      chats: [
        { id: 'chat-1', name: 'Chat 1' },
        { id: 'chat-2', name: 'Chat 2' },
      ],
      agents: [],
      variables: '',
    } as any);

    const state = createBaseState({
      loading: false,
    });

    const updates = (worldUpdateHandlers['create-new-chat'] as any)(state);

    const loading = await updates.next();
    expect(loading.value.loading).toBe(true);

    const hydrated = await updates.next();
    expect(api.newChat).toHaveBeenCalledWith('demo-world');
    expect(api.getWorld).toHaveBeenCalledWith('demo-world');
    expect(hydrated.value.loading).toBe(false);
    expect(hydrated.value.currentChat?.id).toBe('chat-2');
    expect(hydrated.value.world?.currentChatId).toBe('chat-2');
    expect(hydrated.value.world?.chats).toHaveLength(2);
  });
});
