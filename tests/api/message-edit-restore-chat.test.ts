/**
 * Regression tests: restoreChat called before subscribeWorld in send-message and edit paths
 *
 * Purpose:
 * - Verify PUT /worlds/:worldName/messages/:messageId (streaming path) calls
 *   restoreChat(worldId, chatId, { suppressAutoResume: true }) before subscribeWorld.
 * - Verify POST /worlds/:worldName/messages (streaming and non-streaming paths) call
 *   restoreChat(worldId, chatId) before subscribeWorld, mirroring Electron sendChatMessage.
 *
 * Key features:
 * - Validates Electron parity: stale agent runtime is refreshed from storage on every
 *   agent interaction, preventing "no-agent" hangs after world delete+recreate or
 *   agent add/delete while a live runtime is cached.
 *
 * Implementation notes:
 * - subscribeWorld is mocked to return null so each handler exits early, keeping
 *   tests deterministic without waiting for SSE streaming or idle events.
 * - Verifies the call order: restoreChat must be invoked before subscribeWorld.
 *
 * Recent changes:
 * - 2026-03-11: Initial regression test for stale-runtime edit-success fix.
 * - 2026-03-11: Added send-message path regression tests (streaming and non-streaming).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getWorld = vi.fn();
const restoreChat = vi.fn();
const activateChatWithSnapshot = vi.fn();
const editUserMessage = vi.fn();
const subscribeWorld = vi.fn();
const listChatsMock = vi.fn();

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
    activateChatWithSnapshot,
    restoreChat,
    deleteChat: vi.fn(),
    clearAgentMemory: vi.fn(),
    listAgents: vi.fn(),
    getMemory: vi.fn(),
    exportWorldToMarkdown: vi.fn(),
    removeMessagesFrom: vi.fn(),
    editUserMessage,
    stopMessageProcessing: vi.fn(),
    submitWorldHitlResponse: vi.fn(() => ({ accepted: true })),
    enqueueAndProcessUserTurn: vi.fn(),
    dispatchImmediateChatMessage: vi.fn(),
    subscribeWorld,
    ClientConnection: vi.fn(),
    LLMProvider: { OPENAI: 'openai' },
    EventType: {
      WORLD: 'world',
      MESSAGE: 'message',
      SSE: 'sse',
      SYSTEM: 'system',
    },
    listPendingHitlPromptEventsFromMessages: vi.fn(async () => []),
    getActiveProcessingChatIds: vi.fn(() => []),
    getActiveAgentNames: vi.fn(() => []),
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

type MockSSEResponse = {
  statusCode: number;
  body: any;
  headers: Record<string, string>;
  headersSent: boolean;
  written: string[];
  ended: boolean;
  listeners: Record<string, (() => void)[]>;
  status: (code: number) => MockSSEResponse;
  json: (data: any) => MockSSEResponse;
  send: (data?: any) => MockSSEResponse;
  setHeader: (key: string, value: string) => void;
  write: (chunk: string) => void;
  end: () => void;
  on: (event: string, cb: () => void) => MockSSEResponse;
};

function createMockSSEResponse(): MockSSEResponse {
  const res: MockSSEResponse = {
    statusCode: 200,
    body: null,
    headers: {},
    headersSent: false,
    written: [],
    ended: false,
    listeners: {},
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
    },
    write(chunk: string) {
      this.written.push(chunk);
    },
    end() {
      this.ended = true;
      for (const cb of this.listeners['finish'] ?? []) cb();
    },
    on(event: string, cb: () => void) {
      this.listeners[event] = this.listeners[event] ?? [];
      this.listeners[event].push(cb);
      return this;
    },
  };
  return res;
}

async function runMiddleware(middleware: any, req: any, res: any): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const next = (error?: unknown) => {
      if (error) { reject(error); return; }
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

function getRouteHandlers(router: any, method: string, path: string): any[] {
  const layer = router.stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods?.[method]
  );
  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack.map((entry: any) => entry.handle);
}

describe('PUT /worlds/:worldName/messages/:messageId — restoreChat before subscribeWorld', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listChatsMock.mockResolvedValue([{ id: 'chat-1', name: 'Chat 1', messageCount: 0 }]);
    getWorld.mockResolvedValue({
      id: 'world-1',
      name: 'World 1',
      currentChatId: 'chat-1',
      agents: new Map(),
      chats: new Map([['chat-1', { id: 'chat-1', name: 'Chat 1', messageCount: 0 }]]),
    });
    restoreChat.mockResolvedValue(null);
    activateChatWithSnapshot.mockResolvedValue(null);
    // Returning null from subscribeWorld causes the handler to send an SSE error
    // and immediately end the response, keeping the test synchronous.
    subscribeWorld.mockResolvedValue(null);
  });

  it('calls restoreChat(suppressAutoResume: true) before subscribeWorld in the streaming path', async () => {
    const callOrder: string[] = [];
    restoreChat.mockImplementation(async () => {
      callOrder.push('restoreChat');
      return null;
    });
    subscribeWorld.mockImplementation(async () => {
      callOrder.push('subscribeWorld');
      return null; // triggers early SSE-error exit
    });

    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'put', '/worlds/:worldName/messages/:messageId');

    const req: any = {
      params: { worldName: 'world-1', messageId: 'msg-1' },
      body: { chatId: 'chat-1', newContent: 'edited content', stream: true },
    };
    const res = createMockSSEResponse();

    await runMiddleware(validateWorld, req, res);
    await routeHandler(req, res);

    expect(restoreChat).toHaveBeenCalledWith('world-1', 'chat-1', { suppressAutoResume: true });
    expect(subscribeWorld).toHaveBeenCalled();
    expect(callOrder).toEqual(['restoreChat', 'subscribeWorld']);
  });

  it('does NOT call restoreChat for the non-streaming path', async () => {
    editUserMessage.mockResolvedValue({ success: true, processedAgents: [], resubmissionStatus: 'success' });

    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'put', '/worlds/:worldName/messages/:messageId');

    const req: any = {
      params: { worldName: 'world-1', messageId: 'msg-1' },
      body: { chatId: 'chat-1', newContent: 'edited content', stream: false },
    };
    const res = createMockSSEResponse();

    await runMiddleware(validateWorld, req, res);
    await routeHandler(req, res);

    expect(restoreChat).not.toHaveBeenCalled();
    expect(subscribeWorld).not.toHaveBeenCalled();
    expect(editUserMessage).toHaveBeenCalledWith('world-1', 'msg-1', 'edited content', 'chat-1');
  });
});

describe('POST /worlds/:worldName/messages — restoreChat before subscribeWorld', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listChatsMock.mockResolvedValue([{ id: 'chat-1', name: 'Chat 1', messageCount: 0 }]);
    getWorld.mockResolvedValue({
      id: 'world-1',
      name: 'World 1',
      currentChatId: 'chat-1',
      agents: new Map(),
      chats: new Map([['chat-1', { id: 'chat-1', name: 'Chat 1', messageCount: 0 }]]),
    });
    restoreChat.mockResolvedValue(null);
    activateChatWithSnapshot.mockResolvedValue(null);
    // null from subscribeWorld causes both paths to produce an error response early.
    subscribeWorld.mockResolvedValue(null);
  });

  it('streaming path calls restoreChat before subscribeWorld when chatId is provided', async () => {
    const callOrder: string[] = [];
    restoreChat.mockImplementation(async () => {
      callOrder.push('restoreChat');
      return null;
    });
    subscribeWorld.mockImplementation(async () => {
      callOrder.push('subscribeWorld');
      return null; // triggers early SSE-error exit
    });

    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'post', '/worlds/:worldName/messages');

    const req: any = {
      params: { worldName: 'world-1' },
      body: { message: 'hello', sender: 'user', chatId: 'chat-1', stream: true },
    };
    const res = createMockSSEResponse();

    await runMiddleware(validateWorld, req, res);
    await routeHandler(req, res);

    expect(restoreChat).toHaveBeenCalledWith('world-1', 'chat-1');
    expect(subscribeWorld).toHaveBeenCalled();
    expect(callOrder).toEqual(['restoreChat', 'subscribeWorld']);
  });

  it('non-streaming path calls restoreChat before subscribeWorld when chatId is provided', async () => {
    const callOrder: string[] = [];
    restoreChat.mockImplementation(async () => {
      callOrder.push('restoreChat');
      return null;
    });
    subscribeWorld.mockImplementation(async () => {
      callOrder.push('subscribeWorld');
      return null; // triggers early error exit in non-streaming path
    });

    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'post', '/worlds/:worldName/messages');

    const req: any = {
      params: { worldName: 'world-1' },
      body: { message: 'hello', sender: 'user', chatId: 'chat-1', stream: false },
    };
    const res = createMockSSEResponse();

    await runMiddleware(validateWorld, req, res);
    await routeHandler(req, res);

    expect(restoreChat).toHaveBeenCalledWith('world-1', 'chat-1');
    expect(subscribeWorld).toHaveBeenCalled();
    expect(callOrder).toEqual(['restoreChat', 'subscribeWorld']);
  });
});
