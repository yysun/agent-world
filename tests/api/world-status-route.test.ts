/**
 * World Status Route Tests
 *
 * Purpose:
 * - Verify GET /worlds/:worldName/status returns the correct JSON shape.
 * - Verify queuedChatIds and activeChatIds are correctly derived.
 *
 * Key Features:
 * - Black-box boundary tests at request/response level.
 * - In-memory mock world and mocked core dependencies.
 *
 * Implementation Notes:
 * - Route handlers are extracted from the router's stack for direct invocation.
 * - getActiveProcessingChatIds and getActiveAgentNames are mocked on core/index.js.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getWorldMock = vi.fn();
const getActiveProcessingChatIdsMock = vi.fn();
const getActiveAgentNamesMock = vi.fn();

vi.mock('../../core/index.js', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    createWorld: vi.fn(),
    listWorlds: vi.fn(async () => []),
    createCategoryLogger: vi.fn(() => logger),
    publishMessage: vi.fn(),
    enableStreaming: vi.fn(),
    disableStreaming: vi.fn(),
    getWorld: getWorldMock,
    updateWorld: vi.fn(),
    deleteWorld: vi.fn(),
    createAgent: vi.fn(),
    getAgent: vi.fn(),
    updateAgent: vi.fn(),
    deleteAgent: vi.fn(),
    listChats: vi.fn(async () => []),
    newChat: vi.fn(),
    activateChatWithSnapshot: vi.fn(),
    restoreChat: vi.fn(),
    deleteChat: vi.fn(),
    clearAgentMemory: vi.fn(),
    listAgents: vi.fn(async () => []),
    getMemory: vi.fn(async () => []),
    exportWorldToMarkdown: vi.fn(),
    removeMessagesFrom: vi.fn(),
    editUserMessage: vi.fn(),
    stopMessageProcessing: vi.fn(),
    submitWorldHitlResponse: vi.fn(),
    listPendingHitlPromptEventsFromMessages: vi.fn(async () => []),
    enqueueAndProcessUserTurn: vi.fn(),
    dispatchImmediateChatMessage: vi.fn(),
    getActiveProcessingChatIds: getActiveProcessingChatIdsMock,
    getActiveAgentNames: getActiveAgentNamesMock,
    subscribeWorld: vi.fn(),
    ClientConnection: vi.fn(),
    LLMProvider: { OPENAI: 'openai' },
    EventType: { WORLD: 'world', MESSAGE: 'message', SSE: 'sse', SYSTEM: 'system' },
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
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; this.headersSent = true; return this; },
    send(data?) { this.body = data ?? null; this.headersSent = true; return this; },
    setHeader(key, value) { this.headers[key] = value; },
  };
}

async function invokeMiddleware(
  middleware: (req: any, res: any, next: any) => any,
  req: any,
  res: MockResponse,
): Promise<void> {
  const next = vi.fn();
  return new Promise((resolve, reject) => {
    try {
      const maybePromise = middleware(req, res, next);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(() => resolve()).catch(reject);
      } else {
        resolve();
      }
    } catch (err) {
      reject(err);
    }
  });
}

function getRouteHandlers(
  router: any,
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string,
): any[] {
  const layer = router.stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods?.[method],
  );
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  return layer.route.stack.map((entry: any) => entry.handle);
}

function createWorldRecord(overrides: Record<string, any> = {}) {
  return {
    id: 'world-1',
    name: 'World 1',
    description: null,
    turnLimit: 10,
    currentChatId: 'chat-1',
    isProcessing: false,
    agents: new Map(),
    chats: new Map([['chat-1', { id: 'chat-1', name: 'Chat 1', messageCount: 0 }]]),
    _queuedChatIds: new Set<string>(),
    ...overrides,
  } as any;
}

describe('GET /worlds/:worldName/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWorldMock.mockResolvedValue(createWorldRecord());
    getActiveProcessingChatIdsMock.mockReturnValue(new Set<string>());
    getActiveAgentNamesMock.mockReturnValue([]);
  });

  it('returns correct shape with all required fields', async () => {
    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'get', '/worlds/:worldName/status');

    const req: any = { params: { worldName: 'world-1' }, body: {} };
    const res = createMockResponse();
    await invokeMiddleware(validateWorld, req, res);

    const res2 = createMockResponse();
    await invokeMiddleware(routeHandler, req, res2);

    expect(res2.statusCode).toBe(200);
    expect(res2.body).toMatchObject({
      worldId: 'world-1',
      isProcessing: false,
      activeChatIds: [],
      queuedChatIds: [],
      activeAgentNames: [],
      queueDepth: 0,
      sendingCount: 0,
    });
  });

  it('returns queuedChatIds from world._queuedChatIds', async () => {
    const worldWithQueue = createWorldRecord({ _queuedChatIds: new Set(['chat-q1', 'chat-q2']) });
    getWorldMock.mockResolvedValue(worldWithQueue);

    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'get', '/worlds/:worldName/status');

    const req: any = { params: { worldName: 'world-1' }, body: {} };
    const res = createMockResponse();
    await invokeMiddleware(validateWorld, req, res);

    const res2 = createMockResponse();
    await invokeMiddleware(routeHandler, req, res2);

    expect(res2.body.queuedChatIds).toEqual(expect.arrayContaining(['chat-q1', 'chat-q2']));
    expect(res2.body.queueDepth).toBe(2);
  });

  it('returns activeChatIds from getActiveProcessingChatIds', async () => {
    getActiveProcessingChatIdsMock.mockReturnValue(new Set(['chat-active-1']));
    getActiveAgentNamesMock.mockReturnValue(['alice']);

    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'get', '/worlds/:worldName/status');

    const req: any = { params: { worldName: 'world-1' }, body: {} };
    const res = createMockResponse();
    await invokeMiddleware(validateWorld, req, res);

    const res2 = createMockResponse();
    await invokeMiddleware(routeHandler, req, res2);

    expect(res2.body.activeChatIds).toEqual(['chat-active-1']);
    expect(res2.body.activeAgentNames).toEqual(['alice']);
    expect(res2.body.sendingCount).toBe(1);
  });

  it('returns 404 when world is not found', async () => {
    getWorldMock.mockResolvedValue(null);

    const { default: router } = await import('../../server/api.js');
    const [validateWorld] = getRouteHandlers(router, 'get', '/worlds/:worldName/status');

    const req: any = { params: { worldName: 'missing-world' }, body: {} };
    const res = createMockResponse();
    await invokeMiddleware(validateWorld, req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ code: 'WORLD_NOT_FOUND' });
  });
});
