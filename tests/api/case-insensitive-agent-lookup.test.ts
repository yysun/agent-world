/**
 * API Agent Name Normalization Tests
 *
 * Purpose:
 * - Validate that agent routes normalize world and agent route params before core lookups.
 *
 * Key features:
 * - Exercises real route handlers from server/api.ts.
 * - Asserts normalized IDs are passed to core manager functions.
 *
 * Notes:
 * - Replaces legacy toKebabCase demonstration tests with production-path route coverage.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getWorld = vi.fn();
const getAgent = vi.fn();
const updateAgent = vi.fn();

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
    getAgent,
    updateAgent,
    deleteAgent: vi.fn(),
    listChats: vi.fn(async () => []),
    newChat: vi.fn(),
    activateChatWithSnapshot: vi.fn(),
    restoreChat: vi.fn(),
    deleteChat: vi.fn(),
    clearAgentMemory: vi.fn(),
    listAgents: vi.fn(async () => []),
    getMemory: vi.fn(),
    exportWorldToMarkdown: vi.fn(),
    removeMessagesFrom: vi.fn(),
    editUserMessage: vi.fn(),
    stopMessageProcessing: vi.fn(),
    submitWorldHitlResponse: vi.fn(() => ({ accepted: true })),
    subscribeWorld: vi.fn(),
    ClientConnection: vi.fn(),
    LLMProvider: { OPENAI: 'openai' },
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

function getRouteHandlers(router: any, method: 'get' | 'patch', path: string): any[] {
  const layer = router.stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods?.[method]
  );
  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack.map((entry: any) => entry.handle);
}

describe('api agent route normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWorld.mockResolvedValue({
      id: 'my-world',
      name: 'My World',
      agents: new Map([['my-agent', { id: 'my-agent', name: 'My Agent' }]]),
      chats: new Map()
    });
    getAgent.mockResolvedValue({
      id: 'my-agent',
      name: 'My Agent',
      provider: 'openai',
      model: 'gpt-4',
      memory: [],
      llmCallCount: 0
    });
    updateAgent.mockResolvedValue({
      id: 'my-agent',
      name: 'Renamed Agent',
      provider: 'openai',
      model: 'gpt-4',
      memory: [],
      llmCallCount: 0
    });
  });

  it('normalizes world and agent params for GET /agents/:agentName', async () => {
    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'get', '/worlds/:worldName/agents/:agentName');

    const req: any = {
      params: { worldName: 'My World', agentName: 'MY_AGENT' },
      body: {}
    };
    const res = createMockResponse();

    await runMiddleware(validateWorld, req, res);
    await routeHandler(req, res);

    expect(getWorld).toHaveBeenCalledWith('my-world');
    expect(getAgent).toHaveBeenCalledWith('my-world', 'my-agent');
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ id: 'my-agent' });
  });

  it('normalizes agent param for PATCH /agents/:agentName updates', async () => {
    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'patch', '/worlds/:worldName/agents/:agentName');

    const req: any = {
      params: { worldName: 'My World', agentName: 'MyAgent' },
      body: { model: 'gpt-4.1' }
    };
    const res = createMockResponse();

    await runMiddleware(validateWorld, req, res);
    await routeHandler(req, res);

    expect(getAgent).toHaveBeenCalledWith('my-world', 'my-agent');
    expect(updateAgent).toHaveBeenCalledWith('my-world', 'my-agent', { model: 'gpt-4.1' });
    expect(res.statusCode).toBe(200);
  });
});
