/**
 * Manager Utilities - Helper functions for managers
 *
 * Features:
 * - Unique ID generation for events and messages
 * - Manager-specific utility functions
 * - String manipulation utilities (kebab-case conversion)
 * - Agent and message processing utilities
 *
 * Implementation:
 * - Uses native crypto.randomUUID() for ID generation
 * - Self-contained utility functions
 * - Ready for manager module integration
 * - All types moved to types.ts for better organization
 */

/**
 * Generate unique ID for messages and events
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Convert a string to kebab-case
 * @param str - The string to convert
 * @returns The kebab-case version of the string
 */
export function toKebabCase(str: string): string {
  if (!str) return '';

  return str
    .replace(/\s+/g, '-')           // Replace spaces with hyphens
    .replace(/([a-z])([A-Z])/g, '$1-$2')  // Insert hyphen between camelCase
    .replace(/[^a-zA-Z0-9-]/g, '-') // Replace special characters with hyphens
    .replace(/-+/g, '-')            // Replace multiple hyphens with single
    .replace(/^-|-$/g, '')          // Remove leading/trailing hyphens
    .toLowerCase();                 // Convert to lowercase
}

// Import types for utility functions
import { World, SenderType, MessageData, AgentMessage, ChatMessage, AgentConfig } from './types.js';

/**
 * Get world-specific turn limit or default value
 */
export function getWorldTurnLimit(world: World): number {
  return world.config.turnLimit || 5; // Default to 5 if not configured
}

/**
 * Extract @mentions from message content - returns only first valid mention
 * Implements first-mention-only logic to prevent multiple agent responses
 */
export function extractMentions(content: string): string[] {
  if (!content) return [];

  const mentionRegex = /@(\w+(?:[-_]\w+)*)/g;
  const allMentions: string[] = [];
  let firstValidMention: string | null = null;
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    const mention = match[1];
    if (mention && mention.length > 0) {
      const lowerMention = mention.toLowerCase();
      allMentions.push(lowerMention);

      // Only keep the first valid mention
      if (firstValidMention === null) {
        firstValidMention = lowerMention;
      }
    }
  }

  // Return array with first mention only
  return firstValidMention ? [firstValidMention] : [];
}

/**
 * Determine sender type based on sender name (matches src/agent.ts logic)
 */
export function determineSenderType(sender: string | undefined): SenderType {
  if (!sender) return SenderType.SYSTEM;

  const lowerSender = sender.toLowerCase();

  if (lowerSender === 'human' || lowerSender === 'user' || lowerSender === 'you') {
    return SenderType.HUMAN;
  }
  if (lowerSender === 'system' || lowerSender === 'world') {
    return SenderType.SYSTEM;
  }
  return SenderType.AGENT;
}

/**
 * Convert MessageData to AgentMessage for memory storage
 */
export function messageDataToAgentMessage(messageData: MessageData): AgentMessage {
  return {
    role: 'user',
    content: messageData.content || messageData.payload?.content || '',
    sender: messageData.sender,
    createdAt: new Date()
  };
}

/**
 * Prepare messages array for LLM using standard chat message format
 */
export function prepareMessagesForLLM(
  agentConfig: AgentConfig,
  messageData: MessageData,
  conversationHistory: AgentMessage[] = []
): AgentMessage[] {
  const messages: AgentMessage[] = [];

  // Add system message if available
  if (agentConfig.systemPrompt) {
    messages.push({
      role: 'system',
      content: agentConfig.systemPrompt,
      createdAt: new Date()
    });
  }

  // Add conversation history
  messages.push(...conversationHistory);

  // Add current message as user input
  messages.push(messageDataToAgentMessage(messageData));

  return messages;
}
