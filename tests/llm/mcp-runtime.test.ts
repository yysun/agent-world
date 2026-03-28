/**
 * LLM Package MCP Runtime Tests
 *
 * Purpose:
 * - Validate package-owned MCP tool resolution and execution.
 *
 * Key features:
 * - Covers MCP config parsing into executable tools.
 * - Verifies namespaced MCP tool exposure through the runtime async resolution path.
 * - Verifies MCP tool execution is routed through the SDK client wrapper.
 *
 * Implementation notes:
 * - Uses mocked MCP SDK clients/transports with no real process or network activity.
 * - Exercises the public runtime and registry surfaces from `packages/llm`.
 *
 * Recent changes:
 * - 2026-03-27: Initial MCP runtime coverage for the publishable `@agent-world/llm` package.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLLMRuntime } from '../../packages/llm/src/runtime.js';

const {
  mockClientConnect,
  mockClientClose,
  mockClientListTools,
  mockClientCallTool,
  listToolsPayload,
} = vi.hoisted(() => ({
  mockClientConnect: vi.fn(),
  mockClientClose: vi.fn(),
  mockClientListTools: vi.fn(),
  mockClientCallTool: vi.fn(),
  listToolsPayload: [] as any[],
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
    async connect(transport: any) {
      mockClientConnect(transport);
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

describe('@agent-world/llm MCP runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listToolsPayload.length = 0;
    mockClientCallTool.mockResolvedValue({
      content: [{ type: 'text', text: 'mcp-result' }],
    });
  });

  it('resolves executable MCP tools through the package runtime', async () => {
    listToolsPayload.push({
      name: 'lookup',
      description: 'Lookup tool',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    });

    const runtime = createLLMRuntime({
      mcp: {
        config: {
          servers: {
            demo: {
              command: 'node',
              args: ['demo.js'],
              transport: 'stdio',
            },
          },
        },
      },
      tools: {
        builtIns: false,
      },
    });

    const tools = await runtime.resolveToolsAsync();
    expect(Object.keys(tools)).toEqual(['demo_lookup']);

    const result = await tools.demo_lookup?.execute?.({
      query: 'hello',
    });

    expect(result).toBe('mcp-result');
    expect(mockClientConnect).toHaveBeenCalledTimes(1);
    expect(mockClientListTools).toHaveBeenCalledTimes(1);
    expect(mockClientCallTool).toHaveBeenCalledWith({
      name: 'lookup',
      arguments: {
        query: 'hello',
      },
    });

    await runtime.shutdown();
    expect(mockClientClose).toHaveBeenCalledTimes(1);
  });
});
