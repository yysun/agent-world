/**
 * Event Validation and Default Metadata Creation
 * 
 * Provides strict validation for event metadata before persistence and
 * default metadata creation helpers to ensure all events have complete metadata.
 * 
 * Features:
 * - validateEventForPersistence: Strict validation that throws on incomplete metadata
 * - createDefaultMessageMetadata: Create safe defaults for all required fields
 * - Type-safe validation with TypeScript type guards
 * 
 * Implementation: 2025-11-07
 * - Clean build approach - all metadata fields required from creation
 * - No legacy event support - validation enforces completeness
 * - Human vs agent message type detection
 */

import type { StoredEvent, MessageEventMetadata } from './types.js';
import { validateMessageEventMetadata } from './types.js';

/**
 * Validate event before persistence
 * Throws error if metadata is incomplete
 */
export function validateEventForPersistence(event: StoredEvent): void {
  if (event.type === 'message') {
    if (!validateMessageEventMetadata(event.meta)) {
      throw new Error(
        `Invalid message event metadata for event ${event.id}. ` +
        `All metadata fields are required. Missing or invalid fields detected.`
      );
    }
  }

  if (event.type === 'tool') {
    if (!event.meta?.ownerAgentId || !event.meta?.triggeredByMessageId) {
      throw new Error(
        `Invalid tool event metadata for event ${event.id}. ` +
        `ownerAgentId and triggeredByMessageId are required.`
      );
    }
  }
}

/**
 * Create default metadata values for required fields
 */
export function createDefaultMessageMetadata(sender: string): MessageEventMetadata {
  const isHuman = sender === 'human' || sender === 'user';

  return {
    sender,
    chatId: null,
    ownerAgentIds: [],
    recipientAgentId: null,
    originalSender: null,
    deliveredToAgents: [],
    messageDirection: 'broadcast',
    isMemoryOnly: false,
    isCrossAgentMessage: false,
    isHumanMessage: isHuman,
    threadRootId: null,
    threadDepth: 0,
    isReply: false,
    hasReplies: false,
    requiresApproval: false,
    approvalScope: null,
    approvedAt: null,
    approvedBy: null,
    deniedAt: null,
    denialReason: null,
    llmTokensInput: null,
    llmTokensOutput: null,
    llmLatency: null,
    llmProvider: null,
    llmModel: null,
    hasToolCalls: false,
    toolCallCount: 0
  };
}
