/**
 * Purpose: Validate event metadata interfaces and runtime type guard behavior.
 * Key features:
 * - Confirms MessageEventMetadata and ToolEventMetadata fixture completeness
 * - Confirms validateMessageEventMetadata rejects incomplete metadata
 * - Confirms validateMessageEventMetadata accepts complete metadata
 * Implementation notes:
 * - Uses compile-time typed fixtures for interface shape coverage
 * - Uses plain object fixtures for runtime type-guard checks
 * Recent changes:
 * - Removed legacy manual-intervention metadata fields from test fixtures
 */

import { describe, it, expect } from 'vitest';
import type { MessageEventMetadata, ToolEventMetadata } from '../../core/storage/eventStorage/types.js';
import { validateMessageEventMetadata } from '../../core/storage/eventStorage/types.js';

describe('Event Metadata Types', () => {
  describe('MessageEventMetadata structure', () => {
    it('should have all required fields', () => {
      const metadata: MessageEventMetadata = {
        sender: 'human',
        chatId: 'chat-123',
        ownerAgentIds: ['agent1', 'agent2'],
        recipientAgentId: null,
        originalSender: null,
        deliveredToAgents: ['agent1', 'agent2'],
        messageDirection: 'broadcast',
        isMemoryOnly: false,
        isCrossAgentMessage: false,
        isHumanMessage: true,
        threadRootId: null,
        threadDepth: 0,
        isReply: false,
        hasReplies: false,
        llmTokensInput: null,
        llmTokensOutput: null,
        llmLatency: null,
        llmProvider: null,
        llmModel: null,
        hasToolCalls: false,
        toolCallCount: 0
      };

      // TypeScript compilation is the primary test
      expect(metadata).toBeDefined();
      expect(metadata.sender).toBe('human');
      expect(metadata.ownerAgentIds).toHaveLength(2);
    });
  });

  describe('ToolEventMetadata structure', () => {
    it('should have all required fields', () => {
      const metadata: ToolEventMetadata = {
        agentName: 'agent1',
        toolType: 'read_file',
        ownerAgentId: 'agent1',
        triggeredByMessageId: 'msg-123',
        executionDuration: 150,
        resultSize: 1024
      };

      expect(metadata).toBeDefined();
      expect(metadata.ownerAgentId).toBe('agent1');
      expect(metadata.executionDuration).toBe(150);
    });
  });

  describe('validateMessageEventMetadata()', () => {
    it('should reject incomplete data - missing ownerAgentIds', () => {
      const incomplete = {
        sender: 'human',
        chatId: 'chat-123',
        // ownerAgentIds missing
        messageDirection: 'broadcast',
        isMemoryOnly: false,
        isCrossAgentMessage: false,
        isHumanMessage: true,
        threadDepth: 0,
        isReply: false,
        hasReplies: false,
        hasToolCalls: false,
        toolCallCount: 0
      };

      expect(validateMessageEventMetadata(incomplete)).toBe(false);
    });

    it('should accept complete data', () => {
      const complete = {
        sender: 'human',
        chatId: 'chat-123',
        ownerAgentIds: ['agent1'],
        recipientAgentId: null,
        originalSender: null,
        deliveredToAgents: ['agent1'],
        messageDirection: 'broadcast',
        isMemoryOnly: false,
        isCrossAgentMessage: false,
        isHumanMessage: true,
        threadRootId: null,
        threadDepth: 0,
        isReply: false,
        hasReplies: false,
        llmTokensInput: null,
        llmTokensOutput: null,
        llmLatency: null,
        llmProvider: null,
        llmModel: null,
        hasToolCalls: false,
        toolCallCount: 0
      };

      expect(validateMessageEventMetadata(complete)).toBe(true);
    });
  });
});
