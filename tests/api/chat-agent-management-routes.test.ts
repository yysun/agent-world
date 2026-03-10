/**
 * API Chat + Agent Management Route Tests
 *
 * Purpose:
 * - Harden high-value API mutation and validation paths for chat/agent/message management.
 *
 * Key features:
 * - Agent create/update/delete and memory-clear error contracts.
 * - Message stop/edit/delete contracts with lock, validation, and result mapping.
 * - HITL response endpoint validation/success.
 * - Chat list/create/delete route contracts.
 *
 * Notes:
 * - Invokes Express route middleware/handlers directly from router stack.
 * - Uses in-memory mock world state and mocked core function dependencies only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getWorldMock = vi.fn();
const createAgentMock = vi.fn();
const getAgentMock = vi.fn();
const updateAgentMock = vi.fn();
const deleteAgentMock = vi.fn();
const clearAgentMemoryMock = vi.fn();
const listChatsMock = vi.fn();
const newChatMock = vi.fn();
const deleteChatCoreMock = vi.fn();
const coreGetMemoryMock = vi.fn();
const removeMessagesFromMock = vi.fn();
const editUserMessageMock = vi.fn();
const stopMessageProcessingMock = vi.fn();
const submitWorldHitlResponseMock = vi.fn();

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
    publishMessage: vi.fn(),
    enableStreaming: vi.fn(),
    disableStreaming: vi.fn(),
    getWorld: getWorldMock,
    updateWorld: vi.fn(),
    deleteWorld: vi.fn(),
    createAgent: createAgentMock,
    getAgent: getAgentMock,
    updateAgent: updateAgentMock,
    deleteAgent: deleteAgentMock,
    listChats: listChatsMock,
    newChat: newChatMock,
    activateChatWithSnapshot: vi.fn(),
    restoreChat: vi.fn(),
    deleteChat: deleteChatCoreMock,
    clearAgentMemory: clearAgentMemoryMock,
    listAgents: vi.fn(),
    getMemory: coreGetMemoryMock,
    exportWorldToMarkdown: vi.fn(),
    removeMessagesFrom: removeMessagesFromMock,
    editUserMessage: editUserMessageMock,
    stopMessageProcessing: stopMessageProcessingMock,
    submitWorldHitlResponse: submitWorldHitlResponseMock,
    enqueueAndProcessUserTurn: vi.fn(),
    dispatchImmediateChatMessage: vi.fn(),
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
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
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

function createWorldRecord() {
  return {
    id: 'world-1',
    name: 'World 1',
    description: 'desc',
    turnLimit: 10,
    currentChatId: 'chat-1',
    isProcessing: false,
    agents: new Map([
      ['agent-a', { id: 'agent-a', name: 'Agent A', memory: [], provider: 'openai', model: 'gpt-4' }],
    ]),
    chats: new Map([
      ['chat-1', { id: 'chat-1', name: 'Chat 1', messageCount: 1 }],
      ['chat-2', { id: 'chat-2', name: 'Chat 2', messageCount: 0 }],
    ]),
  } as any;
}

describe('api chat + agent management routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getWorldMock.mockResolvedValue(createWorldRecord());
    getAgentMock.mockImplementation(async (_worldId: string, agentName: string) => {
      if (agentName === 'agent-a') {
        return { id: 'agent-a', name: 'Agent A', memory: [], provider: 'openai', model: 'gpt-4', autoReply: true };
      }
      return null;
    });
    createAgentMock.mockResolvedValue({
      id: 'agent-b',
      name: 'Agent B',
      memory: [],
      provider: 'openai',
      model: 'gpt-4',
      autoReply: true,
      llmCallCount: 0,
    });
    updateAgentMock.mockResolvedValue({
      id: 'agent-a',
      name: 'Agent A+',
      memory: [],
      provider: 'openai',
      model: 'gpt-4',
      autoReply: true,
      llmCallCount: 0,
    });
    deleteAgentMock.mockResolvedValue(true);
    clearAgentMemoryMock.mockResolvedValue({
      id: 'agent-a',
      name: 'Agent A',
      memory: [],
      provider: 'openai',
      model: 'gpt-4',
      autoReply: true,
      llmCallCount: 0,
    });

    listChatsMock.mockResolvedValue([
      { id: 'chat-1', name: 'Chat 1', messageCount: 1 },
      { id: 'chat-2', name: 'Chat 2', messageCount: 0 },
    ]);
    newChatMock.mockResolvedValue(createWorldRecord());
    deleteChatCoreMock.mockResolvedValue(true);

    stopMessageProcessingMock.mockReturnValue({ success: true, chatId: 'chat-1' });
    submitWorldHitlResponseMock.mockReturnValue({ accepted: true, requestId: 'req-1' });

    coreGetMemoryMock.mockResolvedValue([
      { role: 'user', messageId: 'msg-1', sender: 'human', content: 'hello', chatId: 'chat-1' },
      { role: 'assistant', messageId: 'msg-2', sender: 'agent-a', content: 'hi', chatId: 'chat-1' },
    ]);

    removeMessagesFromMock.mockResolvedValue({
      success: true,
      messagesRemovedTotal: 1,
      processedAgents: ['agent-a'],
      failedAgents: [],
    });

    editUserMessageMock.mockResolvedValue({
      success: true,
      processedAgents: ['agent-a'],
      failedAgents: [],
      removedMessagesCount: 1,
      resubmissionStatus: 'success',
    });
  });

  it('returns 404 for world route middleware when world is missing', async () => {
    getWorldMock.mockResolvedValueOnce(null);

    const { default: router } = await import('../../server/api.js');
    const [validateWorld] = getRouteHandlers(router, 'get', '/worlds/:worldName/chats');
    const req: any = { params: { worldName: 'missing' }, body: {} };
    const res = createMockResponse();
    const next = vi.fn();
    await validateWorld(req, res, next);
    await Promise.resolve();

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ code: 'WORLD_NOT_FOUND' });
    expect(next).not.toHaveBeenCalled();
  });

  it('enforces duplicate-agent check on create', async () => {
    getAgentMock.mockResolvedValueOnce({ id: 'agent-a', name: 'Agent A' });

    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'post', '/worlds/:worldName/agents');
    const req: any = {
      params: { worldName: 'world-1' },
      body: { name: 'Agent A', provider: 'openai', model: 'gpt-4' },
    };
    const res = createMockResponse();

    await runMiddleware(validateWorld, req, res);
    await routeHandler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'AGENT_EXISTS' });
  });

  it('returns agent update memory-clear failure when clearMemory cannot complete', async () => {
    clearAgentMemoryMock.mockResolvedValueOnce(null);

    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'patch', '/worlds/:worldName/agents/:agentName');
    const req: any = {
      params: { worldName: 'world-1', agentName: 'Agent A' },
      body: { clearMemory: true },
    };
    const res = createMockResponse();

    await runMiddleware(validateWorld, req, res);
    await routeHandler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ code: 'MEMORY_CLEAR_ERROR' });
  });

  it('returns agent delete error when target agent is missing', async () => {
    getAgentMock.mockResolvedValueOnce(null);

    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'delete', '/worlds/:worldName/agents/:agentName');
    const req: any = {
      params: { worldName: 'world-1', agentName: 'missing-agent' },
      body: {},
    };
    const res = createMockResponse();

    await runMiddleware(validateWorld, req, res);
    await routeHandler(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ code: 'AGENT_NOT_FOUND' });
  });

  it('returns 204 when clearing agent memory succeeds', async () => {
    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'delete', '/worlds/:worldName/agents/:agentName/memory');
    const req: any = {
      params: { worldName: 'world-1', agentName: 'agent-a' },
      body: {},
    };
    const res = createMockResponse();

    await runMiddleware(validateWorld, req, res);
    await routeHandler(req, res);

    expect(res.statusCode).toBe(204);
  });

  it('maps stop-message endpoint to core stop processing result', async () => {
    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'post', '/worlds/:worldName/messages/stop');
    const req: any = {
      params: { worldName: 'world-1' },
      body: { chatId: 'chat-1' },
    };
    const res = createMockResponse();

    await runMiddleware(validateWorld, req, res);
    await routeHandler(req, res);

    expect(stopMessageProcessingMock).toHaveBeenCalledWith('world-1', 'chat-1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, chatId: 'chat-1' });
  });

  it('handles non-stream message edit success and lock error mapping', async () => {
    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'put', '/worlds/:worldName/messages/:messageId');

    const okReq: any = {
      params: { worldName: 'world-1', messageId: 'msg-1' },
      body: { chatId: 'chat-1', newContent: 'updated', stream: false },
    };
    const okRes = createMockResponse();

    await runMiddleware(validateWorld, okReq, okRes);
    await routeHandler(okReq, okRes);

    expect(editUserMessageMock).toHaveBeenCalledWith('world-1', 'msg-1', 'updated', 'chat-1');
    expect(okRes.statusCode).toBe(200);

    editUserMessageMock.mockRejectedValueOnce(new Error('Cannot edit message while world is processing'));
    const lockReq: any = {
      params: { worldName: 'world-1', messageId: 'msg-1' },
      body: { chatId: 'chat-1', newContent: 'updated', stream: false },
    };
    const lockRes = createMockResponse();

    await runMiddleware(validateWorld, lockReq, lockRes);
    await routeHandler(lockReq, lockRes);

    expect(lockRes.statusCode).toBe(423);
    expect(lockRes.body).toMatchObject({ code: 'WORLD_LOCKED' });
  });

  it('validates and processes delete-message branches', async () => {
    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'delete', '/worlds/:worldName/messages/:messageId');

    const badBodyReq: any = {
      params: { worldName: 'world-1', messageId: 'msg-1' },
      body: {},
    };
    const badBodyRes = createMockResponse();
    await runMiddleware(validateWorld, badBodyReq, badBodyRes);
    await routeHandler(badBodyReq, badBodyRes);
    expect(badBodyRes.statusCode).toBe(400);

    getWorldMock.mockResolvedValueOnce({ ...createWorldRecord(), isProcessing: true });
    const lockedReq: any = {
      params: { worldName: 'world-1', messageId: 'msg-1' },
      body: { chatId: 'chat-1' },
    };
    const lockedRes = createMockResponse();
    await runMiddleware(validateWorld, lockedReq, lockedRes);
    await routeHandler(lockedReq, lockedRes);
    expect(lockedRes.statusCode).toBe(423);

    coreGetMemoryMock.mockResolvedValueOnce(null);
    const chatMissingReq: any = {
      params: { worldName: 'world-1', messageId: 'msg-1' },
      body: { chatId: 'chat-1' },
    };
    const chatMissingRes = createMockResponse();
    await runMiddleware(validateWorld, chatMissingReq, chatMissingRes);
    await routeHandler(chatMissingReq, chatMissingRes);
    expect(chatMissingRes.statusCode).toBe(404);
    expect(chatMissingRes.body).toMatchObject({ code: 'CHAT_NOT_FOUND' });

    coreGetMemoryMock.mockResolvedValueOnce([
      { role: 'assistant', messageId: 'msg-1', sender: 'agent-a', content: 'nope', chatId: 'chat-1' },
    ]);
    const invalidTypeReq: any = {
      params: { worldName: 'world-1', messageId: 'msg-1' },
      body: { chatId: 'chat-1' },
    };
    const invalidTypeRes = createMockResponse();
    await runMiddleware(validateWorld, invalidTypeReq, invalidTypeRes);
    await routeHandler(invalidTypeReq, invalidTypeRes);
    expect(invalidTypeRes.statusCode).toBe(400);
    expect(invalidTypeRes.body).toMatchObject({ code: 'INVALID_MESSAGE_TYPE' });

    coreGetMemoryMock.mockResolvedValueOnce([
      { role: 'user', messageId: 'msg-1', sender: 'human', content: 'edit me', chatId: 'chat-1' },
    ]);
    removeMessagesFromMock.mockResolvedValueOnce({
      success: true,
      messagesRemovedTotal: 1,
      processedAgents: ['agent-a'],
      failedAgents: [],
    });
    const okReq: any = {
      params: { worldName: 'world-1', messageId: 'msg-1' },
      body: { chatId: 'chat-1' },
    };
    const okRes = createMockResponse();
    await runMiddleware(validateWorld, okReq, okRes);
    await routeHandler(okReq, okRes);
    expect(okRes.statusCode).toBe(200);
    expect(okRes.body).toMatchObject({ success: true, messagesRemovedTotal: 1 });
  });

  it('validates and submits hitl responses', async () => {
    const { default: router } = await import('../../server/api.js');
    const [validateWorld, routeHandler] = getRouteHandlers(router, 'post', '/worlds/:worldName/hitl/respond');

    const invalidReq: any = {
      params: { worldName: 'world-1' },
      body: { requestId: 'req-1' },
    };
    const invalidRes = createMockResponse();
    await runMiddleware(validateWorld, invalidReq, invalidRes);
    await routeHandler(invalidReq, invalidRes);
    expect(invalidRes.statusCode).toBe(400);

    const okReq: any = {
      params: { worldName: 'world-1' },
      body: { requestId: 'req-1', optionId: 'yes', chatId: 'chat-1' },
    };
    const okRes = createMockResponse();
    await runMiddleware(validateWorld, okReq, okRes);
    await routeHandler(okReq, okRes);

    expect(submitWorldHitlResponseMock).toHaveBeenCalledWith({
      worldId: 'world-1',
      requestId: 'req-1',
      optionId: 'yes',
      chatId: 'chat-1',
    });
    expect(okRes.statusCode).toBe(200);
    expect(okRes.body).toMatchObject({ accepted: true, requestId: 'req-1' });
  });

  it('returns chat list, new-chat payload, and delete-chat not-found contract', async () => {
    const { default: router } = await import('../../server/api.js');

    const [validateChats, listHandler] = getRouteHandlers(router, 'get', '/worlds/:worldName/chats');
    const listReq: any = { params: { worldName: 'world-1' }, body: {} };
    const listRes = createMockResponse();
    await runMiddleware(validateChats, listReq, listRes);
    await listHandler(listReq, listRes);
    expect(listRes.statusCode).toBe(200);
    expect(listRes.body).toEqual([
      { id: 'chat-1', name: 'Chat 1', messageCount: 1 },
      { id: 'chat-2', name: 'Chat 2', messageCount: 0 },
    ]);

    const [validateCreateChat, createChatHandler] = getRouteHandlers(router, 'post', '/worlds/:worldName/chats');
    const createReq: any = { params: { worldName: 'world-1' }, body: {} };
    const createRes = createMockResponse();
    await runMiddleware(validateCreateChat, createReq, createRes);
    await createChatHandler(createReq, createRes);
    expect(createRes.statusCode).toBe(200);
    expect(createRes.body).toMatchObject({ success: true, chatId: 'chat-1' });

    deleteChatCoreMock.mockResolvedValueOnce(false);
    const [validateDelete, deleteHandler] = getRouteHandlers(router, 'delete', '/worlds/:worldName/chats/:chatId');
    const deleteReq: any = { params: { worldName: 'world-1', chatId: 'chat-404' }, body: {} };
    const deleteRes = createMockResponse();
    await runMiddleware(validateDelete, deleteReq, deleteRes);
    await deleteHandler(deleteReq, deleteRes);
    expect(deleteRes.statusCode).toBe(404);
    expect(deleteRes.body).toMatchObject({ code: 'CHAT_NOT_FOUND' });
  });
});
