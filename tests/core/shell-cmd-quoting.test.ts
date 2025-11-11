/**
 * Shell Command Parameter Quoting Tests
 * Tests for proper parameter quoting when executing shell commands
 * 
 * Features tested:
 * - Parameters with spaces are properly quoted for shell execution
 * - Multi-word parameters remain intact
 * - Commands execute correctly with quoted parameters
 * 
 * Changes:
 * - 2025-11-11: Initial implementation to test parameter quoting in execution
 */

import { describe, test, expect } from 'vitest';
import { executeShellCommand } from '../../core/shell-cmd-tool.js';

describe('Shell Command Parameter Quoting', () => {
  test('should handle parameters with spaces correctly', async () => {
    const result = await executeShellCommand(
      'echo',
      ['hello world'],
      '/tmp'
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello world');
    expect(result.error).toBeUndefined();
  });

  test('should handle multiple parameters with spaces', async () => {
    const result = await executeShellCommand(
      'echo',
      ['first param', 'second param'],
      '/tmp'
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('first param second param');
  });

  test('should handle mixed parameters (some with spaces, some without)', async () => {
    const result = await executeShellCommand(
      'echo',
      ['hello world', 'and', 'more text'],
      '/tmp'
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello world and more text');
    expect(result.error).toBeUndefined();
  });

  test('should handle parameters with quotes', async () => {
    const result = await executeShellCommand(
      'echo',
      ['say "hello"'],
      '/tmp'
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('say "hello"');
  });

  test('should handle parameters without spaces (no quoting needed)', async () => {
    const result = await executeShellCommand(
      'echo',
      ['hello', 'world'],
      '/tmp'
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello world');
  });

  test('should work with real commands that have space-containing arguments', async () => {
    // Test with a command that would fail if parameters aren't quoted
    const result = await executeShellCommand(
      'node',
      ['-e', 'console.log("test with spaces")'],
      '/tmp'
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('test with spaces');
  });
});
