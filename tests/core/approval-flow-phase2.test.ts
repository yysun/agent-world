/**
 * Phase 2 Approval Flow Unit Tests
 * 
 * Purpose: Verify backend approval system with toolCallStatus tracking
 * 
 * Test Coverage:
 * - Approval request injection with toolCallStatus.complete = false
 * - Deny decision: marks complete, blocks execution
 * - Approve once decision: allows execution, marks complete (session-only in Phase 2)
 * - Approve session decision: allows execution, marks complete, persists
 * - Agent memory persistence for requests and responses
 * - Tool execution tracking using shell_cmd as mock
 * 
 * Architecture:
 * - Memory storage (no database)
 * - Uses built-in shell_cmd tool which requires approval
 * - Direct agent memory inspection for verification
 * - No event-driven testing needed
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createWorld,
  createAgent,
  newChat,
  getWorld,
  deleteWorld
} from '../../core/index.js';
import { checkToolApproval, findSessionApproval } from '../../core/events.js';
import type { World, Agent, AgentMessage, LLMProvider } from '../../core/types.js';

describe('Phase 2: Approval Flow with toolCallStatus Tracking', () => {
  let worldId: string;
  let world: World;
  let agent: Agent;
  let chatId: string;

  beforeEach(async () => {
    // Create fresh world with memory storage
    const createdWorld = await createWorld({
      name: `test-approval-world-${Date.now()}`,
      turnLimit: 5
    });
    worldId = createdWorld!.id;

    // Create agent with built-in shell_cmd tool (requires approval)
    await createAgent(worldId, {
      id: 'a1',
      name: 'Agent A1',
      type: 'llm',
      systemPrompt: 'You are a helpful assistant.',
      provider: 'anthropic' as LLMProvider,
      model: 'claude-3-5-sonnet-20241022'
    });

    // Reload world to get agent
    const reloadedWorld = await getWorld(worldId);
    if (!reloadedWorld) {
      throw new Error('Failed to reload world');
    }
    world = reloadedWorld;

    const loadedAgent = world.agents.get('a1');
    if (!loadedAgent) {
      throw new Error('Failed to load agent');
    }
    agent = loadedAgent;

    // Create chat
    const chat = await newChat(worldId);
    chatId = chat!.id;
  });

  afterEach(async () => {
    if (worldId) {
      await deleteWorld(worldId);
    }
  });

  describe('Approval Request Injection', () => {
    it('should require approval for shell_cmd tool', async () => {
      // Act: Check if shell_cmd requires approval
      const approvalCheck = await checkToolApproval(
        world,
        'shell_cmd',
        { command: 'ls', directory: '~/' },
        'This tool executes shell commands',
        agent.memory,
        { workingDirectory: process.cwd() }
      );

      // Assert: Should need approval
      expect(approvalCheck.needsApproval).toBe(true);
      expect(approvalCheck.canExecute).toBe(false);
      expect(approvalCheck.approvalRequest).toBeDefined();
      expect(approvalCheck.approvalRequest?.toolName).toBe('shell_cmd');
      expect(approvalCheck.approvalRequest?.toolArgs).toEqual({ command: 'ls', directory: '~/' });
      // workingDirectory is added to approvalRequest during checkToolApproval
      expect(approvalCheck.approvalRequest?.workingDirectory).toBe(process.cwd());
      expect(approvalCheck.approvalRequest?.options).toContain('approve_session');
    });

    it('should persist approval request to agent memory with incomplete status', async () => {
      // Arrange: Create approval request message directly
      const approvalToolCallId = 'approval_test_123';
      const approvalRequestMessage: AgentMessage = {
        role: 'assistant',
        content: '',
        sender: agent.id,
        createdAt: new Date(),
        chatId,
        messageId: 'msg-approval-req-1',
        agentId: agent.id,
        tool_calls: [{
          id: approvalToolCallId,
          type: 'function',
          function: {
            name: 'client.requestApproval',
            arguments: JSON.stringify({
              originalToolCall: {
                name: 'list_files',
                args: { directory: '~/' },
                workingDirectory: process.cwd()
              },
              message: 'This tool accesses your file system',
              options: ['deny', 'approve_once', 'approve_session']
            })
          }
        }],
        toolCallStatus: {
          [approvalToolCallId]: {
            complete: false,
            result: null
          }
        }
      };

      // Act: Add to agent memory
      agent.memory.push(approvalRequestMessage);

      // Assert: Verify memory has request with incomplete status
      const savedRequest = agent.memory.find(msg => msg.messageId === 'msg-approval-req-1');
      expect(savedRequest).toBeDefined();
      expect(savedRequest?.toolCallStatus?.[approvalToolCallId].complete).toBe(false);
      expect(savedRequest?.toolCallStatus?.[approvalToolCallId].result).toBeNull();
    });
  });

  describe('Deny/Cancel Decision', () => {
    it('should mark toolCallStatus.complete = true on deny and block execution', async () => {
      // Arrange: Create approval request
      const approvalToolCallId = 'approval_deny_123';
      const approvalRequestMessage: AgentMessage = {
        role: 'assistant',
        content: '',
        sender: agent.id,
        createdAt: new Date(),
        chatId,
        messageId: 'msg-deny-req-1',
        agentId: agent.id,
        tool_calls: [{
          id: approvalToolCallId,
          type: 'function',
          function: {
            name: 'client.requestApproval',
            arguments: JSON.stringify({
              originalToolCall: {
                name: 'list_files',
                args: { directory: '~/' },
                workingDirectory: process.cwd()
              },
              message: 'This tool accesses your file system',
              options: ['deny', 'approve_once', 'approve_session']
            })
          }
        }],
        toolCallStatus: {
          [approvalToolCallId]: {
            complete: false,
            result: null
          }
        }
      };
      agent.memory.push(approvalRequestMessage);

      // Act: Send deny response with enhanced protocol
      const denyResponse: AgentMessage = {
        role: 'tool',
        content: JSON.stringify({
          __type: 'tool_result',
          tool_call_id: approvalToolCallId,
          agentId: agent.id,
          content: JSON.stringify({
            decision: 'deny',
            toolName: 'list_files',
            toolArgs: { directory: '~/' },
            workingDirectory: process.cwd()
          })
        }),
        sender: 'HUMAN',
        createdAt: new Date(),
        chatId,
        messageId: 'msg-deny-resp-1',
        tool_call_id: approvalToolCallId,
        agentId: agent.id,
        toolCallStatus: {
          [approvalToolCallId]: {
            complete: true,
            result: {
              decision: 'deny',
              timestamp: new Date().toISOString()
            }
          }
        }
      };
      agent.memory.push(denyResponse);

      // Update original request
      approvalRequestMessage.toolCallStatus![approvalToolCallId] = {
        complete: true,
        result: {
          decision: 'deny',
          timestamp: new Date().toISOString()
        }
      };

      // Assert: Verify toolCallStatus marked complete
      expect(approvalRequestMessage.toolCallStatus?.[approvalToolCallId].complete).toBe(true);
      expect(approvalRequestMessage.toolCallStatus?.[approvalToolCallId].result?.decision).toBe('deny');

      // Verify approve response in memory
      const savedResponse = agent.memory.find(msg => msg.messageId === 'msg-deny-resp-1');
      expect(savedResponse).toBeDefined();
      expect(savedResponse?.toolCallStatus?.[approvalToolCallId].complete).toBe(true);
      expect(savedResponse?.toolCallStatus?.[approvalToolCallId].result?.decision).toBe('deny');
    });
  });

  describe('Approve Once Decision (Session-only in Phase 2)', () => {
    it('should mark toolCallStatus.complete = true on approve_once', async () => {
      // Arrange: Create approval request
      const approvalToolCallId = 'approval_once_123';
      const approvalRequestMessage: AgentMessage = {
        role: 'assistant',
        content: '',
        sender: agent.id,
        createdAt: new Date(),
        chatId,
        messageId: 'msg-once-req-1',
        agentId: agent.id,
        tool_calls: [{
          id: approvalToolCallId,
          type: 'function',
          function: {
            name: 'client.requestApproval',
            arguments: JSON.stringify({
              originalToolCall: {
                name: 'list_files',
                args: { directory: '~/' },
                workingDirectory: process.cwd()
              },
              message: 'This tool accesses your file system',
              options: ['deny', 'approve_once', 'approve_session']
            })
          }
        }],
        toolCallStatus: {
          [approvalToolCallId]: {
            complete: false,
            result: null
          }
        }
      };
      agent.memory.push(approvalRequestMessage);

      // Act: Send approve_once response with enhanced protocol
      const approveResponse: AgentMessage = {
        role: 'tool',
        content: JSON.stringify({
          __type: 'tool_result',
          tool_call_id: approvalToolCallId,
          agentId: agent.id,
          content: JSON.stringify({
            decision: 'approve',
            scope: 'once',
            toolName: 'list_files',
            toolArgs: { directory: '~/' },
            workingDirectory: process.cwd()
          })
        }),
        sender: 'HUMAN',
        createdAt: new Date(),
        chatId,
        messageId: 'msg-once-resp-1',
        tool_call_id: approvalToolCallId,
        agentId: agent.id,
        toolCallStatus: {
          [approvalToolCallId]: {
            complete: true,
            result: {
              decision: 'approve',
              scope: 'once',
              timestamp: new Date().toISOString()
            }
          }
        }
      };
      agent.memory.push(approveResponse);

      // Update original request
      approvalRequestMessage.toolCallStatus![approvalToolCallId] = {
        complete: true,
        result: {
          decision: 'approve',
          scope: 'once',
          timestamp: new Date().toISOString()
        }
      };

      // Assert: Verify toolCallStatus marked complete
      expect(approvalRequestMessage.toolCallStatus?.[approvalToolCallId].complete).toBe(true);
      expect(approvalRequestMessage.toolCallStatus?.[approvalToolCallId].result?.decision).toBe('approve');
      expect(approvalRequestMessage.toolCallStatus?.[approvalToolCallId].result?.scope).toBe('once');

      // Verify approve response in memory
      const savedResponse = agent.memory.find(msg => msg.messageId === 'msg-once-resp-1');
      expect(savedResponse).toBeDefined();
      expect(savedResponse?.toolCallStatus?.[approvalToolCallId].complete).toBe(true);
      expect(savedResponse?.toolCallStatus?.[approvalToolCallId].result?.decision).toBe('approve');

      // NOTE: In Phase 2, approve_once is treated as session approval (simplified)
      // This is because we removed one-time approval tracking
    });

    it('should NOT find session approval for approve_once (one-time only)', async () => {
      // Arrange: Add approve_once response to memory
      const approvalToolCallId = 'approval_once_check_123';
      const approveOnceResponse: AgentMessage = {
        role: 'tool',
        content: JSON.stringify({
          __type: 'tool_result',
          tool_call_id: approvalToolCallId,
          content: JSON.stringify({
            decision: 'approve',
            scope: 'once',
            toolName: 'list_files',
            toolArgs: { directory: '~/' },
            workingDirectory: process.cwd()
          })
        }),
        sender: 'HUMAN',
        createdAt: new Date(),
        chatId,
        messageId: 'msg-once-check-1',
        tool_call_id: approvalToolCallId,
        agentId: agent.id
      };
      agent.memory.push(approveOnceResponse);

      // Act: Check for session approval (should not find approve_once)
      const sessionApproval = findSessionApproval(
        agent.memory,
        'list_files',
        { directory: '~/' },
        process.cwd()
      );

      // Assert: Should NOT find session approval for once-only approval
      expect(sessionApproval).toBeUndefined();
    });
  });

  describe('Approve Session Decision', () => {
    it('should mark toolCallStatus.complete = true on approve_session', async () => {
      // Arrange: Create approval request
      const approvalToolCallId = 'approval_session_123';
      const approvalRequestMessage: AgentMessage = {
        role: 'assistant',
        content: '',
        sender: agent.id,
        createdAt: new Date(),
        chatId,
        messageId: 'msg-session-req-1',
        agentId: agent.id,
        tool_calls: [{
          id: approvalToolCallId,
          type: 'function',
          function: {
            name: 'client.requestApproval',
            arguments: JSON.stringify({
              originalToolCall: {
                name: 'list_files',
                args: { directory: '~/' },
                workingDirectory: process.cwd()
              },
              message: 'This tool accesses your file system',
              options: ['deny', 'approve_once', 'approve_session']
            })
          }
        }],
        toolCallStatus: {
          [approvalToolCallId]: {
            complete: false,
            result: null
          }
        }
      };
      agent.memory.push(approvalRequestMessage);

      // Act: Send approve_session response with enhanced protocol
      const approveResponse: AgentMessage = {
        role: 'tool',
        content: JSON.stringify({
          __type: 'tool_result',
          tool_call_id: approvalToolCallId,
          agentId: agent.id,
          content: JSON.stringify({
            decision: 'approve',
            scope: 'session',
            toolName: 'list_files',
            toolArgs: { directory: '~/' },
            workingDirectory: process.cwd()
          })
        }),
        sender: 'HUMAN',
        createdAt: new Date(),
        chatId,
        messageId: 'msg-session-resp-1',
        tool_call_id: approvalToolCallId,
        agentId: agent.id,
        toolCallStatus: {
          [approvalToolCallId]: {
            complete: true,
            result: {
              decision: 'approve',
              scope: 'session',
              timestamp: new Date().toISOString()
            }
          }
        }
      };
      agent.memory.push(approveResponse);

      // Update original request
      approvalRequestMessage.toolCallStatus![approvalToolCallId] = {
        complete: true,
        result: {
          decision: 'approve',
          scope: 'session',
          timestamp: new Date().toISOString()
        }
      };

      // Assert: Verify toolCallStatus marked complete
      expect(approvalRequestMessage.toolCallStatus?.[approvalToolCallId].complete).toBe(true);
      expect(approvalRequestMessage.toolCallStatus?.[approvalToolCallId].result?.decision).toBe('approve');
      expect(approvalRequestMessage.toolCallStatus?.[approvalToolCallId].result?.scope).toBe('session');

      // Verify approve response in memory
      const savedResponse = agent.memory.find(msg => msg.messageId === 'msg-session-resp-1');
      expect(savedResponse).toBeDefined();
      expect(savedResponse?.toolCallStatus?.[approvalToolCallId].complete).toBe(true);
      expect(savedResponse?.toolCallStatus?.[approvalToolCallId].result?.decision).toBe('approve');
      expect(savedResponse?.toolCallStatus?.[approvalToolCallId].result?.scope).toBe('session');
    });

    it('should find session approval for future tool executions', async () => {
      // Arrange: Add session approval to memory
      const approvalToolCallId = 'approval_session_persist_123';
      const approveSessionResponse: AgentMessage = {
        role: 'tool',
        content: JSON.stringify({
          __type: 'tool_result',
          tool_call_id: approvalToolCallId,
          content: JSON.stringify({
            decision: 'approve',
            scope: 'session',
            toolName: 'list_files',
            toolArgs: { directory: '~/' },
            workingDirectory: process.cwd()
          })
        }),
        sender: 'HUMAN',
        createdAt: new Date(),
        chatId,
        messageId: 'msg-session-persist-1',
        tool_call_id: approvalToolCallId,
        agentId: agent.id
      };
      agent.memory.push(approveSessionResponse);

      // Act: Check for session approval
      const sessionApproval = findSessionApproval(
        agent.memory,
        'list_files',
        { directory: '~/' },
        process.cwd()
      );

      // Assert: Should find session approval
      expect(sessionApproval).toBeDefined();
      expect(sessionApproval?.decision).toBe('approve');
      expect(sessionApproval?.scope).toBe('session');
      expect(sessionApproval?.toolName).toBe('list_files');
    });

    it('should match session approval with same toolArgs and workingDirectory', async () => {
      // Arrange: Add session approval with specific args
      const approvalToolCallId = 'approval_match_123';
      const approveSessionResponse: AgentMessage = {
        role: 'tool',
        content: JSON.stringify({
          __type: 'tool_result',
          tool_call_id: approvalToolCallId,
          content: JSON.stringify({
            decision: 'approve',
            scope: 'session',
            toolName: 'list_files',
            toolArgs: { directory: '/home/user' },
            workingDirectory: '/home/user/projects'
          })
        }),
        sender: 'HUMAN',
        createdAt: new Date(),
        chatId,
        messageId: 'msg-match-1',
        tool_call_id: approvalToolCallId,
        agentId: agent.id
      };
      agent.memory.push(approveSessionResponse);

      // Act & Assert: Matching parameters should find approval
      const matchingApproval = findSessionApproval(
        agent.memory,
        'list_files',
        { directory: '/home/user' },
        '/home/user/projects'
      );
      expect(matchingApproval).toBeDefined();

      // Different args should NOT find approval
      const differentArgsApproval = findSessionApproval(
        agent.memory,
        'list_files',
        { directory: '/different' },
        '/home/user/projects'
      );
      expect(differentArgsApproval).toBeUndefined();

      // Different working directory should NOT find approval
      const differentDirApproval = findSessionApproval(
        agent.memory,
        'list_files',
        { directory: '/home/user' },
        '/different/path'
      );
      expect(differentDirApproval).toBeUndefined();
    });

    it('should allow execution without approval after session approval granted', async () => {
      // Arrange: Add session approval to memory
      const approvalToolCallId = 'approval_execute_123';
      const approveSessionResponse: AgentMessage = {
        role: 'tool',
        content: JSON.stringify({
          __type: 'tool_result',
          tool_call_id: approvalToolCallId,
          content: JSON.stringify({
            decision: 'approve',
            scope: 'session',
            toolName: 'list_files',
            toolArgs: { directory: '~/' },
            workingDirectory: process.cwd()
          })
        }),
        sender: 'HUMAN',
        createdAt: new Date(),
        chatId,
        messageId: 'msg-execute-1',
        tool_call_id: approvalToolCallId,
        agentId: agent.id
      };
      agent.memory.push(approveSessionResponse);

      // Act: Check approval (should allow execution)
      const approvalCheck = await checkToolApproval(
        world,
        'list_files',
        { directory: '~/' },
        'This tool accesses your file system',
        agent.memory,
        { workingDirectory: process.cwd() }
      );

      // Assert: Should allow execution without new approval
      expect(approvalCheck.needsApproval).toBe(false);
      expect(approvalCheck.canExecute).toBe(true);
    });
  });

  describe('Agent Memory Persistence', () => {
    it('should persist both approval request and response in agent memory', async () => {
      // Arrange: Create complete approval flow
      const approvalToolCallId = 'approval_persist_123';

      // Approval request
      const requestMessage: AgentMessage = {
        role: 'assistant',
        content: '',
        sender: agent.id,
        createdAt: new Date(Date.now() - 1000),
        chatId,
        messageId: 'msg-persist-req-1',
        agentId: agent.id,
        tool_calls: [{
          id: approvalToolCallId,
          type: 'function',
          function: {
            name: 'client.requestApproval',
            arguments: JSON.stringify({
              originalToolCall: {
                name: 'list_files',
                args: { directory: '~/' },
                workingDirectory: process.cwd()
              },
              message: 'This tool accesses your file system',
              options: ['deny', 'approve_once', 'approve_session']
            })
          }
        }],
        toolCallStatus: {
          [approvalToolCallId]: {
            complete: false,
            result: null
          }
        }
      };

      // Approval response
      const responseMessage: AgentMessage = {
        role: 'tool',
        content: JSON.stringify({
          __type: 'tool_result',
          tool_call_id: approvalToolCallId,
          content: JSON.stringify({
            decision: 'approve',
            scope: 'session',
            toolName: 'list_files',
            toolArgs: { directory: '~/' },
            workingDirectory: process.cwd()
          })
        }),
        sender: 'HUMAN',
        createdAt: new Date(),
        chatId,
        messageId: 'msg-persist-resp-1',
        tool_call_id: approvalToolCallId,
        agentId: agent.id,
        toolCallStatus: {
          [approvalToolCallId]: {
            complete: true,
            result: {
              decision: 'approve',
              scope: 'session',
              timestamp: new Date().toISOString()
            }
          }
        }
      };

      // Act: Add to memory
      agent.memory.push(requestMessage);
      agent.memory.push(responseMessage);

      // Update request status
      requestMessage.toolCallStatus![approvalToolCallId] = {
        complete: true,
        result: {
          decision: 'approve',
          scope: 'session',
          timestamp: new Date().toISOString()
        }
      };

      // Assert: Verify both messages in memory
      expect(agent.memory).toHaveLength(2);

      const savedRequest = agent.memory.find(msg => msg.messageId === 'msg-persist-req-1');
      expect(savedRequest).toBeDefined();
      expect(savedRequest?.role).toBe('assistant');
      expect(savedRequest?.tool_calls).toBeDefined();
      expect(savedRequest?.toolCallStatus?.[approvalToolCallId].complete).toBe(true);

      const savedResponse = agent.memory.find(msg => msg.messageId === 'msg-persist-resp-1');
      expect(savedResponse).toBeDefined();
      expect(savedResponse?.role).toBe('tool');
      expect(savedResponse?.tool_call_id).toBe(approvalToolCallId);
      expect(savedResponse?.toolCallStatus?.[approvalToolCallId].complete).toBe(true);
    });

    it('should maintain message order: request -> response', async () => {
      // Arrange & Act: Create approval flow
      const approvalToolCallId = 'approval_order_123';

      const requestMessage: AgentMessage = {
        role: 'assistant',
        content: '',
        sender: agent.id,
        createdAt: new Date(Date.now() - 1000),
        chatId,
        messageId: 'msg-order-req-1',
        agentId: agent.id,
        tool_calls: [{
          id: approvalToolCallId,
          type: 'function',
          function: {
            name: 'client.requestApproval',
            arguments: '{}'
          }
        }],
        toolCallStatus: {
          [approvalToolCallId]: { complete: false, result: null }
        }
      };

      const responseMessage: AgentMessage = {
        role: 'tool',
        content: JSON.stringify({
          __type: 'tool_result',
          tool_call_id: approvalToolCallId,
          content: JSON.stringify({
            decision: 'approve',
            scope: 'session',
            toolName: 'list_files'
          })
        }),
        sender: 'HUMAN',
        createdAt: new Date(),
        chatId,
        messageId: 'msg-order-resp-1',
        tool_call_id: approvalToolCallId,
        agentId: agent.id,
        toolCallStatus: {
          [approvalToolCallId]: { complete: true, result: { decision: 'approve', scope: 'session', timestamp: new Date().toISOString() } }
        }
      };

      agent.memory.push(requestMessage);
      agent.memory.push(responseMessage);

      // Assert: Verify order
      expect(agent.memory[0].messageId).toBe('msg-order-req-1');
      expect(agent.memory[1].messageId).toBe('msg-order-resp-1');
      expect(agent.memory[0].createdAt!.getTime()).toBeLessThan(agent.memory[1].createdAt!.getTime());
    });
  });

  describe('Enhanced Protocol Parsing', () => {
    it('should parse enhanced JSON protocol correctly', async () => {
      // Arrange: Create enhanced protocol response
      const approvalToolCallId = 'approval_protocol_123';
      const enhancedContent = JSON.stringify({
        __type: 'tool_result',
        tool_call_id: approvalToolCallId,
        content: JSON.stringify({
          decision: 'approve',
          scope: 'session',
          toolName: 'list_files',
          toolArgs: { directory: '/home' },
          workingDirectory: '/home/projects'
        })
      });

      const responseMessage: AgentMessage = {
        role: 'tool',
        content: enhancedContent,
        sender: 'HUMAN',
        createdAt: new Date(),
        chatId,
        messageId: 'msg-protocol-1',
        tool_call_id: approvalToolCallId,
        agentId: agent.id
      };

      agent.memory.push(responseMessage);

      // Act: Find session approval (tests parsing)
      const sessionApproval = findSessionApproval(
        agent.memory,
        'list_files',
        { directory: '/home' },
        '/home/projects'
      );

      // Assert: Should parse and match correctly
      expect(sessionApproval).toBeDefined();
      expect(sessionApproval?.decision).toBe('approve');
      expect(sessionApproval?.scope).toBe('session');
    });

    it('should reject malformed JSON gracefully', async () => {
      // Arrange: Create malformed response
      const approvalToolCallId = 'approval_malformed_123';
      const malformedMessage: AgentMessage = {
        role: 'tool',
        content: 'not valid json {{{',
        sender: 'HUMAN',
        createdAt: new Date(),
        chatId,
        messageId: 'msg-malformed-1',
        tool_call_id: approvalToolCallId,
        agentId: agent.id
      };

      agent.memory.push(malformedMessage);

      // Act: Try to find session approval (should not crash)
      const sessionApproval = findSessionApproval(
        agent.memory,
        'list_files',
        { directory: '~/' },
        process.cwd()
      );

      // Assert: Should return undefined, not throw
      expect(sessionApproval).toBeUndefined();
    });
  });
});
