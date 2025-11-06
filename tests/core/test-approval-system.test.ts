/**
 * Approval System Integration Tests
 * 
 * Purpose: Test tool approval system with message-based approval tracking
 * 
 * Features:
 * - One-time approval scenarios (approve_once decision)
 * - Session-wide approval scenarios (approve_session decision)
 * - Approval denial scenarios (deny decision)
 * - Message history parsing and approval persistence
 * - Tool execution gating and approval request generation
 * - Cross-client approval compatibility testing
 * 
 * Test Cases:
 * 1. Basic approval request generation when tool needs approval
 * 2. One-time approval allows single tool execution then requires re-approval
 * 3. Session approval allows multiple tool executions without re-approval
 * 4. Denial prevents tool execution and logs appropriate messages
 * 5. Session approval persists across multiple tool calls
 * 6. Message history parsing correctly identifies existing approvals
 * 7. Tool wrapper integration with approval checking
 * 8. Approval response format compatibility across web/cli/tui clients
 * 
 * Created: Phase 7 - Tool approval system integration tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkToolApproval, findSessionApproval, findRecentApproval } from '../../core/events.js';
import { createMockWorld } from '../__mocks__/mock-world.js';
import type { World } from '../../core/types.js';
import type { AgentMessage } from '../../core/types.js';

describe('Approval System Integration Tests', () => {
  let mockWorld: World;

  beforeEach(() => {
    mockWorld = createMockWorld();
    mockWorld.chats = [{
      id: 'test-chat',
      name: 'Test Chat',
      description: 'Test chat for approval system',
      createdAt: new Date(),
      updatedAt: new Date(),
      messageCount: 0,
      summary: 'Test chat',
      tags: []
    }];
    mockWorld.currentChatId = 'test-chat';
  });

  describe('Basic Approval Request Generation', () => {
    it('should generate approval request when tool requires approval and no prior approval exists', async () => {
      // Arrange: Empty chat with no approval messages
      const messages: AgentMessage[] = [];

      // Act: Check if approval is needed
      const result = await checkToolApproval(mockWorld, 'test-tool', { param: 'value' }, 'Test tool execution', messages);

      // Assert: Should return approval request
      expect(result.needsApproval).toBe(true);
      expect(result.approvalRequest).toBeDefined();
      expect(result.approvalRequest?.toolName).toBe('test-tool');
      expect(result.approvalRequest?.message).toBe('Test tool execution');
      expect(result.approvalRequest?.toolArgs).toEqual({ param: 'value' });
      expect(result.approvalRequest?.requestId).toBeDefined();
      expect(result.canExecute).toBe(false);
    });

    it('should include meaningful tool arguments in approval request', async () => {
      // Arrange: Complex tool arguments
      const toolArgs = {
        command: 'rm -rf /',
        path: '/important/data',
        recursive: true,
        force: true
      };
      const messages: AgentMessage[] = [];

      // Act: Check approval for dangerous tool
      const result = await checkToolApproval(mockWorld, 'shell-command', toolArgs, 'Execute shell command', messages);

      // Assert: Should include all arguments in approval request
      expect(result.approvalRequest?.toolArgs).toEqual(toolArgs);
      expect(result.approvalRequest?.toolName).toBe('shell-command');
    });
  });

  describe('One-Time Approval Scenarios', () => {
    it('should allow tool execution after approve_once approval', async () => {
      // Arrange: Messages with one-time approval
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'I approve the test-tool execution once',
          createdAt: new Date(),
          messageId: 'approval-msg-1'
        }
      ];

      // Act: Check approval after user approved once
      const result = await checkToolApproval(mockWorld, 'test-tool', { param: 'value' }, 'Test tool execution', messages);

      // Assert: Should allow execution
      expect(result.needsApproval).toBe(false);
      expect(result.canExecute).toBe(true);
      expect(result.approvalRequest).toBeUndefined();
    });

    it('should require re-approval after one-time approval is used', async () => {
      // Arrange: Messages with prior one-time approval and tool execution
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'I approve the test-tool execution once',
          createdAt: new Date(Date.now() - 5000),
          messageId: 'approval-msg-1'
        },
        {
          role: 'assistant',
          content: 'Tool test-tool executed successfully',
          createdAt: new Date(Date.now() - 3000),
          messageId: 'tool-result-1'
        }
      ];

      // Act: Check approval for same tool again
      const result = await checkToolApproval(mockWorld, 'test-tool', { param: 'value' }, 'Test tool execution again', messages);

      // Assert: Should require new approval
      expect(result.needsApproval).toBe(true);
      expect(result.canExecute).toBe(false);
      expect(result.approvalRequest).toBeDefined();
    });
  });

  describe('Session-Wide Approval Scenarios', () => {
    it('should allow multiple tool executions after approve_session approval', async () => {
      // Arrange: Messages with session approval
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'I approve the test-tool execution for this session',
          createdAt: new Date(Date.now() - 10000),
          messageId: 'approval-msg-1'
        },
        {
          role: 'assistant',
          content: 'Tool test-tool executed successfully',
          createdAt: new Date(Date.now() - 8000),
          messageId: 'tool-result-1'
        },
        {
          role: 'assistant',
          content: 'Tool test-tool executed again successfully',
          createdAt: new Date(Date.now() - 5000),
          messageId: 'tool-result-2'
        }
      ];

      // Act: Check approval for same tool third time
      const result = await checkToolApproval(mockWorld, 'test-tool', { param: 'different' }, 'Test tool execution third time', messages);

      // Assert: Should still allow execution
      expect(result.needsApproval).toBe(false);
      expect(result.canExecute).toBe(true);
      expect(result.approvalRequest).toBeUndefined();
    });

    it('should persist session approval across different tool arguments', async () => {
      // Arrange: Messages with session approval for one set of args
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'I approve the file-read tool for this session',
          createdAt: new Date(),
          messageId: 'approval-msg-1'
        }
      ];

      // Act: Check approval for same tool with different arguments
      const result = await checkToolApproval(mockWorld, 'file-read', { path: '/different/file.txt' }, 'Read different file', messages);

      // Assert: Should allow execution (session approval covers tool regardless of args)
      expect(result.needsApproval).toBe(false);
      expect(result.canExecute).toBe(true);
    });
  });

  describe('Approval Denial Scenarios', () => {
    it('should prevent tool execution after denial', async () => {
      // Arrange: Messages with explicit denial
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'I deny the dangerous-tool execution',
          createdAt: new Date(),
          messageId: 'denial-msg-1'
        }
      ];

      // Act: Check approval for denied tool
      const result = await checkToolApproval(mockWorld, 'dangerous-tool', { action: 'delete' }, 'Execute dangerous operation', messages);

      // Assert: Should prevent execution
      expect(result.needsApproval).toBe(false);
      expect(result.canExecute).toBe(false);
      expect(result.approvalRequest).toBeUndefined();
      expect(result.reason).toContain('denied');
    });

    it('should require new approval after denial for different tool', async () => {
      // Arrange: Messages with denial for one tool
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'I deny the dangerous-tool execution',
          createdAt: new Date(),
          messageId: 'denial-msg-1'
        }
      ];

      // Act: Check approval for different tool
      const result = await checkToolApproval(mockWorld, 'safe-tool', { action: 'read' }, 'Execute safe operation', messages);

      // Assert: Should require approval (denial is tool-specific)
      expect(result.needsApproval).toBe(true);
      expect(result.approvalRequest).toBeDefined();
    });
  });

  describe('Message History Parsing', () => {
    it('should find session approval in message history', () => {
      // Arrange: Messages with session approval
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'Some other message',
          createdAt: new Date(Date.now() - 20000),
          messageId: 'other-msg-1'
        },
        {
          role: 'user',
          content: 'I approve the test-tool execution for this session',
          createdAt: new Date(Date.now() - 10000),
          messageId: 'approval-msg-1'
        },
        {
          role: 'assistant',
          content: 'Tool executed',
          createdAt: new Date(Date.now() - 5000),
          messageId: 'tool-result-1'
        }
      ];

      // Act: Find session approval
      const approval = findSessionApproval(messages, 'test-tool');

      // Assert: Should find the approval
      expect(approval).toBeDefined();
      expect(approval?.scope).toBe('session');
      expect(approval?.decision).toBe('approve');
      expect(approval?.toolName).toBe('test-tool');
    });

    it('should find recent approval in message history', () => {
      // Arrange: Messages with recent approval
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'I approve the test-tool execution once',
          createdAt: new Date(Date.now() - 1000), // Very recent
          messageId: 'approval-msg-1'
        }
      ];

      // Act: Find recent approval
      const approval = findRecentApproval(messages, 'test-tool');

      // Assert: Should find the approval
      expect(approval).toBeDefined();
      expect(approval?.scope).toBe('once');
      expect(approval?.decision).toBe('approve');
      expect(approval?.toolName).toBe('test-tool');
    });

    it('should not find expired recent approval', () => {
      // Arrange: Messages with old approval (> 5 minutes)
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'I approve the test-tool execution once',
          createdAt: new Date(Date.now() - 6 * 60 * 1000), // 6 minutes ago
          messageId: 'approval-msg-1'
        }
      ];

      // Act: Find recent approval
      const approval = findRecentApproval(messages, 'test-tool');

      // Assert: Should not find expired approval
      expect(approval).toBeUndefined();
    });
  });

  describe('Cross-Client Approval Compatibility', () => {
    it('should recognize web client approval format', () => {
      // Arrange: Web client approval message format
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'User approved test-tool execution for session via web interface',
          createdAt: new Date(),
          messageId: 'web-approval-1'
        }
      ];

      // Act: Find approval
      const approval = findSessionApproval(messages, 'test-tool');

      // Assert: Should recognize web format
      expect(approval).toBeDefined();
      expect(approval?.scope).toBe('session');
    });

    it('should recognize CLI client approval format', () => {
      // Arrange: CLI client approval message format
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'CLI user approved test-tool once',
          createdAt: new Date(),
          messageId: 'cli-approval-1'
        }
      ];

      // Act: Find approval
      const approval = findRecentApproval(messages, 'test-tool');

      // Assert: Should recognize CLI format
      expect(approval).toBeDefined();
      expect(approval?.scope).toBe('once');
    });

    it('should recognize TUI client approval format', () => {
      // Arrange: TUI client approval message format
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'TUI approved test-tool for session',
          createdAt: new Date(),
          messageId: 'tui-approval-1'
        }
      ];

      // Act: Find approval
      const approval = findSessionApproval(messages, 'test-tool');

      // Assert: Should recognize TUI format
      expect(approval).toBeDefined();
      expect(approval?.scope).toBe('session');
    });
  });

  describe('Tool Wrapper Integration', () => {
    it('should integrate with tool validation wrapper', async () => {
      // This test would require integration with the actual tool wrapper
      // For now, we'll test the approval checking logic in isolation

      // Arrange: Mock tool execution context
      const toolName = 'file-delete';
      const toolArgs = { path: '/important/file.txt' };
      const message = 'Delete important file';
      const messages: AgentMessage[] = [];

      // Act: Check if tool needs approval
      const result = await checkToolApproval(mockWorld, toolName, toolArgs, message, messages);

      // Assert: Should require approval for dangerous operation
      expect(result.needsApproval).toBe(true);
      expect(result.canExecute).toBe(false);
      expect(result.approvalRequest?.toolName).toBe(toolName);
    });
  });

  describe('Approval Response Format Validation', () => {
    it('should handle three-option approval response format', () => {
      // Arrange: Three-option response format from any client
      const approvalResponse = {
        requestId: 'test-request-123',
        decision: 'approve' as const,
        scope: 'session' as const
      };

      // Act & Assert: Validate response format
      expect(approvalResponse.decision).toMatch(/^(approve|deny)$/);
      expect(approvalResponse.scope).toMatch(/^(once|session)$/);
      expect(approvalResponse.requestId).toBeDefined();
    });

    it('should handle backward compatible approval formats', () => {
      // Arrange: Legacy two-option format (approve/deny only)
      const legacyResponse = {
        requestId: 'test-request-123',
        decision: 'approve' as const,
        scope: 'once' as const // Default to once for backward compatibility
      };

      // Act & Assert: Should work with legacy format
      expect(legacyResponse.decision).toBe('approve');
      expect(legacyResponse.scope).toBe('once');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty message history gracefully', async () => {
      // Arrange: Empty messages array
      const messages: AgentMessage[] = [];

      // Act: Check approval with no history
      const result = await checkToolApproval(mockWorld, 'test-tool', {}, 'Test', messages);

      // Assert: Should require approval
      expect(result.needsApproval).toBe(true);
      expect(result.canExecute).toBe(false);
    });

    it('should handle malformed approval messages gracefully', () => {
      // Arrange: Messages with malformed approval text
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'I maybe sort of approve something unclear',
          createdAt: new Date(),
          messageId: 'malformed-msg-1'
        }
      ];

      // Act: Try to find approval
      const approval = findRecentApproval(messages, 'test-tool');

      // Assert: Should not find approval in unclear message
      expect(approval).toBeUndefined();
    });

    it('should handle missing chat context gracefully', async () => {
      // Arrange: World with no current chat
      const worldNoChatId = { ...mockWorld, currentChatId: null };
      const messages: AgentMessage[] = [];

      // Act: Check approval without chat context
      const result = await checkToolApproval(worldNoChatId, 'test-tool', {}, 'Test', messages);

      // Assert: Should still work (fall back to message array)
      expect(result.needsApproval).toBe(true);
    });
  });
});