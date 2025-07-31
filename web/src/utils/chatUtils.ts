/**
 * Chat Utility Functions
 * 
 * Features:
 * - Generate short titles from agent messages (≤10 words)
 * - Extract key topics and themes from chat content
 * - Format chat names consistently
 * 
 * Implementation:
 * - Simple text processing for title generation
 * - Fallback to generic names if no suitable content
 * - Word count limiting for concise titles
 */

import type { Message } from '../types';

/**
 * Generate a short title from agent messages (≤10 words)
 * Uses first meaningful agent message content to create title
 */
export function generateChatTitle(messages: Message[]): string {
  // Find first agent message with substantial content
  const agentMessages = messages.filter(msg => 
    msg.sender !== 'HUMAN' && 
    msg.sender !== 'human' && 
    msg.sender !== 'system' &&
    msg.type !== 'user' &&
    msg.text && 
    msg.text.trim().length > 10
  );

  if (agentMessages.length === 0) {
    return 'New Chat';
  }

  const firstMessage = agentMessages[0];
  let content = firstMessage.text.trim();

  // Remove common prefixes and formatting
  content = content
    .replace(/^(Hello|Hi|Hey)[,!.]?\s*/i, '')
    .replace(/^I\s+(am|'m)\s+/i, '')
    .replace(/^(Let me|I'll|I will)\s+/i, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold markdown
    .replace(/\*([^*]+)\*/g, '$1') // Remove italic markdown
    .replace(/[#]+\s*/, '') // Remove headers
    .trim();

  // Split into words and take first 10
  const words = content.split(/\s+/).slice(0, 10);
  
  // Create title
  let title = words.join(' ');
  
  // If too long, try to find a natural break point
  if (title.length > 50) {
    const sentences = title.split(/[.!?]/);
    if (sentences[0] && sentences[0].length <= 50) {
      title = sentences[0].trim();
    } else {
      // Fallback to first 6 words if still too long
      title = words.slice(0, 6).join(' ');
    }
  }

  // Clean up ending punctuation if it's mid-sentence
  title = title.replace(/[,;:]$/, '');
  
  // Add ellipsis if we truncated
  if (words.length > 6 || content.split(/\s+/).length > words.length) {
    title += '...';
  }

  return title || 'New Chat';
}

/**
 * Check if a chat needs to be auto-saved
 * Returns true if this is the first agent message in an unsaved chat
 */
export function shouldAutoSaveChat(messages: Message[], currentChatIsSaved: boolean): boolean {
  if (currentChatIsSaved) {
    return false; // Already saved
  }

  // Count agent messages (non-human, non-system)
  const agentMessageCount = messages.filter(msg => 
    msg.sender !== 'HUMAN' && 
    msg.sender !== 'human' && 
    msg.sender !== 'system' &&
    msg.type !== 'user'
  ).length;

  return agentMessageCount === 1; // First agent message
}

/**
 * Format chat display name with context
 */
export function formatChatDisplayName(chat: { name: string; isSaved: boolean; messageCount: number }): string {
  const { name, isSaved, messageCount } = chat;
  
  if (!isSaved) {
    return `${name} (${messageCount} messages)`;
  }
  
  return name;
}

/**
 * Generate unique chat name to avoid conflicts
 */
export function generateUniqueChatName(baseName: string, existingNames: string[]): string {
  if (!existingNames.includes(baseName)) {
    return baseName;
  }

  let counter = 1;
  let uniqueName: string;
  
  do {
    uniqueName = `${baseName} (${counter})`;
    counter++;
  } while (existingNames.includes(uniqueName));

  return uniqueName;
}