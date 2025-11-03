import { describe, test, expect, beforeEach } from 'vitest';
import {
  executeShellCommand,
  getExecutionHistory,
  clearExecutionHistory,
  formatResultForLLM,
  createShellCmdToolDefinition,
  type CommandExecutionResult
} from '../../core/shell-cmd-tool.js';

describe('Shell Command Tool', () => {
  beforeEach(() => {
    // Clear history before each test
    clearExecutionHistory();
  });

  describe('executeShellCommand', () => {
    test('should execute a simple command successfully', async () => {
      const result = await executeShellCommand('echo', ['hello world'], '/tmp');

      expect(result.command).toBe('echo');
      expect(result.parameters).toEqual(['hello world']);
      expect(result.stdout).toContain('hello world');
      expect(result.exitCode).toBe(0);
      expect(result.error).toBeUndefined();
      expect(result.duration).toBeGreaterThan(0);
      expect(result.executedAt).toBeInstanceOf(Date);
    });

    test('should execute command with multiple parameters', async () => {
      const result = await executeShellCommand('echo', ['hello', 'world'], '/tmp');

      expect(result.command).toBe('echo');
      expect(result.parameters).toEqual(['hello', 'world']);
      expect(result.stdout).toContain('hello world');
      expect(result.exitCode).toBe(0);
    });

    test('should capture stderr for commands that write to stderr', async () => {
      // 'ls' with an invalid directory will write to stderr
      const result = await executeShellCommand('ls', ['/nonexistent-directory-that-does-not-exist'], '/tmp');

      expect(result.command).toBe('ls');
      expect(result.stderr.length).toBeGreaterThan(0);
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toBeDefined();
    });

    test('should handle command not found error', async () => {
      const result = await executeShellCommand('nonexistent-command-xyz', [], '/tmp');

      expect(result.command).toBe('nonexistent-command-xyz');
      expect(result.error).toBeDefined();
      expect(result.error).toContain('ENOENT');
    });

    test('should handle command timeout', async () => {
      // Use a command that will timeout (sleep for longer than timeout)
      const result = await executeShellCommand('sleep', ['5'], '/tmp', { timeout: 100 });

      expect(result.command).toBe('sleep');
      expect(result.error).toBeDefined();
      expect(result.error?.toLowerCase()).toContain('timed out');
      expect(result.duration).toBeGreaterThanOrEqual(100);
      expect(result.duration).toBeLessThan(1000); // Should not wait for full 5 seconds
    });

    test('should execute command in specified working directory', async () => {
      const result = await executeShellCommand('pwd', [], '/tmp');

      expect(result.command).toBe('pwd');
      expect(result.stdout).toContain('/tmp');
      expect(result.exitCode).toBe(0);
    });

    test('should persist execution result to history', async () => {
      await executeShellCommand('echo', ['test1'], '/tmp');
      await executeShellCommand('echo', ['test2'], '/tmp');

      const history = getExecutionHistory();

      expect(history.length).toBe(2);
      expect(history[0].parameters).toEqual(['test2']); // Most recent first
      expect(history[1].parameters).toEqual(['test1']);
    });
  });

  describe('getExecutionHistory', () => {
    test('should return execution history in reverse chronological order', async () => {
      await executeShellCommand('echo', ['first'], '/tmp');
      await executeShellCommand('echo', ['second'], '/tmp');
      await executeShellCommand('echo', ['third'], '/tmp');

      const history = getExecutionHistory();

      expect(history.length).toBe(3);
      expect(history[0].parameters).toEqual(['third']);
      expect(history[1].parameters).toEqual(['second']);
      expect(history[2].parameters).toEqual(['first']);
    });

    test('should limit returned results based on limit parameter', async () => {
      await executeShellCommand('echo', ['1'], '/tmp');
      await executeShellCommand('echo', ['2'], '/tmp');
      await executeShellCommand('echo', ['3'], '/tmp');
      await executeShellCommand('echo', ['4'], '/tmp');
      await executeShellCommand('echo', ['5'], '/tmp');

      const history = getExecutionHistory(3);

      expect(history.length).toBe(3);
      expect(history[0].parameters).toEqual(['5']);
      expect(history[1].parameters).toEqual(['4']);
      expect(history[2].parameters).toEqual(['3']);
    });

    test('should return empty array when history is empty', () => {
      const history = getExecutionHistory();
      expect(history).toEqual([]);
    });
  });

  describe('clearExecutionHistory', () => {
    test('should clear all execution history', async () => {
      await executeShellCommand('echo', ['test1'], '/tmp');
      await executeShellCommand('echo', ['test2'], '/tmp');

      expect(getExecutionHistory().length).toBe(2);

      const clearedCount = clearExecutionHistory();

      expect(clearedCount).toBe(2);
      expect(getExecutionHistory().length).toBe(0);
    });

    test('should return 0 when clearing empty history', () => {
      const clearedCount = clearExecutionHistory();
      expect(clearedCount).toBe(0);
    });
  });

  describe('formatResultForLLM', () => {
    test('should format successful command result', async () => {
      const result = await executeShellCommand('echo', ['hello'], '/tmp');
      const formatted = formatResultForLLM(result);

      expect(formatted).toContain('Command: echo hello');
      expect(formatted).toContain('Executed at:');
      expect(formatted).toContain('Duration:');
      expect(formatted).toContain('Exit code: 0');
      expect(formatted).toContain('Standard Output:');
      expect(formatted).toContain('hello');
    });

    test('should format error result', async () => {
      const result = await executeShellCommand('ls', ['/nonexistent-directory'], '/tmp');
      const formatted = formatResultForLLM(result);

      expect(formatted).toContain('Command: ls /nonexistent-directory');
      expect(formatted).toContain('Error:');
      expect(formatted).toContain('Standard Error:');
    });

    test('should format timeout result', async () => {
      const result = await executeShellCommand('sleep', ['5'], '/tmp', { timeout: 100 });
      const formatted = formatResultForLLM(result);

      expect(formatted).toContain('Command: sleep 5');
      expect(formatted).toContain('Error:');
      expect(formatted.toLowerCase()).toContain('timed out');
    });

    test('should handle command with no output', async () => {
      const result: CommandExecutionResult = {
        command: 'test',
        parameters: [],
        stdout: '',
        stderr: '',
        exitCode: 0,
        signal: null,
        executedAt: new Date(),
        duration: 10
      };

      const formatted = formatResultForLLM(result);

      expect(formatted).toContain('Command: test');
      expect(formatted).toContain('(No output)');
    });
  });

  describe('createShellCmdToolDefinition', () => {
    test('should create valid MCP tool definition', () => {
      const toolDef = createShellCmdToolDefinition();

      expect(toolDef.description).toBeDefined();
      expect(toolDef.parameters).toBeDefined();
      expect(toolDef.parameters.type).toBe('object');
      expect(toolDef.parameters.properties).toBeDefined();
      expect(toolDef.parameters.properties.command).toBeDefined();
      expect(toolDef.parameters.properties.parameters).toBeDefined();
      expect(toolDef.parameters.properties.directory).toBeDefined();
      expect(toolDef.parameters.required).toContain('command');
      expect(toolDef.parameters.required).toContain('directory');
      expect(toolDef.execute).toBeInstanceOf(Function);
    });

    test('should execute command through tool definition', async () => {
      const toolDef = createShellCmdToolDefinition();

      const result = await toolDef.execute({
        command: 'echo',
        parameters: ['test message'],
        directory: '/tmp'
      });

      expect(result).toContain('Command: echo test message');
      expect(result).toContain('test message');
      expect(result).toContain('Exit code: 0');
    });

    test('should handle command validation in tool execute', async () => {
      const toolDef = createShellCmdToolDefinition();

      await expect(toolDef.execute({ command: '', directory: '/tmp' }))
        .rejects.toThrow('Command must be a non-empty string');

      await expect(toolDef.execute({ command: null, directory: '/tmp' }))
        .rejects.toThrow('Command must be a non-empty string');
    });

    test('should handle directory validation in tool execute', async () => {
      const toolDef = createShellCmdToolDefinition();

      await expect(toolDef.execute({ command: 'echo', directory: '' }))
        .rejects.toThrow('Directory must be a non-empty string');

      await expect(toolDef.execute({ command: 'echo', directory: null }))
        .rejects.toThrow('Directory must be a non-empty string');

      await expect(toolDef.execute({ command: 'echo' }))
        .rejects.toThrow('Directory must be a non-empty string');
    });

    test('should handle parameters validation in tool execute', async () => {
      const toolDef = createShellCmdToolDefinition();

      await expect(toolDef.execute({
        command: 'echo',
        directory: '/tmp',
        parameters: 'not-an-array'
      })).rejects.toThrow('Parameters must be an array');
    });

    test('should filter non-string parameters', async () => {
      const toolDef = createShellCmdToolDefinition();

      const result = await toolDef.execute({
        command: 'echo',
        parameters: ['valid', 123, null, 'also-valid'],
        directory: '/tmp'
      });

      expect(result).toContain('Command: echo valid also-valid');
    });

    test('should pass timeout option to execution', async () => {
      const toolDef = createShellCmdToolDefinition();

      const result = await toolDef.execute({
        command: 'sleep',
        parameters: ['5'],
        directory: '/tmp',
        timeout: 100
      });

      expect(result.toLowerCase()).toContain('timed out');
    });

    test('should execute in specified directory', async () => {
      const toolDef = createShellCmdToolDefinition();

      const result = await toolDef.execute({
        command: 'pwd',
        parameters: [],
        directory: '/tmp'
      });

      expect(result).toContain('/tmp');
    });
  });

  describe('integration tests', () => {
    test('should execute multiple commands and maintain history', async () => {
      // Execute a series of commands
      await executeShellCommand('echo', ['first'], '/tmp');
      await executeShellCommand('ls', ['/tmp'], '/tmp');
      await executeShellCommand('pwd', [], '/tmp');

      const history = getExecutionHistory();

      expect(history.length).toBe(3);
      expect(history[0].command).toBe('pwd');
      expect(history[1].command).toBe('ls');
      expect(history[2].command).toBe('echo');
    });

    test('should handle mixed success and failure commands', async () => {
      await executeShellCommand('echo', ['success'], '/tmp');
      await executeShellCommand('ls', ['/nonexistent'], '/tmp');
      await executeShellCommand('pwd', [], '/tmp');

      const history = getExecutionHistory();

      expect(history.length).toBe(3);
      expect(history[2].exitCode).toBe(0); // echo success
      expect(history[1].exitCode).not.toBe(0); // ls failure
      expect(history[0].exitCode).toBe(0); // pwd success
    });
  });
});
