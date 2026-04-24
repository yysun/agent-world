/**
 * LLM Runtime Rich Tool Override Tests
 *
 * Purpose:
 * - Verify runtime-owned rich built-ins execute through Agent World's internal host seams.
 *
 * Key Features:
 * - Confirms `getRuntimeToolsForWorld(...)` preserves llm-runtime tool registration while overriding execution for `shell_cmd`, `web_fetch`, `load_skill`, and `write_file`.
 * - Confirms the raw llm-runtime executors are not invoked once the host override layer is applied.
 *
 * Implementation Notes:
 * - Mocks the external llm-runtime package and the extracted host helper modules.
 * - Keeps assertions focused on tool-resolution behavior only.
 *
 * Summary of Recent Changes:
 * - 2026-04-24: Added regression coverage for private rich-tool execution overrides inside `getRuntimeToolsForWorld(...)`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveTools: vi.fn(),
  resolveToolsAsync: vi.fn(),
  executeShellCmdWithHostSemantics: vi.fn(async () => 'shell-host-result'),
  executeWebFetchWithHostSemantics: vi.fn(async () => 'web-host-result'),
  executeLoadSkillWithHostSemantics: vi.fn(async () => 'load-host-result'),
  executeWriteFileWithHostSemantics: vi.fn(async () => 'write-host-result'),
}));

vi.mock('llm-runtime', () => ({
  clearAllConfiguration: vi.fn(),
  configureLLMProvider: vi.fn(),
  generate: vi.fn(),
  getConfiguredProviders: vi.fn(() => []),
  getConfigurationStatus: vi.fn(() => ({})),
  getLLMProviderConfig: vi.fn(() => ({ apiKey: 'test-key' })),
  isProviderConfigured: vi.fn(() => false),
  parseMCPConfigJson: vi.fn(() => null),
  resolveTools: mocks.resolveTools,
  resolveToolsAsync: mocks.resolveToolsAsync,
  stream: vi.fn(),
  validateProviderConfig: vi.fn(),
}));

vi.mock('../../core/shell-cmd-tool.js', () => ({
  executeShellCmdWithHostSemantics: mocks.executeShellCmdWithHostSemantics,
}));

vi.mock('../../core/web-fetch-tool.js', () => ({
  executeWebFetchWithHostSemantics: mocks.executeWebFetchWithHostSemantics,
}));

vi.mock('../../core/load-skill-tool.js', () => ({
  executeLoadSkillWithHostSemantics: mocks.executeLoadSkillWithHostSemantics,
}));

vi.mock('../../core/file-tools.js', () => ({
  executeWriteFileWithHostSemantics: mocks.executeWriteFileWithHostSemantics,
}));

import { getRuntimeToolsForWorld } from '../../core/llm-runtime.js';

function createWorld() {
  return {
    id: 'world-1',
    variables: '',
    mcpConfig: null,
  } as any;
}

describe('llm-runtime rich tool execution overrides', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes rich runtime-owned tool execution through extracted host helpers', async () => {
    const rawShellExecute = vi.fn(async () => 'raw-shell-result');
    const rawWebExecute = vi.fn(async () => 'raw-web-result');
    const rawLoadExecute = vi.fn(async () => 'raw-load-result');
    const rawWriteExecute = vi.fn(async () => 'raw-write-result');

    mocks.resolveToolsAsync.mockResolvedValue({
      shell_cmd: {
        name: 'shell_cmd',
        description: 'runtime shell',
        parameters: { type: 'object' },
        execute: rawShellExecute,
      },
      web_fetch: {
        name: 'web_fetch',
        description: 'runtime web fetch',
        parameters: { type: 'object' },
        execute: rawWebExecute,
      },
      load_skill: {
        name: 'load_skill',
        description: 'runtime load skill',
        parameters: { type: 'object' },
        execute: rawLoadExecute,
      },
      write_file: {
        name: 'write_file',
        description: 'runtime write file',
        parameters: { type: 'object' },
        execute: rawWriteExecute,
      },
      ask_user_input: {
        name: 'ask_user_input',
        description: 'runtime ask',
        parameters: { type: 'object' },
      },
    });

    const tools = await getRuntimeToolsForWorld(createWorld());

    const shellContext = { sequenceId: 'seq-1', parentToolCallId: 'parent-1', chatId: 'chat-1' } as any;
    await expect(tools.shell_cmd?.execute?.({ command: 'echo' }, shellContext)).resolves.toBe('shell-host-result');
    await expect(tools.web_fetch?.execute?.({ url: 'https://example.com' }, { chatId: 'chat-1' } as any)).resolves.toBe('web-host-result');
    await expect(tools.load_skill?.execute?.({ skill_id: 'find-skills' }, { chatId: 'chat-1' } as any)).resolves.toBe('load-host-result');
    await expect(tools.write_file?.execute?.({ filePath: 'out.txt', content: 'hello' }, { chatId: 'chat-1' } as any)).resolves.toBe('write-host-result');

    expect(mocks.executeShellCmdWithHostSemantics).toHaveBeenCalledWith({ command: 'echo' }, 'seq-1', 'parent-1', shellContext);
    expect(mocks.executeWebFetchWithHostSemantics).toHaveBeenCalledWith({ url: 'https://example.com' }, expect.objectContaining({ chatId: 'chat-1' }));
    expect(mocks.executeLoadSkillWithHostSemantics).toHaveBeenCalledWith({ skill_id: 'find-skills' }, expect.objectContaining({ chatId: 'chat-1' }));
    expect(mocks.executeWriteFileWithHostSemantics).toHaveBeenCalledWith({ filePath: 'out.txt', content: 'hello' }, expect.objectContaining({ chatId: 'chat-1' }));

    expect(rawShellExecute).not.toHaveBeenCalled();
    expect(rawWebExecute).not.toHaveBeenCalled();
    expect(rawLoadExecute).not.toHaveBeenCalled();
    expect(rawWriteExecute).not.toHaveBeenCalled();
    expect(tools.ask_user_input?.name).toBe('ask_user_input');
  });
});