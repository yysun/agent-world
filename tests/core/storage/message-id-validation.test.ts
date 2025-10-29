/**
 * Unit Tests for Message ID Auto-Migration (Priority 2)
 *
 * Features:
 * - Tests automatic migration of messages without messageIds
 * - Validates that legacy data is automatically fixed on load/save
 * - Ensures migration works across different storage backends
 * - Tests that valid agents with complete messageIds work normally
 *
 * Implementation:
 * - Tests memory storage auto-migration
 * - Tests storage factory wrapper auto-migration
 * - Validates migration logging and behavior
 */

import { describe, test, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMemoryStorage } from '../../../core/storage/memory-storage';
import type { Agent, AgentMessage } from '../../../core/types';
import { LLMProvider } from '../../../core/types';

// Mock generateId to ensure it works in tests
let idCounter = 0;
vi.mock('../../../core/utils', async () => {
  const actual = await vi.importActual<typeof import('../../../core/utils')>('../../../core/utils');
  return {
    ...actual,
    generateId: vi.fn(() => `test-id-${++idCounter}`)
  };
});

describe('Message ID Validation', () => {
  let storage: any;
  const worldId = 'test-world';

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  describe('Priority 2: Auto-Migration Layer', () => {
    test('should auto-migrate agent with messages missing messageId', async () => {
      const agent: Agent = {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'assistant',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4',
        systemPrompt: 'Test',
        memory: [
          {
            role: 'user',
            content: 'Message without ID',
            createdAt: new Date()
            // messageId is missing!
          } as AgentMessage
        ],
        llmCallCount: 0,
        createdAt: new Date(),
        lastActive: new Date()
      };

      // Should NOT throw - should auto-migrate instead
      await expect(storage.saveAgent(worldId, agent)).resolves.not.toThrow();

      // Verify the agent was saved
      const loaded = await storage.loadAgent(worldId, 'test-agent');
      expect(loaded).toBeDefined();
      expect(loaded.memory).toHaveLength(1);

      // Verify messageId was auto-generated
      expect(loaded.memory[0].messageId).toBeDefined();
      expect(typeof loaded.memory[0].messageId).toBe('string');
      expect(loaded.memory[0].messageId.length).toBeGreaterThan(0);
    });

    test('should accept agent with all messages having messageId', async () => {
      const agent: Agent = {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'assistant',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4',
        systemPrompt: 'Test',
        memory: [
          {
            role: 'user',
            content: 'Message with ID',
            createdAt: new Date(),
            messageId: 'msg-123',
            agentId: 'test-agent'
          } as AgentMessage,
          {
            role: 'assistant',
            content: 'Response with ID',
            createdAt: new Date(),
            messageId: 'msg-456',
            agentId: 'test-agent'
          } as AgentMessage
        ],
        llmCallCount: 0,
        createdAt: new Date(),
        lastActive: new Date()
      };

      await expect(storage.saveAgent(worldId, agent)).resolves.not.toThrow();

      const loaded = await storage.loadAgent(worldId, 'test-agent');
      expect(loaded).toBeDefined();
      expect(loaded.memory).toHaveLength(2);
      expect(loaded.memory[0].messageId).toBe('msg-123');
      expect(loaded.memory[1].messageId).toBe('msg-456');
    });

    test('should auto-migrate mixed messages (some with, some without IDs)', async () => {
      const agent: Agent = {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'assistant',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4',
        systemPrompt: 'Test',
        memory: [
          { role: 'user', content: 'Msg 1', createdAt: new Date() } as AgentMessage,
          { role: 'assistant', content: 'Msg 2', createdAt: new Date(), messageId: 'valid-id' } as AgentMessage,
          { role: 'user', content: 'Msg 3', createdAt: new Date() } as AgentMessage,
        ],
        llmCallCount: 0,
        createdAt: new Date(),
        lastActive: new Date()
      };

      // Should auto-migrate without throwing
      await expect(storage.saveAgent(worldId, agent)).resolves.not.toThrow();

      const loaded = await storage.loadAgent(worldId, 'test-agent');
      expect(loaded).toBeDefined();
      expect(loaded.memory).toHaveLength(3);

      // All messages should now have messageIds
      expect(loaded.memory[0].messageId).toBeDefined();
      expect(loaded.memory[1].messageId).toBe('valid-id'); // Original ID preserved
      expect(loaded.memory[2].messageId).toBeDefined();
    });

    test('should accept agent with empty memory', async () => {
      const agent: Agent = {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'assistant',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4',
        systemPrompt: 'Test',
        memory: [],
        llmCallCount: 0,
        createdAt: new Date(),
        lastActive: new Date()
      };

      await expect(storage.saveAgent(worldId, agent)).resolves.not.toThrow();
    });

    test('should auto-migrate messages with null or undefined messageId', async () => {
      const agentWithNull: Agent = {
        id: 'test-agent-null',
        name: 'Test Agent',
        type: 'assistant',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4',
        systemPrompt: 'Test',
        memory: [
          {
            role: 'user',
            content: 'Message with null ID',
            createdAt: new Date(),
            messageId: null as any
          } as AgentMessage
        ],
        llmCallCount: 0,
        createdAt: new Date(),
        lastActive: new Date()
      };

      // Should auto-migrate null messageId
      await expect(storage.saveAgent(worldId, agentWithNull)).resolves.not.toThrow();

      const loadedNull = await storage.loadAgent(worldId, 'test-agent-null');
      expect(loadedNull).toBeDefined();
      expect(loadedNull.memory[0].messageId).toBeDefined();
      expect(loadedNull.memory[0].messageId).not.toBeNull();

      const agentWithUndefined: Agent = {
        id: 'test-agent-undefined',
        name: 'Test Agent',
        type: 'assistant',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4',
        systemPrompt: 'Test',
        memory: [
          {
            role: 'user',
            content: 'Message with undefined ID',
            createdAt: new Date(),
            messageId: undefined
          } as AgentMessage
        ],
        llmCallCount: 0,
        createdAt: new Date(),
        lastActive: new Date()
      };

      // Should auto-migrate undefined messageId
      await expect(storage.saveAgent(worldId, agentWithUndefined)).resolves.not.toThrow();

      const loadedUndefined = await storage.loadAgent(worldId, 'test-agent-undefined');
      expect(loadedUndefined).toBeDefined();
      expect(loadedUndefined.memory[0].messageId).toBeDefined();
      expect(typeof loadedUndefined.memory[0].messageId).toBe('string');
    });
  });
});
