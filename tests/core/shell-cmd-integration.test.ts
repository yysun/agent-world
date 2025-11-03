import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createWorld, deleteWorld, getWorld } from '../../core/managers.js';
import { getMCPToolsForWorld } from '../../core/mcp-server-registry.js';
import { LLMProvider } from '../../core/types.js';

describe('shell_cmd integration with worlds', () => {
  let worldId: string;

  beforeEach(async () => {
    // Create a test world
    const world = await createWorld({
      name: 'test-world-shell-cmd',
      description: 'Test world for shell_cmd tool',
      turnLimit: 5,
      chatLLMProvider: LLMProvider.OPENAI,
      chatLLMModel: 'gpt-4'
    });
    worldId = world.id;
  });

  afterEach(async () => {
    // Clean up
    if (worldId) {
      await deleteWorld(worldId);
    }
  });

  test('should include shell_cmd tool in all worlds', async () => {
    const tools = await getMCPToolsForWorld(worldId);

    // Verify shell_cmd tool is present
    expect(tools).toHaveProperty('shell_cmd');
    expect(tools.shell_cmd).toBeDefined();
    expect(tools.shell_cmd.description).toBeDefined();
    expect(tools.shell_cmd.parameters).toBeDefined();
    expect(tools.shell_cmd.execute).toBeInstanceOf(Function);
  });

  test('should have correct tool schema', async () => {
    const tools = await getMCPToolsForWorld(worldId);
    const shellCmdTool = tools.shell_cmd;

    // Verify schema structure
    expect(shellCmdTool.parameters.type).toBe('object');
    expect(shellCmdTool.parameters.properties).toHaveProperty('command');
    expect(shellCmdTool.parameters.properties).toHaveProperty('parameters');
    expect(shellCmdTool.parameters.properties).toHaveProperty('timeout');
    expect(shellCmdTool.parameters.properties).toHaveProperty('cwd');
    expect(shellCmdTool.parameters.required).toContain('command');
  });

  test('should execute shell_cmd tool through tool interface', async () => {
    const tools = await getMCPToolsForWorld(worldId);
    const shellCmdTool = tools.shell_cmd;

    // Execute a simple command through the tool
    const result = await shellCmdTool.execute({
      command: 'echo',
      parameters: ['Hello from test']
    });

    // Verify result format
    expect(result).toContain('Command: echo Hello from test');
    expect(result).toContain('Exit code: 0');
    expect(result).toContain('Hello from test');
  });

  test('should be available even without MCP config', async () => {
    // Verify world has no MCP config
    const world = await getWorld(worldId);
    expect(world.mcpConfig).toBeUndefined();

    // shell_cmd should still be available
    const tools = await getMCPToolsForWorld(worldId);
    expect(tools).toHaveProperty('shell_cmd');
  });

  test('should work alongside MCP server tools if configured', async () => {
    // Note: This test just verifies the built-in tool doesn't break
    // when MCP config is present (without actually configuring an MCP server)
    const tools = await getMCPToolsForWorld(worldId);
    
    // Should have at least the built-in shell_cmd tool
    const toolCount = Object.keys(tools).length;
    expect(toolCount).toBeGreaterThanOrEqual(1);
    expect(tools).toHaveProperty('shell_cmd');
  });

  test('should handle errors through tool interface', async () => {
    const tools = await getMCPToolsForWorld(worldId);
    const shellCmdTool = tools.shell_cmd;

    // Execute a command that will fail
    const result = await shellCmdTool.execute({
      command: 'ls',
      parameters: ['/this-directory-does-not-exist-xyz']
    });

    // Verify error is captured in result
    expect(result).toContain('Command: ls /this-directory-does-not-exist-xyz');
    expect(result).toContain('Error:');
    expect(result.toLowerCase()).toContain('no such file');
  });

  test('should persist execution history across tool calls', async () => {
    const tools = await getMCPToolsForWorld(worldId);
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
