/**
 * Runtime Tool Boundary Integration Tests
 *
 * Purpose:
 * - Verify executable built-ins resolve through the canonical runtime-backed world resolver.
 *
 * Key Features:
 * - Confirms runtime-reserved built-ins and host extras are exposed from `getRuntimeToolsForWorld(...)`.
 * - Confirms `getMCPToolsForWorld(...)` no longer republishes built-ins when no MCP servers are configured.
 * - Executes a simple runtime-backed `shell_cmd` call through the canonical resolver.
 *
 * Implementation Notes:
 * - Uses `setupTestWorld(...)` for a real world fixture.
 * - Keeps assertions focused on the integration boundary instead of the deleted duplicate implementations.
 *
 * Summary of Recent Changes:
 * - 2026-04-24: Replaced duplicate-surface shell integration coverage with canonical runtime-tool boundary assertions.
 */

import { describe, expect, test } from 'vitest';

import { getRuntimeToolsForWorld } from '../../core/llm-runtime.js';
import { getMCPToolsForWorld } from '../../core/mcp-server-registry.js';
import { LLMProvider } from '../../core/types.js';
import { setupTestWorld } from '../helpers/world-test-setup.js';

describe('runtime tool boundary integration', () => {
  const { worldId, getWorld: getTestWorld } = setupTestWorld({
    name: 'test-world-runtime-tools',
    description: 'Test world for canonical runtime tool resolution',
    turnLimit: 5,
    chatLLMProvider: LLMProvider.OPENAI,
    chatLLMModel: 'gpt-4',
  });

  async function getExecutableTools() {
    return await getRuntimeToolsForWorld(await getTestWorld());
  }

  test('exposes runtime-reserved built-ins and host extras from the canonical resolver', async () => {
    const tools = await getExecutableTools();

    expect(tools).toHaveProperty('shell_cmd');
    expect(tools).toHaveProperty('load_skill');
    expect(tools).toHaveProperty('ask_user_input');
    expect(tools).toHaveProperty('human_intervention_request');
    expect(tools).toHaveProperty('web_fetch');
    expect(tools).toHaveProperty('read_file');
    expect(tools).toHaveProperty('write_file');
    expect(tools).toHaveProperty('list_files');
    expect(tools).toHaveProperty('grep');
    expect(tools).toHaveProperty('create_agent');
    expect(tools).toHaveProperty('send_message');
  });

  test('keeps the MCP registry free of built-in duplicates when no MCP servers are configured', async () => {
    const tools = await getMCPToolsForWorld(worldId());

    expect(tools).not.toHaveProperty('shell_cmd');
    expect(tools).not.toHaveProperty('load_skill');
    expect(tools).not.toHaveProperty('ask_user_input');
    expect(tools).not.toHaveProperty('human_intervention_request');
    expect(tools).not.toHaveProperty('web_fetch');
    expect(tools).not.toHaveProperty('read_file');
    expect(tools).not.toHaveProperty('write_file');
    expect(tools).not.toHaveProperty('list_files');
    expect(tools).not.toHaveProperty('grep');
    expect(tools).not.toHaveProperty('create_agent');
    expect(tools).not.toHaveProperty('send_message');
    expect(Object.keys(tools)).toHaveLength(0);
  });

  test('executes shell_cmd through the canonical runtime-backed resolver', async () => {
    const tools = await getExecutableTools();
    const token = 'runtime-tool-boundary';

    const result = await tools.shell_cmd.execute(
      {
        command: 'printf',
        parameters: [token],
      },
      undefined,
      undefined,
      {
        workingDirectory: process.cwd(),
      },
    );

    expect(typeof result).toBe('string');
    expect(String(result)).toContain('Exit code 0');
    expect(String(result)).toContain(token);
  });
});