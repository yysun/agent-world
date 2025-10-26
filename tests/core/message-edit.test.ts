/**
 * Message Edit Feature Tests
 * 
 * Tests for message ID migration and error handling.
 * 
 * Note: These are simplified tests that focus on error handling and validation.
 * Full integration tests with world/agent setup are in the integration test suite.
 */

import { describe, test, expect } from '@jest/globals';
import {
  migrateMessageIds
} from '../../core/index.js';

describe('Message Edit Feature', () => {
  describe('migrateMessageIds', () => {
    test('should throw error for non-existent world', async () => {
      await expect(migrateMessageIds('nonexistent-world-xyz')).rejects.toThrow(/not found/);
    });

    test('validates world existence', async () => {
      const result = migrateMessageIds('invalid-world-id');
      await expect(result).rejects.toThrow();
    });
  });

  describe('Error handling', () => {
    test('provides meaningful error messages for missing worlds', async () => {
      try {
        await migrateMessageIds('does-not-exist');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeTruthy();
        expect(String(error)).toMatch(/not found/i);
      }
    });
  });
});
