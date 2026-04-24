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
 *
 * Recent changes:
 * - 2026-04-24: Updated registry coverage to assert that only MCP-discovered tools are exposed; executable built-ins now resolve through `llm-runtime`.
 * - 2026-03-29: Removed temporary package-backed HITL bridge coverage after restoring core-owned built-ins.
 * - 2026-03-17: Added remote MCP header validation, transport propagation, and registry-isolation coverage.
 * - 2026-03-05: Added deterministic MCP tool-discovery timeout coverage for hanging `listTools()` calls.
 * - 2026-03-05: Added MCP execution reconnect-retry coverage for chat-scoped retry status emissions and retry-exhaustion error mapping.
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

vi.mock('../../core/send-message-tool.js', () => ({
  createSendMessageToolDefinition: vi.fn(() => ({
    description: 'send-message',
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
  refreshServerToolsCache,
  registerMCPServer,
  restartMCPServer,
  mcpToolsToAiTools,
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
        remote: {
          type: 'http',
          url: 'https://example.com/mcp',
          headers: { Authorization: 'Bearer token' },
        },
      },
    });
    expect(parsedLegacy[0]).toMatchObject({
      name: 'remote',
      transport: 'streamable-http',
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer token' },
    });

    expect(
      validateMCPConfig({
        servers: {
          local: { command: 'node', args: ['server.js'] },
          remote: {
            transport: 'sse',
            url: 'https://example.com/sse',
            headers: { 'X-Goog-Api-Key': 'secret-key' },
          },
        },
      })
    ).toBe(true);
    expect(validateMCPConfig({ servers: { bad: { transport: 'invalid', command: 'x' } } })).toBe(
      false
    );
    expect(
      validateMCPConfig({
        servers: {
          badHeaders: { transport: 'streamable-http', url: 'https://example.com/mcp', headers: [] },
        },
      })
    ).toBe(false);
    expect(
      validateMCPConfig({
        servers: {
          badHeaderValue: {
            transport: 'streamable-http',
            url: 'https://example.com/mcp',
            headers: { Authorization: 123 },
          },
        },
      })
    ).toBe(false);
    expect(
      validateMCPConfig({
        servers: {
          emptyHeaderName: {
            transport: 'streamable-http',
            url: 'https://example.com/mcp',
            headers: { '   ': 'value' },
          },
        },
      })
    ).toBe(false);
    expect(parseMCPConfig('{"servers":{"a":{"command":"node"}}}')).not.toBeNull();
    expect(
      parseMCPConfig(
        '{"mcpServers":{"stitch":{"url":"https://stitch.googleapis.com/mcp","headers":{"X-Goog-Api-Key":"key"}}}}'
      )
    ).toEqual({
      mcpServers: {
        stitch: {
          url: 'https://stitch.googleapis.com/mcp',
          headers: { 'X-Goog-Api-Key': 'key' },
        },
      },
    });
    expect(parseMCPConfig('{bad-json')).toBeNull();
  });

  it('passes configured headers into remote transport connections and isolates same-url servers by header set', async () => {
    const firstId = await registerMCPServer(
      {
        name: 'stitch',
        transport: 'streamable-http',
        url: 'https://stitch.googleapis.com/mcp',
        headers: { 'X-Goog-Api-Key': 'key-a' },
      },
      'world-a'
    );

    const secondId = await registerMCPServer(
      {
        name: 'stitch',
        transport: 'streamable-http',
        url: 'https://stitch.googleapis.com/mcp',
        headers: { 'X-Goog-Api-Key': 'key-b' },
      },
      'world-b'
    );

    expect(firstId).not.toBe(secondId);
    expect(listMCPServers()).toHaveLength(2);
    expect(mockClientConnect).toHaveBeenCalledTimes(2);

    const firstTransport = mockClientConnect.mock.calls[0]?.[0];
    const secondTransport = mockClientConnect.mock.calls[1]?.[0];

    expect(firstTransport?.options?.requestInit?.headers).toEqual({ 'X-Goog-Api-Key': 'key-a' });
    expect(secondTransport?.options?.requestInit?.headers).toEqual({ 'X-Goog-Api-Key': 'key-b' });
  });

  it('times out hanging MCP tool discovery with deterministic error', async () => {
    vi.useFakeTimers();
    try {
      const hangingClientRef = {
        current: {
          listTools: vi.fn(() => new Promise(() => { })),
        },
      } as any;

      const pending = mcpToolsToAiTools(
        hangingClientRef,
        {
          name: 'timeout-server',
          transport: 'stdio',
          command: 'node',
        } as any,
        vi.fn(async () => undefined)
      );
      const observedError = pending.then(
        () => null,
        (error) => error as Error,
      );

      await vi.advanceTimersByTimeAsync(5000);
      const timeoutError = await observedError;
      expect(timeoutError).toBeInstanceOf(Error);
      expect(timeoutError?.message).toMatch(/MCP tool discovery timeout after/);
    } finally {
      vi.useRealTimers();
    }
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

    expect(await restartMCPServer(id1)).toBe(true);
    expect(mockClientClose).toHaveBeenCalled();
    expect(mockClientConnect).toHaveBeenCalled();
    expect(getMCPServer(id1)?.lastHealthCheck.getTime()).toBeGreaterThanOrEqual(
      previousHealth?.getTime() ?? 0
    );
  });

  it('retries AI-converted MCP tool execution with chat-scoped retry status updates', async () => {
    vi.useFakeTimers();
    try {
      const callTool = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNRESET: socket hang up'))
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'retried-ok' }],
        });

      const clientRef = {
        current: {
          listTools: vi.fn().mockResolvedValue({
            tools: [{
              name: 'lookup',
              description: 'Lookup',
              inputSchema: {
                type: 'object',
                properties: { query: { type: 'string' } },
                required: ['query'],
              },
            }],
          }),
          callTool,
        },
        reconnecting: null,
      } as any;

      const reconnectClient = vi.fn().mockResolvedValue(undefined);
      const aiTools = await mcpToolsToAiTools(
        clientRef,
        { name: 'demo', transport: 'stdio', command: 'node' } as any,
        reconnectClient,
      );

      const world = {
        id: 'world-1',
        currentChatId: 'chat-1',
        eventEmitter: { emit: vi.fn() },
      } as any;

      const pending = aiTools.demo_lookup.execute(
        { query: 'hello' },
        'seq-1',
        'parent-1',
        { world, chatId: 'chat-1', worldId: 'world-1', agentId: 'agent-1' },
      );

      await vi.advanceTimersByTimeAsync(0);
      expect(world.eventEmitter.emit).toHaveBeenCalledWith(
        'system',
        expect.objectContaining({
          chatId: 'chat-1',
          content: expect.stringContaining('attempt 1/2'),
        }),
      );
      expect(world.eventEmitter.emit).toHaveBeenCalledWith(
        'system',
        expect.objectContaining({
          chatId: 'chat-1',
          content: expect.stringContaining('remaining attempts 1'),
        }),
      );

      await vi.advanceTimersByTimeAsync(1000);
      await expect(pending).resolves.toBe('retried-ok');
      expect(reconnectClient).toHaveBeenCalledTimes(1);
      expect(callTool).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not emit retry status when explicit chatId is missing', async () => {
    vi.useFakeTimers();
    try {
      const callTool = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNRESET: socket hang up'))
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'retried-ok' }],
        });

      const clientRef = {
        current: {
          listTools: vi.fn().mockResolvedValue({
            tools: [{
              name: 'lookup',
              description: 'Lookup',
              inputSchema: {
                type: 'object',
                properties: { query: { type: 'string' } },
                required: ['query'],
              },
            }],
          }),
          callTool,
        },
        reconnecting: null,
      } as any;

      const reconnectClient = vi.fn().mockResolvedValue(undefined);
      const aiTools = await mcpToolsToAiTools(
        clientRef,
        { name: 'demo', transport: 'stdio', command: 'node' } as any,
        reconnectClient,
      );

      const world = {
        id: 'world-1',
        currentChatId: 'chat-1',
        eventEmitter: { emit: vi.fn() },
      } as any;

      const pending = aiTools.demo_lookup.execute(
        { query: 'hello' },
        'seq-1',
        'parent-1',
        { world, worldId: 'world-1', agentId: 'agent-1' },
      );

      await vi.advanceTimersByTimeAsync(1000);
      await expect(pending).resolves.toBe('retried-ok');
      expect(world.eventEmitter.emit).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('maps transport retry exhaustion to deterministic MCP retry-exhausted error', async () => {
    vi.useFakeTimers();
    try {
      const callTool = vi
        .fn()
        .mockRejectedValue(new Error('ECONNRESET: still broken'));

      const clientRef = {
        current: {
          listTools: vi.fn().mockResolvedValue({
            tools: [{
              name: 'lookup',
              description: 'Lookup',
              inputSchema: {
                type: 'object',
                properties: { query: { type: 'string' } },
                required: ['query'],
              },
            }],
          }),
          callTool,
        },
        reconnecting: null,
      } as any;

      const reconnectClient = vi.fn().mockResolvedValue(undefined);
      const aiTools = await mcpToolsToAiTools(
        clientRef,
        { name: 'demo', transport: 'stdio', command: 'node' } as any,
        reconnectClient,
      );

      const pending = aiTools.demo_lookup.execute({ query: 'hello' });
      const observedError = pending.then(
        () => null,
        (error: unknown) => error as Error & { code?: string; category?: string },
      );
      await vi.advanceTimersByTimeAsync(1000);
      const retryExhaustedError = await observedError;
      expect(retryExhaustedError).toMatchObject({
        name: 'MCPRetryExhaustedError',
        code: 'MCP_RETRY_EXHAUSTED',
        category: 'retry_exhausted',
      });
      expect(callTool).toHaveBeenCalledTimes(2);
      expect(reconnectClient).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
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
    expect(toolsFirst).not.toHaveProperty('shell_cmd');
    expect(toolsFirst).not.toHaveProperty('load_skill');
    expect(toolsFirst).not.toHaveProperty('human_intervention_request');
    expect(toolsFirst).not.toHaveProperty('ask_user_input');
    expect(toolsFirst).not.toHaveProperty('send_message');
    expect(toolsFirst).not.toHaveProperty('web_fetch');
    expect(toolsFirst).not.toHaveProperty('write_file');
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
