/**
 * LLM Package Mocked Showcase Suite
 *
 * Purpose:
 * - Provide a mocked feature-tour suite for the `@agent-world/llm` package surface.
 *
 * Key features:
 * - Demonstrates package-owned built-ins, skills, MCP, and provider dispatch.
 * - Uses descriptive test names so terminal output reads like a feature tour.
 * - Runs with mocks only; no real network, filesystem, or provider traffic.
 *
 * Implementation notes:
 * - This suite complements the real e2e showcase runner under `tests/e2e`.
 * - Each test exercises one major user-facing capability of the package with no live provider traffic.
 *
 * Recent changes:
 * - 2026-03-27: Initial terminal showcase suite for `@agent-world/llm`.
 * - 2026-03-27: Re-labeled as the mocked showcase after adding the real e2e showcase runner.
 */

import { describe, expect, it, vi } from 'vitest';

const {
  mockCreateClientForProvider,
  mockGenerateOpenAIResponse,
  mockClientConnect,
  mockClientListTools,
  mockClientCallTool,
  listToolsPayload,
} = vi.hoisted(() => ({
  mockCreateClientForProvider: vi.fn(() => ({ client: 'openai' })),
  mockGenerateOpenAIResponse: vi.fn(async (request: any) => ({
    type: 'text',
    content: 'showcase-generated',
    assistantMessage: {
      role: 'assistant',
      content: `resolved:${Object.keys(request.tools || {}).join(',')}`,
    },
  })),
  mockClientConnect: vi.fn(),
  mockClientListTools: vi.fn(),
  mockClientCallTool: vi.fn(async () => ({
    content: [{ type: 'text', text: 'showcase-mcp-result' }],
  })),
  listToolsPayload: [] as any[],
}));

vi.mock('../../packages/llm/src/openai-direct.js', async () => {
  const actual = await vi.importActual('../../packages/llm/src/openai-direct.js');
  return {
    ...(actual as object),
    createClientForProvider: mockCreateClientForProvider,
    generateOpenAIResponse: mockGenerateOpenAIResponse,
  };
});

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
      mockCreateClientForProvider();
      mockClientConnect(transport);
    }

    async close() {
      return undefined;
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

describe('@agent-world/llm mocked showcase', () => {
  it('showcases built-in tools and skill loading through one runtime', async () => {
    const { createLLMRuntime } = await import('../../packages/llm/src/runtime.js');

    const runtime = createLLMRuntime({
      skills: {
        roots: ['/global', '/project'],
        fileSystem: {
          access: async () => undefined,
          readFile: async (targetPath: string) => targetPath.includes('/project/')
            ? '---\nname: find-skills\ndescription: Project skill\n---\n# Project Skill'
            : '---\nname: find-skills\ndescription: Global skill\n---\n# Global Skill',
          readdir: async (targetPath: string) => {
            if (targetPath === '/global') {
              return [{ name: 'find', isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false }];
            }
            if (targetPath === '/global/find') {
              return [{ name: 'SKILL.md', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }];
            }
            if (targetPath === '/project') {
              return [{ name: 'find', isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false }];
            }
            if (targetPath === '/project/find') {
              return [{ name: 'SKILL.md', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }];
            }
            return [];
          },
          realpath: async (targetPath: string) => targetPath,
          stat: async (targetPath: string) => ({
            isDirectory: () => !targetPath.endsWith('SKILL.md'),
            isFile: () => targetPath.endsWith('SKILL.md'),
          }),
        },
      },
    });

    const builtIns = runtime.getBuiltInTools();
    const skill = await runtime.getSkillRegistry().loadSkill('find-skills');

    expect(Object.keys(builtIns)).toContain('load_skill');
    expect(skill?.description).toBe('Project skill');
    expect(skill?.content).toContain('# Project Skill');
  });

  it('showcases MCP tool discovery and execution through the package runtime', async () => {
    listToolsPayload.length = 0;
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

    const { createLLMRuntime } = await import('../../packages/llm/src/runtime.js');
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
    const result = await tools.demo_lookup?.execute?.({ query: 'hello' });

    expect(Object.keys(tools)).toContain('demo_lookup');
    expect(result).toBe('showcase-mcp-result');
  });

  it('showcases provider generation with built-ins and MCP tools merged into one call', async () => {
    listToolsPayload.length = 0;
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

    const { createLLMRuntime } = await import('../../packages/llm/src/runtime.js');
    const runtime = createLLMRuntime({
      providers: {
        openai: {
          apiKey: 'test-openai-key',
        },
      },
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
        builtIns: {
          read_file: true,
        },
      },
    });

    const response = await runtime.generate({
      provider: 'openai',
      model: 'gpt-5',
      messages: [
        {
          role: 'user',
          content: 'Summarize the repo',
        },
      ],
    });

    expect(response.content).toBe('showcase-generated');
    expect(mockGenerateOpenAIResponse).toHaveBeenCalledWith(expect.objectContaining({
      tools: expect.objectContaining({
        read_file: expect.any(Object),
        demo_lookup: expect.any(Object),
      }),
    }));
  });
});
