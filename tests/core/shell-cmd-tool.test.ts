/**
 * Shell Command Tool Unit Tests
 * Tests for shell command execution with streaming support
 * 
 * Features tested:
 * - Basic command execution
 * - Streaming callbacks for stdout and stderr
 * - Backwards compatibility (without callbacks)
 * - Error handling
 * - Output accumulation
 * 
 * Changes:
 * - 2026-02-14: Added inline-script guard coverage (`sh -c`) and short-option path-prefix checks (`-I/path`).
 * - 2026-02-14: Added scope-regression tests for relative escape paths (`./../../...`) and option assignment paths (`--flag=/...`).
 * - 2026-02-13: Added directory-request scope validation coverage (inside world cwd allowed, outside rejected).
 * - 2026-02-08: Initial test suite for streaming callback functionality
 */

import { describe, test, expect } from 'vitest';
import {
  executeShellCommand,
  validateShellDirectoryRequest,
  validateShellCommandScope
} from '../../core/shell-cmd-tool.js';

describe('shell command execution', () => {
  test('should execute command and return result', async () => {
    const result = await executeShellCommand('echo', ['test'], './');
    
    expect(result.command).toBe('echo');
    expect(result.parameters).toEqual(['test']);
    expect(result.stdout).toContain('test');
    expect(result.exitCode).toBe(0);
    expect(result.error).toBeUndefined();
  });

  test('should capture stderr output', async () => {
    // Use a command that writes to stderr - ls with non-existent file
    const result = await executeShellCommand('ls', ['/this-does-not-exist-xyz'], './');
    
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  test('should work without callbacks (backwards compatibility)', async () => {
    const result = await executeShellCommand('echo', ['test'], './');
    
    expect(result.stdout).toContain('test');
    expect(result.exitCode).toBe(0);
  });
});

describe('shell command streaming callbacks', () => {
  test('should invoke onStdout callback with output chunks', async () => {
    const stdoutChunks: string[] = [];
    
    const result = await executeShellCommand('echo', ['test'], './', {
      onStdout: (chunk) => stdoutChunks.push(chunk)
    });
    
    expect(stdoutChunks.length).toBeGreaterThan(0);
    expect(stdoutChunks.join('')).toContain('test');
    expect(result.stdout).toContain('test');
  });

  test('should invoke onStderr callback when command writes to stderr', async () => {
    const stderrChunks: string[] = [];
    
    const result = await executeShellCommand('ls', ['/this-does-not-exist-xyz'], './', {
      onStderr: (chunk) => stderrChunks.push(chunk)
    });
    
    expect(stderrChunks.length).toBeGreaterThan(0);
    expect(stderrChunks.join('').length).toBeGreaterThan(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  test('should accumulate full output even with streaming callbacks', async () => {
    const stdoutChunks: string[] = [];
    
    const result = await executeShellCommand('echo', ['line1'], './', {
      onStdout: (chunk) => stdoutChunks.push(chunk)
    });
    
    // Verify callbacks received data
    expect(stdoutChunks.length).toBeGreaterThan(0);
    
    // Verify full output is accumulated in result
    expect(result.stdout).toContain('line1');
    
    // Verify chunks match accumulated output
    const chunksJoined = stdoutChunks.join('');
    expect(result.stdout).toBe(chunksJoined);
  });

  test('should handle both stdout and stderr callbacks simultaneously', async () => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    
    // Command that outputs to both stdout and stderr
    // Using sh -c to ensure both streams are used
    const result = await executeShellCommand('sh', [
      '-c',
      'echo "to stdout"; echo "to stderr" >&2'
    ], './', {
      onStdout: (chunk) => stdoutChunks.push(chunk),
      onStderr: (chunk) => stderrChunks.push(chunk)
    });
    
    expect(stdoutChunks.join('')).toContain('to stdout');
    expect(stderrChunks.join('')).toContain('to stderr');
    expect(result.stdout).toContain('to stdout');
    expect(result.stderr).toContain('to stderr');
  });

  test('should work with only onStdout callback', async () => {
    const stdoutChunks: string[] = [];
    
    const result = await executeShellCommand('echo', ['test'], './', {
      onStdout: (chunk) => stdoutChunks.push(chunk)
      // No onStderr callback
    });
    
    expect(stdoutChunks.length).toBeGreaterThan(0);
    expect(result.stdout).toContain('test');
  });

  test('should work with only onStderr callback', async () => {
    const stderrChunks: string[] = [];
    
    const result = await executeShellCommand('ls', ['/this-does-not-exist-xyz'], './', {
      // No onStdout callback
      onStderr: (chunk) => stderrChunks.push(chunk)
    });
    
    expect(stderrChunks.length).toBeGreaterThan(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});

describe('shell command error handling with streaming', () => {
  test('should handle command errors with streaming callbacks', async () => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    
    const result = await executeShellCommand('ls', ['/invalid-path-xyz'], './', {
      onStdout: (chunk) => stdoutChunks.push(chunk),
      onStderr: (chunk) => stderrChunks.push(chunk)
    });
    
    expect(result.exitCode).not.toBe(0);
    expect(result.error).toBeDefined();
    expect(stderrChunks.length).toBeGreaterThan(0);
  });

  test('should complete execution even if callback throws', async () => {
    // This test ensures that errors in callbacks don't break execution
    const result = await executeShellCommand('echo', ['test'], './', {
      onStdout: () => {
        // Simulate callback error
        throw new Error('Callback error');
      }
    });
    
    // Execution should complete despite callback error
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('test');
  });
});

describe('shell command directory request validation', () => {
  test('should allow requested directory inside world working_directory', () => {
    const result = validateShellDirectoryRequest(
      '/tmp/project/subdir',
      '/tmp/project'
    );

    expect(result.valid).toBe(true);
  });

  test('should reject requested directory outside world working_directory', () => {
    const result = validateShellDirectoryRequest(
      '/Users/esun',
      '/Users/esun/Documents/Projects/test-agent-world'
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('outside world working directory');
    }
  });
});

describe('shell command argument scope validation', () => {
  test('should reject relative escape path tokens like ./../../etc', () => {
    const result = validateShellCommandScope(
      'ls',
      ['./../../etc'],
      '/tmp/project'
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('outside world working directory');
    }
  });

  test('should reject option assignment path tokens like --output=/tmp/outside', () => {
    const result = validateShellCommandScope(
      'echo',
      ['--output=/tmp/outside'],
      '/tmp/project'
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('outside world working directory');
    }
  });

  test('should reject short-option prefixed path tokens like -I/tmp/include', () => {
    const result = validateShellCommandScope(
      'clang',
      ['-I/tmp/include'],
      '/tmp/project'
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('outside world working directory');
    }
  });

  test('should reject inline script execution patterns like sh -c', () => {
    const result = validateShellCommandScope(
      'sh',
      ['-c', 'cat /etc/passwd'],
      '/tmp/project'
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('inline script execution');
    }
  });
});
