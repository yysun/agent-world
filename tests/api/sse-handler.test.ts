/**
 * SSE Handler Contract Tests
 *
 * Purpose:
 * - Validate server SSE handler behavior for chat scoping, lifecycle, and cleanup.
 *
 * Key features:
 * - Chat-scoped forwarding for message/tool/log events.
 * - Stream lifecycle completion on response-start -> idle transition.
 * - Listener and log-stream callback cleanup on client disconnect.
 * - Edit context skips synthesis to prevent duplicate user messages.
 *
 * Implementation notes:
 * - Uses an in-memory EventEmitter world and mocked core interfaces only.
 * - No network/socket/file-system usage.
 *
 * Recent Changes:
 * - 2026-03-11: Added readiness coverage to lock listener attachment before chat/edit dispatch.
 */

import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const addLogStreamCallback = vi.fn();
const getMemory = vi.fn();
const listPendingHitlPromptEventsFromMessages = vi.fn();

vi.mock('../../core/index.js', () => ({
  addLogStreamCallback,
  createCategoryLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  getMemory,
  listPendingHitlPromptEventsFromMessages,
  EventType: {
    WORLD: 'world',
    MESSAGE: 'message',
    SSE: 'sse',
    SYSTEM: 'system',
  },
}));

type MockReq = EventEmitter;
type MockRes = {
  headers: Record<string, string>;
  writes: string[];
  ended: boolean;
  destroyed: boolean;
  setHeader: (key: string, value: string) => void;
  write: (chunk: string) => void;
  end: () => void;
};

function createMockReq(): MockReq {
  return new EventEmitter();
}

function createMockRes(): MockRes {
  return {
    headers: {},
    writes: [],
    ended: false,
    destroyed: false,
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    },
    write(chunk: string) {
      this.writes.push(chunk);
    },
    end() {
      this.ended = true;
    },
  };
}

function extractPayloads(res: MockRes): any[] {
  return res.writes
    .map((chunk) => chunk.replace(/^data:\s*/, '').trim())
    .filter(Boolean)
    .map((raw) => JSON.parse(raw));
}

describe('sse-handler behavior', () => {
  let logCallback: ((event: any) => void) | null = null;
  let unsubscribeLogStream: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    getMemory.mockResolvedValue([]);
    listPendingHitlPromptEventsFromMessages.mockReturnValue([]);
    unsubscribeLogStream = vi.fn();
    logCallback = null;
    addLogStreamCallback.mockImplementation((cb: (event: any) => void) => {
      logCallback = cb;
      return unsubscribeLogStream;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('forwards only chat-scoped message/tool/log events', async () => {
    const { createSSEHandler } = await import('../../server/sse-handler.js');
    const req = createMockReq();
    const res = createMockRes();
    const world = { id: 'world-1', eventEmitter: new EventEmitter() } as any;

    createSSEHandler(req as any, res as any, world, 'test', 'chat-a');
    await Promise.resolve();
    await Promise.resolve();

    world.eventEmitter.emit('message', {
      sender: 'agent',
      content: 'wrong chat',
      messageId: 'msg-b',
      chatId: 'chat-b',
    });
    world.eventEmitter.emit('message', {
      sender: 'agent',
      content: 'right chat',
      messageId: 'msg-a',
      chatId: 'chat-a',
    });

    world.eventEmitter.emit('world', {
      type: 'tool-start',
      messageId: 'tool-b',
      toolExecution: { toolName: 'shell_cmd' },
      chatId: 'chat-b',
    });
    world.eventEmitter.emit('world', {
      type: 'tool-start',
      messageId: 'tool-a',
      toolExecution: { toolName: 'shell_cmd' },
      chatId: 'chat-a',
    });

    expect(logCallback).not.toBeNull();
    logCallback?.({
      level: 'info',
      category: 'api',
      message: 'wrong chat log',
      worldId: 'world-1',
      chatId: 'chat-b',
    });
    logCallback?.({
      level: 'info',
      category: 'api',
      message: 'right chat log',
      worldId: 'world-1',
      chatId: 'chat-a',
    });

    const payloads = extractPayloads(res);
    const messagePayloads = payloads.filter((payload) => payload.type === 'message');
    const toolPayloads = payloads.filter(
      (payload) => payload.type === 'sse' && payload.data?.type === 'tool-start'
    );
    const logPayloads = payloads.filter(
      (payload) => payload.type === 'sse' && payload.data?.type === 'log'
    );

    expect(messagePayloads).toHaveLength(1);
    expect(messagePayloads[0].data.chatId).toBe('chat-a');
    expect(toolPayloads).toHaveLength(1);
    expect(toolPayloads[0].data.chatId).toBe('chat-a');
    expect(logPayloads).toHaveLength(1);
    expect(logPayloads[0].data.chatId).toBe('chat-a');
  });

  it('ends stream after idle event when response cycle is complete', async () => {
    vi.useFakeTimers();
    const { createSSEHandler } = await import('../../server/sse-handler.js');
    const req = createMockReq();
    const res = createMockRes();
    const world = { id: 'world-1', eventEmitter: new EventEmitter() } as any;

    createSSEHandler(req as any, res as any, world, 'test', 'chat-a');
    await Promise.resolve();
    await Promise.resolve();

    world.eventEmitter.emit('world', { type: 'response-start', chatId: 'chat-a', activityId: 1 });
    world.eventEmitter.emit('world', { type: 'idle', chatId: 'chat-a', activityId: 1 });

    expect(res.ended).toBe(false);
    vi.advanceTimersByTime(1999);
    expect(res.ended).toBe(false);
    vi.advanceTimersByTime(1);
    expect(res.ended).toBe(true);
  });

  it('cleans up listeners and log forwarding on request close', async () => {
    const { createSSEHandler } = await import('../../server/sse-handler.js');
    const req = createMockReq();
    const res = createMockRes();
    const world = { id: 'world-1', eventEmitter: new EventEmitter() } as any;

    createSSEHandler(req as any, res as any, world, 'test');
    await Promise.resolve();
    await Promise.resolve();

    expect(world.eventEmitter.listenerCount('world')).toBeGreaterThan(0);
    expect(world.eventEmitter.listenerCount('message')).toBeGreaterThan(0);
    expect(world.eventEmitter.listenerCount('sse')).toBeGreaterThan(0);
    expect(world.eventEmitter.listenerCount('system')).toBeGreaterThan(0);

    req.emit('close');

    expect(res.ended).toBe(true);
    expect(world.eventEmitter.listenerCount('world')).toBe(0);
    expect(world.eventEmitter.listenerCount('message')).toBe(0);
    expect(world.eventEmitter.listenerCount('sse')).toBe(0);
    expect(world.eventEmitter.listenerCount('system')).toBe(0);
    expect(unsubscribeLogStream).toHaveBeenCalledTimes(1);
  });

  it('skips synthesis for edit context to prevent duplicate user messages', async () => {
    // Regression: editing a message would emit the old user message from synthesis
    // AND the new user message from publishMessage, resulting in two "From human" messages.
    const oldUserMessage = {
      role: 'user',
      sender: 'human',
      content: '@a1, say hi to @a2.',
      messageId: 'msg-original',
      chatId: 'chat-a',
      createdAt: new Date().toISOString(),
    };
    getMemory.mockResolvedValue([oldUserMessage]);

    const { createSSEHandler } = await import('../../server/sse-handler.js');
    const req = createMockReq();
    const res = createMockRes();
    const world = { id: 'world-1', eventEmitter: new EventEmitter() } as any;

    createSSEHandler(req as any, res as any, world, 'edit', 'chat-a');
    // Let async synthesis resolve
    await new Promise((r) => setTimeout(r, 0));

    const payloads = extractPayloads(res);
    const messagePayloads = payloads.filter((p) => p.type === 'message');
    // Synthesis must not emit the stale user message for edit context
    expect(messagePayloads).toHaveLength(0);
  });

  it('exposes readiness only after live listeners are attached', async () => {
    let resolveMemory: ((value: any[]) => void) | null = null;
    getMemory.mockImplementation(
      () =>
        new Promise<any[]>((resolve) => {
          resolveMemory = resolve;
        }),
    );

    const { createSSEHandler } = await import('../../server/sse-handler.js');
    const req = createMockReq();
    const res = createMockRes();
    const world = { id: 'world-1', eventEmitter: new EventEmitter() } as any;

    const handler = createSSEHandler(req as any, res as any, world, 'test', 'chat-a');

    expect(world.eventEmitter.listenerCount('message')).toBe(0);

    let readyResolved = false;
    const readyPromise = handler.ready.then(() => {
      readyResolved = true;
    });
    await Promise.resolve();
    expect(readyResolved).toBe(false);

    resolveMemory?.([]);
    await readyPromise;

    expect(readyResolved).toBe(true);
    expect(world.eventEmitter.listenerCount('world')).toBeGreaterThan(0);
    expect(world.eventEmitter.listenerCount('message')).toBeGreaterThan(0);
    expect(world.eventEmitter.listenerCount('sse')).toBeGreaterThan(0);
    expect(world.eventEmitter.listenerCount('system')).toBeGreaterThan(0);
  });
});
