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

const testWorkingDirectory = process.cwd();

describe('Shell Command Parameter Quoting', () => {
  test('should handle parameters with spaces correctly', async () => {
    const result = await executeShellCommand(
      'node',
      ['-e', 'console.log(process.argv.slice(1).join(" "))', 'hello world'],
      testWorkingDirectory
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello world');
    expect(result.error).toBeUndefined();
  });

  test('should handle multiple parameters with spaces', async () => {
    const result = await executeShellCommand(
      'node',
      ['-e', 'console.log(process.argv.slice(1).join(" "))', 'first param', 'second param'],
      testWorkingDirectory
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('first param second param');
  });

  test('should handle mixed parameters (some with spaces, some without)', async () => {
    const result = await executeShellCommand(
      'node',
      ['-e', 'console.log(process.argv.slice(1).join(" "))', 'hello world', 'and', 'more text'],
      testWorkingDirectory
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello world and more text');
    expect(result.error).toBeUndefined();
  });

  test('should handle parameters with quotes', async () => {
    const result = await executeShellCommand(
      'node',
      ['-e', 'console.log(process.argv.slice(1).join(" "))', 'say "hello"'],
      testWorkingDirectory
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('say "hello"');
  });

  test('should handle parameters without spaces (no quoting needed)', async () => {
    const result = await executeShellCommand(
      'echo',
      ['hello', 'world'],
      testWorkingDirectory
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello world');
  });

  test('should work with real commands that have space-containing arguments', async () => {
    // Test with a command that would fail if parameters aren't quoted
    const result = await executeShellCommand(
      'node',
      ['-e', 'console.log("test with spaces")'],
      testWorkingDirectory
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('test with spaces');
  });
});
