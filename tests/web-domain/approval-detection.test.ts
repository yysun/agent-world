/**
 * Unit Tests - Frontend Approval Detection Logic
 *
 * Purpose: Verify the reusable functions for finding pending approvals from message history
 *
 * Test Coverage:
 * 1. `findPendingApproval` finds the first pending approval
 * 2. `findAllPendingApprovals` finds all pending approvals
 * 3. `countPendingApprovals` correctly counts pending approvals
 * 4. Functions correctly handle dismissed approvals
 * 5. Functions correctly handle approvals that have been responded to
 * 6. Edge cases (empty messages, malformed data) are handled gracefully
 */

import { describe, it, expect } from 'vitest';
import {
  findPendingApproval,
  findAllPendingApprovals,
  countPendingApprovals,
} from '../../web/src/domain/approval-detection.ts';
import type { Message } from '../../web/src/types';

describe('Approval Detection - Unit Tests', () => {
  it('should find a single pending approval', () => {
    const messages: Message[] = [
      {
        isToolCallRequest: true,
        toolCallData: {
          toolCallId: '1',
          toolName: 'test_tool',
          toolArgs: {},
          approvalMessage: 'Approve?',
          options: ['deny', 'approve_once', 'approve_session'],
          agentId: 'agent1',
        },
      } as Message,
    ];
    const approval = findPendingApproval(messages);
    expect(approval).toBeDefined();
    expect(approval?.toolCallId).toBe('1');
  });

  it('should return null if no pending approvals', () => {
    const messages: Message[] = [];
    const approval = findPendingApproval(messages);
    expect(approval).toBeNull();
  });

  it('should skip approvals with responses', () => {
    const messages: Message[] = [
      {
        isToolCallRequest: true,
        toolCallData: { toolCallId: '1' },
      } as Message,
      {
        role: 'tool',
        tool_call_id: '1',
      } as Message,
    ];
    const approval = findPendingApproval(messages);
    expect(approval).toBeNull();
  });

  it('should skip dismissed approvals', () => {
    const messages: Message[] = [
      {
        isToolCallRequest: true,
        toolCallData: { toolCallId: '1' },
      } as Message,
    ];
    const dismissed = new Set(['1']);
    const approval = findPendingApproval(messages, dismissed);
    expect(approval).toBeNull();
  });

  it('should find all pending approvals', () => {
    const messages: Message[] = [
      {
        isToolCallRequest: true,
        toolCallData: { toolCallId: '1' },
      } as Message,
      {
        isToolCallRequest: true,
        toolCallData: { toolCallId: '2' },
      } as Message,
    ];
    const approvals = findAllPendingApprovals(messages);
    expect(approvals.length).toBe(2);
  });

  it('should count pending approvals', () => {
    const messages: Message[] = [
      {
        isToolCallRequest: true,
        toolCallData: { toolCallId: '1' },
      } as Message,
      {
        isToolCallRequest: true,
        toolCallData: { toolCallId: '2' },
      } as Message,
    ];
    const count = countPendingApprovals(messages);
    expect(count).toBe(2);
  });
});
