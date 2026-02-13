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
 * - Agent memory filtering for LLM context (prevents irrelevant message pollution)
 *
 * Core Utilities:
 * - generateId: Crypto-based unique ID generation for messages and events
 * - generateChatId: Nanoid-based short ID generation for chat history
 * - toKebabCase: String conversion for consistent naming conventions
 * - getWorldTurnLimit: World-specific turn limit retrieval with fallback defaults
 * - extractMentions: Case-insensitive mention extraction with first-mention-only logic
 * - determineSenderType: Sender classification for message filtering and processing
 * - prepareMessagesForLLM: Message formatting for LLM calls with history and system prompts
 * - wouldAgentHaveRespondedToHistoricalMessage: Filters irrelevant messages from LLM context
 *
 * Implementation Details:
 * - Uses native crypto.randomUUID() for ID generation ensuring uniqueness
 * - Uses nanoid for human-readable chat IDs (8 characters, URL-safe)
 * - Self-contained utility functions with no external dependencies
 * - Ready for manager module integration with consistent interfaces
 * - All types imported from types.ts for better organization and reusability
 * - World-aware functions that respect world-specific configurations
 * - Message processing utilities that handle AI SDK compatibility
 * - Agent memory filtering prevents LLM context pollution from irrelevant messages
 *
 * Recent Changes:
 * - 2026-02-08: Fixed wouldAgentHaveRespondedToHistoricalMessage to include assistant messages with tool_calls
 *   (prevents OpenAI error: "messages with role 'tool' must be a response to a preceeding message with 'tool_calls'")
 * - Enhanced comment documentation with detailed feature descriptions
 * - Improved function descriptions with implementation details
 * - Added details about world-aware operations and LLM integration
 * - Added nanoid support for chat ID generation
 * - Added wouldAgentHaveRespondedToHistoricalMessage for LLM context filtering
 * - Updated prepareMessagesForLLM to filter irrelevant conversation history
 * - Consolidated with message-prep.ts filtering for client-side tool calls
 */

import { nanoid } from 'nanoid';
import { filterClientSideMessages } from './message-prep.js';
import { createCategoryLogger } from './logger.js';

const logger = createCategoryLogger('core.utils');

const DEFAULT_WORLD_ENV_VALUES: Record<string, string> = {
  working_directory: './'
};

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

/**
 * Parse .env-style text into key-value map.
 * Supported:
 * - Comments: # comment
 * - Blank lines
 * - KEY=value entries (optional whitespace around '=')
 * Invalid lines are ignored.
 */
export function parseEnvText(variablesText?: string): Record<string, string> {
  const envMap: Record<string, string> = {};
  if (!variablesText || typeof variablesText !== 'string') {
    return envMap;
  }

  const lines = variablesText.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      logger.debug('Ignoring invalid env line', { line: rawLine });
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!key) {
      logger.debug('Ignoring env line with empty key', { line: rawLine });
      continue;
    }

    envMap[key] = value;
  }

  return envMap;
}

/**
 * Get a single env value from .env-style text
 */
export function getEnvValueFromText(variablesText: string | undefined, key: string): string | undefined {
  if (!key) {
    return undefined;
  }
  const envMap = parseEnvText(variablesText);
  if (Object.prototype.hasOwnProperty.call(envMap, key)) {
    return envMap[key];
  }
  return DEFAULT_WORLD_ENV_VALUES[key];
}

/**
 * Interpolate template variables in form {{ variable }} from env map.
 * Missing variables are replaced with empty string.
 */
export function interpolateTemplateVariables(template: string, envMap: Record<string, string>): string {
  if (!template) {
    return '';
  }

  return template.replace(/\{\{\s*([A-Za-z0-9_\-]+)\s*\}\}/g, (_match, variableName: string) => {
    if (Object.prototype.hasOwnProperty.call(envMap, variableName)) {
      return envMap[variableName] ?? '';
    }
    return '';
  });
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
 * Check if agent would have responded to a historical message
 * Replicates shouldAgentRespond logic for saved messages to filter LLM context
 * 
 * @param agent - The agent to check response logic for
 * @param message - The historical message to evaluate
 * @returns true if agent would have responded to this message
 */
export function wouldAgentHaveRespondedToHistoricalMessage(
  agent: Agent,
  message: AgentMessage
): boolean {
  // Always include own messages (by agentId or sender)
  if (message.agentId === agent.id || message.sender?.toLowerCase() === agent.id.toLowerCase()) {
    return true;
  }

  const content = message.content || '';

  // Never respond to turn limit messages (prevents endless loops)
  if (content.includes('Turn limit reached')) {
    return false;
  }

  // Never respond to system messages
  if (message.sender === 'system') {
    return false;
  }

  // Always include tool messages (they are results from previous interactions)
  if (message.role === 'tool' || message.sender === 'tool') {
    return true;
  }

  // Always include assistant messages with tool_calls (required for tool result context)
  if (message.role === 'assistant' && (message as ChatMessage).tool_calls?.length) {
    return true;
  }

  // Always respond to world messages
  if (message.sender === 'world') {
    return true;
  }

  const anyMentions = extractMentions(content);
  const mentions = extractParagraphBeginningMentions(content);

  // Determine sender type
  const senderType = determineSenderType(message.sender);

  // For HUMAN messages
  if (senderType === SenderType.HUMAN) {
    if (mentions.length === 0) {
      // If there are ANY mentions anywhere but none at paragraph beginnings, don't respond
      if (anyMentions.length > 0) {
        return false;
      } else {
        return true; // No mentions = public message
      }
    } else {
      return mentions.includes(agent.id.toLowerCase());
    }
  }

  // For agent messages, only respond if this agent has a paragraph-beginning mention
  return mentions.includes(agent.id.toLowerCase());
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
 * Filters conversation history by chatId if provided and excludes messages
 * the agent would not have responded to (prevents irrelevant context pollution)
 */
export async function prepareMessagesForLLM(
  worldId: string,
  agent: Agent,
  chatId: string | null,
  includeCurrentMessage?: MessageData
): Promise<AgentMessage[]> {
  const messages: AgentMessage[] = [];
  let worldEnvMap: Record<string, string> = {};

  // Load FRESH agent from storage to get original system prompt (not patched)
  // This ensures we always use the clean system prompt from storage
  let freshSystemPrompt: string | undefined;
  try {
    const { createStorageWithWrappers } = await import('./storage/storage-factory.js');
    const storage = await createStorageWithWrappers();
    const freshAgent = await storage.loadAgent(worldId, agent.id);
    freshSystemPrompt = freshAgent?.systemPrompt;
    const world = await storage.loadWorld(worldId);
    worldEnvMap = parseEnvText(world?.variables);
  } catch (error) {
    const { logger } = await import('./logger.js');
    logger.error('Could not load agent from storage for system prompt', {
      agentId: agent.id,
      worldId,
      error: error instanceof Error ? error.message : error
    });
    // Fallback to in-memory agent's system prompt
    freshSystemPrompt = agent.systemPrompt;
  }

  // IDEMPOTENCE: Always add system message first (if available)
  // System messages are NEVER saved to storage
  if (freshSystemPrompt) {
    messages.push({
      role: 'system',
      content: interpolateTemplateVariables(freshSystemPrompt, worldEnvMap),
      createdAt: new Date()
    });
  }

  // Load FRESH conversation history from storage (not from in-memory agent)
  // This ensures we always have the latest messages
  let conversationHistory: AgentMessage[] = [];
  try {
    const { createStorageWithWrappers } = await import('./storage/storage-factory.js');
    const storage = await createStorageWithWrappers();
    conversationHistory = await storage.getMemory(worldId, chatId);
  } catch (error) {
    const { logger } = await import('./logger.js');
    logger.error('Could not load conversation history from storage', {
      agentId: agent.id,
      worldId,
      chatId,
      error: error instanceof Error ? error.message : error
    });
  }

  // Filter to only include messages from THIS specific agent
  // getMemory returns messages from ALL agents, but we only want this agent's memory
  const agentMessages = conversationHistory.filter(msg => msg.agentId === agent.id);

  // IDEMPOTENCE: Always filter out system messages from history
  // System message should only come from agent.systemPrompt above, never from storage
  const filteredHistory = agentMessages.filter(msg => msg.role !== 'system');

  // Filter to only include messages this agent would have responded to
  // This prevents irrelevant "not mentioned" messages from polluting LLM context
  const relevantHistory = filteredHistory.filter(msg =>
    wouldAgentHaveRespondedToHistoricalMessage(agent, msg)
  );

  // Add filtered conversation history
  messages.push(...relevantHistory);

  // Add current message if provided
  if (includeCurrentMessage) {
    messages.push(messageDataToAgentMessage(includeCurrentMessage));
  }

  // Filter out client-side tool calls and orphaned tool results.
  const { filterClientSideMessages } = await import('./message-prep.js');
  return filterClientSideMessages(messages);
}
