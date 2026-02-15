/**
 * API Route Tests for ChatId Isolation
 *
 * Purpose:
 * - Validate route-level chat isolation behavior for send/edit/switch endpoints.
 *
 * Key features:
 * - Rejects send/edit when `chatId` does not exist in world chats.
 * - Ensures set-chat with unknown chat keeps current session unchanged.
 *
 * Notes:
 * - Uses route stack invocation with mocked core functions (no HTTP server boot).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getWorld = vi.fn();
const restoreChat = vi.fn();
const editUserMessage = vi.fn();
const listChatsMock = vi.fn();

vi.mock('../../core/index.js', () => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };

  return {
    createWorld: vi.fn(),
    listWorlds: vi.fn(async () => []),
    createCategoryLogger: vi.fn(() => logger),
    publishMessage: vi.fn(),
    enableStreaming: vi.fn(),
    disableStreaming: vi.fn(),
    getWorld,
    updateWorld: vi.fn(),
    deleteWorld: vi.fn(),
    createAgent: vi.fn(),
    getAgent: vi.fn(),
    updateAgent: vi.fn(),
    deleteAgent: vi.fn(),
    listChats: listChatsMock,
    newChat: vi.fn(),
    restoreChat,
    deleteChat: vi.fn(),
    clearAgentMemory: vi.fn(),
    listAgents: vi.fn(),
    getMemory: vi.fn(),
    exportWorldToMarkdown: vi.fn(),
    removeMessagesFrom: vi.fn(),
    editUserMessage,
    stopMessageProcessing: vi.fn(),
    submitWorldOptionResponse: vi.fn(() => ({ accepted: true })),
    subscribeWorld: vi.fn(),
    ClientConnection: vi.fn(),
    LLMProvider: {
      OPENAI: 'openai'
    },
    EventType: {
      WORLD: 'world',
      MESSAGE: 'message',
      SSE: 'sse'
    }
  };
});

vi.mock('../../core/mcp-server-registry.js', () => ({
  listMCPServers: vi.fn(() => []),
  restartMCPServer: vi.fn(async () => true),
  getMCPSystemHealth: vi.fn(() => ({ status: 'healthy' })),
  getMCPRegistryStats: vi.fn(() => ({ totalServers: 0 }))
}));

type MockResponse = {
  statusCode: number;
  body: any;
  headers: Record<string, string>;
  headersSent: boolean;
  status: (code: number) => MockResponse;
  json: (data: any) => MockResponse;
  send: (data?: any) => MockResponse;
  setHeader: (key: string, value: string) => void;
};

function createMockResponse(): MockResponse {
  return {
    statusCode: 200,
    body: null,
    headers: {},
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
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    }
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

function getRouteHandlers(router: any, method: 'post' | 'put', path: string): any[] {
  const layer = router.stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods?.[method]
  );
  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack.map((entry: any) => entry.handle);
}

describe('API chat route isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listChatsMock.mockResolvedValue([{ id: 'chat-1', name: 'Chat 1', messageCount: 0 }]);
    getWorld.mockResolvedValue({
      id: 'world-1',
      name: 'World 1',
      currentChatId: 'chat-1',
      agents: new Map(),
      chats: new Map([['chat-1', { id: 'chat-1', name: 'Chat 1', messageCount: 0 }]])
    });
    restoreChat.mockResolvedValue(null);
  });

  it('rejects message send when requested chatId does not exist', async () => {
    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'post', '/worlds/:worldName/messages');

    const req: any = {
      params: { worldName: 'world-1' },
      body: {
        message: 'hello',
        sender: 'human',
        stream: false,
        chatId: 'chat-missing'
      }
    };
    const res = createMockResponse();

    await runMiddleware(validateWorld, req, res);
    await routeHandler(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({
      error: 'Chat not found',
      code: 'CHAT_NOT_FOUND'
    });
  });

  it('rejects message edit when requested chatId does not exist', async () => {
    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'put', '/worlds/:worldName/messages/:messageId');

    const req: any = {
      params: { worldName: 'world-1', messageId: 'msg-1' },
      body: {
        chatId: 'chat-missing',
        newContent: 'updated content',
        stream: false
      }
    };
    const res = createMockResponse();

    await runMiddleware(validateWorld, req, res);
    await routeHandler(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({
      error: 'Chat not found',
      code: 'CHAT_NOT_FOUND'
    });
    expect(editUserMessage).not.toHaveBeenCalled();
  });

  it('keeps current chat unchanged when setChat target is invalid', async () => {
    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'post', '/worlds/:worldName/setChat/:chatId');

    const req: any = {
      params: { worldName: 'world-1', chatId: 'chat-missing' },
      body: {}
    };
    const res = createMockResponse();

    await runMiddleware(validateWorld, req, res);
    await routeHandler(req, res);

    expect(restoreChat).toHaveBeenCalledWith('world-1', 'chat-missing');
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: false,
      chatId: 'chat-1'
    });
  });
});
