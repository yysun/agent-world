/**
 * Unit tests for subscribeAgentToToolMessages handler
 * 
 * Tests:
 * - Only processes role='tool' messages
 * - Ownership check rejects wrong tool_call_id
 * - Approved tool executes
 * - Denied tool doesn't execute
 * - LLM resumes after approval
 * - Agent filtering (only processes messages for target agent)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { subscribeAgentToToolMessages, publishToolResult } from '../../core/events/index.js';
import type { World, Agent, ToolResultData } from '../../core/types.js';
import { EventEmitter } from 'events';

// Mock storage
const mockStorage = {
  saveAgent: vi.fn().mockResolvedValue(undefined),
  loadAgent: vi.fn(),
  deleteAgent: vi.fn(),
  listAgents: vi.fn(),
  agentExists: vi.fn(),
  saveAgentMemory: vi.fn(),
  archiveMemory: vi.fn(),
  deleteMemoryByChatId: vi.fn(),
  saveAgentsBatch: vi.fn(),
  loadAgentsBatch: vi.fn(),
  saveWorld: vi.fn(),
  loadWorld: vi.fn(),
  deleteWorld: vi.fn(),
  listWorlds: vi.fn(),
  worldExists: vi.fn(),
  getMemory: vi.fn(),
  saveChatData: vi.fn(),
  loadChatData: vi.fn(),
  deleteChatData: vi.fn(),
  listChats: vi.fn(),
  updateChatData: vi.fn(),
  saveWorldChat: vi.fn(),
  loadWorldChat: vi.fn(),
  loadWorldChatFull: vi.fn(),
  restoreFromWorldChat: vi.fn(),
  validateIntegrity: vi.fn(),
  repairData: vi.fn(),
  loadAgentWithRetry: vi.fn()
};

// Mock storage factory
vi.mock('../../core/storage/storage-factory.js', () => ({
  getStorageWrappers: vi.fn(() => Promise.resolve(mockStorage)),
  createStorageWithWrappers: vi.fn(() => Promise.resolve(mockStorage))
}));

// Mock shell command tool
let executeShellCommandMock = vi.fn().mockResolvedValue({
  exitCode: 0,
  stdout: 'mock command output',
  stderr: '',
  duration: 100
});

vi.mock('../../core/shell-cmd-tool.js', () => ({
  executeShellCommand: (...args: any[]) => executeShellCommandMock(...args)
}));

describe('subscribeAgentToToolMessages', () => {
  let world: World;
  let agent: Agent;
  let cleanup: () => void;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset executeShellCommand mock
    executeShellCommandMock = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: 'mock command output',
      stderr: '',
      duration: 100
    });

    const eventEmitter = new EventEmitter();

    world = {
      id: 'test-world',
      name: 'Test World',
      turnLimit: 5,
      currentChatId: 'test-chat',
      createdAt: new Date(),
      lastUpdated: new Date(),
      totalAgents: 1,
      totalMessages: 0,
      eventEmitter,
      agents: new Map(),
      chats: new Map(),
    };

    agent = {
      id: 'test-agent',
      name: 'Test Agent',
      type: 'assistant',
      provider: 'openai' as any,
      model: 'gpt-4',
      llmCallCount: 0,
      memory: []
    };
  });

  afterEach(() => {
    if (cleanup) {
      cleanup();
    }
  });

  it('should only process role="tool" messages', async () => {
    cleanup = subscribeAgentToToolMessages(world, agent);

    // Send a regular user message
    world.eventEmitter.emit('message', {
      content: '@test-agent hello',
      sender: 'human',
      timestamp: new Date(),
      messageId: 'msg-1',
      chatId: 'test-chat'
    });

    // Should not save anything (no tool result)
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(mockStorage.saveAgent).not.toHaveBeenCalled();
  });

  it('should reject tool calls not in agent memory (security)', async () => {
    cleanup = subscribeAgentToToolMessages(world, agent);

    const toolData: ToolResultData = {
      tool_call_id: 'unknown_call_123',
      decision: 'approve',
      toolName: 'shell_cmd',
      toolArgs: { command: 'ls' }
    };

    publishToolResult(world, agent.id, toolData);

    // Wait for async handler
    await new Promise(resolve => setTimeout(resolve, 50));

    // Should NOT save or execute (security rejection)
    expect(mockStorage.saveAgent).not.toHaveBeenCalled();
  });

  it('should accept tool calls that exist in agent memory', async () => {
    // Add a tool call to agent memory
    agent.memory.push({
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: 'call_valid_123',
        type: 'function',
        function: {
          name: 'shell_cmd',
          arguments: JSON.stringify({ command: 'ls' })
        }
      }]
    });

    cleanup = subscribeAgentToToolMessages(world, agent);

    const toolData: ToolResultData = {
      tool_call_id: 'call_valid_123',
      decision: 'approve',
      toolName: 'shell_cmd',
      toolArgs: { command: 'ls' }
    };

    publishToolResult(world, agent.id, toolData);

    // Wait for async handler
    await new Promise(resolve => setTimeout(resolve, 100));

    // Should save agent (tool result added to memory)
    expect(mockStorage.saveAgent).toHaveBeenCalled();
    expect(agent.memory.length).toBe(2); // Original + tool result
    expect(agent.memory[1].role).toBe('tool');
  });

  it('should execute approved tools', async () => {
    agent.memory.push({
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: 'call_exec_123',
        type: 'function',
        function: {
          name: 'shell_cmd',
          arguments: JSON.stringify({ command: 'pwd' })
        }
      }]
    });

    cleanup = subscribeAgentToToolMessages(world, agent);

    const toolData: ToolResultData = {
      tool_call_id: 'call_exec_123',
      decision: 'approve',
      toolName: 'shell_cmd',
      toolArgs: { command: 'pwd' }
    };

    publishToolResult(world, agent.id, toolData);

    await new Promise(resolve => setTimeout(resolve, 100));

    // Should execute the command
    expect(executeShellCommandMock).toHaveBeenCalledWith('pwd', [], './');

    // Should save result
    expect(agent.memory[1].content).toBe('mock command output');
  });

  it('should NOT execute denied tools', async () => {

    agent.memory.push({
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: 'call_deny_123',
        type: 'function',
        function: {
          name: 'shell_cmd',
          arguments: JSON.stringify({ command: 'rm -rf /' })
        }
      }]
    });

    cleanup = subscribeAgentToToolMessages(world, agent);

    const toolData: ToolResultData = {
      tool_call_id: 'call_deny_123',
      decision: 'deny',
      toolName: 'shell_cmd',
      toolArgs: { command: 'rm -rf /' }
    };

    publishToolResult(world, agent.id, toolData);

    await new Promise(resolve => setTimeout(resolve, 100));

    // Should NOT execute
    expect(executeShellCommandMock).not.toHaveBeenCalled();

    // Should save denial message
    expect(agent.memory[1].content).toBe('Tool execution was denied by the user.');
  });

  it('should resume LLM after approval', async () => {
    agent.memory.push({
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: 'call_resume_123',
        type: 'function',
        function: {
          name: 'shell_cmd',
          arguments: JSON.stringify({ command: 'echo test' })
        }
      }]
    });

    cleanup = subscribeAgentToToolMessages(world, agent);

    const toolData: ToolResultData = {
      tool_call_id: 'call_resume_123',
      decision: 'approve',
      toolName: 'shell_cmd',
      toolArgs: { command: 'echo test' }
    };

    publishToolResult(world, agent.id, toolData);

    await new Promise(resolve => setTimeout(resolve, 100));

    // Should have processed the approval and added tool result to memory
    expect(agent.memory.length).toBe(2);
    expect(agent.memory[1].role).toBe('tool');
    expect(mockStorage.saveAgent).toHaveBeenCalledWith(world.id, agent);
  });

  it('should only process messages for target agent', async () => {
    const agent2: Agent = {
      id: 'other-agent',
      name: 'Other Agent',
      type: 'assistant',
      provider: 'openai' as any,
      model: 'gpt-4',
      llmCallCount: 0,
      memory: [{
        role: 'assistant',
        content: '',
        tool_calls: [{
          id: 'call_other_123',
          type: 'function',
          function: {
            name: 'shell_cmd',
            arguments: JSON.stringify({ command: 'ls' })
          }
        }]
      }]
    };

    cleanup = subscribeAgentToToolMessages(world, agent);

    // Send tool result for agent2, not agent
    const toolData: ToolResultData = {
      tool_call_id: 'call_other_123',
      decision: 'approve',
      toolName: 'shell_cmd'
    };

    publishToolResult(world, 'other-agent', toolData);

    await new Promise(resolve => setTimeout(resolve, 100));

    // agent should NOT process this (wrong target)
    expect(agent.memory.length).toBe(0);
  });

  it('should handle session scope approvals', async () => {
    agent.memory.push({
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: 'call_session_123',
        type: 'function',
        function: {
          name: 'shell_cmd',
          arguments: JSON.stringify({ command: 'ls' })
        }
      }]
    });

    cleanup = subscribeAgentToToolMessages(world, agent);

    const toolData: ToolResultData = {
      tool_call_id: 'call_session_123',
      decision: 'approve',
      scope: 'session',
      toolName: 'shell_cmd',
      toolArgs: { command: 'ls' }
    };

    publishToolResult(world, agent.id, toolData);

    await new Promise(resolve => setTimeout(resolve, 100));

    // Check toolCallStatus was updated with scope
    const toolResult = agent.memory.find(m => m.role === 'tool');
    expect(toolResult?.toolCallStatus).toBeDefined();
    const status = Object.values(toolResult!.toolCallStatus!)[0];
    expect(status.result?.scope).toBe('session');
  });

  it('should handle once scope approvals', async () => {
    agent.memory.push({
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: 'call_once_123',
        type: 'function',
        function: {
          name: 'shell_cmd',
          arguments: JSON.stringify({ command: 'ls' })
        }
      }]
    });

    cleanup = subscribeAgentToToolMessages(world, agent);

    const toolData: ToolResultData = {
      tool_call_id: 'call_once_123',
      decision: 'approve',
      scope: 'once',
      toolName: 'shell_cmd',
      toolArgs: { command: 'ls' }
    };

    publishToolResult(world, agent.id, toolData);

    await new Promise(resolve => setTimeout(resolve, 100));

    // Check toolCallStatus was updated with scope
    const toolResult = agent.memory.find(m => m.role === 'tool');
    expect(toolResult?.toolCallStatus).toBeDefined();
    const status = Object.values(toolResult!.toolCallStatus!)[0];
    expect(status.result?.scope).toBe('once');
  });
});
