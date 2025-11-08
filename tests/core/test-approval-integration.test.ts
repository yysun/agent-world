/**
 * Integration Test: Message-Based Approval Response Handling (Refactored for Memory-Driven Architecture)
 *
 * Purpose: Test end-to-end approval flow with memory-driven message processing
 *
 * This test verifies that when a user provides approval via a `tool_result` message,
 * the system can:
 * 1. Parse the JSON protocol from the `tool_result` message
 * 2. Allow tool execution based on the session approval
 * 3. Correctly match `toolName`, `toolArgs`, and `workingDirectory` for session approvals
 *
 * Changes:
 * - 2025-11-07: Rewrote tests for memory-driven architecture
 * - Removed tests for natural language parsing and one-time approvals
 * - Added tests for `tool_result` message handling and session approval matching
 */

import { describe, it, expect } from 'vitest';
import { wrapToolWithValidation } from '../../core/tool-utils.js';
import { createMockWorld } from '../__mocks__/mock-world.js';
import type { AgentMessage, ChatMessage } from '../../core/types.js';

describe('Message-Based Approval Response Integration (Memory-Driven)', () => {
  it('should allow tool execution after user provides session approval via tool_result', async () => {
    const mockTool = {
      name: 'dangerous-command',
      approval: { required: true },
      execute: async (args: any) => `Executed: ${args.command}`,
    };
    const wrappedTool = wrapToolWithValidation(mockTool, 'dangerous-command');
    const mockWorld = createMockWorld();
    const messages: AgentMessage[] = [
      {
        role: 'tool',
        tool_call_id: 'approval_123',
        content: JSON.stringify({
          __type: 'tool_result',
          content: JSON.stringify({
            decision: 'approve',
            scope: 'session',
            toolName: 'dangerous-command',
            toolArgs: { command: 'rm -rf /' },
            workingDirectory: '/tmp',
          }),
        }),
      } as ChatMessage,
    ];

    const context = {
      world: mockWorld,
      messages,
      workingDirectory: '/tmp',
    };

    const result = await wrappedTool.execute({ command: 'rm -rf /' }, undefined, undefined, context);
    expect(result).toBe('Executed: rm -rf /');
  });

  it('should request approval if toolArgs do not match session approval', async () => {
    const mockTool = {
      name: 'dangerous-command',
      approval: { required: true },
      execute: async () => 'executed',
    };
    const wrappedTool = wrapToolWithValidation(mockTool, 'dangerous-command');
    const mockWorld = createMockWorld();
    const messages: AgentMessage[] = [
      {
        role: 'tool',
        tool_call_id: 'approval_123',
        content: JSON.stringify({
          __type: 'tool_result',
          content: JSON.stringify({
            decision: 'approve',
            scope: 'session',
            toolName: 'dangerous-command',
            toolArgs: { command: 'ls' },
            workingDirectory: '/tmp',
          }),
        }),
      } as ChatMessage,
    ];

    const context = {
      world: mockWorld,
      messages,
      workingDirectory: '/tmp',
    };

    const result = await wrappedTool.execute({ command: 'rm -rf /' }, undefined, undefined, context);
    expect(result.type).toBe('approval_request');
  });
});
