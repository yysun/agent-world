/**
 * Client Approval Request Message Handling Tests (Refactored for Memory-Driven Architecture)
 *
 * Purpose: Verify how session approval messages are handled and persisted
 *
 * Test Scenarios:
 * 1. Session approval messages are correctly parsed and identified
 * 2. Session approvals persist for future tool executions
 *
 * Changes:
 * - 2025-11-07: Simplified tests to focus on session approval persistence
 * - Removed obsolete tests for `deny` and `approve_once` logic
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { checkToolApproval, findSessionApproval } from '../../core/events.js';
import { createMockWorld } from '../__mocks__/mock-world.js';
import type { World, AgentMessage, ChatMessage } from '../../core/types.js';

describe('Client Approval Message Handling (Memory-Driven)', () => {
  let mockWorld: World;

  beforeEach(() => {
    mockWorld = createMockWorld();
    const testChat = {
      id: 'test-chat',
      worldId: 'test-world-123',
      name: 'Test Chat',
      createdAt: new Date(),
      updatedAt: new Date(),
      messageCount: 0,
    };
    mockWorld.chats.set('test-chat', testChat);
    mockWorld.currentChatId = 'test-chat';
  });

  describe('Session Approval Decision - Message Persistence for Future Scanning', () => {
    it('should find session approval and persist for future tool executions', async () => {
      const messages: AgentMessage[] = [
        {
          role: 'tool',
          tool_call_id: 'approval_123',
          content: JSON.stringify({
            __type: 'tool_result',
            content: JSON.stringify({
              decision: 'approve',
              scope: 'session',
              toolName: 'dangerous-tool',
            }),
          }),
          createdAt: new Date(),
          messageId: 'session-approval-msg',
        } as ChatMessage,
      ];

      const result = await checkToolApproval(mockWorld, 'dangerous-tool', {}, 'Execute command', messages);
      expect(result.needsApproval).toBe(false);
      expect(result.canExecute).toBe(true);

      const sessionApproval = findSessionApproval(messages, 'dangerous-tool');
      expect(sessionApproval).toBeDefined();
      expect(sessionApproval?.scope).toBe('session');
    });

    it('should persist session approval for multiple tool calls', async () => {
      const messages: AgentMessage[] = [
        {
          role: 'tool',
          tool_call_id: 'approval_123',
          content: JSON.stringify({
            __type: 'tool_result',
            content: JSON.stringify({
              decision: 'approve',
              scope: 'session',
              toolName: 'dangerous-tool',
            }),
          }),
          createdAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
          messageId: 'session-approval-msg',
        } as ChatMessage,
        {
          role: 'assistant',
          content: 'Tool executed successfully',
          createdAt: new Date(Date.now() - 25 * 60 * 1000),
          messageId: 'execution-1',
        } as AgentMessage,
      ];

      const result = await checkToolApproval(mockWorld, 'dangerous-tool', {}, 'Execute again', messages);
      expect(result.needsApproval).toBe(false);
      expect(result.canExecute).toBe(true);
    });
  });

  describe('Integration with Real Approval Flow', () => {
    it('should demonstrate complete flow: request → session approval → persistence → reuse', async () => {
      let messages: AgentMessage[] = [];

      const initialCheck = await checkToolApproval(mockWorld, 'dangerous-tool', {}, 'Delete files', messages);
      expect(initialCheck.needsApproval).toBe(true);

      messages.push({
        role: 'tool',
        tool_call_id: 'approval_789',
        content: JSON.stringify({
            __type: 'tool_result',
            content: JSON.stringify({
                decision: 'approve',
                scope: 'session',
                toolName: 'dangerous-tool',
            }),
        }),
        createdAt: new Date(),
        messageId: 'session-approval-tool-msg',
      } as ChatMessage);

      const secondCheck = await checkToolApproval(mockWorld, 'dangerous-tool', {}, 'List files', messages);
      expect(secondCheck.needsApproval).toBe(false);
      expect(secondCheck.canExecute).toBe(true);

      const sessionApproval = findSessionApproval(messages, 'dangerous-tool');
      expect(sessionApproval?.scope).toBe('session');
    });
  });
});
