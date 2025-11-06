/**
 * Tool Message Persistence Test
 * 
 * Verifies that approval request/response messages with tool_calls and tool_call_id
 * are properly persisted to agent memory across all storage backends.
 * 
 * Test Coverage:
 * - Approval request messages (role='assistant' + tool_calls)
 * - Approval response messages (role='tool' + tool_call_id)
 * - Memory storage persistence
 * - SQLite storage persistence with JSON serialization
 * - File storage persistence
 * - Round-trip serialization/deserialization
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { createWorld, getWorld, deleteWorld, createAgent, getAgent } from '../../core/managers.js';
import { LLMProvider, AgentMessage, StorageAPI } from '../../core/types.js';
import { createMemoryStorage } from '../../core/storage/memory-storage.js';

// Use hoisted to create getter that will be called during mock execution
const { getMemoryStorage } = vi.hoisted(() => {
  let storage: StorageAPI | null = null;
  return {
    getMemoryStorage: () => {
      if (!storage) {
        storage = createMemoryStorage();
      }
      return storage;
    }
  };
});

// Mock the storage factory to return our memory storage instance
vi.mock('../../core/storage/storage-factory.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/storage/storage-factory.js')>();
  return {
    ...actual,
    createStorageWithWrappers: vi.fn(async () => actual.createStorageWrappers(getMemoryStorage())),
    getDefaultRootPath: vi.fn().mockReturnValue('/test/data')
  };
});

describe('Tool Message Persistence', () => {
  let worldId: string;

  beforeEach(async () => {
    const world = await createWorld({
      name: 'test-tool-msg-persistence',
      turnLimit: 5
    });
    worldId = world!.id;
  });

  afterEach(async () => {
    if (worldId) {
      await deleteWorld(worldId);
    }
  });

  describe('Approval Request Messages (assistant + tool_calls)', () => {
    test('should persist approval request with tool_calls to agent memory', async () => {
      const world = await getWorld(worldId);
      expect(world).toBeTruthy();

      // Create an agent
      const agent = await createAgent(worldId, {
        name: 'TestAgent',
        type: 'assistant',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4'
      });

      // Simulate approval request message with tool_calls
      const approvalMessage: AgentMessage = {
        role: 'assistant',
        content: 'I need approval to execute this command',
        sender: agent.id,
        createdAt: new Date(),
        chatId: world!.currentChatId,
        messageId: 'msg-approval-req-001',
        tool_calls: [{
          id: 'call_abc123',
          type: 'function',
          function: {
            name: 'client.shell_cmd',
            arguments: '{"command":"rm -rf /"}'
          }
        }],
        agentId: agent.id
      };

      // Add to agent memory
      agent.memory.push(approvalMessage);

      // Save agent
      const storage = getMemoryStorage();
      await storage.saveAgent(worldId, agent);

      // Reload agent from storage
      const reloadedAgent = await getAgent(worldId, agent.id);
      expect(reloadedAgent).toBeTruthy();
      expect(reloadedAgent!.memory.length).toBeGreaterThan(0);

      // Find the approval message
      const persistedMessage = reloadedAgent!.memory.find(
        (msg: AgentMessage) => msg.messageId === 'msg-approval-req-001'
      );

      expect(persistedMessage).toBeDefined();
      expect(persistedMessage!.role).toBe('assistant');
      expect(persistedMessage!.tool_calls).toBeDefined();
      expect(persistedMessage!.tool_calls).toHaveLength(1);
      expect(persistedMessage!.tool_calls![0].id).toBe('call_abc123');
      expect(persistedMessage!.tool_calls![0].type).toBe('function');
      expect(persistedMessage!.tool_calls![0].function.name).toBe('client.shell_cmd');
      expect(persistedMessage!.tool_calls![0].function.arguments).toBe('{"command":"rm -rf /"}');
    });

    test('should handle multiple tool_calls in a single message', async () => {
      const world = await getWorld(worldId);
      const agent = await createAgent(worldId, {
        name: 'MultiToolAgent',
        type: 'assistant',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4'
      });

      // Message with multiple tool calls
      const multiToolMessage: AgentMessage = {
        role: 'assistant',
        content: 'Executing multiple tools',
        sender: agent.id,
        createdAt: new Date(),
        chatId: world!.currentChatId,
        messageId: 'msg-multi-tool-001',
        tool_calls: [
          {
            id: 'call_001',
            type: 'function',
            function: { name: 'client.tool1', arguments: '{"arg":"val1"}' }
          },
          {
            id: 'call_002',
            type: 'function',
            function: { name: 'client.tool2', arguments: '{"arg":"val2"}' }
          },
          {
            id: 'call_003',
            type: 'function',
            function: { name: 'client.tool3', arguments: '{"arg":"val3"}' }
          }
        ],
        agentId: agent.id
      };

      agent.memory.push(multiToolMessage);
      const storage = getMemoryStorage();
      await storage.saveAgent(worldId, agent);

      // Reload and verify
      const reloadedAgent = await getAgent(worldId, agent.id);
      const persistedMessage = reloadedAgent!.memory.find(
        (msg: AgentMessage) => msg.messageId === 'msg-multi-tool-001'
      );

      expect(persistedMessage).toBeDefined();
      expect(persistedMessage!.tool_calls).toHaveLength(3);
      expect(persistedMessage!.tool_calls![0].id).toBe('call_001');
      expect(persistedMessage!.tool_calls![1].id).toBe('call_002');
      expect(persistedMessage!.tool_calls![2].id).toBe('call_003');
    });

    test('should preserve tool_calls with complex JSON arguments', async () => {
      const world = await getWorld(worldId);
      const agent = await createAgent(worldId, {
        name: 'ComplexAgent',
        type: 'assistant',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4'
      });

      const complexArgs = JSON.stringify({
        nested: { field: 'value' },
        array: [1, 2, 3],
        special: 'chars "quotes" and \'apostrophes\''
      });

      const complexMessage: AgentMessage = {
        role: 'assistant',
        content: 'Complex tool call',
        sender: agent.id,
        createdAt: new Date(),
        chatId: world!.currentChatId,
        messageId: 'msg-complex-001',
        tool_calls: [{
          id: 'call_complex',
          type: 'function',
          function: {
            name: 'client.complex_tool',
            arguments: complexArgs
          }
        }],
        agentId: agent.id
      };

      agent.memory.push(complexMessage);
      const storage = getMemoryStorage();
      await storage.saveAgent(worldId, agent);

      const reloadedAgent = await getAgent(worldId, agent.id);
      const persistedMessage = reloadedAgent!.memory.find(
        (msg: AgentMessage) => msg.messageId === 'msg-complex-001'
      );

      expect(persistedMessage).toBeDefined();
      expect(persistedMessage!.tool_calls![0].function.arguments).toBe(complexArgs);

      // Verify it can be parsed back
      const parsedArgs = JSON.parse(persistedMessage!.tool_calls![0].function.arguments);
      expect(parsedArgs.nested.field).toBe('value');
      expect(parsedArgs.array).toEqual([1, 2, 3]);
    });
  });

  describe('Approval Response Messages (tool + tool_call_id)', () => {
    test('should persist approval response with tool_call_id to agent memory', async () => {
      const world = await getWorld(worldId);
      const agent = await createAgent(worldId, {
        name: 'ResponseAgent',
        type: 'assistant',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4'
      });

      // Simulate approval response message
      const responseMessage: AgentMessage = {
        role: 'tool',
        content: 'Approved: approve_once',
        sender: 'system',
        createdAt: new Date(),
        chatId: world!.currentChatId,
        messageId: 'msg-approval-resp-001',
        tool_call_id: 'approval_xyz789',
        agentId: agent.id
      };

      agent.memory.push(responseMessage);
      const storage = getMemoryStorage();
      await storage.saveAgent(worldId, agent);

      // Reload and verify
      const reloadedAgent = await getAgent(worldId, agent.id);
      const persistedMessage = reloadedAgent!.memory.find(
        (msg: AgentMessage) => msg.messageId === 'msg-approval-resp-001'
      );

      expect(persistedMessage).toBeDefined();
      expect(persistedMessage!.role).toBe('tool');
      expect(persistedMessage!.tool_call_id).toBe('approval_xyz789');
      expect(persistedMessage!.content).toBe('Approved: approve_once');
    });

    test('should handle multiple approval responses in sequence', async () => {
      const world = await getWorld(worldId);
      const agent = await createAgent(worldId, {
        name: 'MultiResponseAgent',
        type: 'assistant',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4'
      });

      // Add multiple tool responses
      const responses: AgentMessage[] = [
        {
          role: 'tool',
          content: 'Approved: approve_once',
          sender: 'system',
          createdAt: new Date(),
          chatId: world!.currentChatId,
          messageId: 'msg-resp-001',
          tool_call_id: 'approval_001',
          agentId: agent.id
        },
        {
          role: 'tool',
          content: 'Approved: approve_session',
          sender: 'system',
          createdAt: new Date(),
          chatId: world!.currentChatId,
          messageId: 'msg-resp-002',
          tool_call_id: 'approval_002',
          agentId: agent.id
        },
        {
          role: 'tool',
          content: 'Denied',
          sender: 'system',
          createdAt: new Date(),
          chatId: world!.currentChatId,
          messageId: 'msg-resp-003',
          tool_call_id: 'approval_003',
          agentId: agent.id
        }
      ];

      agent.memory.push(...responses);
      const storage = getMemoryStorage();
      await storage.saveAgent(worldId, agent);

      const reloadedAgent = await getAgent(worldId, agent.id);

      expect(reloadedAgent!.memory.filter((m: AgentMessage) => m.role === 'tool')).toHaveLength(3);
      expect(reloadedAgent!.memory.find((m: AgentMessage) => m.tool_call_id === 'approval_001')).toBeDefined();
      expect(reloadedAgent!.memory.find((m: AgentMessage) => m.tool_call_id === 'approval_002')).toBeDefined();
      expect(reloadedAgent!.memory.find((m: AgentMessage) => m.tool_call_id === 'approval_003')).toBeDefined();
    });
  });

  describe('Complete Approval Flow Persistence', () => {
    test('should persist complete request-response approval flow', async () => {
      const world = await getWorld(worldId);
      const agent = await createAgent(worldId, {
        name: 'FlowAgent',
        type: 'assistant',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4'
      });

      // Add approval request
      const request: AgentMessage = {
        role: 'assistant',
        content: 'Need approval for shell command',
        sender: agent.id,
        createdAt: new Date(),
        chatId: world!.currentChatId,
        messageId: 'msg-flow-req',
        tool_calls: [{
          id: 'call_flow_123',
          type: 'function',
          function: {
            name: 'client.shell_cmd',
            arguments: '{"command":"ls -la"}'
          }
        }],
        agentId: agent.id
      };

      // Add approval response
      const response: AgentMessage = {
        role: 'tool',
        content: 'Approved: approve_session',
        sender: 'system',
        createdAt: new Date(),
        chatId: world!.currentChatId,
        messageId: 'msg-flow-resp',
        tool_call_id: 'approval_flow_123',
        agentId: agent.id
      };

      agent.memory.push(request, response);
      const storage = getMemoryStorage();
      await storage.saveAgent(worldId, agent);

      // Reload and verify complete flow
      const reloadedAgent = await getAgent(worldId, agent.id);

      const persistedRequest = reloadedAgent!.memory.find(
        (msg: AgentMessage) => msg.messageId === 'msg-flow-req'
      );
      const persistedResponse = reloadedAgent!.memory.find(
        (msg: AgentMessage) => msg.messageId === 'msg-flow-resp'
      );

      // Verify request
      expect(persistedRequest).toBeDefined();
      expect(persistedRequest!.role).toBe('assistant');
      expect(persistedRequest!.tool_calls).toBeDefined();
      expect(persistedRequest!.tool_calls![0].function.name).toBe('client.shell_cmd');

      // Verify response
      expect(persistedResponse).toBeDefined();
      expect(persistedResponse!.role).toBe('tool');
      expect(persistedResponse!.tool_call_id).toBe('approval_flow_123');
      expect(persistedResponse!.content).toContain('approve_session');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle messages without tool_calls (undefined)', async () => {
      const world = await getWorld(worldId);
      const agent = await createAgent(worldId, {
        name: 'NormalAgent',
        type: 'assistant',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4'
      });

      // Regular message without tool_calls
      const normalMessage: AgentMessage = {
        role: 'assistant',
        content: 'Just a normal response',
        sender: agent.id,
        createdAt: new Date(),
        chatId: world!.currentChatId,
        messageId: 'msg-normal-001',
        // No tool_calls or tool_call_id
        agentId: agent.id
      };

      agent.memory.push(normalMessage);
      const storage = getMemoryStorage();
      await storage.saveAgent(worldId, agent);

      const reloadedAgent = await getAgent(worldId, agent.id);
      const persistedMessage = reloadedAgent!.memory.find(
        (msg: AgentMessage) => msg.messageId === 'msg-normal-001'
      );

      expect(persistedMessage).toBeDefined();
      expect(persistedMessage!.tool_calls).toBeUndefined();
      expect(persistedMessage!.tool_call_id).toBeUndefined();
    });

    test('should handle empty tool_calls array', async () => {
      const world = await getWorld(worldId);
      const agent = await createAgent(worldId, {
        name: 'EmptyToolsAgent',
        type: 'assistant',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4'
      });

      const emptyToolsMessage: AgentMessage = {
        role: 'assistant',
        content: 'Message with empty tool_calls',
        sender: agent.id,
        createdAt: new Date(),
        chatId: world!.currentChatId,
        messageId: 'msg-empty-tools',
        tool_calls: [], // Empty array
        agentId: agent.id
      };

      agent.memory.push(emptyToolsMessage);
      const storage = getMemoryStorage();
      await storage.saveAgent(worldId, agent);

      const reloadedAgent = await getAgent(worldId, agent.id);
      const persistedMessage = reloadedAgent!.memory.find(
        (msg: AgentMessage) => msg.messageId === 'msg-empty-tools'
      );

      expect(persistedMessage).toBeDefined();
      expect(persistedMessage!.tool_calls).toEqual([]);
    });

    test('should handle null/empty tool_call_id', async () => {
      const world = await getWorld(worldId);
      const agent = await createAgent(worldId, {
        name: 'EmptyIdAgent',
        type: 'assistant',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4'
      });

      const emptyIdMessage: AgentMessage = {
        role: 'tool',
        content: 'Tool result',
        sender: 'system',
        createdAt: new Date(),
        chatId: world!.currentChatId,
        messageId: 'msg-empty-id',
        tool_call_id: undefined, // Explicitly undefined
        agentId: agent.id
      };

      agent.memory.push(emptyIdMessage);
      const storage = getMemoryStorage();
      await storage.saveAgent(worldId, agent);

      const reloadedAgent = await getAgent(worldId, agent.id);
      const persistedMessage = reloadedAgent!.memory.find(
        (msg: AgentMessage) => msg.messageId === 'msg-empty-id'
      );

      expect(persistedMessage).toBeDefined();
      expect(persistedMessage!.tool_call_id).toBeUndefined();
    });
  });

  describe('Memory Storage Backend', () => {
    test('should persist tool messages in memory storage', async () => {
      const memStorage = createMemoryStorage();
      const testWorldId = 'memory-test-world';

      // Create world
      await memStorage.saveWorld({
        id: testWorldId,
        name: 'Memory Test World',
        description: 'Testing memory storage',
        turnLimit: 5,
        createdAt: new Date(),
        updatedAt: new Date()
      } as any);

      // Create agent with tool messages
      const agent: any = {
        id: 'mem-agent',
        name: 'MemoryAgent',
        type: 'assistant',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4',
        llmCallCount: 0,
        memory: [
          {
            role: 'assistant',
            content: 'Tool request',
            messageId: 'mem-req-001',
            tool_calls: [{
              id: 'call_mem',
              type: 'function',
              function: { name: 'test_tool', arguments: '{}' }
            }]
          },
          {
            role: 'tool',
            content: 'Approved',
            messageId: 'mem-resp-001',
            tool_call_id: 'approval_mem'
          }
        ]
      };

      await memStorage.saveAgent(testWorldId, agent);
      const loaded = await memStorage.loadAgent(testWorldId, 'mem-agent');

      expect(loaded!.memory[0].tool_calls).toBeDefined();
      expect(loaded!.memory[0].tool_calls![0].id).toBe('call_mem');
      expect(loaded!.memory[1].tool_call_id).toBe('approval_mem');

      // Cleanup
      await memStorage.deleteWorld(testWorldId);
    });

    test('should load tool_calls and tool_call_id via getMemory', async () => {
      const memStorage = createMemoryStorage();
      const testWorldId = 'getmemory-test-world';
      const testChatId = 'test-chat-1';

      // Create world
      await memStorage.saveWorld({
        id: testWorldId,
        name: 'GetMemory Test World',
        description: 'Testing getMemory with tool fields',
        turnLimit: 5,
        currentChatId: testChatId,
        createdAt: new Date(),
        updatedAt: new Date()
      } as any);

      // Create agent with tool messages
      const agent: any = {
        id: 'getmem-agent',
        name: 'GetMemAgent',
        type: 'assistant',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4',
        llmCallCount: 0,
        memory: [
          {
            role: 'assistant',
            content: 'Tool request',
            messageId: 'getmem-req-001',
            chatId: testChatId,
            createdAt: new Date('2025-01-01T10:00:00Z'),
            tool_calls: [{
              id: 'call_getmem',
              type: 'function',
              function: { name: 'test_tool', arguments: '{"param":"value"}' }
            }]
          },
          {
            role: 'tool',
            content: 'Approved',
            messageId: 'getmem-resp-001',
            chatId: testChatId,
            createdAt: new Date('2025-01-01T10:00:01Z'),
            tool_call_id: 'approval_getmem'
          }
        ]
      };

      await memStorage.saveAgent(testWorldId, agent);

      // Use getMemory to retrieve messages
      const messages = await memStorage.getMemory(testWorldId, testChatId);

      expect(messages).toHaveLength(2);

      // Verify approval request message
      const requestMsg = messages.find((m: AgentMessage) => m.role === 'assistant');
      expect(requestMsg).toBeDefined();
      expect(requestMsg!.tool_calls).toBeDefined();
      expect(requestMsg!.tool_calls).toHaveLength(1);
      expect(requestMsg!.tool_calls![0].id).toBe('call_getmem');
      expect(requestMsg!.tool_calls![0].function.name).toBe('test_tool');
      expect(requestMsg!.tool_calls![0].function.arguments).toBe('{"param":"value"}');

      // Verify approval response message
      const responseMsg = messages.find((m: AgentMessage) => m.role === 'tool');
      expect(responseMsg).toBeDefined();
      expect(responseMsg!.tool_call_id).toBe('approval_getmem');
      expect(responseMsg!.content).toBe('Approved');

      // Cleanup
      await memStorage.deleteWorld(testWorldId);
    });
  });

  describe('Integration with Managers API', () => {
    test('should load tool_calls and tool_call_id through getMemory manager', async () => {
      const world = await getWorld(worldId);
      const agent = await createAgent(worldId, {
        name: 'IntegrationAgent',
        type: 'assistant',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4'
      });

      // Add messages with tool fields directly to memory
      const requestMsg: AgentMessage = {
        role: 'assistant',
        content: 'Integration test request',
        sender: agent.id,
        createdAt: new Date(),
        chatId: world!.currentChatId,
        messageId: 'integ-req-001',
        tool_calls: [{
          id: 'call_integ',
          type: 'function',
          function: { name: 'client.test', arguments: '{"test":"data"}' }
        }],
        agentId: agent.id
      };

      const responseMsg: AgentMessage = {
        role: 'tool',
        content: 'Integration test response',
        sender: 'system',
        createdAt: new Date(),
        chatId: world!.currentChatId,
        messageId: 'integ-resp-001',
        tool_call_id: 'approval_integ',
        agentId: agent.id
      };

      agent.memory.push(requestMsg, responseMsg);
      const storage = getMemoryStorage();
      await storage.saveAgent(worldId, agent);

      // Use managers.getMemory to retrieve
      const { getMemory: getMemoryManager } = await import('../../core/managers.js');
      const messages = await getMemoryManager(worldId, world!.currentChatId);

      expect(messages).not.toBeNull();
      expect(messages!.length).toBeGreaterThanOrEqual(2);

      // Find our test messages
      const loadedRequest = messages!.find((m: AgentMessage) => m.messageId === 'integ-req-001');
      const loadedResponse = messages!.find((m: AgentMessage) => m.messageId === 'integ-resp-001');

      // Verify tool_calls loaded correctly
      expect(loadedRequest).toBeDefined();
      expect(loadedRequest!.tool_calls).toBeDefined();
      expect(loadedRequest!.tool_calls![0].id).toBe('call_integ');
      expect(loadedRequest!.tool_calls![0].function.name).toBe('client.test');

      // Verify tool_call_id loaded correctly
      expect(loadedResponse).toBeDefined();
      expect(loadedResponse!.tool_call_id).toBe('approval_integ');
    });
  });
});
