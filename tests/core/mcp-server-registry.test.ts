/**
 * MCP Server Registry Behavioral Tests
 *
 * Purpose:
 * - Exercise production-path MCP registry behavior without real MCP transports.
 *
 * Key features:
 * - Config parsing and schema sanitization helpers.
 * - Server registration/reuse, lifecycle, and health status reporting.
 * - Tool execution argument correction through executeMCPTool.
 * - Registry-level tool cache behavior for getMCPToolsForWorld.
 *
 * Notes:
 * - Uses mocked MCP SDK client/transport classes and mocked world/tool dependencies.
 * - Avoids network/process side effects while preserving runtime code paths.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetWorld,
  mockClientConnect,
  mockClientClose,
  mockClientCallTool,
  mockClientListTools,
  failConnectCommands,
  listToolsPayload,
} = vi.hoisted(() => ({
  mockGetWorld: vi.fn(),
  mockClientConnect: vi.fn(),
  mockClientClose: vi.fn(),
  mockClientCallTool: vi.fn(),
  mockClientListTools: vi.fn(),
  failConnectCommands: new Set<string>(),
  listToolsPayload: [] as any[],
}));

vi.mock('../../core/managers.js', () => ({
  getWorld: mockGetWorld,
}));

vi.mock('../../core/logger.js', () => ({
  createCategoryLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class MockStdioClientTransport {
    options: any;
    constructor(options: any) {
      this.options = options;
    }
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: class MockSSEClientTransport {
    url: URL;
    options: any;
    constructor(url: URL, options: any) {
      this.url = url;
      this.options = options;
    }
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class MockStreamableHTTPClientTransport {
    url: URL;
    options: any;
    constructor(url: URL, options: any) {
      this.url = url;
      this.options = options;
    }
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class MockClient {
    transport: any;

    async connect(transport: any) {
      this.transport = transport;
      mockClientConnect(transport);
      const command = transport?.options?.command;
      if (command && failConnectCommands.has(command)) {
        throw new Error(`connect failed: ${command}`);
      }
    }

    async close() {
      mockClientClose();
    }

    async listTools() {
      mockClientListTools();
      return { tools: [...listToolsPayload] };
    }

    async callTool(payload: any) {
      return mockClientCallTool(payload);
    }
  },
}));

vi.mock('../../core/shell-cmd-tool.js', () => ({
  createShellCmdToolDefinition: vi.fn(() => ({
    description: 'shell',
    parameters: { type: 'object', properties: {} },
    execute: vi.fn(),
  })),
}));

vi.mock('../../core/load-skill-tool.js', () => ({
  createLoadSkillToolDefinition: vi.fn(() => ({
    description: 'load',
    parameters: { type: 'object', properties: {} },
    execute: vi.fn(),
  })),
}));

vi.mock('../../core/create-agent-tool.js', () => ({
  createCreateAgentToolDefinition: vi.fn(() => ({
    description: 'create-agent',
    parameters: { type: 'object', properties: {} },
    execute: vi.fn(),
  })),
}));

vi.mock('../../core/hitl-tool.js', () => ({
  createHitlToolDefinition: vi.fn(() => ({
    description: 'hitl',
    parameters: { type: 'object', properties: {} },
    execute: vi.fn(),
  })),
}));

vi.mock('../../core/web-fetch-tool.js', () => ({
  createWebFetchToolDefinition: vi.fn(() => ({
    description: 'web-fetch',
    parameters: { type: 'object', properties: {} },
    execute: vi.fn(),
  })),
}));

vi.mock('../../core/send-message-tool.js', () => ({
  createSendMessageToolDefinition: vi.fn(() => ({
    description: 'send-message',
    parameters: { type: 'object', properties: {} },
    execute: vi.fn(),
  })),
}));

vi.mock('../../core/file-tools.js', () => ({
  createReadFileToolDefinition: vi.fn(() => ({
    description: 'read-file',
    parameters: { type: 'object', properties: {} },
    execute: vi.fn(),
  })),
  createWriteFileToolDefinition: vi.fn(() => ({
    description: 'write-file',
    parameters: { type: 'object', properties: {} },
    execute: vi.fn(),
  })),
  createListFilesToolDefinition: vi.fn(() => ({
    description: 'list-files',
    parameters: { type: 'object', properties: {} },
    execute: vi.fn(),
  })),
  createGrepToolDefinition: vi.fn(() => ({
    description: 'grep',
    parameters: { type: 'object', properties: {} },
    execute: vi.fn(),
  })),
}));

vi.mock('../../core/tool-utils.js', () => ({
  wrapToolWithValidation: vi.fn((tool: any) => tool),
}));

import {
  clearToolsCache,
  executeMCPTool,
  getMCPRegistryStats,
  getMCPServer,
  getMCPServersForWorld,
  getMCPSystemHealth,
  getMCPToolsForWorld,
  getToolsCacheStats,
  listMCPServers,
  parseMCPConfig,
  parseServersFromConfig,
  performHealthCheck,
  refreshServerToolsCache,
  registerMCPServer,
  restartMCPServer,
  sanitizeArgs,
  shutdownAllMCPServers,
  unregisterMCPServer,
  validateMCPConfig,
  validateToolSchema,
} from '../../core/mcp-server-registry.js';

describe('mcp-server-registry behavior', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    failConnectCommands.clear();
    listToolsPayload.length = 0;
    mockGetWorld.mockResolvedValue(null);
    mockClientCallTool.mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
    });
    await shutdownAllMCPServers();
    await clearToolsCache();
    vi.useRealTimers();
  });

  it('sanitizes args, validates schema, and parses mixed server config formats', () => {
    expect(
      sanitizeArgs({
        api_key: 'secret',
        tokenValue: 'secret-token',
        normal: 'safe',
      })
    ).toEqual({
      api_key: '[REDACTED]',
      tokenValue: '[REDACTED]',
      normal: 'safe',
    });

    expect(
      validateToolSchema({
        properties: {
          limit: { type: 'integer', description: 'max items' },
          tags: { type: 'array', items: { type: 'number' } },
          active: { type: 'boolean' },
        },
        required: ['limit'],
      })
    ).toEqual({
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'max items' },
        tags: { type: 'array', items: { type: 'string' } },
        active: { type: 'boolean' },
      },
      additionalProperties: false,
      required: ['limit'],
    });

    const parsed = parseServersFromConfig({
      servers: {
        local: { command: 'node', args: ['server.js'] },
      },
      mcpServers: {
        remote: { type: 'http', url: 'https://example.com/mcp' },
      },
    });

    expect(parsed).toEqual([
      {
        name: 'local',
        transport: 'stdio',
        command: 'node',
        args: ['server.js'],
        env: undefined,
      },
    ]);

    const parsedLegacy = parseServersFromConfig({
      mcpServers: {
        remote: { type: 'http', url: 'https://example.com/mcp' },
      },
    });
    expect(parsedLegacy[0]).toMatchObject({
      name: 'remote',
      transport: 'streamable-http',
      url: 'https://example.com/mcp',
    });

    expect(
      validateMCPConfig({
        servers: {
          local: { command: 'node', args: ['server.js'] },
          remote: { transport: 'sse', url: 'https://example.com/sse' },
        },
      })
    ).toBe(true);
    expect(validateMCPConfig({ servers: { bad: { transport: 'invalid', command: 'x' } } })).toBe(
      false
    );
    expect(parseMCPConfig('{"servers":{"a":{"command":"node"}}}')).not.toBeNull();
    expect(parseMCPConfig('{bad-json')).toBeNull();
  });

  it('registers/reuses server instances and supports corrected executeMCPTool arguments', async () => {
    const config = { name: 'local', transport: 'stdio' as const, command: 'node' };

    const id1 = await registerMCPServer(config, 'world-a');
    const id2 = await registerMCPServer(config, 'world-b');

    expect(id2).toBe(id1);
    expect(listMCPServers()).toHaveLength(1);
    expect(getMCPServersForWorld('world-a')).toEqual([id1]);
    expect(getMCPServersForWorld('world-b')).toEqual([id1]);
    expect(getMCPRegistryStats()).toMatchObject({
      totalServers: 1,
      runningServers: 1,
      errorServers: 0,
      totalWorlds: 2,
    });

    await executeMCPTool(
      id1,
      'search_agents',
      { limit: '5', mode: 'DESC', optional: null },
      'seq-1',
      'parent-1',
      {
        properties: {
          limit: { type: 'number' },
          mode: { enum: ['asc', 'desc'] },
          optional: { type: 'string' },
        },
        required: ['limit', 'mode'],
      }
    );

    expect(mockClientCallTool).toHaveBeenCalledWith({
      name: 'search_agents',
      arguments: { limit: 5, mode: 'desc' },
    });

    mockClientCallTool.mockResolvedValueOnce({
      isError: true,
      error: { message: 'tool failed', code: 400 },
    });

    await expect(executeMCPTool(id1, 'search_agents', {})).rejects.toThrow('MCP tool error');

    const previousHealth = getMCPServer(id1)?.lastHealthCheck;
    performHealthCheck();
    expect(getMCPServer(id1)?.lastHealthCheck.getTime()).toBeGreaterThanOrEqual(
      previousHealth?.getTime() ?? 0
    );

    expect(await restartMCPServer(id1)).toBe(true);
    expect(mockClientClose).toHaveBeenCalled();
    expect(mockClientConnect).toHaveBeenCalled();
  });

  it('builds world tools with cache hits and supports cache refresh operations', async () => {
    mockGetWorld.mockResolvedValue({
      id: 'world-1',
      mcpConfig: JSON.stringify({
        servers: {
          demo: { command: 'node', args: ['demo.js'] },
        },
      }),
    });
    listToolsPayload.push({
      name: 'lookup',
      description: 'Lookup tool',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    });

    const toolsFirst = await getMCPToolsForWorld('world-1');
    expect(toolsFirst).toHaveProperty('shell_cmd');
    expect(toolsFirst).toHaveProperty('send_message');
    expect(toolsFirst).toHaveProperty('web_fetch');
    expect(toolsFirst).toHaveProperty('write_file');
    expect(toolsFirst).toHaveProperty('demo_lookup');
    expect(mockClientListTools).toHaveBeenCalledTimes(1);

    const toolsSecond = await getMCPToolsForWorld('world-1');
    expect(toolsSecond).toHaveProperty('demo_lookup');
    expect(mockClientListTools).toHaveBeenCalledTimes(1);

    expect(getToolsCacheStats()).toMatchObject({
      totalEntries: 1,
      totalTools: 1,
      cacheSize: 1,
    });

    expect(await refreshServerToolsCache('demo')).toBe(true);
    expect(getToolsCacheStats().totalEntries).toBe(0);

    await getMCPToolsForWorld('world-1');
    expect(mockClientListTools).toHaveBeenCalledTimes(2);

    await clearToolsCache('demo');
    expect(getToolsCacheStats().totalEntries).toBe(0);
  });

  it('reports unhealthy status on failed startup and removes zero-ref servers after timeout', async () => {
    failConnectCommands.add('bad-cmd');

    await expect(
      registerMCPServer(
        { name: 'bad', transport: 'stdio', command: 'bad-cmd' },
        'world-bad'
      )
    ).rejects.toThrow('connect failed: bad-cmd');

    expect(getMCPSystemHealth()).toMatchObject({
      status: 'unhealthy',
      details: {
        totalServers: 1,
        healthyServers: 0,
        unhealthyServers: 1,
      },
    });

    await shutdownAllMCPServers();
    const id = await registerMCPServer(
      { name: 'cleanup', transport: 'stdio', command: 'node' },
      'world-1'
    );
    await registerMCPServer({ name: 'cleanup', transport: 'stdio', command: 'node' }, 'world-2');

    vi.useFakeTimers();
    await unregisterMCPServer(id, 'world-1');
    await unregisterMCPServer(id, 'world-2');
    await vi.advanceTimersByTimeAsync(30000);
    vi.useRealTimers();

    expect(getMCPServer(id)).toBeNull();
    expect(getMCPServersForWorld('world-1')).toEqual([]);
    expect(getMCPServersForWorld('world-2')).toEqual([]);
  });
});
