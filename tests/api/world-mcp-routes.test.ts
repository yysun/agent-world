/**
 * API World + MCP Route Behavior Tests
 *
 * Purpose:
 * - Cover high-value world-management and MCP-management route branches in server/api.ts.
 *
 * Key features:
 * - Default-world bootstrap/list behavior.
 * - World create conflict/error mapping and patch-update field filtering.
 * - Delete-world failure handling and world export headers/body contract.
 * - MCP server list/restart/health contracts including failure paths.
 *
 * Notes:
 * - Executes router middleware/handlers directly with mocked core interfaces.
 * - Uses only in-memory fakes and no filesystem/database/network side effects.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const createWorldMock = vi.fn();
const listWorldsMock = vi.fn();
const getWorldMock = vi.fn();
const updateWorldMock = vi.fn();
const deleteWorldMock = vi.fn();
const exportWorldToMarkdownMock = vi.fn();

const listMCPServersMock = vi.fn();
const restartMCPServerMock = vi.fn();
const getMCPSystemHealthMock = vi.fn();
const getMCPRegistryStatsMock = vi.fn();

vi.mock('../../core/index.js', () => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  return {
    createWorld: createWorldMock,
    listWorlds: listWorldsMock,
    createCategoryLogger: vi.fn(() => logger),
    publishMessage: vi.fn(),
    enableStreaming: vi.fn(),
    disableStreaming: vi.fn(),
    getWorld: getWorldMock,
    updateWorld: updateWorldMock,
    deleteWorld: deleteWorldMock,
    createAgent: vi.fn(),
    getAgent: vi.fn(),
    updateAgent: vi.fn(),
    deleteAgent: vi.fn(),
    listChats: vi.fn(),
    newChat: vi.fn(),
    activateChatWithSnapshot: vi.fn(),
    restoreChat: vi.fn(),
    deleteChat: vi.fn(),
    clearAgentMemory: vi.fn(),
    listAgents: vi.fn(),
    getMemory: vi.fn(),
    exportWorldToMarkdown: exportWorldToMarkdownMock,
    removeMessagesFrom: vi.fn(),
    editUserMessage: vi.fn(),
    stopMessageProcessing: vi.fn(),
    submitWorldHitlResponse: vi.fn(() => ({ accepted: true })),
    subscribeWorld: vi.fn(),
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
  listMCPServers: listMCPServersMock,
  restartMCPServer: restartMCPServerMock,
  getMCPSystemHealth: getMCPSystemHealthMock,
  getMCPRegistryStats: getMCPRegistryStatsMock,
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

function getRouteHandlers(
  router: any,
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string
): any[] {
  const layer = router.stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods?.[method]
  );
  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack.map((entry: any) => entry.handle);
}

function createWorldRecord(name = 'World 1') {
  return {
    id: 'world-1',
    name,
    description: 'desc',
    turnLimit: 10,
    mainAgent: null,
    chatLLMProvider: null,
    chatLLMModel: null,
    currentChatId: 'chat-1',
    mcpConfig: null,
    variables: '',
    agents: new Map(),
    chats: new Map([['chat-1', { id: 'chat-1', name: 'Chat 1', messageCount: 0 }]]),
  };
}

describe('api world + mcp routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    listWorldsMock.mockResolvedValue([
      { id: 'world-1', name: 'World 1', totalAgents: 2, description: 'desc' },
    ]);
    createWorldMock.mockResolvedValue(createWorldRecord('Default World'));
    getWorldMock.mockResolvedValue(createWorldRecord());
    updateWorldMock.mockResolvedValue(createWorldRecord('Updated World'));
    deleteWorldMock.mockResolvedValue(true);
    exportWorldToMarkdownMock.mockResolvedValue('# Export');

    listMCPServersMock.mockReturnValue([]);
    restartMCPServerMock.mockResolvedValue(true);
    getMCPSystemHealthMock.mockReturnValue({ status: 'healthy' });
    getMCPRegistryStatsMock.mockReturnValue({ totalServers: 0 });
  });

  it('creates a default world when /worlds list is empty', async () => {
    listWorldsMock.mockResolvedValueOnce([]);

    const { default: router } = await import('../../server/api.js');
    const [routeHandler] = getRouteHandlers(router, 'get', '/worlds');
    const req: any = { params: {}, body: {} };
    const res = createMockResponse();

    await routeHandler(req, res);

    expect(createWorldMock).toHaveBeenCalledWith({ name: 'Default World' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ name: 'Default World', agentCount: 0 }]);
  });

  it('returns create-world error when default world bootstrap fails', async () => {
    listWorldsMock.mockResolvedValueOnce([]);
    createWorldMock.mockResolvedValueOnce(null);

    const { default: router } = await import('../../server/api.js');
    const [routeHandler] = getRouteHandlers(router, 'get', '/worlds');
    const req: any = { params: {}, body: {} };
    const res = createMockResponse();

    await routeHandler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ code: 'WORLD_CREATE_ERROR' });
  });

  it('maps world-create conflict errors to WORLD_EXISTS', async () => {
    createWorldMock.mockRejectedValueOnce(new Error('world already exists'));

    const { default: router } = await import('../../server/api.js');
    const [routeHandler] = getRouteHandlers(router, 'post', '/worlds');
    const req: any = {
      params: {},
      body: { name: 'World 1', description: null },
    };
    const res = createMockResponse();

    await routeHandler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'WORLD_EXISTS' });
  });

  it('returns current world without update call when patch body has no changes', async () => {
    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'patch', '/worlds/:worldName');
    const req: any = {
      params: { worldName: 'world-1' },
      body: {},
    };
    const res = createMockResponse();

    await runMiddleware(validateWorld, req, res);
    await routeHandler(req, res);

    expect(updateWorldMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ id: 'world-1', name: 'World 1' });
  });

  it('filters nullable provider/model updates in world patch payload', async () => {
    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'patch', '/worlds/:worldName');
    const req: any = {
      params: { worldName: 'world-1' },
      body: {
        description: null,
        chatLLMProvider: null,
        chatLLMModel: null,
        variables: 'FOO=bar',
      },
    };
    const res = createMockResponse();

    await runMiddleware(validateWorld, req, res);
    await routeHandler(req, res);

    expect(updateWorldMock).toHaveBeenCalledTimes(1);
    expect(updateWorldMock).toHaveBeenCalledWith(
      'world-1',
      expect.objectContaining({
        description: null,
        variables: 'FOO=bar',
      })
    );
    expect(updateWorldMock.mock.calls[0][1]).not.toHaveProperty('chatLLMProvider');
    expect(updateWorldMock.mock.calls[0][1]).not.toHaveProperty('chatLLMModel');
  });

  it('returns delete error when world deletion returns false', async () => {
    deleteWorldMock.mockResolvedValueOnce(false);

    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'delete', '/worlds/:worldName');
    const req: any = {
      params: { worldName: 'world-1' },
      body: {},
    };
    const res = createMockResponse();

    await runMiddleware(validateWorld, req, res);
    await routeHandler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ code: 'WORLD_DELETE_ERROR' });
  });

  it('exports world markdown with attachment headers', async () => {
    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'get', '/worlds/:worldName/export');
    const req: any = {
      params: { worldName: 'world-1' },
      body: {},
    };
    const res = createMockResponse();

    await runMiddleware(validateWorld, req, res);
    await routeHandler(req, res);

    expect(exportWorldToMarkdownMock).toHaveBeenCalledWith('world-1');
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('text/markdown');
    expect(res.headers['Content-Disposition']).toContain('world-1-');
    expect(Number(res.headers['Content-Length'])).toBe(Buffer.byteLength('# Export', 'utf8'));
    expect(res.body).toBe('# Export');
  });

  it('returns MCP server list with truncated ids and registry stats', async () => {
    listMCPServersMock.mockReturnValueOnce([
      {
        id: 'abcdef1234567890',
        config: { name: 'skills', transport: 'stdio' },
        status: 'running',
        referenceCount: 2,
        startedAt: '2026-02-27T10:00:00.000Z',
        lastHealthCheck: '2026-02-27T10:01:00.000Z',
        associatedWorlds: new Set(['world-1']),
      },
    ]);
    getMCPRegistryStatsMock.mockReturnValueOnce({ totalServers: 1, healthyServers: 1 });

    const { default: router } = await import('../../server/api.js');
    const [routeHandler] = getRouteHandlers(router, 'get', '/mcp/servers');
    const req: any = { params: {}, body: {} };
    const res = createMockResponse();

    await routeHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      stats: { totalServers: 1, healthyServers: 1 },
      servers: [
        expect.objectContaining({
          id: 'abcdef12',
          name: 'skills',
          transport: 'stdio',
          associatedWorlds: ['world-1'],
        }),
      ],
    });
  });

  it('handles MCP restart not-found and restart-failure branches', async () => {
    const { default: router } = await import('../../server/api.js');
    const [routeHandler] = getRouteHandlers(router, 'post', '/mcp/servers/:serverId/restart');

    listMCPServersMock.mockReturnValueOnce([]);
    const missingReq: any = { params: { serverId: 'missing' }, body: {} };
    const missingRes = createMockResponse();
    await routeHandler(missingReq, missingRes);
    expect(missingRes.statusCode).toBe(404);
    expect(missingRes.body).toMatchObject({ code: 'MCP_SERVER_NOT_FOUND' });

    listMCPServersMock.mockReturnValueOnce([
      {
        id: 'abc123456789',
        config: { name: 'skills', transport: 'stdio' },
      },
    ]);
    restartMCPServerMock.mockResolvedValueOnce(false);
    const failReq: any = { params: { serverId: 'abc12345' }, body: {} };
    const failRes = createMockResponse();
    await routeHandler(failReq, failRes);
    expect(failRes.statusCode).toBe(500);
    expect(failRes.body).toMatchObject({ code: 'MCP_RESTART_ERROR' });
  });

  it('returns unhealthy payload when MCP health lookup throws', async () => {
    getMCPSystemHealthMock.mockImplementationOnce(() => {
      throw new Error('health failed');
    });

    const { default: router } = await import('../../server/api.js');
    const [routeHandler] = getRouteHandlers(router, 'get', '/mcp/health');
    const req: any = { params: {}, body: {} };
    const res = createMockResponse();

    await routeHandler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({
      status: 'unhealthy',
      error: 'Failed to get MCP system health',
    });
  });
});
