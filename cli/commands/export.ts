/**
 * Export Command - Conversation Export to Markdown
 * 
 * Features:
 * - Export all conversation messages to markdown format
 * - Include conversation metadata and statistics
 * - Chronological message ordering with timestamps
 * - Proper sender identification and message type indicators
 * - File handling with error reporting and success confirmation
 * 
 * Implementation:
 * - Retrieve messages from global message store
 * - Format as structured markdown with headers and sections
 * - Handle filename validation and auto-extension
 * - Provide clear feedback on export status and location
 * 
 * Usage:
 * - /export filename - Export to filename.md
 * - /export path/filename.md - Export to specific path with extension
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getMessagesForWorld, getMessageCount, StoredMessage } from '../message-store';
import { SenderType } from '../../src/types';
import { displayUnifiedMessage, displayError, displaySuccess } from '../ui/unified-display';
import { colors } from '../ui/colors';

/**
 * Export command implementation
 */
export async function exportCommand(args: string[], worldName: string): Promise<void> {
  if (args.length === 0) {
    displayUnifiedMessage({
      content: 'Usage: /export <filename>\nExample: /export my-conversation',
      type: 'help'
    });
    return;
  }

  const filename = args[0];
  const messageCount = getMessageCount(worldName);

  if (messageCount === 0) {
    displayUnifiedMessage({
      content: 'No messages to export for this world.',
      type: 'status'
    });
    return;
  }

  try {
    const exportPath = await exportConversation(worldName, filename);
    displaySuccess(`Exported ${messageCount} messages to: ${exportPath}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    displayError(`Export failed: ${errorMessage}`);
  }
}

/**
 * Export conversation to markdown file
 */
export async function exportConversation(worldName: string, filename: string): Promise<string> {
  // Validate and prepare filename
  const sanitizedFilename = sanitizeFilename(filename);
  const fullFilename = sanitizedFilename.endsWith('.md') ? sanitizedFilename : `${sanitizedFilename}.md`;
  const exportPath = path.resolve(process.cwd(), fullFilename);

  // Get all messages for the world
  const messages = getMessagesForWorld(worldName);

  if (messages.length === 0) {
    throw new Error('No messages found to export');
  }

  // Generate markdown content
  const markdownContent = formatMessagesAsMarkdown(messages, worldName);

  // Write to file
  try {
    await fs.writeFile(exportPath, markdownContent, 'utf8');
    return exportPath;
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      switch (error.code) {
        case 'ENOENT':
          throw new Error('Export directory does not exist');
        case 'EACCES':
          throw new Error('Permission denied - cannot write to export location');
        case 'ENOSPC':
          throw new Error('Insufficient disk space for export');
        default:
          throw new Error(`File system error: ${error.message}`);
      }
    }
    throw error;
  }
}

/**
 * Format messages as structured markdown
 */
function formatMessagesAsMarkdown(messages: StoredMessage[], worldName: string): string {
  const exportTimestamp = new Date().toLocaleString();
  const messageCount = messages.length;

  // Calculate statistics
  const stats = calculateMessageStats(messages);

  let markdown = `# Agent World Conversation Export

**World:** ${worldName}  
**Exported:** ${exportTimestamp}  
**Total Messages:** ${messageCount}

## Statistics

- **Human Messages:** ${stats.humanCount}
- **Agent Messages:** ${stats.agentCount}
- **System Messages:** ${stats.systemCount}
- **Conversation Duration:** ${formatDuration(stats.startTime, stats.endTime)}
- **Active Agents:** ${stats.activeAgents.join(', ') || 'None'}

---

## Conversation History

`;

  // Sort messages by timestamp
  const sortedMessages = [...messages].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Format each message
  for (const message of sortedMessages) {
    const timestamp = message.timestamp.toLocaleString();
    const senderType = getSenderTypeLabel(message.senderType);
    const senderName = message.sender === 'HUMAN' ? 'you' : message.sender;

    markdown += `### ${timestamp} - ${senderType}: ${senderName}\n\n`;

    // Format content with proper markdown escaping
    const formattedContent = formatMessageContent(message.content);
    markdown += `${formattedContent}\n\n`;

    // Add metadata if available
    if (message.metadata) {
      const metadataItems: string[] = [];
      if (message.metadata.agentModel) {
        metadataItems.push(`Model: ${message.metadata.agentModel}`);
      }
      if (message.metadata.tokenCount) {
        metadataItems.push(`Tokens: ${message.metadata.tokenCount}`);
      }
      if (message.metadata.source) {
        metadataItems.push(`Source: ${message.metadata.source}`);
      }

      if (metadataItems.length > 0) {
        markdown += `*${metadataItems.join(' | ')}*\n\n`;
      }
    }

    markdown += '---\n\n';
  }

  markdown += `*Exported from Agent World CLI on ${exportTimestamp}*\n`;

  return markdown;
}

/**
 * Calculate conversation statistics
 */
function calculateMessageStats(messages: StoredMessage[]): {
  humanCount: number;
  agentCount: number;
  systemCount: number;
  startTime: Date;
  endTime: Date;
  activeAgents: string[];
} {
  let humanCount = 0;
  let agentCount = 0;
  let systemCount = 0;
  const agentSet = new Set<string>();

  let startTime = messages[0]?.timestamp || new Date();
  let endTime = messages[0]?.timestamp || new Date();

  for (const message of messages) {
    // Update time range
    if (message.timestamp < startTime) startTime = message.timestamp;
    if (message.timestamp > endTime) endTime = message.timestamp;

    // Count by sender type
    switch (message.senderType) {
      case SenderType.HUMAN:
        humanCount++;
        break;
      case SenderType.AGENT:
        agentCount++;
        agentSet.add(message.sender);
        break;
      case SenderType.WORLD:
        systemCount++;
        break;
    }
  }

  return {
    humanCount,
    agentCount,
    systemCount,
    startTime,
    endTime,
    activeAgents: Array.from(agentSet).sort()
  };
}

/**
 * Get human-readable sender type label
 */
function getSenderTypeLabel(senderType: SenderType): string {
  switch (senderType) {
    case SenderType.HUMAN:
      return 'human';
    case SenderType.AGENT:
      return 'agent';
    case SenderType.WORLD:
      return 'system';
    default:
      return 'unknown';
  }
}

/**
 * Format message content for markdown
 */
function formatMessageContent(content: string): string {
  // Escape markdown special characters but preserve intentional formatting
  let formatted = content
    .replace(/\\/g, '\\\\')    // Escape backslashes
    .replace(/\*/g, '\\*')     // Escape asterisks
    .replace(/\_/g, '\\_')     // Escape underscores
    .replace(/\`/g, '\\`')     // Escape backticks
    .replace(/\#/g, '\\#')     // Escape headers
    .replace(/\[/g, '\\[')     // Escape link brackets
    .replace(/\]/g, '\\]');    // Escape link brackets

  // Preserve line breaks and paragraphs
  formatted = formatted.replace(/\n\n+/g, '\n\n').trim();

  // If content is very long, add some formatting
  if (formatted.length > 500) {
    // Don't truncate, but add a note about length
    formatted += `\n\n*[Message length: ${formatted.length} characters]*`;
  }

  return formatted || '*[Empty message]*';
}

/**
 * Format duration between two dates
 */
function formatDuration(start: Date, end: Date): string {
  const durationMs = end.getTime() - start.getTime();
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);

  if (minutes === 0) {
    return `${seconds} seconds`;
  } else if (minutes < 60) {
    return `${minutes} minutes, ${seconds} seconds`;
  } else {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours} hours, ${remainingMinutes} minutes`;
  }
}

/**
 * Sanitize filename for filesystem compatibility
 */
function sanitizeFilename(filename: string): string {
  // Remove or replace invalid characters
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')  // Replace invalid chars with underscore
    .replace(/\s+/g, '-')           // Replace spaces with hyphens
    .replace(/\.+/g, '.')           // Normalize multiple dots
    .replace(/^\./, '_')            // Don't start with dot
    .replace(/\.$/, '_')            // Don't end with dot
    .substring(0, 100)              // Limit length
    .toLowerCase();                 // Normalize case
}
