/**
 * World Export Module - Markdown Export Functionality
 *
 * Provides comprehensive world export functionality to Markdown format including:
 * - World configuration and metadata
 * - Agent configurations, system prompts, and memory
 * - Chat sessions with complete message histories
 * - Structured formatting with proper markdown syntax
 * - Timestamp formatting and content preservation
 *
 * Features:
 * - Complete world state export including all chats
 * - Agent memory and configuration details
 * - Chat message histories with proper formatting
 * - Structured markdown with clear sections and navigation
 * - Support for both WorldChat snapshots and individual agent memories
 *
 * Implementation:
 * - Uses managers module for data access
 * - Formats dates consistently as ISO strings
 * - Preserves message content with proper escaping
 * - Organizes export by logical sections (world → agents → chats)
 *
 * Changes:
 * - 2025-08-07: Extracted from managers.ts and enhanced with chat export
 * - 2025-08-07: Added complete chat message history support
 * - 2025-08-07: Enhanced formatting and structure for better readability
 */

// Core module imports
import { createCategoryLogger } from './logger.js';
import { getWorld, listAgents, getAgent, listChats } from './managers.js';
import { type StorageAPI, createStorageWithWrappers } from './storage/storage-factory.js';

// Type imports
import type { World, Agent, Chat, AgentMessage, WorldChat } from './types.js';

// Initialize logger and storage
const logger = createCategoryLogger('export');
let storageWrappers: StorageAPI | null = null;

async function initializeModules() {
  storageWrappers = await createStorageWithWrappers();
}

const moduleInitialization = initializeModules();

/**
 * Export world configuration, agents, and chats to Markdown format
 */
export async function exportWorldToMarkdown(worldName: string): Promise<string> {
  await moduleInitialization;

  // Load world configuration
  const worldData = await getWorld(worldName);
  if (!worldData) {
    throw new Error(`World '${worldName}' not found`);
  }

  const agents = await listAgents(worldData.id);
  const chats = await listChats(worldData.id);

  let markdown = `# World Export: ${worldData.name}\n\n`;
  markdown += `**Exported on:** ${new Date().toISOString()}\n\n`;

  // World Configuration Section
  markdown += `## World Configuration\n\n`;
  markdown += `- **Name:** ${worldData.name}\n`;
  markdown += `- **ID:** ${worldData.id}\n`;
  markdown += `- **Description:** ${worldData.description || 'No description'}\n`;
  markdown += `- **Turn Limit:** ${worldData.turnLimit}\n`;
  if (worldData.chatLLMProvider) {
    markdown += `- **Chat LLM Provider:** ${worldData.chatLLMProvider}\n`;
  }
  if (worldData.chatLLMModel) {
    markdown += `- **Chat LLM Model:** ${worldData.chatLLMModel}\n`;
  }
  markdown += `- **Total Agents:** ${agents.length}\n`;
  markdown += `- **Total Chats:** ${chats.length}\n`;
  markdown += `- **Current Chat ID:** ${worldData.currentChatId || 'None'}\n`;
  markdown += `- **Created:** ${formatDate(worldData.createdAt)}\n`;
  markdown += `- **Last Updated:** ${formatDate(worldData.lastUpdated)}\n\n`;

  // Agents Section
  if (agents.length > 0) {
    markdown += `## Agents (${agents.length})\n\n`;

    for (const agentInfo of agents) {
      const fullAgent = await getAgent(worldData.id, agentInfo.id);
      if (!fullAgent) continue;

      markdown += `### ${fullAgent.name}\n\n`;
      markdown += `**Configuration:**\n`;
      markdown += `- **ID:** ${fullAgent.id}\n`;
      markdown += `- **Type:** ${fullAgent.type}\n`;
      markdown += `- **LLM Provider:** ${fullAgent.provider}\n`;
      markdown += `- **Model:** ${fullAgent.model}\n`;
      markdown += `- **Status:** ${fullAgent.status || 'active'}\n`;
      markdown += `- **Temperature:** ${fullAgent.temperature || 'default'}\n`;
      markdown += `- **Max Tokens:** ${fullAgent.maxTokens || 'default'}\n`;
      markdown += `- **LLM Calls:** ${fullAgent.llmCallCount}\n`;
      markdown += `- **Created:** ${formatDate(fullAgent.createdAt)}\n`;
      markdown += `- **Last Active:** ${formatDate(fullAgent.lastActive)}\n\n`;

      if (fullAgent.systemPrompt) {
        markdown += `**System Prompt:**\n`;
        markdown += `\`\`\`\n${fullAgent.systemPrompt}\n\`\`\`\n\n`;
      }

      if (fullAgent.memory && fullAgent.memory.length > 0) {
        markdown += `**Memory (${fullAgent.memory.length} messages):**\n\n`;

        fullAgent.memory.forEach((message, index) => {
          markdown += `${index + 1}. **${message.role}** ${message.sender ? `(${message.sender})` : ''}\n`;
          if (message.createdAt) {
            markdown += `   *${formatDate(message.createdAt)}*\n`;
          }
          if (message.chatId) {
            markdown += `   *Chat ID: ${message.chatId}*\n`;
          }
          markdown += '   ```markdown\n';
          let paddedContent = '';
          if (typeof message.content === 'string') {
            paddedContent = message.content
              .split(/(\n)/)
              .map(part => part === '\n' ? '\n' : '    ' + part)
              .join('');
          }
          markdown += `${paddedContent}\n`;
          markdown += '   ```\n\n';
        });
      } else {
        markdown += `**Memory:** No messages\n\n`;
      }

      markdown += `---\n\n`;
    }
  } else {
    markdown += `## Agents\n\nNo agents found in this world.\n\n`;
  }

  // Chats Section
  if (chats.length > 0) {
    markdown += `## Chats (${chats.length})\n\n`;

    for (const chat of chats) {
      markdown += `### ${chat.name}\n\n`;
      markdown += `**Chat Information:**\n`;
      markdown += `- **ID:** ${chat.id}\n`;
      markdown += `- **Name:** ${chat.name}\n`;
      markdown += `- **Description:** ${chat.description || 'No description'}\n`;
      markdown += `- **Message Count:** ${chat.messageCount}\n`;
      markdown += `- **Created:** ${formatDate(chat.createdAt)}\n`;
      markdown += `- **Updated:** ${formatDate(chat.updatedAt)}\n`;

      // Check if this is the current chat
      if (worldData.currentChatId === chat.id) {
        markdown += `- **Status:** Current active chat\n`;
      }
      markdown += `\n`;

      // Load chat messages from WorldChat if available
      try {
        const worldChat = await storageWrappers?.loadWorldChatFull?.(worldData.id, chat.id);
        if (worldChat && worldChat.messages && worldChat.messages.length > 0) {
          markdown += `**Messages (${worldChat.messages.length}):**\n\n`;

          // Sort messages by timestamp if available
          const sortedMessages = worldChat.messages.sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateA - dateB;
          });

          sortedMessages.forEach((message, index) => {
            markdown += `${index + 1}. **${message.role}** ${message.sender ? `(${message.sender})` : ''}\n`;
            if (message.createdAt) {
              markdown += `   *${formatDate(message.createdAt)}*\n`;
            }
            markdown += '   ```markdown\n';
            let paddedContent = '';
            if (typeof message.content === 'string') {
              paddedContent = message.content
                .split(/(\n)/)
                .map(part => part === '\n' ? '\n' : '    ' + part)
                .join('');
            }
            markdown += `${paddedContent}\n`;
            markdown += '   ```\n\n';
          });
        } else {
          // Fallback: try to gather messages from agent memories that belong to this chat
          const chatMessages: AgentMessage[] = [];
          for (const agentInfo of agents) {
            const fullAgent = await getAgent(worldData.id, agentInfo.id);
            if (fullAgent && fullAgent.memory) {
              const agentChatMessages = fullAgent.memory.filter(msg => msg.chatId === chat.id);
              chatMessages.push(...agentChatMessages);
            }
          }

          if (chatMessages.length > 0) {
            // Sort by timestamp
            const sortedMessages = chatMessages.sort((a, b) => {
              const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
              const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
              return dateA - dateB;
            });

            markdown += `**Messages (${sortedMessages.length} from agent memories):**\n\n`;

            sortedMessages.forEach((message, index) => {
              markdown += `${index + 1}. **${message.role}** ${message.sender ? `(${message.sender})` : ''}\n`;
              if (message.createdAt) {
                markdown += `   *${formatDate(message.createdAt)}*\n`;
              }
              markdown += '   ```markdown\n';
              let paddedContent = '';
              if (typeof message.content === 'string') {
                paddedContent = message.content
                  .split(/(\n)/)
                  .map(part => part === '\n' ? '\n' : '    ' + part)
                  .join('');
              }
              markdown += `${paddedContent}\n`;
              markdown += '   ```\n\n';
            });
          } else {
            markdown += `**Messages:** No messages found for this chat\n\n`;
          }
        }
      } catch (error) {
        logger.warn('Failed to load chat messages', { chatId: chat.id, error: error instanceof Error ? error.message : error });

        // Fallback: try to gather messages from agent memories that belong to this chat
        try {
          const chatMessages: AgentMessage[] = [];
          for (const agentInfo of agents) {
            const fullAgent = await getAgent(worldData.id, agentInfo.id);
            if (fullAgent && fullAgent.memory) {
              const agentChatMessages = fullAgent.memory.filter(msg => msg.chatId === chat.id);
              chatMessages.push(...agentChatMessages);
            }
          }

          if (chatMessages.length > 0) {
            // Sort by timestamp
            const sortedMessages = chatMessages.sort((a, b) => {
              const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
              const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
              return dateA - dateB;
            });

            markdown += `**Messages (${sortedMessages.length} from agent memories):**\n\n`;

            sortedMessages.forEach((message, index) => {
              markdown += `${index + 1}. **${message.role}** ${message.sender ? `(${message.sender})` : ''}\n`;
              if (message.createdAt) {
                markdown += `   *${formatDate(message.createdAt)}*\n`;
              }
              markdown += '   ```markdown\n';
              let paddedContent = '';
              if (typeof message.content === 'string') {
                paddedContent = message.content
                  .split(/(\n)/)
                  .map(part => part === '\n' ? '\n' : '    ' + part)
                  .join('');
              }
              markdown += `${paddedContent}\n`;
              markdown += '   ```\n\n';
            });
          } else {
            markdown += `**Messages:** Unable to load messages (${error instanceof Error ? error.message : 'Unknown error'})\n\n`;
          }
        } catch (fallbackError) {
          markdown += `**Messages:** Unable to load messages (${error instanceof Error ? error.message : 'Unknown error'})\n\n`;
        }
      }

      markdown += `---\n\n`;
    }
  } else {
    markdown += `## Chats\n\nNo chats found in this world.\n\n`;
  }

  // Export metadata
  markdown += `## Export Metadata\n\n`;
  markdown += `- **Export Format Version:** 1.0\n`;
  markdown += `- **Agent World Version:** ${process.env.npm_package_version || 'Unknown'}\n`;
  markdown += `- **Total Export Size:** ${markdown.length} characters\n`;
  markdown += `- **Sections:** World Configuration, Agents (${agents.length}), Chats (${chats.length})\n`;

  return markdown;
}

/**
 * Helper function to format dates consistently
 */
function formatDate(date: Date | string | undefined): string {
  if (!date) return 'Unknown';

  try {
    if (date instanceof Date) {
      return date.toISOString();
    } else if (typeof date === 'string') {
      return new Date(date).toISOString();
    }
    return 'Invalid date';
  } catch (error) {
    return 'Invalid date';
  }
}
