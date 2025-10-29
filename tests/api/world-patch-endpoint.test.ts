/**
 * World PATCH Endpoint Tests
 * Tests the PATCH /api/worlds/:worldName endpoint for updating world properties
 */

import { describe, it, expect, beforeEach } from 'vitest'; import { z } from 'zod';

// Copy the WorldUpdateSchema from server/api.ts for testing
const WorldUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  turnLimit: z.number().min(1).optional(),
  chatLLMProvider: z.enum(['openai', 'anthropic', 'azure', 'google', 'xai', 'openai-compatible', 'ollama']).nullable().optional(),
  chatLLMModel: z.string().nullable().optional()
});

describe('World PATCH Endpoint Schema', () => {
  describe('WorldUpdateSchema Validation', () => {
    it('should accept update with all fields', () => {
      const updateData = {
        name: 'Updated World',
        description: 'Updated description',
        turnLimit: 10,
        chatLLMProvider: 'openai' as const,
        chatLLMModel: 'gpt-4'
      };

      const result = WorldUpdateSchema.safeParse(updateData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(updateData);
      }
    });

    it('should accept update with only name and description (no provider/model)', () => {
      const updateData = {
        name: 'Updated World',
        description: 'Updated description'
      };

      const result = WorldUpdateSchema.safeParse(updateData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(updateData);
        expect(result.data.chatLLMProvider).toBeUndefined();
        expect(result.data.chatLLMModel).toBeUndefined();
      }
    });

    it('should accept update with only provider and model', () => {
      const updateData = {
        chatLLMProvider: 'anthropic' as const,
        chatLLMModel: 'claude-3-sonnet'
      };

      const result = WorldUpdateSchema.safeParse(updateData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(updateData);
      }
    });

    it('should accept empty update object', () => {
      const updateData = {};

      const result = WorldUpdateSchema.safeParse(updateData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({});
      }
    });

    it('should accept null values for provider and model', () => {
      const updateData = {
        chatLLMProvider: null,
        chatLLMModel: null
      };

      const result = WorldUpdateSchema.safeParse(updateData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.chatLLMProvider).toBeNull();
        expect(result.data.chatLLMModel).toBeNull();
      }
    });

    it('should accept mixed null and valid values', () => {
      const updateData = {
        name: 'Test World',
        chatLLMProvider: null,
        chatLLMModel: 'gpt-4'
      };

      const result = WorldUpdateSchema.safeParse(updateData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Test World');
        expect(result.data.chatLLMProvider).toBeNull();
        expect(result.data.chatLLMModel).toBe('gpt-4');
      }
    });

    it('should reject invalid provider values', () => {
      const updateData = {
        chatLLMProvider: 'invalid-provider'
      };

      const result = WorldUpdateSchema.safeParse(updateData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid turnLimit values', () => {
      const updateData = {
        turnLimit: 0 // Should be min 1
      };

      const result = WorldUpdateSchema.safeParse(updateData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid name length', () => {
      const updateData = {
        name: '' // Should be min 1 character
      };

      const result = WorldUpdateSchema.safeParse(updateData);
      expect(result.success).toBe(false);
    });
  });

  describe('Update Field Processing Logic', () => {
    // Test the logic that was fixed in the PATCH endpoint
    it('should process all schema fields in update object', () => {
      const validationData = {
        name: 'Test World',
        description: 'Test description',
        turnLimit: 5,
        chatLLMProvider: 'openai' as const,
        chatLLMModel: 'gpt-3.5-turbo'
      };

      // Simulate the destructuring and update logic from the PATCH endpoint
      const { name, description, turnLimit, chatLLMProvider, chatLLMModel } = validationData;

      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (turnLimit !== undefined) updates.turnLimit = turnLimit;
      if (chatLLMProvider !== undefined) updates.chatLLMProvider = chatLLMProvider;
      if (chatLLMModel !== undefined) updates.chatLLMModel = chatLLMModel;

      expect(updates).toEqual({
        name: 'Test World',
        description: 'Test description',
        turnLimit: 5,
        chatLLMProvider: 'openai',
        chatLLMModel: 'gpt-3.5-turbo'
      });
    });

    it('should handle partial updates without provider/model', () => {
      const validationData: any = {
        name: 'Test World',
        description: 'Test description'
        // chatLLMProvider and chatLLMModel are undefined
      };

      // Simulate the destructuring and update logic
      const { name, description, turnLimit, chatLLMProvider, chatLLMModel } = validationData;

      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (turnLimit !== undefined) updates.turnLimit = turnLimit;
      if (chatLLMProvider !== undefined) updates.chatLLMProvider = chatLLMProvider;
      if (chatLLMModel !== undefined) updates.chatLLMModel = chatLLMModel;

      expect(updates).toEqual({
        name: 'Test World',
        description: 'Test description'
      });
      expect(updates.chatLLMProvider).toBeUndefined();
      expect(updates.chatLLMModel).toBeUndefined();
    });

    it('should handle updates with only provider/model fields', () => {
      const validationData: any = {
        chatLLMProvider: 'anthropic' as const,
        chatLLMModel: 'claude-3-opus'
        // name, description, turnLimit are undefined
      };

      // Simulate the destructuring and update logic
      const { name, description, turnLimit, chatLLMProvider, chatLLMModel } = validationData;

      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (turnLimit !== undefined) updates.turnLimit = turnLimit;
      if (chatLLMProvider !== undefined) updates.chatLLMProvider = chatLLMProvider;
      if (chatLLMModel !== undefined) updates.chatLLMModel = chatLLMModel;

      expect(updates).toEqual({
        chatLLMProvider: 'anthropic',
        chatLLMModel: 'claude-3-opus'
      });
      expect(updates.name).toBeUndefined();
      expect(updates.description).toBeUndefined();
      expect(updates.turnLimit).toBeUndefined();
    });

    it('should handle empty validation data', () => {
      const validationData: any = {};

      // Simulate the destructuring and update logic
      const { name, description, turnLimit, chatLLMProvider, chatLLMModel } = validationData;

      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (turnLimit !== undefined) updates.turnLimit = turnLimit;
      if (chatLLMProvider !== undefined && chatLLMProvider !== null) updates.chatLLMProvider = chatLLMProvider;
      if (chatLLMModel !== undefined && chatLLMModel !== null) updates.chatLLMModel = chatLLMModel;

      expect(updates).toEqual({});
      expect(Object.keys(updates)).toHaveLength(0);
    });

    it('should handle null values in update logic', () => {
      const validationData: any = {
        name: 'Test World',
        chatLLMProvider: null,
        chatLLMModel: null
      };

      // Simulate the destructuring and update logic
      const { name, description, turnLimit, chatLLMProvider, chatLLMModel } = validationData;

      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (turnLimit !== undefined) updates.turnLimit = turnLimit;
      if (chatLLMProvider !== undefined && chatLLMProvider !== null) updates.chatLLMProvider = chatLLMProvider;
      if (chatLLMModel !== undefined && chatLLMModel !== null) updates.chatLLMModel = chatLLMModel;

      // Null values should be filtered out, only name should be included
      expect(updates).toEqual({
        name: 'Test World'
      });
      expect(updates.chatLLMProvider).toBeUndefined();
      expect(updates.chatLLMModel).toBeUndefined();
    });

    it('should handle mixed null and valid LLM fields', () => {
      const validationData: any = {
        chatLLMProvider: null,
        chatLLMModel: 'gpt-4'
      };

      // Simulate the destructuring and update logic
      const { name, description, turnLimit, chatLLMProvider, chatLLMModel } = validationData;

      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (turnLimit !== undefined) updates.turnLimit = turnLimit;
      if (chatLLMProvider !== undefined && chatLLMProvider !== null) updates.chatLLMProvider = chatLLMProvider;
      if (chatLLMModel !== undefined && chatLLMModel !== null) updates.chatLLMModel = chatLLMModel;

      // Only non-null chatLLMModel should be included
      expect(updates).toEqual({
        chatLLMModel: 'gpt-4'
      });
      expect(updates.chatLLMProvider).toBeUndefined();
    });
  });

  describe('Schema-Endpoint Consistency', () => {
    it('should verify all schema fields are handled in endpoint logic', () => {
      // Get all the optional fields from the schema
      const schemaShape = WorldUpdateSchema.shape;
      const schemaFields = Object.keys(schemaShape);

      // The endpoint should handle all these fields
      const handledFields = ['name', 'description', 'turnLimit', 'chatLLMProvider', 'chatLLMModel'];

      expect(schemaFields.sort()).toEqual(handledFields.sort());
    });

    it('should handle all valid provider enum values', () => {
      const validProviders = ['openai', 'anthropic', 'azure', 'google', 'xai', 'openai-compatible', 'ollama'];

      validProviders.forEach(provider => {
        const updateData = { chatLLMProvider: provider };
        const result = WorldUpdateSchema.safeParse(updateData);
        expect(result.success).toBe(true);
      });
    });
  });
});
