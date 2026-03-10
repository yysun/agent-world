/**
 * Tool Artifact Route Tests
 *
 * Purpose:
 * - Verify `/api/tool-artifact` resolves adopted-tool preview files only from approved roots.
 *
 * Key Features:
 * - Serves registered skill artifacts through stable same-origin URLs for restored previews.
 * - Rejects paths outside world working-directory and registered skill roots.
 *
 * Notes on Implementation:
 * - Invokes the Express route handler directly with mocked core/registry/fs dependencies.
 * - Uses in-memory response doubles; no HTTP server boot and no real filesystem access.
 *
 * Recent Changes:
 * - 2026-03-06: Initial coverage for stable adopted-tool artifact serving.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getWorld = vi.fn();
const getSkills = vi.fn();
const getSkillSourcePath = vi.fn();
const statMock = vi.fn();
const realpathMock = vi.fn();

vi.mock('fs', () => ({
  promises: {
    stat: statMock,
    realpath: realpathMock,
  },
}));

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
    enqueueAndProcessUserTurn: vi.fn(),
    dispatchImmediateChatMessage: vi.fn(),
    enableStreaming: vi.fn(),
    disableStreaming: vi.fn(),
    getWorld,
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
    subscribeWorld: vi.fn(),
    ClientConnection: vi.fn(),
    LLMProvider: {
      OPENAI: 'openai',
    },
    EventType: {
      WORLD: 'world',
      MESSAGE: 'message',
      SSE: 'sse',
    },
  };
});

vi.mock('../../core/skill-registry.js', () => ({
  getSkills,
  getSkillSourcePath,
}));

vi.mock('../../core/mcp-server-registry.js', () => ({
  listMCPServers: vi.fn(() => []),
  restartMCPServer: vi.fn(async () => true),
  getMCPSystemHealth: vi.fn(() => ({ status: 'healthy' })),
  getMCPRegistryStats: vi.fn(() => ({ totalServers: 0 })),
}));

type MockResponse = {
  statusCode: number;
  body: any;
  headersSent: boolean;
  status: (code: number) => MockResponse;
  json: (data: any) => MockResponse;
  sendFile: (filePath: string) => MockResponse;
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
    sendFile(filePath: string) {
      this.body = { filePath };
      this.headersSent = true;
      return this;
    },
  };
}

function getRouteHandler(router: any, method: 'get', path: string) {
  const layer = router.stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods?.[method],
  );
  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack[0].handle;
}

describe('API tool artifact route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWorld.mockResolvedValue({
      id: 'world-1',
      name: 'World 1',
      variables: 'working_directory=/tmp/world-work',
      agents: new Map(),
      chats: new Map(),
    });
    getSkills.mockReturnValue([{ skill_id: 'music-to-svg' }]);
    getSkillSourcePath.mockImplementation((skillId: string) =>
      skillId === 'music-to-svg' ? '/Users/esun/.agents/skills/music-to-svg/SKILL.md' : undefined,
    );
  });

  it('serves files from symlinked registered skill roots using realpath authorization', async () => {
    statMock.mockImplementation(async (targetPath: string) => {
      const normalizedPath = String(targetPath).replace(/\/+/g, '/');
      if (normalizedPath === '/Users/esun/dev/music-to-svg/assets/score.svg') {
        return { isFile: () => true };
      }
      throw new Error('ENOENT');
    });
    realpathMock.mockImplementation(async (targetPath: string) => {
      const normalizedPath = String(targetPath).replace(/\/+/g, '/');
      if (normalizedPath === '/Users/esun/.agents/skills/music-to-svg/SKILL.md') {
        return '/Users/esun/dev/music-to-svg/SKILL.md';
      }
      if (normalizedPath === '/Users/esun/.agents/skills/music-to-svg/assets/score.svg') {
        return '/Users/esun/dev/music-to-svg/assets/score.svg';
      }
      throw new Error('ENOENT');
    });

    const { default: router } = await import('../../server/api.js');
    const handler = getRouteHandler(router, 'get', '/tool-artifact');
    const req: any = {
      query: {
        path: '/Users/esun/.agents/skills/music-to-svg/assets/score.svg',
      },
    };
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ filePath: '/Users/esun/dev/music-to-svg/assets/score.svg' });
  });

  it('rejects symlink escapes outside approved skill and world roots', async () => {
    statMock.mockResolvedValue({ isFile: () => true });
    realpathMock.mockImplementation(async (targetPath: string) => {
      const normalizedPath = String(targetPath).replace(/\/+/g, '/');
      if (normalizedPath === '/tmp/world-work') {
        return '/tmp/world-work';
      }
      if (normalizedPath === '/Users/esun/.agents/skills/music-to-svg/SKILL.md') {
        return '/Users/esun/dev/music-to-svg/SKILL.md';
      }
      if (normalizedPath === '/tmp/world-work/link-to-secret.txt') {
        return '/private/tmp/secret.txt';
      }
      throw new Error('ENOENT');
    });

    const { default: router } = await import('../../server/api.js');
    const handler = getRouteHandler(router, 'get', '/tool-artifact');
    const req: any = {
      query: {
        path: '/tmp/world-work/link-to-secret.txt',
        worldId: 'world-1',
      },
    };
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({
      error: 'Tool artifact not found',
      code: 'TOOL_ARTIFACT_NOT_FOUND',
    });
  });
});
