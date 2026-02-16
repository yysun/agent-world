/**
 * Shell Command Tool Integration Tests
 * Tests for shell_cmd built-in tool integration with worlds
 * 
 * Features tested:
 * - shell_cmd tool availability in all worlds
 * - load_skill built-in tool availability in all worlds
 * - read_file/list_files/grep built-in tool availability in all worlds
 * - Tool schema and parameter validation
 * - Command execution through tool interface
 * - Error handling and reporting
 * - Execution history persistence
 *
 * Implementation notes:
 * - Uses setupTestWorld helper for consistent world fixture setup.
 * - Executes real local shell commands and validates formatted tool output.
 * 
 * Changes:
 * - 2026-02-16: Added integration assertions for built-in `read_file`, `list_files`, and `grep` tools.
 * - 2026-02-15: Added `output_format=json` integration coverage and artifact hashing metadata assertions.
 * - 2026-02-14: Added assertion that built-in `load_skill` tool is registered alongside `shell_cmd`.
 * - 2026-02-14: Updated unresolved-cwd fallback test to reflect core default working directory behavior (user home fallback) instead of `./`.
 * - 2026-02-14: Added hard-fail coverage for inline script execution (`sh -c`) and short-option path prefixes (`-I/path`) outside world working_directory.
 * - 2026-02-14: Added hard-fail coverage for path-escape argument forms (`./../../...` and `--flag=/...`) against world working_directory.
 * - 2025-11-07: Refactored to use setupTestWorld helper (test deduplication initiative)
 * - 2026-02-13: Updated mismatch coverage: mismatched LLM `directory` and out-of-scope path arguments now hard-fail against world `working_directory`.
 */

import { describe, test, expect } from 'vitest';
import { fileURLToPath } from 'url';
import { getWorld } from '../../core/managers.js';
import { getMCPToolsForWorld } from '../../core/mcp-server-registry.js';
import { LLMProvider } from '../../core/types.js';
import { setupTestWorld } from '../helpers/world-test-setup.js';
import { clearExecutionHistory, getExecutionHistory } from '../../core/shell-cmd-tool.js';

describe('shell_cmd integration with worlds', () => {
  const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));

  const { worldId, getWorld: getTestWorld } = setupTestWorld({
    name: 'test-world-shell-cmd',
    description: 'Test world for shell_cmd tool',
    turnLimit: 5,
    chatLLMProvider: LLMProvider.OPENAI,
    chatLLMModel: 'gpt-4'
  });

  test('should include shell_cmd tool in all worlds', async () => {
    const tools = await getMCPToolsForWorld(worldId());

    // Verify shell_cmd tool is present
    expect(tools).toHaveProperty('shell_cmd');
    expect(tools.shell_cmd).toBeDefined();
    expect(tools.shell_cmd.description).toBeDefined();
    expect(tools.shell_cmd.parameters).toBeDefined();
    expect(tools.shell_cmd.execute).toBeInstanceOf(Function);

    expect(tools).toHaveProperty('load_skill');
    expect(tools.load_skill).toBeDefined();
    expect(tools.load_skill.parameters).toBeDefined();
    expect(tools.load_skill.execute).toBeInstanceOf(Function);

    expect(tools).toHaveProperty('read_file');
    expect(tools.read_file).toBeDefined();
    expect(tools.read_file.parameters).toBeDefined();
    expect(tools.read_file.execute).toBeInstanceOf(Function);

    expect(tools).toHaveProperty('list_files');
    expect(tools.list_files).toBeDefined();
    expect(tools.list_files.parameters).toBeDefined();
    expect(tools.list_files.execute).toBeInstanceOf(Function);

    expect(tools).toHaveProperty('grep');
    expect(tools.grep).toBeDefined();
    expect(tools.grep.parameters).toBeDefined();
    expect(tools.grep.execute).toBeInstanceOf(Function);

    // Backward compatibility alias
    expect(tools).toHaveProperty('grep_search');
    expect(tools.grep_search).toBeDefined();
  });

  test('should execute read_file, list_files, and grep tools through tool interface', async () => {
    const tools = await getMCPToolsForWorld(worldId());
    const testWorkingDirectory = process.cwd();

    const readResultRaw = await tools.read_file.execute({
      filePath: 'package.json',
      offset: 1,
      limit: 5,
    }, undefined, undefined, { workingDirectory: testWorkingDirectory });
    if (typeof readResultRaw === 'string' && readResultRaw.startsWith('Error:')) {
      throw new Error(readResultRaw);
    }
    const readResult = JSON.parse(readResultRaw);
    expect(readResult).toHaveProperty('filePath');
    expect(readResult).toHaveProperty('content');
    expect(typeof readResult.content).toBe('string');
    expect(readResult).toHaveProperty('offset', 1);
    expect(readResult).toHaveProperty('limit', 5);

    const listResultRaw = await tools.list_files.execute({
      path: 'core',
    }, undefined, undefined, { workingDirectory: testWorkingDirectory });
    if (typeof listResultRaw === 'string' && listResultRaw.startsWith('Error:')) {
      throw new Error(listResultRaw);
    }
    const listResult = JSON.parse(listResultRaw);
    expect(listResult).toHaveProperty('entries');
    expect(Array.isArray(listResult.entries)).toBe(true);
    expect(listResult).toHaveProperty('path');

    const grepResultRaw = await tools.grep.execute({
      query: 'createShellCmdToolDefinition',
      isRegexp: false,
      directoryPath: 'core',
      includePattern: '**/*.ts',
      maxResults: 10,
    }, undefined, undefined, { workingDirectory: testWorkingDirectory });
    if (typeof grepResultRaw === 'string' && grepResultRaw.startsWith('Error:')) {
      throw new Error(grepResultRaw);
    }
    const grepResult = JSON.parse(grepResultRaw);
    expect(grepResult).toHaveProperty('matches');
    expect(Array.isArray(grepResult.matches)).toBe(true);
    expect(grepResult).toHaveProperty('query', 'createShellCmdToolDefinition');
  });

  test('should reject file tool paths outside world working_directory', async () => {
    const tools = await getMCPToolsForWorld(worldId());
    const restrictedContext = {
      world: {
        id: worldId(),
        variables: 'working_directory=/tmp/project',
      },
    };

    const readResultRaw = await tools.read_file.execute(
      { filePath: '../../etc/passwd', offset: 1, limit: 1 },
      undefined,
      undefined,
      restrictedContext,
    );
    expect(readResultRaw).toContain('Working directory mismatch');

    const listResultRaw = await tools.list_files.execute(
      { path: '../../etc' },
      undefined,
      undefined,
      restrictedContext,
    );
    expect(listResultRaw).toContain('Working directory mismatch');

    const grepResultRaw = await tools.grep.execute(
      { query: 'root', directoryPath: '../../etc', isRegexp: false },
      undefined,
      undefined,
      restrictedContext,
    );
    expect(grepResultRaw).toContain('Working directory mismatch');
  });

  test('should execute load_skill tool through tool interface', async () => {
    const tools = await getMCPToolsForWorld(worldId());
    const loadSkillTool = tools.load_skill;

    const result = await loadSkillTool.execute({
      skill_id: '__missing_skill_for_integration_test__'
    });

    expect(result).toContain('<skill_context id="__missing_skill_for_integration_test__">');
    expect(result).toContain('not found');
  });

  test('should have correct tool schema', async () => {
    const tools = await getMCPToolsForWorld(worldId());
    const shellCmdTool = tools.shell_cmd;

    // Verify schema structure
    expect(shellCmdTool.parameters.type).toBe('object');
    expect(shellCmdTool.parameters.properties).toHaveProperty('command');
    expect(shellCmdTool.parameters.properties).toHaveProperty('parameters');
    expect(shellCmdTool.parameters.properties).toHaveProperty('directory');
    expect(shellCmdTool.parameters.properties).toHaveProperty('timeout');
    expect(shellCmdTool.parameters.properties).toHaveProperty('output_format');
    expect(shellCmdTool.parameters.properties).toHaveProperty('output_detail');
    expect(shellCmdTool.parameters.properties).toHaveProperty('artifact_paths');
    expect(shellCmdTool.parameters.required).toContain('command');
    expect(shellCmdTool.parameters.required).not.toContain('directory');
  });

  test('should return structured json result when output_format is json', async () => {
    const tools = await getMCPToolsForWorld(worldId());
    const shellCmdTool = tools.shell_cmd;

    const rawResult = await shellCmdTool.execute(
      {
        command: 'echo',
        parameters: ['json-output-test'],
        output_format: 'json'
      },
      undefined,
      undefined,
      {
        world: {
          id: worldId(),
          variables: `working_directory=${workspaceRoot}`
        }
      }
    );

    const parsed = JSON.parse(rawResult);
    expect(parsed).toHaveProperty('exit_code');
    expect(typeof parsed.exit_code === 'number' || parsed.exit_code === null).toBe(true);
    expect(parsed).toHaveProperty('stdout');
    expect(parsed.stderr).toBeTypeOf('string');
    expect(parsed.timed_out).toBe(false);
    expect(parsed.duration_ms).toBeTypeOf('number');
    expect(Array.isArray(parsed.artifacts)).toBe(true);
  });

  test('should include artifact metadata in structured json output', async () => {
    const tools = await getMCPToolsForWorld(worldId());
    const shellCmdTool = tools.shell_cmd;

    const artifactTarget = 'artifact-test-output.txt';
    const absoluteArtifactPath = fileURLToPath(new URL(`../../${artifactTarget}`, import.meta.url));

    const rawResult = await shellCmdTool.execute(
      {
        command: 'echo',
        parameters: ['artifact-test'],
        output_format: 'json',
        artifact_paths: [absoluteArtifactPath]
      },
      undefined,
      undefined,
      {
        world: {
          id: worldId(),
          variables: `working_directory=${workspaceRoot}`
        }
      }
    );

    const parsed = JSON.parse(rawResult);
    expect(parsed.artifacts.length).toBeGreaterThanOrEqual(1);
    const artifact = parsed.artifacts.find((item: any) => String(item.path).endsWith(artifactTarget));
    expect(artifact).toBeDefined();
    expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof artifact.bytes).toBe('number');
    expect(artifact.bytes).toBeGreaterThanOrEqual(0);
  });

  test('should reject artifact paths outside world working_directory', async () => {
    const tools = await getMCPToolsForWorld(worldId());
    const shellCmdTool = tools.shell_cmd;

    await expect(
      shellCmdTool.execute(
        {
          command: 'echo',
          parameters: ['artifact-scope-test'],
          output_format: 'json',
          artifact_paths: ['/etc/passwd']
        },
        undefined,
        undefined,
        {
          world: {
            id: worldId(),
            variables: `working_directory=${workspaceRoot}`
          }
        }
      )
    ).rejects.toThrow('Working directory mismatch');
  });

  test('should execute shell_cmd tool through tool interface', async () => {
    const tools = await getMCPToolsForWorld(worldId());
    const shellCmdTool = tools.shell_cmd;

    // Execute a simple command through the tool
    const result = await shellCmdTool.execute({
      command: 'echo',
      parameters: ['Hello from test']
    });

    // Verify result format
    expect(result).toContain('**Command:** `echo "Hello from test"`');
    expect(result).toContain('Exit code 0');
    expect(result).toContain('Hello from test');
  });

  test('should use world working_directory when directory parameter is omitted', async () => {
    const tools = await getMCPToolsForWorld(worldId());
    const shellCmdTool = tools.shell_cmd;

    const result = await shellCmdTool.execute(
      {
        command: 'echo',
        parameters: ['fallback-directory-test']
      },
      undefined,
      undefined,
      {
        world: {
          id: worldId(),
          variables: 'working_directory=/tmp'
        }
      }
    );

    expect(result).toContain('fallback-directory-test');
    expect(result).toContain('Exit code 0');
  });

  test('should fail when model-provided directory differs from world working_directory', async () => {
    const tools = await getMCPToolsForWorld(worldId());
    const shellCmdTool = tools.shell_cmd;

    await expect(
      shellCmdTool.execute(
        {
          command: 'pwd',
          directory: '/'
        },
        undefined,
        undefined,
        {
          world: {
            id: worldId(),
            variables: 'working_directory=/tmp'
          }
        }
      )
    ).rejects.toThrow('Working directory mismatch');
  });

  test('should fail when parameters target path outside world working_directory', async () => {
    const tools = await getMCPToolsForWorld(worldId());
    const shellCmdTool = tools.shell_cmd;

    await expect(
      shellCmdTool.execute(
        {
          command: 'ls',
          parameters: ['-la', '~/']
        },
        undefined,
        undefined,
        {
          world: {
            id: worldId(),
            variables: 'working_directory=/tmp'
          }
        }
      )
    ).rejects.toThrow('Working directory mismatch');
  });

  test('should fail when relative escape path parameters resolve outside world working_directory', async () => {
    const tools = await getMCPToolsForWorld(worldId());
    const shellCmdTool = tools.shell_cmd;

    await expect(
      shellCmdTool.execute(
        {
          command: 'ls',
          parameters: ['./../../etc']
        },
        undefined,
        undefined,
        {
          world: {
            id: worldId(),
            variables: 'working_directory=/tmp/project'
          }
        }
      )
    ).rejects.toThrow('Working directory mismatch');
  });

  test('should fail when option assignment paths target outside world working_directory', async () => {
    const tools = await getMCPToolsForWorld(worldId());
    const shellCmdTool = tools.shell_cmd;

    await expect(
      shellCmdTool.execute(
        {
          command: 'echo',
          parameters: ['--output=/tmp/outside']
        },
        undefined,
        undefined,
        {
          world: {
            id: worldId(),
            variables: 'working_directory=/tmp/project'
          }
        }
      )
    ).rejects.toThrow('Working directory mismatch');
  });

  test('should fail when short-option path prefixes target outside world working_directory', async () => {
    const tools = await getMCPToolsForWorld(worldId());
    const shellCmdTool = tools.shell_cmd;

    await expect(
      shellCmdTool.execute(
        {
          command: 'clang',
          parameters: ['-I/tmp/outside']
        },
        undefined,
        undefined,
        {
          world: {
            id: worldId(),
            variables: 'working_directory=/tmp/project'
          }
        }
      )
    ).rejects.toThrow('Working directory mismatch');
  });

  test('should fail when inline script execution is requested', async () => {
    const tools = await getMCPToolsForWorld(worldId());
    const shellCmdTool = tools.shell_cmd;

    await expect(
      shellCmdTool.execute(
        {
          command: 'sh',
          parameters: ['-c', 'cat /etc/passwd']
        },
        undefined,
        undefined,
        {
          world: {
            id: worldId(),
            variables: 'working_directory=/tmp/project'
          }
        }
      )
    ).rejects.toThrow('inline script execution');
  });

  test('should use core default working directory when directory is unresolved', async () => {
    const tools = await getMCPToolsForWorld(worldId());
    const shellCmdTool = tools.shell_cmd;

    clearExecutionHistory();
    const beforeCount = getExecutionHistory(1000).length;

    const result = await shellCmdTool.execute({
      command: 'echo',
      parameters: ['fallback-current-directory']
    });

    const afterCount = getExecutionHistory(1000).length;
    expect(result).toContain('fallback-current-directory');
    expect(result).toContain('Exit code 0');
    expect(afterCount).toBeGreaterThan(beforeCount);
  });

  test('should be available even without MCP config', async () => {
    // Verify world has no MCP config
    const world = await getTestWorld();
    expect(world).not.toBeNull();
    if (!world) {
      throw new Error('Expected test world to exist');
    }
    expect(world.mcpConfig).toBeUndefined();

    // shell_cmd should still be available
    const tools = await getMCPToolsForWorld(worldId());
    expect(tools).toHaveProperty('shell_cmd');
  });

  test('should work alongside MCP server tools if configured', async () => {
    // Note: This test just verifies the built-in tool doesn't break
    // when MCP config is present (without actually configuring an MCP server)
    const tools = await getMCPToolsForWorld(worldId());

    // Should have at least the built-in shell_cmd tool
    const toolCount = Object.keys(tools).length;
    expect(toolCount).toBeGreaterThanOrEqual(1);
    expect(tools).toHaveProperty('shell_cmd');
  });

  test('should handle errors through tool interface', async () => {
    const tools = await getMCPToolsForWorld(worldId());
    const shellCmdTool = tools.shell_cmd;

    // Execute a command that will fail
    const result = await shellCmdTool.execute({
      command: 'ls',
      parameters: ['./this-directory-does-not-exist-xyz']
    });

    // Verify error is captured in result
    expect(result).toContain('**Command:** `ls ./this-directory-does-not-exist-xyz`');
    expect(result).toContain('Error:');
    expect(result.toLowerCase()).toContain('no such file');
  });

  test('should persist execution history across tool calls', async () => {
    const tools = await getMCPToolsForWorld(worldId());
    const shellCmdTool = tools.shell_cmd;

    // Execute multiple commands
    await shellCmdTool.execute({
      command: 'echo',
      parameters: ['test1']
    });

    await shellCmdTool.execute({
      command: 'echo',
      parameters: ['test2']
    });

    // History should be available via the API
    const { getExecutionHistory } = await import('../../core/shell-cmd-tool.js');
    const history = getExecutionHistory();

    // Should have at least the 2 commands we just ran
    expect(history.length).toBeGreaterThanOrEqual(2);

    // Most recent first
    expect(history[0].parameters).toContain('test2');
    expect(history[1].parameters).toContain('test1');
  });
});
