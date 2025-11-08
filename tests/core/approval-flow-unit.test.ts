/**
 * Unit Tests - Approval Flow Core Logic (Refactored for Memory-Driven Architecture)
 *
 * Purpose: Verify the simplified, memory-driven approval flow
 *
 * Test Coverage:
 * 1. `checkToolApproval` correctly identifies the need for approval
 * 2. `findSessionApproval` correctly parses JSON protocol and legacy text
 * 3. `checkToolApproval` passes `context` with `workingDirectory`
 * 4. Session approval matches on `toolName`, `toolArgs`, and `workingDirectory`
 * 5. Legacy text-based approvals trigger a security warning
 *
 * Changes:
 * - 2025-11-07: Rewrote tests for memory-driven architecture
 * - Removed tests for deprecated `findRecentDenial` and `findRecentApproval`
 * - Added tests for JSON protocol parsing, `workingDirectory`, and `toolArgs` matching
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { World, AgentMessage } from '../../core/types.js';

// Mock the logger using vi.doMock to ensure it's hoisted and available before other imports
const loggerMemory = {
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
};
vi.doMock('../../core/logger.js', () => ({
  createCategoryLogger: () => loggerMemory,
}));

// Dynamically import the modules under test after mocks are set up
const { checkToolApproval, findSessionApproval } = await import('../../core/events.js');

describe('Approval Flow - Unit Tests (Memory-Driven)', () => {
  let mockWorld: World;
  let mockMessages: AgentMessage[];

  beforeEach(() => {
    mockWorld = {
      id: 'test-world',
      name: 'Test World',
      eventEmitter: new EventEmitter(),
    } as any;
    mockMessages = [];
    loggerMemory.warn.mockClear();
  });

  describe('checkToolApproval', () => {
    it('should request approval when no session approval is found', async () => {
      const result = await checkToolApproval(mockWorld, 'shell_cmd', { command: 'ls' }, 'Approve command?', [], { workingDirectory: '/tmp' });
      expect(result.needsApproval).toBe(true);
      expect(result.canExecute).toBe(false);
      expect(result.approvalRequest).toBeDefined();
      expect(result.approvalRequest.toolName).toBe('shell_cmd');
      expect(result.approvalRequest.workingDirectory).toBe('/tmp');
    });

    it('should allow execution when a matching session approval is found', async () => {
      mockMessages = [
        {
          role: 'tool',
          tool_call_id: 'approval_123',
          content: JSON.stringify({
            __type: 'tool_result',
            content: JSON.stringify({
              decision: 'approve',
              scope: 'session',
              toolName: 'shell_cmd',
              toolArgs: { command: 'ls' },
              workingDirectory: '/tmp',
            }),
          }),
        } as AgentMessage,
      ];
      const result = await checkToolApproval(mockWorld, 'shell_cmd', { command: 'ls' }, 'Approve command?', mockMessages, { workingDirectory: '/tmp' });
      expect(result.needsApproval).toBe(false);
      expect(result.canExecute).toBe(true);
    });

    it('should request approval if `workingDirectory` does not match', async () => {
      mockMessages = [
        {
          role: 'tool',
          tool_call_id: 'approval_123',
          content: JSON.stringify({
            __type: 'tool_result',
            content: JSON.stringify({
              decision: 'approve',
              scope: 'session',
              toolName: 'shell_cmd',
              toolArgs: { command: 'ls' },
              workingDirectory: '/home',
            }),
          }),
        } as AgentMessage,
      ];
      const result = await checkToolApproval(mockWorld, 'shell_cmd', { command: 'ls' }, 'Approve command?', mockMessages, { workingDirectory: '/tmp' });
      expect(result.needsApproval).toBe(true);
    });

    it('should request approval if `toolArgs` do not match', async () => {
      mockMessages = [
        {
          role: 'tool',
          tool_call_id: 'approval_123',
          content: JSON.stringify({
            __type: 'tool_result',
            content: JSON.stringify({
              decision: 'approve',
              scope: 'session',
              toolName: 'shell_cmd',
              toolArgs: { command: 'rm -rf /' },
              workingDirectory: '/tmp',
            }),
          }),
        } as AgentMessage,
      ];
      const result = await checkToolApproval(mockWorld, 'shell_cmd', { command: 'ls' }, 'Approve command?', mockMessages, { workingDirectory: '/tmp' });
      expect(result.needsApproval).toBe(true);
    });
  });

  describe('findSessionApproval', () => {
    it('should find approval using JSON protocol', () => {
      mockMessages = [
        {
          role: 'tool',
          tool_call_id: 'approval_123',
          content: JSON.stringify({
            __type: 'tool_result',
            content: JSON.stringify({
              decision: 'approve',
              scope: 'session',
              toolName: 'shell_cmd',
              toolArgs: { command: 'ls' },
              workingDirectory: '/tmp',
            }),
          }),
        } as AgentMessage,
      ];
      const approval = findSessionApproval(mockMessages, 'shell_cmd', { command: 'ls' }, '/tmp');
      expect(approval).toBeDefined();
      expect(approval?.decision).toBe('approve');
    });

    it('should find approval using legacy text protocol and log a warning', () => {
      mockMessages = [
        {
          role: 'user',
          content: 'approve_session shell_cmd',
        } as AgentMessage,
      ];
      const approval = findSessionApproval(mockMessages, 'shell_cmd', { command: 'ls' }, '/tmp');
      expect(approval).toBeDefined();
      expect(approval?.decision).toBe('approve');
      expect(loggerMemory.warn).toHaveBeenCalledWith(
        'Using legacy text-based approval (no parameter/directory check)',
        expect.any(Object)
      );
    });

    it('should return undefined if tool name does not match', () => {
        mockMessages = [
            {
                role: 'tool',
                tool_call_id: 'approval_123',
                content: JSON.stringify({
                    __type: 'tool_result',
                    content: JSON.stringify({
                        decision: 'approve',
                        scope: 'session',
                        toolName: 'another_tool',
                        toolArgs: { command: 'ls' },
                        workingDirectory: '/tmp',
                    }),
                }),
            } as AgentMessage,
        ];
        const approval = findSessionApproval(mockMessages, 'shell_cmd', { command: 'ls' }, '/tmp');
        expect(approval).toBeUndefined();
    });
  });
});
