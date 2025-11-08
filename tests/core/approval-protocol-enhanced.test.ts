/**
 * Unit Tests - Enhanced Approval Protocol (JSON Format)
 *
 * Purpose: Test the enhanced JSON protocol for approval messages
 *
 * Test Coverage:
 * 1. JSON protocol parsing in findSessionApproval()
 * 2. Legacy text parsing fallback with security warning
 * 3. checkToolApproval() accepts context parameter
 * 4. workingDirectory matching in session approval
 * 5. Parameter matching with exact equality
 *
 * Changes:
 * - 2025-11-08: Initial creation for enhanced protocol testing (Phase 1)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { checkToolApproval, findSessionApproval } from '../../core/events.js';
import type { World, AgentMessage } from '../../core/types.js';

describe('Enhanced Approval Protocol - JSON Format', () => {
  let mockWorld: World;
  let mockMessages: AgentMessage[];

  beforeEach(() => {
    mockWorld = {
      id: 'test-world',
      name: 'Test World',
      description: 'Test world for approval flow',
      currentChatId: 'test-chat-1',
      eventEmitter: new EventEmitter(),
      chats: new Map([
        ['test-chat-1', {
          id: 'test-chat-1',
          worldId: 'test-world',
          title: 'Test Chat',
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date()
        }]
      ])
    } as any;

    mockMessages = [];
  });

  describe('findSessionApproval - JSON Protocol Parsing', () => {
    it('should parse enhanced JSON protocol format', () => {
      const approvalMessage: AgentMessage = {
        role: 'tool',
        content: JSON.stringify({
          __type: 'tool_result',
          content: JSON.stringify({
            decision: 'approve',
            scope: 'session',
            toolName: 'shell_cmd',
            toolArgs: { command: 'ls', directory: '/tmp' },
            workingDirectory: '/home/user/project'
          })
        }),
        tool_call_id: 'approval_123',
        createdAt: new Date()
      };

      mockMessages.push(approvalMessage);

      const result = findSessionApproval(
        mockMessages,
        'shell_cmd',
        { command: 'ls', directory: '/tmp' },
        '/home/user/project'
      );

      expect(result).toBeDefined();
      expect(result?.decision).toBe('approve');
      expect(result?.scope).toBe('session');
      expect(result?.toolName).toBe('shell_cmd');
    });

    it('should match toolName case-insensitively', () => {
      const approvalMessage: AgentMessage = {
        role: 'tool',
        content: JSON.stringify({
          __type: 'tool_result',
          content: JSON.stringify({
            decision: 'approve',
            scope: 'session',
            toolName: 'Shell_CMD',
            toolArgs: { command: 'ls' }
          })
        }),
        tool_call_id: 'approval_123',
        createdAt: new Date()
      };

      mockMessages.push(approvalMessage);

      const result = findSessionApproval(mockMessages, 'shell_cmd', { command: 'ls' });

      expect(result).toBeDefined();
      expect(result?.toolName).toBe('shell_cmd');
    });

    it('should reject approval if workingDirectory does not match', () => {
      const approvalMessage: AgentMessage = {
        role: 'tool',
        content: JSON.stringify({
          __type: 'tool_result',
          content: JSON.stringify({
            decision: 'approve',
            scope: 'session',
            toolName: 'shell_cmd',
            toolArgs: { command: 'ls' },
            workingDirectory: '/home/user/project1'
          })
        }),
        tool_call_id: 'approval_123',
        createdAt: new Date()
      };

      mockMessages.push(approvalMessage);

      // Try to find approval with different working directory
      const result = findSessionApproval(
        mockMessages,
        'shell_cmd',
        { command: 'ls' },
        '/home/user/project2'
      );

      expect(result).toBeUndefined();
    });

    it('should reject approval if parameters do not match exactly', () => {
      const approvalMessage: AgentMessage = {
        role: 'tool',
        content: JSON.stringify({
          __type: 'tool_result',
          content: JSON.stringify({
            decision: 'approve',
            scope: 'session',
            toolName: 'shell_cmd',
            toolArgs: { command: 'ls', directory: '/tmp' }
          })
        }),
        tool_call_id: 'approval_123',
        createdAt: new Date()
      };

      mockMessages.push(approvalMessage);

      // Try to find approval with different parameters
      const result = findSessionApproval(
        mockMessages,
        'shell_cmd',
        { command: 'ls', directory: '/home' }
      );

      expect(result).toBeUndefined();
    });

    it('should accept approval if workingDirectory is not specified in approval', () => {
      const approvalMessage: AgentMessage = {
        role: 'tool',
        content: JSON.stringify({
          __type: 'tool_result',
          content: JSON.stringify({
            decision: 'approve',
            scope: 'session',
            toolName: 'shell_cmd',
            toolArgs: { command: 'ls' }
          })
        }),
        tool_call_id: 'approval_123',
        createdAt: new Date()
      };

      mockMessages.push(approvalMessage);

      // Should match even with different working directory
      const result = findSessionApproval(
        mockMessages,
        'shell_cmd',
        { command: 'ls' },
        '/any/directory'
      );

      expect(result).toBeDefined();
    });

    it('should accept approval if parameters are not specified in approval', () => {
      const approvalMessage: AgentMessage = {
        role: 'tool',
        content: JSON.stringify({
          __type: 'tool_result',
          content: JSON.stringify({
            decision: 'approve',
            scope: 'session',
            toolName: 'shell_cmd'
          })
        }),
        tool_call_id: 'approval_123',
        createdAt: new Date()
      };

      mockMessages.push(approvalMessage);

      // Should match with any parameters
      const result = findSessionApproval(
        mockMessages,
        'shell_cmd',
        { command: 'ls', directory: '/tmp' }
      );

      expect(result).toBeDefined();
    });

    it('should fall back to legacy text parsing when JSON parsing fails', () => {
      const approvalMessage: AgentMessage = {
        role: 'user',
        content: 'I approve_session for shell_cmd',
        createdAt: new Date()
      };

      mockMessages.push(approvalMessage);

      const result = findSessionApproval(mockMessages, 'shell_cmd');

      expect(result).toBeDefined();
      expect(result?.decision).toBe('approve');
      expect(result?.scope).toBe('session');
    });

    it('should handle malformed JSON gracefully', () => {
      const approvalMessage: AgentMessage = {
        role: 'tool',
        content: 'not valid json {',
        tool_call_id: 'approval_123',
        createdAt: new Date()
      };

      mockMessages.push(approvalMessage);

      const result = findSessionApproval(mockMessages, 'shell_cmd');

      // Should not throw, just return undefined
      expect(result).toBeUndefined();
    });
  });

  describe('checkToolApproval - Context Parameter', () => {
    it('should accept context parameter with workingDirectory', async () => {
      const result = await checkToolApproval(
        mockWorld,
        'shell_cmd',
        { command: 'ls' },
        'Approval message',
        mockMessages,
        { workingDirectory: '/home/user/project' }
      );

      expect(result).toBeDefined();
      expect(result.needsApproval).toBe(true);
      expect(result.approvalRequest?.workingDirectory).toBe('/home/user/project');
    });

    it('should use process.cwd() as default workingDirectory', async () => {
      const result = await checkToolApproval(
        mockWorld,
        'shell_cmd',
        { command: 'ls' },
        'Approval message',
        mockMessages
      );

      expect(result).toBeDefined();
      expect(result.needsApproval).toBe(true);
      // workingDirectory should be set to process.cwd() by default
      expect(result.approvalRequest).toBeDefined();
      // The approval request will include workingDirectory field
      const hasWorkingDirectory = 'workingDirectory' in (result.approvalRequest || {});
      expect(hasWorkingDirectory).toBe(true);
    });

    it('should match session approval with workingDirectory', async () => {
      const approvalMessage: AgentMessage = {
        role: 'tool',
        content: JSON.stringify({
          __type: 'tool_result',
          content: JSON.stringify({
            decision: 'approve',
            scope: 'session',
            toolName: 'shell_cmd',
            toolArgs: { command: 'ls' },
            workingDirectory: '/home/user/project'
          })
        }),
        tool_call_id: 'approval_123',
        createdAt: new Date()
      };

      mockMessages.push(approvalMessage);

      const result = await checkToolApproval(
        mockWorld,
        'shell_cmd',
        { command: 'ls' },
        'Approval message',
        mockMessages,
        { workingDirectory: '/home/user/project' }
      );

      expect(result.needsApproval).toBe(false);
      expect(result.canExecute).toBe(true);
    });

    it('should request approval if workingDirectory does not match', async () => {
      const approvalMessage: AgentMessage = {
        role: 'tool',
        content: JSON.stringify({
          __type: 'tool_result',
          content: JSON.stringify({
            decision: 'approve',
            scope: 'session',
            toolName: 'shell_cmd',
            toolArgs: { command: 'ls' },
            workingDirectory: '/home/user/project1'
          })
        }),
        tool_call_id: 'approval_123',
        createdAt: new Date()
      };

      mockMessages.push(approvalMessage);

      const result = await checkToolApproval(
        mockWorld,
        'shell_cmd',
        { command: 'ls' },
        'Approval message',
        mockMessages,
        { workingDirectory: '/home/user/project2' }
      );

      expect(result.needsApproval).toBe(true);
      expect(result.canExecute).toBe(false);
    });
  });

  describe('checkToolApproval - Simplified Logic', () => {
    it('should only check for session approval', async () => {
      // Add a session approval
      const approvalMessage: AgentMessage = {
        role: 'tool',
        content: JSON.stringify({
          __type: 'tool_result',
          content: JSON.stringify({
            decision: 'approve',
            scope: 'session',
            toolName: 'shell_cmd',
            toolArgs: { command: 'ls' }
          })
        }),
        tool_call_id: 'approval_123',
        createdAt: new Date()
      };

      mockMessages.push(approvalMessage);

      const result = await checkToolApproval(
        mockWorld,
        'shell_cmd',
        { command: 'ls' },
        'Approval message',
        mockMessages
      );

      expect(result.needsApproval).toBe(false);
      expect(result.canExecute).toBe(true);
    });

    it('should request approval if no session approval exists', async () => {
      const result = await checkToolApproval(
        mockWorld,
        'shell_cmd',
        { command: 'ls' },
        'Approval message',
        mockMessages
      );

      expect(result.needsApproval).toBe(true);
      expect(result.canExecute).toBe(false);
      expect(result.approvalRequest).toBeDefined();
      expect(result.approvalRequest?.toolName).toBe('shell_cmd');
      expect(result.approvalRequest?.options).toContain('approve_session');
    });

    it('should include workingDirectory in approval request', async () => {
      const result = await checkToolApproval(
        mockWorld,
        'shell_cmd',
        { command: 'ls' },
        'Approval message',
        mockMessages,
        { workingDirectory: '/test/dir' }
      );

      expect(result.approvalRequest?.workingDirectory).toBe('/test/dir');
    });
  });

  describe('Parameter Matching - Exact Equality', () => {
    it('should match parameters with exact deep equality', () => {
      const approvalMessage: AgentMessage = {
        role: 'tool',
        content: JSON.stringify({
          __type: 'tool_result',
          content: JSON.stringify({
            decision: 'approve',
            scope: 'session',
            toolName: 'shell_cmd',
            toolArgs: {
              command: 'ls',
              directory: '/tmp',
              options: { recursive: true, all: false }
            }
          })
        }),
        tool_call_id: 'approval_123',
        createdAt: new Date()
      };

      mockMessages.push(approvalMessage);

      const result = findSessionApproval(
        mockMessages,
        'shell_cmd',
        {
          command: 'ls',
          directory: '/tmp',
          options: { recursive: true, all: false }
        }
      );

      expect(result).toBeDefined();
    });

    it('should reject if nested parameters differ', () => {
      const approvalMessage: AgentMessage = {
        role: 'tool',
        content: JSON.stringify({
          __type: 'tool_result',
          content: JSON.stringify({
            decision: 'approve',
            scope: 'session',
            toolName: 'shell_cmd',
            toolArgs: {
              command: 'ls',
              options: { recursive: true }
            }
          })
        }),
        tool_call_id: 'approval_123',
        createdAt: new Date()
      };

      mockMessages.push(approvalMessage);

      const result = findSessionApproval(
        mockMessages,
        'shell_cmd',
        {
          command: 'ls',
          options: { recursive: false }
        }
      );

      expect(result).toBeUndefined();
    });
  });
});
