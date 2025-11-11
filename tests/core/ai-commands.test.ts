/**
 * Tests for AI Commands Module
 * 
 * Verifies that AI commands (gemini, copilot, codex) are correctly identified
 * even when they include arguments and subcommands.
 */

import { describe, it, expect } from 'vitest';
import { isAICommand } from '../../core/ai-commands.js';

describe('isAICommand', () => {
  it('should identify basic AI commands without arguments', () => {
    expect(isAICommand('gemini')).toBe(true);
    expect(isAICommand('copilot')).toBe(true);
    expect(isAICommand('codex')).toBe(true);
  });

  it('should identify AI commands with subcommands and arguments', () => {
    expect(isAICommand('codex exec "summarize project briefly"')).toBe(true);
    expect(isAICommand("codex exec 'summarize project briefly'")).toBe(true);
    expect(isAICommand('gemini chat "hello world"')).toBe(true);
    expect(isAICommand('copilot --help')).toBe(true);
  });

  it('should be case-insensitive', () => {
    expect(isAICommand('CODEX')).toBe(true);
    expect(isAICommand('Gemini')).toBe(true);
    expect(isAICommand('CoPilot')).toBe(true);
    expect(isAICommand('CODEX exec "test"')).toBe(true);
  });

  it('should handle extra whitespace', () => {
    expect(isAICommand('  codex  exec  "test"  ')).toBe(true);
    expect(isAICommand(' gemini ')).toBe(true);
  });

  it('should not identify non-AI commands', () => {
    expect(isAICommand('ls')).toBe(false);
    expect(isAICommand('ls -la')).toBe(false);
    expect(isAICommand('echo "hello"')).toBe(false);
    expect(isAICommand('git status')).toBe(false);
    expect(isAICommand('npm test')).toBe(false);
  });

  it('should handle edge cases', () => {
    expect(isAICommand('')).toBe(false);
    expect(isAICommand('   ')).toBe(false);
    expect(isAICommand(null as any)).toBe(false);
    expect(isAICommand(undefined as any)).toBe(false);
  });

  it('should identify the exact command from database example', () => {
    // This is the actual command format from the database
    expect(isAICommand('codex exec \'summarize project briefly\'')).toBe(true);
  });
});
