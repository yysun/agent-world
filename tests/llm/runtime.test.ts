/**
 * LLM Package Runtime Tests
 *
 * Purpose:
 * - Validate the first public runtime slice in `packages/llm`.
 *
 * Key features:
 * - MCP config parsing and normalization.
 * - Ordered skill-root precedence with a mocked filesystem adapter.
 * - Tool registry merge behavior through `createLLMRuntime(...)`.
 *
 * Implementation notes:
 * - Uses a mocked in-memory filesystem adapter for skill-registry coverage.
 * - Exercises the package through its public entrypoint.
 * - Avoids any real filesystem, network, or provider calls.
 *
 * Recent changes:
 * - 2026-03-27: Initial targeted coverage for the new `@agent-world/llm` package.
 * - 2026-03-27: Added runtime-scoped provider configuration regression coverage.
 * - 2026-03-27: Added built-in tool enablement, narrowing, and host-adapter coverage.
 */

import { describe, expect, it } from 'vitest';
import {
  createLLMRuntime,
  parseMCPConfigJson,
  type LLMRuntimeOptions,
  type SkillFileSystemAdapter,
} from '../../packages/llm/src/index.js';

function createMockSkillFileSystem(files: Record<string, string>): SkillFileSystemAdapter {
  const normalizedFiles = new Map(
    Object.entries(files).map(([filePath, content]) => [filePath, content]),
  );

  const directories = new Set<string>();
  for (const filePath of normalizedFiles.keys()) {
    const segments = filePath.split('/').filter(Boolean);
    let current = '';
    for (let index = 0; index < segments.length - 1; index += 1) {
      current += `/${segments[index]}`;
      directories.add(current);
    }
  }

  const makeDirent = (name: string, type: 'file' | 'dir') => ({
    name,
    isDirectory: () => type === 'dir',
    isFile: () => type === 'file',
    isSymbolicLink: () => false,
  });

  return {
    access: async (targetPath) => {
      if (!directories.has(targetPath) && !normalizedFiles.has(targetPath)) {
        throw new Error(`ENOENT: ${targetPath}`);
      }
    },
    readFile: async (targetPath) => {
      const content = normalizedFiles.get(targetPath);
      if (content === undefined) {
        throw new Error(`ENOENT: ${targetPath}`);
      }
      return content;
    },
    readdir: async (targetPath) => {
      const children = new Map<string, 'file' | 'dir'>();
      const prefix = `${targetPath === '/' ? '' : targetPath}/`;

      for (const directory of directories) {
        if (!directory.startsWith(prefix) || directory === targetPath) continue;
        const remainder = directory.slice(prefix.length);
        if (!remainder || remainder.includes('/')) continue;
        children.set(remainder, 'dir');
      }

      for (const filePath of normalizedFiles.keys()) {
        if (!filePath.startsWith(prefix)) continue;
        const remainder = filePath.slice(prefix.length);
        if (!remainder || remainder.includes('/')) continue;
        children.set(remainder, 'file');
      }

      return [...children.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, type]) => makeDirent(name, type));
    },
    realpath: async (targetPath) => targetPath,
    stat: async (targetPath) => ({
      isDirectory: () => directories.has(targetPath),
      isFile: () => normalizedFiles.has(targetPath),
    }),
  };
}

describe('@agent-world/llm runtime', () => {
  it('parses legacy MCP JSON and normalizes mcpServers into servers', () => {
    const config = parseMCPConfigJson(JSON.stringify({
      mcpServers: {
        fetcher: {
          url: 'https://example.com/mcp',
          transport: 'streamable-http',
          headers: {
            Authorization: 'Bearer test',
          },
        },
      },
    }));

    expect(config).toEqual({
      servers: {
        fetcher: {
          url: 'https://example.com/mcp',
          transport: 'streamable-http',
          headers: {
            Authorization: 'Bearer test',
          },
        },
      },
    });
  });

  it('applies later skill roots as higher precedence for duplicate skill ids', async () => {
    const fileSystem = createMockSkillFileSystem({
      '/global/find/SKILL.md': '---\nname: find-skills\ndescription: global description\n---\n# Global',
      '/project/find/SKILL.md': '---\nname: find-skills\ndescription: project description\n---\n# Project',
    });

    const runtime = createLLMRuntime({
      skills: {
        roots: ['/global', '/project'],
        fileSystem,
      },
    });

    const skills = await runtime.getSkillRegistry().listSkills();
    expect(skills).toEqual([
      expect.objectContaining({
        skillId: 'find-skills',
        description: 'project description',
        rootPath: '/project',
      }),
    ]);

    const loadedSkill = await runtime.getSkillRegistry().loadSkill('find-skills');
    expect(loadedSkill?.content).toContain('# Project');
  });

  it('merges constructor-time and per-call extra tools deterministically', () => {
    const runtime = createLLMRuntime({
      tools: {
        builtIns: false,
        extraTools: [
          {
            name: 'project_lookup',
            description: 'Project lookup',
            parameters: { type: 'object' },
          },
        ],
      },
    });

    const resolved = runtime.getToolRegistry().resolveTools([
      {
        name: 'project_write',
        description: 'Project write',
        parameters: { type: 'object' },
      },
      {
        name: 'project_lookup',
        description: 'Override lookup',
        parameters: { type: 'object', override: true },
      },
    ]);

    expect(Object.keys(resolved)).toEqual(['project_lookup', 'project_write']);
    expect(resolved.project_lookup?.description).toBe('Override lookup');
    expect(resolved.project_write?.description).toBe('Project write');
  });

  it('keeps provider configuration isolated per runtime instance', () => {
    const firstRuntime = createLLMRuntime({
      providers: {
        openai: {
          apiKey: 'first-openai-key',
        },
      },
    } satisfies LLMRuntimeOptions);

    const secondRuntime = createLLMRuntime({
      providers: {
        anthropic: {
          apiKey: 'second-anthropic-key',
        },
      },
    } satisfies LLMRuntimeOptions);

    expect(firstRuntime.getProviderConfig('openai')).toEqual({
      apiKey: 'first-openai-key',
    });
    expect(firstRuntime.isProviderConfigured('anthropic')).toBe(false);
    expect(() => secondRuntime.getProviderConfig('openai')).toThrow(
      /No configuration found for openai provider/,
    );

    secondRuntime.configureProvider('openai', {
      apiKey: 'second-openai-key',
    });

    expect(firstRuntime.getProviderConfig('openai')).toEqual({
      apiKey: 'first-openai-key',
    });
    expect(secondRuntime.getProviderConfig('openai')).toEqual({
      apiKey: 'second-openai-key',
    });
  });

  it('accepts constructor-time provider config through the public runtime options', () => {
    const runtime = createLLMRuntime({
      providers: {
        azure: {
          apiKey: 'azure-key',
          resourceName: 'azure-resource',
          deployment: 'gpt-5',
        },
      },
    } satisfies LLMRuntimeOptions);

    expect(runtime.getConfigurationStatus()).toMatchObject({
      azure: true,
    });
    expect(runtime.getProviderConfig('azure')).toEqual({
      apiKey: 'azure-key',
      resourceName: 'azure-resource',
      deployment: 'gpt-5',
    });
  });

  it('includes internal built-ins by default, including HITL pending requests', () => {
    const runtime = createLLMRuntime();

    expect(Object.keys(runtime.getBuiltInTools()).sort()).toEqual([
      'grep',
      'human_intervention_request',
      'list_files',
      'load_skill',
      'read_file',
      'shell_cmd',
      'web_fetch',
      'write_file',
    ]);
  });

  it('supports constructor-time built-in disabling and per-call narrowing', () => {
    const runtime = createLLMRuntime({
      tools: {
        builtIns: {
          shell_cmd: true,
          read_file: true,
          write_file: true,
          list_files: true,
        },
      },
    } satisfies LLMRuntimeOptions);

    expect(Object.keys(runtime.getBuiltInTools()).sort()).toEqual([
      'list_files',
      'read_file',
      'shell_cmd',
      'write_file',
    ].sort());

    const narrowed = runtime.resolveTools({
      enabledBuiltIns: {
        read_file: true,
        list_files: true,
      },
    });

    expect(Object.keys(narrowed)).toEqual(['list_files', 'read_file']);
  });

  it('returns a pending HITL request artifact without requiring an adapter', async () => {
    const runtime = createLLMRuntime();
    const result = await runtime.getBuiltInTools().human_intervention_request?.execute?.({
      question: 'Approve?',
      options: ['Yes', 'No'],
      defaultOption: 'Yes',
    }, {
      toolCallId: 'hitl-call-1',
    });

    expect(result).toContain('"status": "pending"');
    expect(result).toContain('"pending": true');
    expect(result).toContain('"requestId": "hitl-call-1"');
    expect(result).toContain('"defaultOption": "Yes"');
  });

  it('rejects attempts to override reserved built-in tool names', () => {
    expect(() => createLLMRuntime({
      tools: {
        extraTools: [
          {
            name: 'read_file',
            description: 'override',
            parameters: { type: 'object' },
          },
        ],
      },
    } satisfies LLMRuntimeOptions)).toThrow(
      'Tool name "read_file" is reserved by @agent-world/llm built-ins.',
    );
  });

  it('validates and normalizes built-in tool arguments before execution', async () => {
    const runtime = createLLMRuntime();

    const successResult = await runtime.getBuiltInTools().human_intervention_request?.execute?.({
      prompt: 'Continue?',
      options: 'Yes',
      default_option: 'Yes',
    } as any, {
      toolCallId: 'hitl-call-2',
    } as any);

    expect(successResult).toContain('"status": "pending"');
    expect(successResult).toContain('"question": "Continue?"');
    expect(successResult).toContain('"options": [\n    "Yes"\n  ]');
    expect(successResult).toContain('"defaultOption": "Yes"');

    const failureResult = await runtime.getBuiltInTools().human_intervention_request?.execute?.({
      question: 123,
      options: ['Yes'],
    } as any);

    expect(failureResult).toBe(
      "Error: Tool parameter validation failed for human_intervention_request: Parameter 'question' must be a string, got: number",
    );
  });

  it('allows explicit HITL enablement without requiring an adapter', () => {
    const runtime = createLLMRuntime({
      tools: {
        builtIns: {
          human_intervention_request: true,
        },
      },
    } satisfies LLMRuntimeOptions);

    expect(runtime.getBuiltInTools()).toHaveProperty('human_intervention_request');
  });
});
