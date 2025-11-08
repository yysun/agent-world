/**
 * Approval System Integration Tests (Refactored for Memory-Driven Architecture)
 *
 * Purpose: Test the tool approval system with memory-driven message tracking
 *
 * Test Cases:
 * 1. Basic approval request generation when no prior approval exists
 * 2. Session approval allows multiple tool executions without re-approval
 * 3. Session approval is tool-specific
 *
 * Changes:
 * - 2025-11-07: Rewrote tests for memory-driven architecture
 * - Removed obsolete tests for one-time approvals and denials
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { checkToolApproval } from '../../core/events.js';
import { createMockWorld } from '../__mocks__/mock-world.js';
import type { World, AgentMessage, ChatMessage } from '../../core/types.js';

describe('Approval System Integration Tests (Memory-Driven)', () => {
  let mockWorld: World;

  beforeEach(() => {
    mockWorld = createMockWorld();
  });

  it('should generate an approval request when no prior approval exists', async () => {
    const messages: AgentMessage[] = [];
    const result = await checkToolApproval(mockWorld, 'test-tool', { param: 'value' }, 'Test tool', messages);
    expect(result.needsApproval).toBe(true);
    expect(result.canExecute).toBe(false);
    expect(result.approvalRequest).toBeDefined();
  });

  it('should allow multiple tool executions after session approval', async () => {
    const messages: AgentMessage[] = [
      {
        role: 'tool',
        tool_call_id: 'approval_123',
        content: JSON.stringify({
          __type: 'tool_result',
          content: JSON.stringify({
            decision: 'approve',
            scope: 'session',
            toolName: 'test-tool',
          }),
        }),
      } as ChatMessage,
    ];

    const result1 = await checkToolApproval(mockWorld, 'test-tool', {}, 'Test 1', messages);
    expect(result1.canExecute).toBe(true);

    const result2 = await checkToolApproval(mockWorld, 'test-tool', {}, 'Test 2', messages);
    expect(result2.canExecute).toBe(true);
  });

  it('should require new approval for a different tool', async () => {
    const messages: AgentMessage[] = [
      {
        role: 'tool',
        tool_call_id: 'approval_123',
        content: JSON.stringify({
          __type: 'tool_result',
          content: JSON.stringify({
            decision: 'approve',
            scope: 'session',
            toolName: 'safe-tool',
          }),
        }),
      } as ChatMessage,
    ];

    const result = await checkToolApproval(mockWorld, 'dangerous-tool', {}, 'Execute dangerous operation', messages);
    expect(result.needsApproval).toBe(true);
  });
});
