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
 * - 2026-02-21: Added minimal shell LLM-result formatting assertions (status + exit semantics, no stdout/stderr transcript body).
 * - 2025-11-11: Initial implementation to test parameter quoting
 */

import { describe, test, expect } from 'vitest';
import {
  formatResultForLLM,
  formatMinimalShellResult,
  formatMinimalShellResultForLLM
} from '../../core/shell-cmd-tool.js';
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

describe('formatMinimalShellResultForLLM', () => {
  test('should format success status with exit code only', () => {
    const result: CommandExecutionResult = {
      executionId: 'test-success',
      command: 'echo',
      parameters: ['ok'],
      stdout: 'hidden from llm',
      stderr: '',
      exitCode: 0,
      signal: null,
      executedAt: new Date(),
      duration: 12
    };

    const minimal = formatMinimalShellResult(result);
    const text = formatMinimalShellResultForLLM(result);

    expect(minimal.status).toBe('success');
    expect(minimal.exit_code).toBe(0);
    expect(text).toContain('status: success');
    expect(text).toContain('exit_code: 0');
    expect(text).not.toContain('hidden from llm');
  });

  test('should format failed status with reason for non-zero exit', () => {
    const result: CommandExecutionResult = {
      executionId: 'test-fail',
      command: 'ls',
      parameters: ['/missing'],
      stdout: '',
      stderr: 'No such file',
      exitCode: 2,
      signal: null,
      error: 'Command exited with code 2',
      executedAt: new Date(),
      duration: 17
    };

    const minimal = formatMinimalShellResult(result);
    const text = formatMinimalShellResultForLLM(result);

    expect(minimal.status).toBe('failed');
    expect(minimal.reason).toBe('non_zero_exit');
    expect(text).toContain('status: failed');
    expect(text).toContain('exit_code: 2');
    expect(text).toContain('reason: non_zero_exit');
    expect(text).not.toContain('No such file');
  });
});
