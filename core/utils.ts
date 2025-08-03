/**
 * Manager Utilities - Helper functions for managers and agent processing
 *
 * Features:
 * - Unique ID generation for events and messages using crypto.randomUUID()
 * - Chat ID generation using nanoid for human-readable IDs
 * - Manager-specific utility functions for string manipulation and processing
 * - String manipulation utilities (kebab-case conversion for IDs and names)
 * - Agent and message processing utilities with world-aware operations
 * - LLM message preparation with conversation history and system prompts
 * - Mention extraction with first-mention-only logic and case-insensitive matching
 * - Sender type detection for humans, agents, and system messages
 *
 * Core Utilities:
 * - generateId: Crypto-based unique ID generation for messages and events
 * - generateChatId: Nanoid-based short ID generation for chat history
 * - toKebabCase: String conversion for consistent naming conventions
 * - getWorldTurnLimit: World-specific turn limit retrieval with fallback defaults
 * - extractMentions: Case-insensitive mention extraction with first-mention-only logic
 * - determineSenderType: Sender classification for message filtering and processing
 * - prepareMessagesForLLM: Message formatting for LLM calls with history and system prompts
 *
 * Implementation Details:
 * - Uses native crypto.randomUUID() for ID generation ensuring uniqueness
 * - Uses nanoid for human-readable chat IDs (8 characters, URL-safe)
 * - Self-contained utility functions with no external dependencies
 * - Ready for manager module integration with consistent interfaces
 * - All types imported from types.ts for better organization and reusability
 * - World-aware functions that respect world-specific configurations
 * - Message processing utilities that handle AI SDK compatibility
 *
 * Recent Changes:
 * - Enhanced comment documentation with detailed feature descriptions
 * - Improved function descriptions with implementation details
 * - Added details about world-aware operations and LLM integration
 * - Added nanoid support for chat ID generation
 */

import { nanoid } from 'nanoid';

/**
 * Generate unique ID for messages and events
 */
export function generateId(): string {
  try {
    return nanoid();
  } catch (error) {
    // Fallback for environments where nanoid import fails
    console.warn('[generateId] nanoid not available, using fallback');
    return 'id-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
  }
}

/**
 * Generate short, human-readable ID for chat history
 */
export function generateChatId(): string {
  return nanoid(8); // 8 characters, URL-safe
}

/**
 * Simple runtime environment detection
 * Returns true for Node.js, false for browser
 */
export function isNodeEnvironment(): boolean {
  // Robust Node.js detection: process.versions.node is always present in Node
  return typeof process !== 'undefined' && !!process.versions && !!process.versions.node;
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
import { World, Agent, SenderType, MessageData, AgentMessage, ChatMessage } from './types.js';

/**
 * Get world-specific turn limit or default value
 */
export function getWorldTurnLimit(world: World): number {
  return world.turnLimit || 5; // Default to 5 if not configured
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
 * Extract @mentions that appear at the beginning of paragraphs
 * Implements paragraph-beginning-only logic for agent response triggering
 * 
 * @param content - The message content to search for mentions
 * @returns Array of mention names (lowercase) that appear at paragraph beginnings
 */
export function extractParagraphBeginningMentions(content: string): string[] {
  if (!content) return [];

  const validMentions: string[] = [];
  const mentionPattern = /^@(\w+(?:[-_]\w+)*)/;
  const lines = content.split(/\n/);

  for (const line of lines) {
    const trimmed = line.trimStart();
    // Only match if @ is the very first character after trimming
    if (trimmed.startsWith('@')) {
      const match = mentionPattern.exec(trimmed);
      if (match && match[1]) {
        validMentions.push(match[1].toLowerCase());
      }
    }
  }

  return validMentions;
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
  if (lowerSender === 'system') {
    return SenderType.SYSTEM;
  }
  if (lowerSender === 'world') {
    return SenderType.WORLD;
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
  agent: Agent,
  messageData: MessageData,
  conversationHistory: AgentMessage[] = []
): AgentMessage[] {
  const messages: AgentMessage[] = [];

  // Add system message if available
  if (agent.systemPrompt) {
    messages.push({
      role: 'system',
      content: agent.systemPrompt,
      createdAt: new Date()
    });
  }

  // Add conversation history
  messages.push(...conversationHistory);

  // Add current message as user input
  messages.push(messageDataToAgentMessage(messageData));

  return messages;
}
