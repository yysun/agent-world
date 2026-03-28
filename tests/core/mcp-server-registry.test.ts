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
  mockCreateLLMRuntime,
  mockPackageShellExecute,
  mockPackageLoadSkillExecute,
  mockPackageWebFetchExecute,
  mockPackageReadFileExecute,
  mockPackageWriteFileExecute,
  mockRequestWorldOption,
  failConnectCommands,
  listToolsPayload,
} = vi.hoisted(() => ({
  mockGetWorld: vi.fn(),
  mockClientConnect: vi.fn(),
  mockClientClose: vi.fn(),
  mockClientCallTool: vi.fn(),
  mockClientListTools: vi.fn(),
  mockCreateLLMRuntime: vi.fn((options?: any) => {
    const allBuiltIns = {
      human_intervention_request: {
        name: 'human_intervention_request',
        description: 'pkg-hitl',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn(async (args: any, context: any) => JSON.stringify({
          ok: false,
          pending: true,
          status: 'pending',
          confirmed: false,
          requestId: String(context?.toolCallId || ''),
          selectedOption: null,
          question: String(args?.question || ''),
          options: Array.isArray(args?.options) ? args.options : [],
        })),
      },
      shell_cmd: {
        name: 'shell_cmd',
        description: 'pkg-shell',
        parameters: { type: 'object', properties: {} },
        execute: mockPackageShellExecute,
      },
      load_skill: {
        name: 'load_skill',
        description: 'pkg-load-skill',
        parameters: { type: 'object', properties: {} },
        execute: mockPackageLoadSkillExecute,
      },
      read_file: {
        name: 'read_file',
        description: 'pkg-read',
        parameters: { type: 'object', properties: {} },
        execute: mockPackageReadFileExecute,
      },
      write_file: {
        name: 'write_file',
        description: 'pkg-write',
        parameters: { type: 'object', properties: {} },
        execute: mockPackageWriteFileExecute,
      },
      list_files: {
        name: 'list_files',
        description: 'pkg-list',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn(),
      },
      grep: {
        name: 'grep',
        description: 'pkg-grep',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn(),
      },
      web_fetch: {
        name: 'web_fetch',
        description: 'pkg-web-fetch',
        parameters: { type: 'object', properties: {} },
        execute: mockPackageWebFetchExecute,
      },
    } as Record<string, any>;

    const enabledBuiltIns = options?.tools?.builtIns;

    return {
      getBuiltInTools: () => Object.fromEntries(
        Object.entries(allBuiltIns).filter(([name]) => enabledBuiltIns?.[name] !== false),
      ),
    };
  }),
  mockPackageShellExecute: vi.fn(async () => '{"ok":true,"tool":"shell_cmd"}'),
  mockPackageLoadSkillExecute: vi.fn(async () => '<skill_context id="demo"></skill_context>'),
  mockPackageWebFetchExecute: vi.fn(async () => '{"ok":true,"tool":"web_fetch"}'),
  mockPackageReadFileExecute: vi.fn(async () => '{"ok":true}'),
  mockPackageWriteFileExecute: vi.fn(async () => '{"ok":true,"tool":"write_file"}'),
  mockRequestWorldOption: vi.fn(),
  failConnectCommands: new Set<string>(),
  listToolsPayload: [] as any[],
}));

vi.mock('../../core/managers.js', () => ({
  getWorld: mockGetWorld,
}));

vi.mock('@agent-world/llm', () => ({
  createLLMRuntime: mockCreateLLMRuntime,
}));

vi.mock('../../core/hitl.js', () => ({
  requestWorldOption: mockRequestWorldOption,
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
    mockRequestWorldOption.mockResolvedValue({
      requestId: 'tool-hitl-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      optionId: 'opt_1',
      source: 'user',
    });
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
    performHealthCheck();
    expect(getMCPServer(id1)?.lastHealthCheck.getTime()).toBeGreaterThanOrEqual(
      previousHealth?.getTime() ?? 0
    );

    expect(await restartMCPServer(id1)).toBe(true);
    expect(mockClientClose).toHaveBeenCalled();
    expect(mockClientConnect).toHaveBeenCalled();
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
    expect(toolsFirst).toHaveProperty('shell_cmd');
    expect(toolsFirst).toHaveProperty('load_skill');
    expect(toolsFirst).toHaveProperty('human_intervention_request');
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

  it('bridges only the package-owned hitl built-in through the core execute signature', async () => {
    mockGetWorld.mockResolvedValue({
      id: 'world-1',
      variables: 'working_directory=/repo',
      mcpConfig: null,
    });

    const tools = await getMCPToolsForWorld('world-1');
    const toolContext = {
      world: {
        id: 'world-1',
        variables: 'working_directory=/repo',
      },
      chatId: 'chat-1',
      toolCallId: 'tool-hitl-1',
      agentName: 'assistant',
    };

    expect(mockCreateLLMRuntime).toHaveBeenCalledWith(expect.objectContaining({
      tools: {
        builtIns: {
          shell_cmd: false,
          load_skill: false,
          web_fetch: false,
          read_file: false,
          write_file: false,
          list_files: false,
          grep: false,
          human_intervention_request: true,
        },
      },
    }));
    const result = await tools.human_intervention_request.execute(
      { question: 'Approve?', options: ['Yes', 'No'] },
      undefined,
      undefined,
      toolContext,
    );

    expect(JSON.parse(result)).toMatchObject({
      ok: true,
      status: 'confirmed',
      confirmed: true,
      selectedOption: 'Yes',
      requestId: 'tool-hitl-1',
    });
    expect(mockRequestWorldOption).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'world-1' }),
      expect.objectContaining({
        requestId: 'tool-hitl-1',
        message: 'Approve?',
        chatId: 'chat-1',
        options: [
          { id: 'opt_1', label: 'Yes' },
          { id: 'opt_2', label: 'No' },
        ],
      }),
    );
  });

  it('keeps shell, load-skill, web-fetch, and write-file on the core-owned built-ins', async () => {
    mockGetWorld.mockResolvedValue({
      id: 'world-1',
      variables: 'working_directory=/repo',
      mcpConfig: null,
    });

    const tools = await getMCPToolsForWorld('world-1');
    const toolContext = {
      world: {
        id: 'world-1',
        variables: 'working_directory=/repo',
      },
      chatId: 'chat-1',
      workingDirectory: '/repo',
      toolCallId: 'tool-1',
    };

    await tools.shell_cmd.execute({ command: 'pwd' }, undefined, undefined, toolContext);
    await tools.load_skill.execute({ skill_id: 'demo' }, undefined, undefined, toolContext);
    await tools.web_fetch.execute({ url: 'https://example.com' }, undefined, undefined, toolContext);
    await tools.write_file.execute(
      { filePath: 'notes.txt', content: 'hello' },
      undefined,
      undefined,
      toolContext,
    );

    expect(mockPackageShellExecute).not.toHaveBeenCalled();
    expect(mockPackageLoadSkillExecute).not.toHaveBeenCalled();
    expect(mockPackageWebFetchExecute).not.toHaveBeenCalled();
    expect(mockPackageWriteFileExecute).not.toHaveBeenCalled();
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
