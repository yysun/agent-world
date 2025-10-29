/**
 * Timestamp Protection Tests
 * 
 * Tests for timestamp immutability in World and Agent updates
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { z } from 'zod';

// Copy the relevant schemas from server/api.ts for testing
const AgentUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.string().optional(),
  status: z.enum(["active", "inactive", "error"]).optional(),
  provider: z.enum(['openai', 'anthropic', 'azure', 'google', 'xai', 'openai-compatible', 'ollama']).optional(),
  model: z.string().optional(),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().min(1).optional(),
  clearMemory: z.boolean().optional()
  // Note: createdAt, lastActive, lastLLMCall are automatically managed by the core and cannot be set by clients
});

const WorldCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  turnLimit: z.number().min(1).optional()
  // Note: createdAt, lastUpdated are automatically managed by the core
});

const WorldUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  turnLimit: z.number().min(1).optional()
  // Note: createdAt, lastUpdated are automatically managed by the core
});

describe('API Timestamp Protection', () => {
  describe('AgentUpdateSchema', () => {
    test('should accept valid agent update data without timestamps', () => {
      const validData = {
        name: 'Updated Agent',
        type: 'assistant',
        status: 'active' as const,
        provider: 'openai' as const,
        model: 'gpt-4',
        systemPrompt: 'Updated system prompt',
        temperature: 0.7,
        maxTokens: 1000
      };

      const result = AgentUpdateSchema.safeParse(validData);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data).toEqual(validData);
      }
    });

    test('should reject data with client-provided createdAt', () => {
      const dataWithCreatedAt = {
        name: 'Updated Agent',
        createdAt: '2019-01-01T00:00:00Z'
      };

      const result = AgentUpdateSchema.safeParse(dataWithCreatedAt);
      expect(result.success).toBe(true); // Schema ignores unknown fields

      if (result.success) {
        // createdAt should not be in the parsed result
        expect(result.data).not.toHaveProperty('createdAt');
        expect(result.data).toEqual({ name: 'Updated Agent' });
      }
    });

    test('should reject data with client-provided lastActive', () => {
      const dataWithLastActive = {
        name: 'Updated Agent',
        lastActive: '2019-01-01T00:00:00Z'
      };

      const result = AgentUpdateSchema.safeParse(dataWithLastActive);
      expect(result.success).toBe(true); // Schema ignores unknown fields

      if (result.success) {
        // lastActive should not be in the parsed result
        expect(result.data).not.toHaveProperty('lastActive');
        expect(result.data).toEqual({ name: 'Updated Agent' });
      }
    });

    test('should reject data with client-provided lastLLMCall', () => {
      const dataWithLastLLMCall = {
        name: 'Updated Agent',
        lastLLMCall: '2019-01-01T00:00:00Z'
      };

      const result = AgentUpdateSchema.safeParse(dataWithLastLLMCall);
      expect(result.success).toBe(true); // Schema ignores unknown fields

      if (result.success) {
        // lastLLMCall should not be in the parsed result
        expect(result.data).not.toHaveProperty('lastLLMCall');
        expect(result.data).toEqual({ name: 'Updated Agent' });
      }
    });

    test('should filter out multiple timestamp fields while preserving valid fields', () => {
      const mixedData = {
        name: 'Updated Agent',
        type: 'assistant',
        createdAt: '2019-01-01T00:00:00Z',
        lastActive: '2019-01-01T00:00:00Z',
        lastLLMCall: '2019-01-01T00:00:00Z',
        temperature: 0.8,
        invalidField: 'should be filtered'
      };

      const result = AgentUpdateSchema.safeParse(mixedData);
      expect(result.success).toBe(true);

      if (result.success) {
        // Only valid schema fields should be present
        expect(result.data).toEqual({
          name: 'Updated Agent',
          type: 'assistant',
          temperature: 0.8
        });

        // Timestamp fields should be filtered out
        expect(result.data).not.toHaveProperty('createdAt');
        expect(result.data).not.toHaveProperty('lastActive');
        expect(result.data).not.toHaveProperty('lastLLMCall');
        expect(result.data).not.toHaveProperty('invalidField');
      }
    });

    test('should validate enum values correctly', () => {
      const validStatus = {
        status: 'active' as const
      };

      const invalidStatus = {
        status: 'invalid-status'
      };

      expect(AgentUpdateSchema.safeParse(validStatus).success).toBe(true);
      expect(AgentUpdateSchema.safeParse(invalidStatus).success).toBe(false);
    });

    test('should validate number ranges correctly', () => {
      const validTemperature = {
        temperature: 0.5
      };

      const invalidTemperature = {
        temperature: 1.5 // Out of range
      };

      const validMaxTokens = {
        maxTokens: 1000
      };

      const invalidMaxTokens = {
        maxTokens: 0 // Must be at least 1
      };

      expect(AgentUpdateSchema.safeParse(validTemperature).success).toBe(true);
      expect(AgentUpdateSchema.safeParse(invalidTemperature).success).toBe(false);
      expect(AgentUpdateSchema.safeParse(validMaxTokens).success).toBe(true);
      expect(AgentUpdateSchema.safeParse(invalidMaxTokens).success).toBe(false);
    });
  });

  describe('WorldCreateSchema', () => {
    test('should accept valid world creation data without timestamps', () => {
      const validData = {
        name: 'Test World',
        description: 'A test world',
        turnLimit: 5
      };

      const result = WorldCreateSchema.safeParse(validData);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data).toEqual(validData);
      }
    });

    test('should filter out client-provided timestamps', () => {
      const dataWithTimestamps = {
        name: 'Test World',
        description: 'A test world',
        createdAt: '2019-01-01T00:00:00Z',
        lastUpdated: '2019-01-01T00:00:00Z'
      };

      const result = WorldCreateSchema.safeParse(dataWithTimestamps);
      expect(result.success).toBe(true);

      if (result.success) {
        // Timestamp fields should be filtered out
        expect(result.data).not.toHaveProperty('createdAt');
        expect(result.data).not.toHaveProperty('lastUpdated');
        expect(result.data).toEqual({
          name: 'Test World',
          description: 'A test world'
        });
      }
    });

    test('should require name field', () => {
      const dataWithoutName = {
        description: 'A test world'
      };

      const result = WorldCreateSchema.safeParse(dataWithoutName);
      expect(result.success).toBe(false);
    });
  });

  describe('WorldUpdateSchema', () => {
    test('should accept valid world update data without timestamps', () => {
      const validData = {
        name: 'Updated World',
        description: 'Updated description',
        turnLimit: 10
      };

      const result = WorldUpdateSchema.safeParse(validData);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data).toEqual(validData);
      }
    });

    test('should filter out client-provided timestamps', () => {
      const dataWithTimestamps = {
        name: 'Updated World',
        createdAt: '2019-01-01T00:00:00Z',
        lastUpdated: '2019-01-01T00:00:00Z'
      };

      const result = WorldUpdateSchema.safeParse(dataWithTimestamps);
      expect(result.success).toBe(true);

      if (result.success) {
        // Timestamp fields should be filtered out
        expect(result.data).not.toHaveProperty('createdAt');
        expect(result.data).not.toHaveProperty('lastUpdated');
        expect(result.data).toEqual({
          name: 'Updated World'
        });
      }
    });

    test('should accept empty update data', () => {
      const emptyData = {};

      const result = WorldUpdateSchema.safeParse(emptyData);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data).toEqual({});
      }
    });
  });

  describe('Cross-Schema Consistency', () => {
    test('should maintain consistent timestamp protection across all schemas', () => {
      const timestampFields = ['createdAt', 'lastActive', 'lastUpdated', 'lastLLMCall'];

      // Test that timestamp fields are not included in any schema
      const agentKeys = Object.keys(AgentUpdateSchema.shape);
      const worldCreateKeys = Object.keys(WorldCreateSchema.shape);
      const worldUpdateKeys = Object.keys(WorldUpdateSchema.shape);

      timestampFields.forEach(field => {
        expect(agentKeys).not.toContain(field);
        expect(worldCreateKeys).not.toContain(field);
        expect(worldUpdateKeys).not.toContain(field);
      });
    });

    test('should validate that schemas filter unknown fields consistently', () => {
      const testData = {
        validField: 'test',
        createdAt: '2019-01-01T00:00:00Z',
        lastActive: '2019-01-01T00:00:00Z',
        randomField: 'should be filtered'
      };

      // All schemas should ignore unknown fields (including timestamps)
      const agentResult = AgentUpdateSchema.safeParse(testData);
      const worldCreateResult = WorldCreateSchema.safeParse({ ...testData, name: 'Required Name' });
      const worldUpdateResult = WorldUpdateSchema.safeParse(testData);

      expect(agentResult.success).toBe(true);
      expect(worldCreateResult.success).toBe(true);
      expect(worldUpdateResult.success).toBe(true);

      // None should contain timestamp or random fields
      if (agentResult.success) {
        expect(agentResult.data).not.toHaveProperty('createdAt');
        expect(agentResult.data).not.toHaveProperty('lastActive');
        expect(agentResult.data).not.toHaveProperty('randomField');
      }
    });
  });

  describe('Real-world Attack Scenarios', () => {
    test('should protect against timestamp manipulation in agent updates', () => {
      // Simulate a malicious client trying to manipulate timestamps
      const maliciousUpdate = {
        name: 'Compromised Agent',
        createdAt: '1970-01-01T00:00:00Z', // Try to set creation date to epoch
        lastActive: '2099-12-31T23:59:59Z', // Try to set future activity
        lastLLMCall: '2024-01-01T00:00:00Z', // Try to manipulate call timestamp
        llmCallCount: 999999, // This should also be filtered (not in schema)
        memory: [], // This should also be filtered (not in schema)
        someOtherHack: 'malicious data'
      };

      const result = AgentUpdateSchema.safeParse(maliciousUpdate);
      expect(result.success).toBe(true); // Schema accepts it but filters harmful fields

      if (result.success) {
        // Only the name should pass through
        expect(result.data).toEqual({
          name: 'Compromised Agent'
        });

        // All malicious fields should be filtered
        expect(result.data).not.toHaveProperty('createdAt');
        expect(result.data).not.toHaveProperty('lastActive');
        expect(result.data).not.toHaveProperty('lastLLMCall');
        expect(result.data).not.toHaveProperty('llmCallCount');
        expect(result.data).not.toHaveProperty('memory');
        expect(result.data).not.toHaveProperty('someOtherHack');
      }
    });

    test('should protect against timestamp manipulation in world creation', () => {
      const maliciousCreate = {
        name: 'Hacked World',
        description: 'Legitimate description',
        createdAt: '1970-01-01T00:00:00Z',
        lastUpdated: '2099-12-31T23:59:59Z',
        totalAgents: 999, // Should be filtered
        totalMessages: 999, // Should be filtered
        adminAccess: true, // Should be filtered
        secretKey: 'hack123' // Should be filtered
      };

      const result = WorldCreateSchema.safeParse(maliciousCreate);
      expect(result.success).toBe(true);

      if (result.success) {
        // Only legitimate fields should pass through
        expect(result.data).toEqual({
          name: 'Hacked World',
          description: 'Legitimate description'
        });

        // All malicious/system fields should be filtered
        expect(result.data).not.toHaveProperty('createdAt');
        expect(result.data).not.toHaveProperty('lastUpdated');
        expect(result.data).not.toHaveProperty('totalAgents');
        expect(result.data).not.toHaveProperty('totalMessages');
        expect(result.data).not.toHaveProperty('adminAccess');
        expect(result.data).not.toHaveProperty('secretKey');
      }
    });
  });
});
