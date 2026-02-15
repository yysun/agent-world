/**
 * Shell Command Tool Format Tests
 * Tests for shell_cmd result formatting
 * 
 * Features tested:
 * - Parameter quoting for parameters with spaces
 * - Proper display of command with quoted parameters
 * - Escaping of quotes within parameters
 * 
 * Changes:
 * - 2025-11-11: Initial implementation to test parameter quoting
 */

import { describe, test, expect } from 'vitest';
import { formatResultForLLM } from '../../core/shell-cmd-tool.js';
import type { CommandExecutionResult } from '../../core/shell-cmd-tool.js';

describe('formatResultForLLM', () => {
  test('should quote parameters with spaces', () => {
    const result: CommandExecutionResult = {
      command: 'codex',
      parameters: ['exec', 'review the last commit'],
      stdout: '',
      stderr: '',
      exitCode: 0,
      signal: null,
      executedAt: new Date(),
      duration: 100
    };

    const formatted = formatResultForLLM(result);
    expect(formatted).toContain('codex exec "review the last commit"');
  });

  test('should not quote parameters without spaces', () => {
    const result: CommandExecutionResult = {
      command: 'ls',
      parameters: ['-la', '/tmp'],
      stdout: '',
      stderr: '',
      exitCode: 0,
      signal: null,
      executedAt: new Date(),
      duration: 50
    };

    const formatted = formatResultForLLM(result);
    expect(formatted).toContain('ls -la /tmp');
    expect(formatted).not.toContain('"');
  });

  test('should escape quotes within parameters', () => {
    const result: CommandExecutionResult = {
      command: 'echo',
      parameters: ['Hello "world"'],
      stdout: '',
      stderr: '',
      exitCode: 0,
      signal: null,
      executedAt: new Date(),
      duration: 10
    };

    const formatted = formatResultForLLM(result);
    expect(formatted).toContain('echo "Hello \\"world\\""');
  });

  test('should quote parameters with tabs', () => {
    const result: CommandExecutionResult = {
      command: 'echo',
      parameters: ['hello\tworld'],
      stdout: '',
      stderr: '',
      exitCode: 0,
      signal: null,
      executedAt: new Date(),
      duration: 10
    };

    const formatted = formatResultForLLM(result);
    expect(formatted).toContain('"hello\tworld"');
  });

  test('should handle mixed parameters (some quoted, some not)', () => {
    const result: CommandExecutionResult = {
      command: 'git',
      parameters: ['commit', '-m', 'Initial commit with changes'],
      stdout: '',
      stderr: '',
      exitCode: 0,
      signal: null,
      executedAt: new Date(),
      duration: 200
    };

    const formatted = formatResultForLLM(result);
    expect(formatted).toContain('git commit -m "Initial commit with changes"');
  });

  test('should handle empty parameters array', () => {
    const result: CommandExecutionResult = {
      command: 'pwd',
      parameters: [],
      stdout: '/home/user',
      stderr: '',
      exitCode: 0,
      signal: null,
      executedAt: new Date(),
      duration: 5
    };

    const formatted = formatResultForLLM(result);
    expect(formatted).toContain('pwd');
    expect(formatted).toContain('/home/user');
  });

  test('should return bounded preview output by default (minimal mode)', () => {
    const result: CommandExecutionResult = {
      command: 'echo',
      parameters: ['x'],
      stdout: 'a'.repeat(1000),
      stderr: '',
      exitCode: 0,
      signal: null,
      executedAt: new Date(),
      duration: 5
    };

    const formatted = formatResultForLLM(result);
    expect(formatted).toContain('Standard Output (preview)');
    expect(formatted).toContain('Output truncated to minimum necessary preview');
    expect(formatted).not.toContain('**Executed at:**');
  });

  test('should include full output and timestamp in full detail mode', () => {
    const result: CommandExecutionResult = {
      command: 'echo',
      parameters: ['full'],
      stdout: 'full-output',
      stderr: '',
      exitCode: 0,
      signal: null,
      executedAt: new Date(),
      duration: 5
    };

    const formatted = formatResultForLLM(result, { detail: 'full' });
    expect(formatted).toContain('### Standard Output');
    expect(formatted).toContain('full-output');
    expect(formatted).toContain('**Executed at:**');
  });
});
