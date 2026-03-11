/**
 * Shell Command Tool Format Tests
 * Tests for shell_cmd result formatting
 * 
 * Features tested:
 * - Parameter quoting for parameters with spaces
 * - Proper display of command with quoted parameters
 * - Escaping of quotes within parameters
 * - ANSI escape sequence stripping from LLM preview output
 * 
 * Changes:
 * - 2026-03-11: Added ANSI-stripping regression tests (spinner/cursor codes confused LLM into reporting completed command as still in progress).
 * - 2026-03-06: Added explicit canonical shell failure-reason coverage for validation and approval-denied terminal paths.
 * - 2026-03-06: Updated shell LLM-result coverage to assert the canonical bounded-preview contract, including stderr/error normalization.
 * - 2026-02-21: Added minimal shell LLM-result formatting assertions (status + exit semantics, no stdout/stderr transcript body).
 * - 2025-11-11: Initial implementation to test parameter quoting
 */

import { describe, test, expect } from 'vitest';
import {
  formatResultForLLM,
  formatMinimalShellResult,
  formatPreviewShellResultForLLM,
  formatShellToolErrorResultForLLM,
  stripAnsiFromShellOutput,
} from '../../core/shell-cmd-tool.js';
import type { CommandExecutionResult } from '../../core/shell-cmd-tool.js';

describe('formatResultForLLM', () => {
  test('should quote parameters with spaces', () => {
    const result: CommandExecutionResult = {
      executionId: 'fmt-quote-spaces',
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
      executionId: 'fmt-no-quote',
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
      executionId: 'fmt-escape-quotes',
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
      executionId: 'fmt-tabs',
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
      executionId: 'fmt-mixed',
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
      executionId: 'fmt-empty-params',
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
      executionId: 'fmt-preview-default',
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
      executionId: 'fmt-full-detail',
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

describe('formatPreviewShellResultForLLM', () => {
  test('should format success status with bounded stdout preview', () => {
    const result: CommandExecutionResult = {
      executionId: 'test-success',
      command: 'echo',
      parameters: ['ok'],
      stdout: 'visible to llm',
      stderr: '',
      exitCode: 0,
      signal: null,
      executedAt: new Date(),
      duration: 12
    };

    const minimal = formatMinimalShellResult(result);
    const text = formatPreviewShellResultForLLM(result);

    expect(minimal.status).toBe('success');
    expect(minimal.exit_code).toBe(0);
    expect(text).toContain('status: success');
    expect(text).toContain('exit_code: 0');
    expect(text).toContain('stdout_preview:');
    expect(text).toContain('visible to llm');
  });

  test('should format failed status with bounded stderr preview', () => {
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
    const text = formatPreviewShellResultForLLM(result);

    expect(minimal.status).toBe('failed');
    expect(minimal.reason).toBe('non_zero_exit');
    expect(text).toContain('status: failed');
    expect(text).toContain('exit_code: 2');
    expect(text).toContain('reason: non_zero_exit');
    expect(text).toContain('stderr_preview:');
    expect(text).toContain('No such file');
  });

  test('should fall back to error text for stderr preview when stderr is empty', () => {
    const result: CommandExecutionResult = {
      executionId: 'test-validation-fail',
      command: '<invalid>',
      parameters: [],
      stdout: '',
      stderr: '',
      exitCode: null,
      signal: null,
      error: 'Invalid command: command must be a non-empty string.',
      failureReason: 'validation_error',
      executedAt: new Date(),
      duration: 0
    };

    const text = formatPreviewShellResultForLLM(result);

    expect(text).toContain('status: failed');
    expect(text).toContain('exit_code: null');
    expect(text).toContain('reason: validation_error');
    expect(text).toContain('stderr_preview:');
    expect(text).toContain('Invalid command: command must be a non-empty string.');
  });

  test('should preserve approval-denied failures as canonical shell error results', () => {
    const text = formatShellToolErrorResultForLLM({
      command: 'curl',
      parameters: ['-O', 'https://example.com/file'],
      error: 'Command not executed: approval required for remote_download and request was not approved (user_denied).',
      failureReason: 'approval_denied',
    });

    expect(text).toContain('status: failed');
    expect(text).toContain('exit_code: null');
    expect(text).toContain('reason: approval_denied');
    expect(text).toContain('stderr_preview:');
    expect(text).toContain('request was not approved');
  });
});

describe('stripAnsiFromShellOutput', () => {
  test('strips ANSI color codes', () => {
    const input = '\x1b[38;5;250mHello\x1b[0m world';
    expect(stripAnsiFromShellOutput(input)).toBe('Hello world');
  });

  test('strips cursor-hide/show sequences used by spinner animations', () => {
    const input = '\x1b[?25lInstalling...\x1b[?25h';
    expect(stripAnsiFromShellOutput(input)).toBe('Installing...');
  });

  test('strips carriage-return+erase spinner overwrite sequences', () => {
    // This is the pattern emitted by the `skills add` CLI spinner:
    // ◒  Cloning repository\r\x1b[J◐  Cloning repository\r\x1b[J◓  Cloning repository
    const input = '◒  Cloning repository\x1b[999D\x1b[J◐  Cloning repository\x1b[999D\x1b[J◓  Cloning';
    const result = stripAnsiFromShellOutput(input);
    // All CSI sequences stripped; carriage-return-style cursor moves gone
    expect(result).not.toContain('\x1b');
    expect(result).not.toContain('\r');
  });

  test('returns clean completion text so LLM is not confused by in-progress spinner', () => {
    // Regression: real stdout from `npx skills add tavily-ai/skills@search -y`
    // was truncated mid-spinner, causing Gemini to say "installation in progress"
    // even though exit_code was 0.
    const spinnerStdout =
      '\x1b[?25l│\n◇  Source: https://github.com/tavily-ai/skills.git @search\n' +
      '\x1b[?25h\x1b[?25l│\n◒  Cloning repository\x1b[999D\x1b[J◐  Cloning repository\x1b[999D\x1b[J◓  Cloning repository';

    const result: CommandExecutionResult = {
      executionId: 'spinner-regression',
      command: 'npx',
      parameters: ['skills', 'add', 'tavily-ai/skills@search', '-y'],
      stdout: spinnerStdout,
      stderr: '',
      exitCode: 0,
      signal: null,
      executedAt: new Date(),
      duration: 10419
    };

    const text = formatPreviewShellResultForLLM(result);

    // Status must be clearly stated at top
    expect(text).toContain('status: success');
    expect(text).toContain('exit_code: 0');
    // No raw ANSI escape sequences in LLM output
    expect(text).not.toContain('\x1b');
    // No raw carriage-return overwrite sequences
    expect(text).not.toContain('\x1b[999D');
    expect(text).not.toContain('\x1b[?25l');
  });

  test('preserves plain text without modification', () => {
    const plain = 'Installation complete.\nSkill added successfully.';
    expect(stripAnsiFromShellOutput(plain)).toBe(plain);
  });

  test('handles empty string', () => {
    expect(stripAnsiFromShellOutput('')).toBe('');
  });
});
