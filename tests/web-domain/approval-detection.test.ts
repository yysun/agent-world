/**
 * Unit Tests - Approval Detection Domain Logic
 *
 * Purpose: Test the approval detection functions for frontend UI
 *
 * Test Coverage:
 * 1. Finding pending approval without responses
 * 2. Skipping approvals with responses
 * 3. Skipping dismissed approvals
 * 4. Finding multiple pending approvals
 * 5. Edge cases (empty messages, malformed data)
 *
 * Changes:
 * - 2025-11-08: Initial creation for Phase 2 approval detection testing
 */

import { describe, it, expect } from 'vitest';
import { findPendingApproval, findAllPendingApprovals, countPendingApprovals } from '../../web/src/domain/approval-detection.js';
import type { Message } from '../../web/src/types/index.js';

describe('Approval Detection - Frontend Domain Logic', () => {
  describe('findPendingApproval', () => {
    it('should find pending approval without response', () => {
      const messages: Message[] = [
        {
          id: 'msg-1',
          type: 'message',
          sender: 'agent-1',
          text: 'Approval needed',
          createdAt: new Date(),
          isToolCallRequest: true,
          toolCallData: {
            toolCallId: 'approval-123',
            toolName: 'shell_cmd',
            toolArgs: { command: 'ls' },
            approvalMessage: 'Execute shell command?',
            approvalOptions: ['deny', 'approve_once', 'approve_session'],
            agentId: 'agent-1'
          }
        }
      ];

      const result = findPendingApproval(messages);

      expect(result).toBeDefined();
      expect(result?.toolCallId).toBe('approval-123');
      expect(result?.toolName).toBe('shell_cmd');
      expect(result?.agentId).toBe('agent-1');
    });

    it('should skip approvals with responses', () => {
      const messages: Message[] = [
        {
          id: 'msg-1',
          type: 'message',
          sender: 'agent-1',
          text: 'Approval needed',
          createdAt: new Date(),
          isToolCallRequest: true,
          toolCallData: {
            toolCallId: 'approval-123',
            toolName: 'shell_cmd',
            toolArgs: { command: 'ls' },
            agentId: 'agent-1'
          }
        },
        {
          id: 'msg-2',
          type: 'message',
          sender: 'user',
          text: 'Approved',
          createdAt: new Date(),
          role: 'tool',
          messageId: 'approval-123'  // Response to the approval request
        }
      ];

      const result = findPendingApproval(messages);

      expect(result).toBeNull();
    });

    it('should skip dismissed approvals', () => {
      const messages: Message[] = [
        {
          id: 'msg-1',
          type: 'message',
          sender: 'agent-1',
          text: 'Approval needed',
          createdAt: new Date(),
          isToolCallRequest: true,
          toolCallData: {
            toolCallId: 'approval-123',
            toolName: 'shell_cmd',
            toolArgs: { command: 'ls' },
            agentId: 'agent-1'
          }
        }
      ];

      const dismissed = new Set(['approval-123']);
      const result = findPendingApproval(messages, dismissed);

      expect(result).toBeNull();
    });

    it('should find first pending approval when multiple exist', () => {
      const messages: Message[] = [
        {
          id: 'msg-1',
          type: 'message',
          sender: 'agent-1',
          text: 'Approval 1',
          createdAt: new Date(),
          isToolCallRequest: true,
          toolCallData: {
            toolCallId: 'approval-1',
            toolName: 'tool-1',
            toolArgs: {},
            agentId: 'agent-1'
          }
        },
        {
          id: 'msg-2',
          type: 'message',
          sender: 'agent-2',
          text: 'Approval 2',
          createdAt: new Date(),
          isToolCallRequest: true,
          toolCallData: {
            toolCallId: 'approval-2',
            toolName: 'tool-2',
            toolArgs: {},
            agentId: 'agent-2'
          }
        }
      ];

      const result = findPendingApproval(messages);

      expect(result).toBeDefined();
      expect(result?.toolCallId).toBe('approval-1');
    });

    it('should handle empty message list', () => {
      const messages: Message[] = [];
      const result = findPendingApproval(messages);

      expect(result).toBeNull();
    });

    it('should handle messages without tool call data', () => {
      const messages: Message[] = [
        {
          id: 'msg-1',
          type: 'message',
          sender: 'agent-1',
          text: 'Regular message',
          createdAt: new Date()
        }
      ];

      const result = findPendingApproval(messages);

      expect(result).toBeNull();
    });

    it('should include workingDirectory in approval request', () => {
      const messages: Message[] = [
        {
          id: 'msg-1',
          type: 'message',
          sender: 'agent-1',
          text: 'Approval needed',
          createdAt: new Date(),
          isToolCallRequest: true,
          toolCallData: {
            toolCallId: 'approval-123',
            toolName: 'shell_cmd',
            toolArgs: { command: 'ls' },
            workingDirectory: '/home/user/project',
            agentId: 'agent-1'
          }
        }
      ];

      const result = findPendingApproval(messages);

      expect(result).toBeDefined();
      expect(result?.workingDirectory).toBe('/home/user/project');
    });
  });

  describe('findAllPendingApprovals', () => {
    it('should find multiple pending approvals', () => {
      const messages: Message[] = [
        {
          id: 'msg-1',
          type: 'message',
          sender: 'agent-1',
          text: 'Approval 1',
          createdAt: new Date(),
          isToolCallRequest: true,
          toolCallData: {
            toolCallId: 'approval-1',
            toolName: 'tool-1',
            toolArgs: {},
            agentId: 'agent-1'
          }
        },
        {
          id: 'msg-2',
          type: 'message',
          sender: 'agent-2',
          text: 'Approval 2',
          createdAt: new Date(),
          isToolCallRequest: true,
          toolCallData: {
            toolCallId: 'approval-2',
            toolName: 'tool-2',
            toolArgs: {},
            agentId: 'agent-2'
          }
        }
      ];

      const result = findAllPendingApprovals(messages);

      expect(result).toHaveLength(2);
      expect(result[0].toolCallId).toBe('approval-1');
      expect(result[1].toolCallId).toBe('approval-2');
    });

    it('should exclude approvals with responses', () => {
      const messages: Message[] = [
        {
          id: 'msg-1',
          type: 'message',
          sender: 'agent-1',
          text: 'Approval 1',
          createdAt: new Date(),
          isToolCallRequest: true,
          toolCallData: {
            toolCallId: 'approval-1',
            toolName: 'tool-1',
            toolArgs: {},
            agentId: 'agent-1'
          }
        },
        {
          id: 'msg-2',
          type: 'message',
          sender: 'user',
          text: 'Response',
          createdAt: new Date(),
          role: 'tool',
          messageId: 'approval-1'  // Response
        },
        {
          id: 'msg-3',
          type: 'message',
          sender: 'agent-2',
          text: 'Approval 2',
          createdAt: new Date(),
          isToolCallRequest: true,
          toolCallData: {
            toolCallId: 'approval-2',
            toolName: 'tool-2',
            toolArgs: {},
            agentId: 'agent-2'
          }
        }
      ];

      const result = findAllPendingApprovals(messages);

      expect(result).toHaveLength(1);
      expect(result[0].toolCallId).toBe('approval-2');
    });

    it('should exclude dismissed approvals', () => {
      const messages: Message[] = [
        {
          id: 'msg-1',
          type: 'message',
          sender: 'agent-1',
          text: 'Approval 1',
          createdAt: new Date(),
          isToolCallRequest: true,
          toolCallData: {
            toolCallId: 'approval-1',
            toolName: 'tool-1',
            toolArgs: {},
            agentId: 'agent-1'
          }
        },
        {
          id: 'msg-2',
          type: 'message',
          sender: 'agent-2',
          text: 'Approval 2',
          createdAt: new Date(),
          isToolCallRequest: true,
          toolCallData: {
            toolCallId: 'approval-2',
            toolName: 'tool-2',
            toolArgs: {},
            agentId: 'agent-2'
          }
        }
      ];

      const dismissed = new Set(['approval-1']);
      const result = findAllPendingApprovals(messages, dismissed);

      expect(result).toHaveLength(1);
      expect(result[0].toolCallId).toBe('approval-2');
    });

    it('should return empty array for no pending approvals', () => {
      const messages: Message[] = [];
      const result = findAllPendingApprovals(messages);

      expect(result).toEqual([]);
    });
  });

  describe('countPendingApprovals', () => {
    it('should count pending approvals', () => {
      const messages: Message[] = [
        {
          id: 'msg-1',
          type: 'message',
          sender: 'agent-1',
          text: 'Approval 1',
          createdAt: new Date(),
          isToolCallRequest: true,
          toolCallData: {
            toolCallId: 'approval-1',
            toolName: 'tool-1',
            toolArgs: {},
            agentId: 'agent-1'
          }
        },
        {
          id: 'msg-2',
          type: 'message',
          sender: 'agent-2',
          text: 'Approval 2',
          createdAt: new Date(),
          isToolCallRequest: true,
          toolCallData: {
            toolCallId: 'approval-2',
            toolName: 'tool-2',
            toolArgs: {},
            agentId: 'agent-2'
          }
        }
      ];

      const count = countPendingApprovals(messages);

      expect(count).toBe(2);
    });

    it('should return 0 for no pending approvals', () => {
      const messages: Message[] = [];
      const count = countPendingApprovals(messages);

      expect(count).toBe(0);
    });

    it('should exclude dismissed approvals from count', () => {
      const messages: Message[] = [
        {
          id: 'msg-1',
          type: 'message',
          sender: 'agent-1',
          text: 'Approval 1',
          createdAt: new Date(),
          isToolCallRequest: true,
          toolCallData: {
            toolCallId: 'approval-1',
            toolName: 'tool-1',
            toolArgs: {},
            agentId: 'agent-1'
          }
        },
        {
          id: 'msg-2',
          type: 'message',
          sender: 'agent-2',
          text: 'Approval 2',
          createdAt: new Date(),
          isToolCallRequest: true,
          toolCallData: {
            toolCallId: 'approval-2',
            toolName: 'tool-2',
            toolArgs: {},
            agentId: 'agent-2'
          }
        }
      ];

      const dismissed = new Set(['approval-1']);
      const count = countPendingApprovals(messages, dismissed);

      expect(count).toBe(1);
    });
  });
});
