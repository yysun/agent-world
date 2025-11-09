/**
 * Auto-Mention Logic - Pure String Processing Functions
 *
 * Purpose: Handle @mention processing for agent responses
 * Features:
 * - Detect mentions at paragraph beginnings
 * - Add/remove mentions with loop prevention
 * - Support world tags: <world>STOP|DONE|PASS|TO:a,b</world>
 * - Case-insensitive mention matching
 *
 * These are pure functions with no dependencies on World/Agent objects
 */

import { extractParagraphBeginningMentions, determineSenderType } from '../utils.js';
import { SenderType } from '../types.js';
import { createCategoryLogger } from '../logger.js';

const loggerAutoMention = createCategoryLogger('events.automention');

/**
 * Check if response has any mention at paragraph beginning (prevents auto-mention loops)
 */
export function hasAnyMentionAtBeginning(response: string): boolean {
  if (!response?.trim()) return false;
  const result = extractParagraphBeginningMentions(response).length > 0;
  loggerAutoMention.debug('Checking for mentions at beginning', { response: response.substring(0, 100), hasMentions: result });
  return result;
}

/**
 * Remove all mentions from paragraph beginnings (including commas and spaces)
 */
export function removeMentionsFromParagraphBeginnings(text: string, specificMention?: string): string {
  if (!text?.trim()) return text;

  const lines = text.split('\n');
  const processedLines = lines.map(line => {
    const trimmed = line.trimStart();
    let cleaned = trimmed;

    if (specificMention) {
      // For specific mentions, escape special regex characters and handle consecutive mentions
      const escapedMention = specificMention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Pattern to match @mention followed by optional comma/space combinations
      const mentionPattern = new RegExp(`^@${escapedMention}(?:[,\\s]+|$)`, 'gi');

      // Keep removing mentions from the beginning until no more are found
      while (mentionPattern.test(cleaned)) {
        cleaned = cleaned.replace(mentionPattern, '');
        mentionPattern.lastIndex = 0; // Reset regex for next iteration
      }
    } else {
      // For any mentions
      const mentionPattern = /^@\w+(?:[-_]\w+)*(?:[,\s]+|$)/;

      // Keep removing mentions from the beginning until no more are found
      while (mentionPattern.test(cleaned)) {
        cleaned = cleaned.replace(mentionPattern, '');
      }
    }

    const leadingWhitespace = line.match(/^(\s*)/)?.[1] || '';
    return leadingWhitespace + cleaned;
  });

  return processedLines.join('\n');
}

/**
 * Add auto-mention at beginning if no existing mentions (prevents loops)
 * Supports world tags: <world>STOP|DONE|PASS</world> and <world>TO: a,b,c</world>
 */
export function addAutoMention(response: string, sender: string): string {
  if (!response?.trim() || !sender) {
    return response;
  }

  loggerAutoMention.debug('Processing auto-mention', { sender, responseStart: response.substring(0, 100) });

  // Consolidated regex patterns for world tags (case insensitive)
  const worldTagPattern = /<world>(STOP|DONE|PASS|TO:\s*([^<]*))<\/world>/gi;
  let match;
  let processedResponse = response;

  while ((match = worldTagPattern.exec(response)) !== null) {
    const [fullMatch, action, toRecipients] = match;
    loggerAutoMention.debug('Found world tag', { action, toRecipients, fullMatch });

    // Remove the world tag from response
    processedResponse = processedResponse.replace(fullMatch, '');

    const upperAction = action.toUpperCase();
    if (upperAction === 'STOP' || upperAction === 'DONE' || upperAction === 'PASS') {
      // Stop tags prevent auto-mention and remove ALL mentions at beginning of paragraphs
      loggerAutoMention.debug('Processing STOP/DONE/PASS tag - removing mentions');
      const cleanResponse = processedResponse.trim();
      return removeMentionsFromParagraphBeginnings(cleanResponse).trim();
    } else if (upperAction.startsWith('TO:')) {
      // TO tag with recipients - also remove existing mentions
      const recipients = toRecipients?.split(',').map(name => name.trim()).filter(name => name) || [];
      loggerAutoMention.debug('Processing TO tag', { recipients });

      // Remove existing mentions from the response
      const cleanResponse = removeMentionsFromParagraphBeginnings(processedResponse.trim()).trim();

      if (recipients.length > 0) {
        const mentions = recipients.map(recipient => `@${recipient}`).join('\n');
        const result = `${mentions}\n\n${cleanResponse}`;
        loggerAutoMention.debug('Added TO tag mentions', { mentions, result: result.substring(0, 100) });
        return result;
      } else {
        // Empty TO tag - fall back to normal auto-mention behavior
        loggerAutoMention.debug('Empty TO tag - falling back to normal auto-mention');
        if (hasAnyMentionAtBeginning(cleanResponse)) {
          return cleanResponse;
        }
        return `@${sender} ${cleanResponse}`;
      }
    }
  }

  // Existing logic: add auto-mention if no existing mentions at beginning
  if (hasAnyMentionAtBeginning(processedResponse)) {
    loggerAutoMention.debug('Response already has mentions at beginning - no auto-mention needed');
    return processedResponse;
  }

  const result = `@${sender} ${processedResponse.trim()}`;
  loggerAutoMention.debug('Added auto-mention', { sender, result: result.substring(0, 100) });
  return result;
}

/**
 * Get valid mentions excluding self-mentions (case-insensitive)
 */
export function getValidMentions(response: string, agentId: string): string[] {
  if (!response?.trim() || !agentId) return [];
  return extractParagraphBeginningMentions(response)
    .filter(mention => mention.toLowerCase() !== agentId.toLowerCase());
}

/**
 * Determine if agent should auto-mention sender (no valid mentions in response)
 * Auto-mention is used to target responses and prevent unintended broadcasting
 */
export function shouldAutoMention(response: string, sender: string, agentId: string): boolean {
  if (!response?.trim() || !sender || !agentId) return false;
  if (determineSenderType(sender) === SenderType.HUMAN) return false;
  if (sender.toLowerCase() === agentId.toLowerCase()) return false;
  // Check if response already has valid mentions (excluding self)
  return getValidMentions(response, agentId).length === 0;
}

/**
 * Remove consecutive self-mentions from response beginning (case-insensitive)
 */
export function removeSelfMentions(response: string, agentId: string): string {
  if (!response || !agentId) return response;

  const trimmedResponse = response.trim();
  if (!trimmedResponse) return response;

  loggerAutoMention.debug('Removing self-mentions', { agentId, responseStart: response.substring(0, 100) });

  // Use the helper function to remove self-mentions
  const result = removeMentionsFromParagraphBeginnings(trimmedResponse, agentId);

  loggerAutoMention.debug('Self-mention removal result', {
    agentId,
    before: trimmedResponse.substring(0, 100),
    after: result.substring(0, 100),
    changed: trimmedResponse !== result
  });

  // Preserve original leading whitespace
  const originalMatch = response.match(/^(\s*)/);
  const originalLeadingWhitespace = originalMatch ? originalMatch[1] : '';
  return originalLeadingWhitespace + result;
}
