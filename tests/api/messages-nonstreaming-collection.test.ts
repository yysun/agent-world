/**
 * API Non-Streaming Message Collection Tests
 *
 * Purpose:
 * - Validate non-streaming `/messages` response collection contracts in server/api.ts.
 *
 * Key features:
 * - Chat-scoped message aggregation excludes cross-chat contamination.
 * - Completion waits for in-scope world idle event.
 *
 * Implementation notes:
 * - Invokes route middleware/handler directly from Express router stack.
 * - Uses in-memory EventEmitter world and mocked core API only.
 */

import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getWorld = vi.fn();
const listChatsMock = vi.fn();
const publishMessage = vi.fn();
const enqueueAndProcessUserMessage = vi.fn();
const subscribeWorld = vi.fn();
const enableStreaming = vi.fn();
const disableStreaming = vi.fn();
const unsubscribe = vi.fn();

vi.mock('../../core/index.js', () => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  return {
    createWorld: vi.fn(),
    listWorlds: vi.fn(async () => []),
    createCategoryLogger: vi.fn(() => logger),
    publishMessage,
    enqueueAndProcessUserMessage,
    enableStreaming,
    disableStreaming,
    getWorld,
    updateWorld: vi.fn(),
    deleteWorld: vi.fn(),
    createAgent: vi.fn(),
    getAgent: vi.fn(),
    updateAgent: vi.fn(),
    deleteAgent: vi.fn(),
    listChats: listChatsMock,
    newChat: vi.fn(),
    activateChatWithSnapshot: vi.fn(),
    restoreChat: vi.fn(),
    deleteChat: vi.fn(),
    clearAgentMemory: vi.fn(),
    listAgents: vi.fn(),
    getMemory: vi.fn(),
    exportWorldToMarkdown: vi.fn(),
    removeMessagesFrom: vi.fn(),
    editUserMessage: vi.fn(),
    stopMessageProcessing: vi.fn(),
    submitWorldHitlResponse: vi.fn(() => ({ accepted: true })),
    subscribeWorld,
    ClientConnection: vi.fn(),
    LLMProvider: {
      OPENAI: 'openai',
    },
    EventType: {
      WORLD: 'world',
      MESSAGE: 'message',
      SSE: 'sse',
      SYSTEM: 'system',
    },
  };
});

vi.mock('../../core/mcp-server-registry.js', () => ({
  listMCPServers: vi.fn(() => []),
  restartMCPServer: vi.fn(async () => true),
  getMCPSystemHealth: vi.fn(() => ({ status: 'healthy' })),
  getMCPRegistryStats: vi.fn(() => ({ totalServers: 0 })),
}));

vi.mock('../../core/optional-tracers/opik-runtime.js', () => ({
  attachOptionalOpikTracer: vi.fn(async () => undefined),
}));

type MockResponse = {
  statusCode: number;
  body: any;
  headersSent: boolean;
  status: (code: number) => MockResponse;
  json: (data: any) => MockResponse;
  send: (data?: any) => MockResponse;
};

function createMockResponse(): MockResponse {
  return {
    statusCode: 200,
    body: null,
    headersSent: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      this.headersSent = true;
      return this;
    },
    send(data?: any) {
      this.body = data ?? null;
      this.headersSent = true;
      return this;
    },
  };
}

async function runMiddleware(middleware: any, req: any, res: any): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const next = (error?: unknown) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };

    try {
      const maybePromise = middleware(req, res, next);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(() => resolve()).catch(reject);
      }
    } catch (error) {
      reject(error);
    }
  });
}

function getRouteHandlers(router: any, method: 'post', path: string): any[] {
  const layer = router.stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods?.[method]
  );
  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack.map((entry: any) => entry.handle);
}

describe('api non-streaming message collection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const world = {
      id: 'world-1',
      name: 'World 1',
      currentChatId: 'chat-a',
      isProcessing: false,
      eventEmitter: new EventEmitter(),
      agents: new Map(),
      chats: new Map([
        ['chat-a', { id: 'chat-a', name: 'Chat A', messageCount: 0 }],
        ['chat-b', { id: 'chat-b', name: 'Chat B', messageCount: 0 }],
      ]),
    };

    getWorld.mockResolvedValue(world);
    listChatsMock.mockResolvedValue([
      { id: 'chat-a', name: 'Chat A', messageCount: 0 },
      { id: 'chat-b', name: 'Chat B', messageCount: 0 },
    ]);
    subscribeWorld.mockResolvedValue({
      world,
      unsubscribe,
    });
  });

  it('collects only in-scope chat messages for non-streaming requests', async () => {
    enqueueAndProcessUserMessage.mockImplementation(async (_worldId: string, _chatId: string, _message: string, _sender: string, world: any) => {
      world.eventEmitter.emit('world', { type: 'response-start', chatId: 'chat-a', activityId: 1 });
      world.eventEmitter.emit('message', {
        sender: 'agent',
        content: 'cross-chat',
        messageId: 'msg-b',
        chatId: 'chat-b',
      });
      world.eventEmitter.emit('message', {
        sender: 'agent',
        content: 'in-scope',
        messageId: 'msg-a',
        chatId: 'chat-a',
      });
      world.eventEmitter.emit('world', { type: 'idle', chatId: 'chat-a', activityId: 1 });
    });

    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'post', '/worlds/:worldName/messages');

    const req: any = {
      params: { worldName: 'world-1' },
      body: {
        message: 'hello',
        sender: 'human',
        stream: false,
        chatId: 'chat-a',
      },
    };
    const res = createMockResponse();

    await runMiddleware(validateWorld, req, res);
    await routeHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    const contentPayload = JSON.parse(res.body.data.content);
    expect(contentPayload.data.chatId).toBe('chat-a');
    expect(contentPayload.data.content).toBe('in-scope');
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(disableStreaming).toHaveBeenCalledTimes(1);
    expect(enableStreaming).toHaveBeenCalledTimes(1);
  });

  it('waits for in-scope idle event before completing response', async () => {
    enqueueAndProcessUserMessage.mockImplementation(async (_worldId: string, _chatId: string, _message: string, _sender: string, world: any) => {
      world.eventEmitter.emit('world', { type: 'response-start', chatId: 'chat-a', activityId: 2 });
      world.eventEmitter.emit('message', {
        sender: 'agent',
        content: 'still processing',
        messageId: 'msg-a1',
        chatId: 'chat-a',
      });
      world.eventEmitter.emit('world', { type: 'idle', chatId: 'chat-b', activityId: 2 });
      world.eventEmitter.emit('message', {
        sender: 'agent',
        content: 'final',
        messageId: 'msg-a2',
        chatId: 'chat-a',
      });
      world.eventEmitter.emit('world', { type: 'idle', chatId: 'chat-a', activityId: 2 });
    });

    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'post', '/worlds/:worldName/messages');

    const req: any = {
      params: { worldName: 'world-1' },
      body: {
        message: 'hello',
        sender: 'human',
        stream: false,
        chatId: 'chat-a',
      },
    };
    const res = createMockResponse();

    await runMiddleware(validateWorld, req, res);
    await routeHandler(req, res);

    const contentPayload = JSON.parse(res.body.data.content);
    expect(contentPayload.data.messageId).toBe('msg-a2');
    expect(contentPayload.data.chatId).toBe('chat-a');
  });
});
