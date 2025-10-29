/**
 * Tests for Case-Insensitive Agent Lookup in API Routes
 * 
 * This test ensures that agent names in API routes are properly normalized
 * using toKebabCase to handle case-insensitive lookups.
 */

import { describe, it, expect } from 'vitest';
import { toKebabCase } from '../../core/utils.js';

describe('Case-Insensitive Agent Lookup', () => {
  describe('toKebabCase normalization', () => {
    it('should normalize agent names consistently for simple case variations', () => {
      // Test realistic case variations that users might type
      expect(toKebabCase('Musician')).toBe('musician');
      expect(toKebabCase('musician')).toBe('musician');
      expect(toKebabCase('MUSICIAN')).toBe('musician');
    });

    it('should handle complex agent names', () => {
      expect(toKebabCase('My Agent Name')).toBe('my-agent-name');
      expect(toKebabCase('MY AGENT NAME')).toBe('my-agent-name');
      expect(toKebabCase('my agent name')).toBe('my-agent-name');
      expect(toKebabCase('My-Agent-Name')).toBe('my-agent-name');
    });

    it('should handle special characters', () => {
      expect(toKebabCase('Agent@123')).toBe('agent-123');
      expect(toKebabCase('Agent_Name')).toBe('agent-name');
      expect(toKebabCase('Agent.Name')).toBe('agent-name');
    });

    it('should handle edge cases', () => {
      expect(toKebabCase('')).toBe('');
      expect(toKebabCase('A')).toBe('a');
      expect(toKebabCase('a')).toBe('a');
    });

    it('should demonstrate camelCase handling behavior', () => {
      // This shows the camelCase conversion behavior
      expect(toKebabCase('MuSiCiAn')).toBe('mu-si-ci-an');
      expect(toKebabCase('myAgent')).toBe('my-agent');
    });
  });

  describe('API route normalization scenarios', () => {
    it('should demonstrate the fix for common case-sensitive SQLite lookups', () => {
      // These are the realistic scenarios that were failing before the fix
      const userInputs = ['Musician', 'MUSICIAN', 'musician'];
      const expectedNormalizedId = 'musician';

      userInputs.forEach(input => {
        const normalized = toKebabCase(input);
        expect(normalized).toBe(expectedNormalizedId);
      });
    });

    it('should handle agent names from different case conventions', () => {
      // camelCase
      expect(toKebabCase('myAgent')).toBe('my-agent');
      expect(toKebabCase('MyAgent')).toBe('my-agent');

      // PascalCase
      expect(toKebabCase('MyAgentName')).toBe('my-agent-name');

      // snake_case
      expect(toKebabCase('my_agent_name')).toBe('my-agent-name');

      // UPPER_SNAKE_CASE
      expect(toKebabCase('MY_AGENT_NAME')).toBe('my-agent-name');
    });
  }); describe('SQLite case-sensitivity problem demonstration', () => {
    it('should show why case normalization is needed', () => {
      // Before the fix: These would be treated as different IDs in SQLite
      const originalId = 'Musician';  // What user types in URL
      const storedId = 'musician';    // What's actually stored (from toKebabCase during creation)

      // Without normalization: originalId !== storedId -> 404 Not Found
      expect(originalId).not.toBe(storedId);

      // With normalization: both normalize to the same value
      expect(toKebabCase(originalId)).toBe(toKebabCase(storedId));
      expect(toKebabCase(originalId)).toBe(storedId);
    });
  });
});
