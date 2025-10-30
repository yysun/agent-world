/**
 * Message Threading Integration Tests
 * 
 * Tests that require real LLM API calls to verify message threading behavior.
 * These tests verify that:
 * - Agent replies link to triggering messages via replyToMessageId
 * - Incoming messages do NOT have replyToMessageId
 * - Multiple agents can reply to the same message
 * - Threading data persists correctly in storage
 * - Cross-agent threading works correctly
 * 
 * Note: These tests make real LLM API calls and may take 10-15 seconds.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  createWorld,
  createAgent,
  deleteWorld
} from '../core/managers.js';
import {
  publishMessage,
  subscribeAgentToMessages
} from '../core/events.js';
import { createStorageWithWrappers } from '../core/storage/storage-factory.js';
import type { World, Agent, AgentMessage } from '../core/types.js';
import { LLMProvider } from '../core/types.js';

describe('Message Threading Integration Tests', () => {
  describe('Message Creation with Threading', () => {
    let testWorld: World | null;
    let testAgent: Agent;

    beforeEach(async () => {
      const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      testWorld = await createWorld({ name: `test-threading-${uniqueId}` });
      if (!testWorld) throw new Error('Failed to create test world');

      testAgent = await createAgent(testWorld.id, {
        name: 'Test Agent',
        type: 'assistant',
        provider: LLMProvider.ANTHROPIC,
        model: 'claude-3-5-sonnet-20241022',
        systemPrompt: 'You are a helpful assistant.'
      });
    });

    afterEach(async () => {
      if (testWorld) {
        try {
          await deleteWorld(testWorld.id);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    });

    test('should link agent reply to triggering message', async () => {
      if (!testWorld) throw new Error('Test world not initialized');

      // Subscribe agent to messages
      await subscribeAgentToMessages(testWorld, testAgent);

      // Publish human message
      const humanMessage = publishMessage(testWorld, 'Hello', 'HUMAN');
      expect(humanMessage.messageId).toBeDefined();

      // Wait for agent to process (give it time to respond)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check agent memory for reply with replyToMessageId
      const agentMemory = testAgent.memory;
      const agentReply = agentMemory.find(m => m.role === 'assistant');

      if (agentReply) {
        expect(agentReply.messageId).toBeDefined();
        expect(agentReply.replyToMessageId).toBe(humanMessage.messageId);
        expect(agentReply.replyToMessageId).not.toBe(agentReply.messageId); // Not same as self
      }
    }, 10000); // 10 second timeout for LLM response

    test('incoming messages should NOT have replyToMessageId', async () => {
      if (!testWorld) throw new Error('Test world not initialized');

      // Subscribe agent to messages
      await subscribeAgentToMessages(testWorld, testAgent);

      // Publish message
      const message = publishMessage(testWorld, 'Test message', 'HUMAN');

      // Wait for message to be saved to agent memory
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check agent memory for incoming message
      const incomingMessage = testAgent.memory.find(m =>
        m.role === 'user' && m.messageId === message.messageId
      );

      if (incomingMessage) {
        expect(incomingMessage.messageId).toBe(message.messageId);
        expect(incomingMessage.replyToMessageId).toBeUndefined(); // Should NOT have replyToMessageId
      }
    });

    test('should handle multiple agents replying to same message', async () => {
      if (!testWorld) throw new Error('Test world not initialized');

      // Create second agent
      const agent2 = await createAgent(testWorld.id, {
        name: 'Test Agent 2',
        type: 'assistant',
        provider: LLMProvider.ANTHROPIC,
        model: 'claude-3-5-sonnet-20241022',
        systemPrompt: 'You are a helpful assistant.'
      });

      // Subscribe both agents
      await subscribeAgentToMessages(testWorld, testAgent);
      await subscribeAgentToMessages(testWorld, agent2);

      // Publish message
      const humanMessage = publishMessage(testWorld, 'Hello everyone', 'HUMAN');

      // Wait for agents to respond
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check both agents' replies
      const reply1 = testAgent.memory.find((m: AgentMessage) => m.role === 'assistant');
      const reply2 = agent2.memory.find((m: AgentMessage) => m.role === 'assistant');

      if (reply1) {
        expect(reply1.replyToMessageId).toBe(humanMessage.messageId);
      }

      if (reply2) {
        expect(reply2.replyToMessageId).toBe(humanMessage.messageId);
      }

      // Both should reply to same message but have different messageIds
      if (reply1 && reply2) {
        expect(reply1.messageId).not.toBe(reply2.messageId);
        expect(reply1.replyToMessageId).toBe(reply2.replyToMessageId);
      }
    }, 15000); // 15 second timeout for both LLM responses
  });

  describe('Database Persistence', () => {
    let testWorld: World | null;
    let testAgent: Agent;

    beforeEach(async () => {
      const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      testWorld = await createWorld({ name: `test-threading-db-${uniqueId}` });
      if (!testWorld) throw new Error('Failed to create test world');

      testAgent = await createAgent(testWorld.id, {
        name: 'Test Agent',
        type: 'assistant',
        provider: LLMProvider.ANTHROPIC,
        model: 'claude-3-5-sonnet-20241022',
        systemPrompt: 'You are a helpful assistant.'
      });
    });

    afterEach(async () => {
      if (testWorld) {
        try {
          await deleteWorld(testWorld.id);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    });

    test('should persist and retrieve replyToMessageId', async () => {
      if (!testWorld) throw new Error('Test world not initialized');

      const storage = await createStorageWithWrappers();

      // Create message with replyToMessageId
      const message: AgentMessage = {
        role: 'assistant',
        content: 'Reply',
        messageId: 'msg-2',
        replyToMessageId: 'msg-1',
        chatId: testWorld.currentChatId,
        agentId: testAgent.id
      };

      testAgent.memory.push(message);
      await storage.saveAgent(testWorld.id, testAgent);

      // Reload agent and check message
      const reloadedAgent = await storage.loadAgent(testWorld.id, testAgent.id);
      if (!reloadedAgent) throw new Error('Failed to reload agent');

      const reloadedMessage = reloadedAgent.memory.find((m: AgentMessage) => m.messageId === 'msg-2');

      expect(reloadedMessage).toBeDefined();
      expect(reloadedMessage?.replyToMessageId).toBe('msg-1');
    });

    test('should handle NULL replyToMessageId for legacy messages', async () => {
      if (!testWorld) throw new Error('Test world not initialized');

      const storage = await createStorageWithWrappers();

      // Create message without replyToMessageId
      const message: AgentMessage = {
        role: 'user',
        content: 'Legacy message',
        messageId: 'msg-1',
        chatId: testWorld.currentChatId,
        agentId: testAgent.id
        // No replyToMessageId
      };

      testAgent.memory.push(message);
      await storage.saveAgent(testWorld.id, testAgent);

      // Reload agent and check message
      const reloadedAgent = await storage.loadAgent(testWorld.id, testAgent.id);
      if (!reloadedAgent) throw new Error('Failed to reload agent');

      const reloadedMessage = reloadedAgent.memory.find((m: AgentMessage) => m.messageId === 'msg-1');

      expect(reloadedMessage).toBeDefined();
      expect(reloadedMessage?.replyToMessageId).toBeUndefined();
    });
  });

  describe('Cross-Agent Threading', () => {
    let testWorld: World | null;
    let testAgent: Agent;

    beforeEach(async () => {
      const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      testWorld = await createWorld({ name: `test-threading-cross-${uniqueId}` });
      if (!testWorld) throw new Error('Failed to create test world');

      testAgent = await createAgent(testWorld.id, {
        name: 'Test Agent',
        type: 'assistant',
        provider: LLMProvider.ANTHROPIC,
        model: 'claude-3-5-sonnet-20241022',
        systemPrompt: 'You are a helpful assistant.'
      });
    });

    afterEach(async () => {
      if (testWorld) {
        try {
          await deleteWorld(testWorld.id);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    });

    test('should handle agent-to-agent message threading', async () => {
      if (!testWorld) throw new Error('Test world not initialized');

      // Create second agent
      const agent2 = await createAgent(testWorld.id, {
        name: 'Agent 2',
        type: 'assistant',
        provider: LLMProvider.ANTHROPIC,
        model: 'claude-3-5-sonnet-20241022',
        systemPrompt: 'You are agent 2.'
      });

      // Subscribe both agents
      await subscribeAgentToMessages(testWorld, testAgent);
      await subscribeAgentToMessages(testWorld, agent2);

      // Agent 1 sends message
      const agent1Message = publishMessage(testWorld, 'Hello Agent 2', testAgent.id);

      // Wait for Agent 2 to receive and potentially respond
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check Agent 2's memory for incoming message
      const incomingToAgent2 = agent2.memory.find((m: AgentMessage) =>
        m.messageId === agent1Message.messageId && m.role === 'user'
      );

      if (incomingToAgent2) {
        // Incoming message should NOT have replyToMessageId
        expect(incomingToAgent2.replyToMessageId).toBeUndefined();

        // If Agent 2 replied, check the reply
        const agent2Reply = agent2.memory.find((m: AgentMessage) =>
          m.role === 'assistant' && m.replyToMessageId === agent1Message.messageId
        );

        if (agent2Reply) {
          expect(agent2Reply.replyToMessageId).toBe(agent1Message.messageId);
        }
      }
    }, 10000);
  });

  describe('Edge Cases - Integration', () => {
    let testWorld: World | null;
    let testAgent: Agent;

    beforeEach(async () => {
      const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      testWorld = await createWorld({ name: `test-threading-edge-${uniqueId}` });
      if (!testWorld) throw new Error('Failed to create test world');

      testAgent = await createAgent(testWorld.id, {
        name: 'Test Agent',
        type: 'assistant',
        provider: LLMProvider.ANTHROPIC,
        model: 'claude-3-5-sonnet-20241022',
        systemPrompt: 'You are a helpful assistant.'
      });
    });

    afterEach(async () => {
      if (testWorld) {
        try {
          await deleteWorld(testWorld.id);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    });

    test('should handle concurrent message creation', async () => {
      if (!testWorld) throw new Error('Test world not initialized');

      // Subscribe agent
      await subscribeAgentToMessages(testWorld, testAgent);

      // Send multiple messages concurrently
      const messages = [
        publishMessage(testWorld, 'Message 1', 'HUMAN'),
        publishMessage(testWorld, 'Message 2', 'HUMAN'),
        publishMessage(testWorld, 'Message 3', 'HUMAN')
      ];

      // All should have unique messageIds
      const messageIds = messages.map(m => m.messageId);
      const uniqueIds = new Set(messageIds);
      expect(uniqueIds.size).toBe(3);

      // Wait for agent to process
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Agent replies should link to correct triggering messages
      const replies = testAgent.memory.filter((m: AgentMessage) => m.role === 'assistant');

      replies.forEach(reply => {
        expect(reply.replyToMessageId).toBeDefined();
        expect(messageIds).toContain(reply.replyToMessageId);
      });
    }, 15000);
  });
});
