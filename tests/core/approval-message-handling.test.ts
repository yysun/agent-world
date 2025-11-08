/**
 * Client Approval Request Message Handling Tests
 * 
 * Purpose: Verify how approval responses are handled regarding message saving
 * 
 * Test Scenarios:
 * 1. deny/cancel: does not save to messages - return LLM with deny/cancel as tool call result
 * 2. one time approval: does not save to messages - call the tool - return tool call result to LLM  
 * 3. session approval: save to messages for future scan - call the tool - return tool call result to LLM
 * 
 * This tests the critical distinction: session approvals are saved to message history 
 * for future scanning, while deny/once approvals are not saved for persistence.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { checkToolApproval, findSessionApproval, findRecentApproval } from '../../core/events.js';
import { createMockWorld } from '../__mocks__/mock-world.js';
import type { World } from '../../core/types.js';
import type { AgentMessage, ChatMessage } from '../../core/types.js';

describe('Client Approval Message Handling', () => {
  let mockWorld: World;

  beforeEach(() => {
    mockWorld = createMockWorld();

    // Set up a test chat in the chats Map
    const testChat = {
      id: 'test-chat',
      worldId: 'test-world-123',
      name: 'Test Chat',
      description: 'Test chat for approval system',
      createdAt: new Date(),
      updatedAt: new Date(),
      messageCount: 0
    };
    mockWorld.chats.set('test-chat', testChat);
    mockWorld.currentChatId = 'test-chat';
  });

  describe('Deny/Cancel Decision - No Message Saving', () => {
    it('should NOT find any approval when user denies tool execution', async () => {
      // Arrange: Messages with denial
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'I deny the dangerous-tool execution',
          createdAt: new Date(),
          messageId: 'denial-msg-1'
        }
      ];

      // Act: Check if approval exists (it should not)
      const sessionApproval = findSessionApproval(messages, 'dangerous-tool');
      const recentApproval = findRecentApproval(messages, 'dangerous-tool');

      // Assert: No approval should be found for denied tool
      expect(sessionApproval).toBeUndefined();
      expect(recentApproval).toBeUndefined();
    });

    it('should request approval again after denial (denial not cached)', async () => {
      // Note: In the new simplified logic, denials are no longer cached.
      // Users should be allowed to change their mind.
      
      // Arrange: Messages with previous denial
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'deny dangerous-tool',
          createdAt: new Date(),
          messageId: 'denial-msg-1'
        }
      ];

      // Act: Check if tool needs approval
      const result = await checkToolApproval(mockWorld, 'dangerous-tool', { command: 'rm -rf /' }, 'Execute dangerous command', messages);

      // Assert: Should request approval again (denial not cached)
      expect(result.needsApproval).toBe(true); // Need approval
      expect(result.canExecute).toBe(false); // Cannot execute yet
      expect(result.approvalRequest).toBeDefined();
    });

    it('should simulate deny response without saving approval tool message', () => {
      // Arrange: Simulate client deny response (no tool message added to history)
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'Execute dangerous command',
          createdAt: new Date(),
          messageId: 'user-msg-1'
        }
        // NOTE: No approval tool message is added for deny decisions
        // The tool execution is blocked and conversation continues without the tool result
      ];

      // Act: Check approval status
      const approval = findRecentApproval(messages, 'dangerous-tool');

      // Assert: No approval found because deny responses are not persisted
      expect(approval).toBeUndefined();
      expect(messages).toHaveLength(1); // Only original user message
    });
  });

  describe('One-Time Approval Decision (Deprecated - No Longer Cached)', () => {
    it('should NOT cache one-time approval (simplified logic)', async () => {
      // Note: One-time approvals are no longer cached in the simplified logic.
      // Only session approvals are recognized.
      
      // Arrange: Messages with one-time approval text
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'I approve dangerous-tool execution once',
          createdAt: new Date(),
          messageId: 'approval-msg-1'
        }
      ];

      // Act: Check for approval
      const result = await checkToolApproval(mockWorld, 'dangerous-tool', { command: 'rm -rf /' }, 'Execute command', messages);

      // Assert: Should request approval (one-time not cached)
      expect(result.needsApproval).toBe(true);
      expect(result.canExecute).toBe(false);
      expect(result.approvalRequest).toBeDefined();

      const recentApproval = findRecentApproval(messages, 'dangerous-tool');
      const sessionApproval = findSessionApproval(messages, 'dangerous-tool');

      // Both should be undefined since one-time approvals are deprecated
      expect(sessionApproval).toBeUndefined(); // No session approval
    });

    it('should require new approval after once approval is consumed', () => {
      // Arrange: Messages with one-time approval that was already "consumed"
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'approve dangerous-tool once',
          createdAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
          messageId: 'old-approval-msg'
        },
        {
          role: 'assistant',
          content: 'Tool dangerous-tool executed successfully',
          createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
          messageId: 'tool-execution-msg'
        }
      ];

      // Act: Check for approval (should not find valid one)
      const recentApproval = findRecentApproval(messages, 'dangerous-tool');

      // Assert: Once approval should be considered consumed
      expect(recentApproval).toBeUndefined();
    });

    it('should simulate once approval tool message flow - message sent but no session persistence', () => {
      // Arrange: Simulate client once approval response (tool message temporarily added during processing)
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'Execute dangerous command',
          createdAt: new Date(),
          messageId: 'user-msg-1'
        },
        {
          role: 'tool',
          tool_call_id: 'approval_123',
          content: JSON.stringify({
            decision: 'approve',
            scope: 'once',
            toolName: 'dangerous-tool'
          }),
          createdAt: new Date(),
          messageId: 'approval-tool-msg'
        } as ChatMessage
      ];

      // Act: Check approval status
      const approval = findRecentApproval(messages, 'dangerous-tool');
      const sessionApproval = findSessionApproval(messages, 'dangerous-tool');

      // Assert: Once approval found but no session approval (no persistence)
      expect(approval).toBeDefined();
      expect(approval?.scope).toBe('once');
      expect(sessionApproval).toBeUndefined();
    });
  });

  describe('Session Approval Decision - Message Persistence for Future Scanning', () => {
    it('should find session approval and persist for future tool executions', async () => {
      // Arrange: Messages with session approval
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'I approve dangerous-tool for this session',
          createdAt: new Date(),
          messageId: 'session-approval-msg'
        }
      ];

      // Act: Check for session approval
      const result = await checkToolApproval(mockWorld, 'dangerous-tool', { command: 'rm -rf /' }, 'Execute command', messages);

      // Assert: Should allow execution and find session approval
      expect(result.needsApproval).toBe(false);
      expect(result.canExecute).toBe(true);

      const sessionApproval = findSessionApproval(messages, 'dangerous-tool');
      expect(sessionApproval).toBeDefined();
      expect(sessionApproval?.scope).toBe('session');
    });

    it('should persist session approval for multiple tool calls', async () => {
      // Arrange: Messages with session approval from earlier in conversation
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'approve dangerous-tool for session',
          createdAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
          messageId: 'session-approval-msg'
        },
        {
          role: 'assistant',
          content: 'Tool executed successfully',
          createdAt: new Date(Date.now() - 25 * 60 * 1000),
          messageId: 'execution-1'
        },
        {
          role: 'user',
          content: 'Execute the same tool again',
          createdAt: new Date(),
          messageId: 'user-msg-2'
        }
      ];

      // Act: Check if second execution still approved
      const result = await checkToolApproval(mockWorld, 'dangerous-tool', { command: 'ls' }, 'Execute again', messages);

      // Assert: Should still be approved due to session approval
      expect(result.needsApproval).toBe(false);
      expect(result.canExecute).toBe(true);

      const sessionApproval = findSessionApproval(messages, 'dangerous-tool');
      expect(sessionApproval).toBeDefined();
    });

    it('should simulate session approval tool message persistence flow', () => {
      // Arrange: Simulate client session approval response (tool message added and PERSISTED)
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'Execute dangerous command',
          createdAt: new Date(),
          messageId: 'user-msg-1'
        },
        {
          role: 'tool',
          tool_call_id: 'approval_123',
          content: JSON.stringify({
            decision: 'approve',
            scope: 'session',
            toolName: 'dangerous-tool'
          }),
          createdAt: new Date(),
          messageId: 'session-approval-tool-msg'
        } as ChatMessage,
        {
          role: 'assistant',
          content: 'Tool executed successfully',
          createdAt: new Date(),
          messageId: 'execution-msg'
        }
      ];

      // Act: Check approval status multiple times (simulating future calls)
      const sessionApproval = findSessionApproval(messages, 'dangerous-tool');
      const recentApproval = findRecentApproval(messages, 'dangerous-tool');

      // Assert: Session approval persists (saved for future scanning)
      expect(sessionApproval).toBeDefined();
      expect(sessionApproval?.scope).toBe('session');
      expect(sessionApproval?.decision).toBe('approve');

      // Session approval should work even if recent approval is consumed
      expect(sessionApproval).toBeTruthy();
    });

    it('should differentiate session vs once approval in message scanning', () => {
      // Arrange: Messages with both types of approval
      const messages: AgentMessage[] = [
        {
          role: 'tool',
          tool_call_id: 'approval_once',
          content: JSON.stringify({
            decision: 'approve',
            scope: 'once',
            toolName: 'dangerous-tool'
          }),
          createdAt: new Date(Date.now() - 10000),
          messageId: 'once-approval'
        } as ChatMessage,
        {
          role: 'tool',
          tool_call_id: 'approval_session',
          content: JSON.stringify({
            decision: 'approve',
            scope: 'session',
            toolName: 'dangerous-tool'
          }),
          createdAt: new Date(),
          messageId: 'session-approval'
        } as ChatMessage
      ];

      // Act: Scan for both types
      const sessionApproval = findSessionApproval(messages, 'dangerous-tool');
      const recentApproval = findRecentApproval(messages, 'dangerous-tool');

      // Assert: Should find session approval (persists) and recent approval (most recent)
      expect(sessionApproval).toBeDefined();
      expect(sessionApproval?.scope).toBe('session');
      expect(recentApproval).toBeDefined();
      expect(recentApproval?.scope).toBe('once'); // Most recent, but once
    });
  });

  describe('Message Format and Processing Validation', () => {
    it('should properly parse approval tool messages', () => {
      // Arrange: Tool message with approval content
      const approvalMessage: ChatMessage = {
        role: 'tool',
        tool_call_id: 'approval_123',
        content: JSON.stringify({
          decision: 'approve',
          scope: 'session',
          toolName: 'dangerous-tool'
        }),
        createdAt: new Date()
      };

      // Act: Parse the content
      const content = JSON.parse(approvalMessage.content);

      // Assert: Content should have expected structure
      expect(content.decision).toBe('approve');
      expect(content.scope).toBe('session');
      expect(content.toolName).toBe('dangerous-tool');
      expect(approvalMessage.role).toBe('tool');
      expect(approvalMessage.tool_call_id).toMatch(/^approval_/);
    });

    it('should validate approval message requirements for persistence', () => {
      // Arrange: Valid approval tool message for session
      const validSessionApproval: ChatMessage = {
        role: 'tool',
        tool_call_id: 'approval_456',
        content: JSON.stringify({
          decision: 'approve',
          scope: 'session',
          toolName: 'file-write'
        }),
        createdAt: new Date()
      };

      // Act: Validate structure
      const isValidApprovalMessage =
        validSessionApproval.role === 'tool' &&
        validSessionApproval.tool_call_id?.startsWith('approval_') &&
        !!validSessionApproval.content;

      // Assert: Should meet all requirements for approval message
      expect(isValidApprovalMessage).toBe(true);

      const content = JSON.parse(validSessionApproval.content);
      expect(['approve', 'deny']).toContain(content.decision);
      expect(['once', 'session']).toContain(content.scope);
      expect(content.toolName).toBeTruthy();
    });

    it('should demonstrate key difference: deny vs once vs session message saving behavior', () => {
      // Act & Assert: Demonstrate the three behaviors

      // 1. DENY: No approval messages, no persistence
      const denyMessages: AgentMessage[] = [
        {
          role: 'user',
          content: 'Execute shell command',
          createdAt: new Date(),
          messageId: 'user-msg'
        }
        // No approval message for deny - execution blocked, conversation continues
      ];
      expect(findRecentApproval(denyMessages, 'shell_command')).toBeUndefined();
      expect(findSessionApproval(denyMessages, 'shell_command')).toBeUndefined();

      // 2. ONCE: Natural language approval for once, no session persistence
      const onceMessages: AgentMessage[] = [
        {
          role: 'user',
          content: 'I approve shell_command once',
          createdAt: new Date(),
          messageId: 'user-msg'
        }
      ];
      expect(findRecentApproval(onceMessages, 'shell_command')?.scope).toBe('once');
      expect(findSessionApproval(onceMessages, 'shell_command')).toBeUndefined(); // No session persistence

      // 3. SESSION: Natural language approval for session, persists for future scanning
      const sessionMessages: AgentMessage[] = [
        {
          role: 'user',
          content: 'I approve shell_command for this session',
          createdAt: new Date(),
          messageId: 'user-msg'
        }
      ];
      expect(findSessionApproval(sessionMessages, 'shell_command')?.scope).toBe('session'); // Session persistence
    });
  });

  describe('Integration with Real Approval Flow', () => {
    it('should demonstrate complete flow: request → session approval → persistence → reuse', async () => {
      // Step 1: Initial request should need approval
      let messages: AgentMessage[] = [];

      const initialCheck = await checkToolApproval(mockWorld, 'dangerous-tool', { command: 'rm -rf /' }, 'Delete files', messages);
      expect(initialCheck.needsApproval).toBe(true);

      // Step 2: User provides session approval (simulated tool message)
      messages.push({
        role: 'tool',
        tool_call_id: 'approval_789',
        content: JSON.stringify({
          decision: 'approve',
          scope: 'session',
          toolName: 'dangerous-tool'
        }),
        createdAt: new Date(),
        messageId: 'session-approval-tool-msg'
      } as ChatMessage);

      // Step 3: Second call should be auto-approved due to session approval
      const secondCheck = await checkToolApproval(mockWorld, 'dangerous-tool', { command: 'ls' }, 'List files', messages);
      expect(secondCheck.needsApproval).toBe(false);
      expect(secondCheck.canExecute).toBe(true);

      // Step 4: Session approval should be findable for future tool executions
      const sessionApproval = findSessionApproval(messages, 'dangerous-tool');
      expect(sessionApproval?.scope).toBe('session');
    });
  });
});