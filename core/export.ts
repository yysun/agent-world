/**
 * World Markdown Export Functionality
 *
 * Provides comprehensive world export functionality to Markdown format including:
 * - World configuration and metadata
 * - Agent configurations and system prompts (memory excluded)
 * - Chat sessions with complete message histories
 * - World events in chronological order with CLI-style formatting
 * - Improved message labeling for better readability
 * - In-memory message detection (messages received without reply)
 * - Timestamp formatting and content preservation
 * - Message deduplication using messageId (consistent with frontend)
 *
 * Features:
 * - Complete world export with only the current chat
 * - Agent configuration details (without memory)
 * - Current chat message history with improved formatting:
 *   - Human messages: "From: HUMAN / To: agent1, agent2"
 *   - Agent incoming: "Agent: agentName (incoming from sender)"
 *   - Agent reply: "Agent: agentName (reply to targetName)"
 *   - In-memory detection: "[in-memory, no reply]" for received messages without response
 * - Chat events section for current chat only with chronological order:
 *   - Message events: ● [message] sender: content preview
 *   - SSE events: ● [sse] agent: type content (shows streaming chunks)
 *   - World events: ● [world] agent: activity pending=N (activity tracking)
 *   - Tool events: ● [tool] agent type (tool execution)
 *   - System events: ● [system] content preview
 *   - Timestamp shown as HH:MM:SS for readability
 * - Structured markdown with clear sections and navigation
 * - Uses getMemory() for efficient message retrieval
 * - O(n) messageId-based deduplication (replaces O(n²) content-based approach)
 * - Tool call detection and summarization
 *
 * Message Format Examples:
 * ```
 * From: HUMAN
 * To: a1
 * Time: 2025-10-25T21:24:51.218Z
 * hi
 *
 * Agent: o1 (incoming from HUMAN)
 * Time: 2025-10-25T21:24:57.105Z
 * [2 tool calls: function1, function2]
 *
 * Agent: o1 (reply to human)
 * Time: 2025-10-25T21:24:57.105Z
 * [2 tool calls: function1, function2]
 *
 * Agent: a1 (incoming from o1) [in-memory, no reply]
 * Time: 2025-10-25T21:24:58.395Z
 * Hi — how can I help you today?
 * ```
 *
 * Event Format Examples:
 * ```
 * 1. `10:00:00` ● [message] human: Test message content
 * 2. `10:01:00` ● [sse] Test Agent: start
 * 3. `10:01:01` ● [sse] Test Agent: chunk Hello world
 * 4. `10:01:02` ● [sse] Test Agent: end
 * 5. `10:02:00` ● [world] a1: response-start pending=1
 * 6. `10:03:00` ● [world] a1: response-end pending=0
 * 7. `10:04:00` ● [tool] Test Agent tool-start
 * 8. `10:05:00` ● [system] chat-title-updated
 * ```
 *
 * Implementation:
 * - Uses managers module for data access
 * - Formats dates consistently as ISO strings
 * - Preserves message content with proper escaping
 * - Organizes export by logical sections (world → agents → current chat → events)
 * - Simplified chat loading using world.chats.get() and getMemory()
 * - Maps agentId to agent names for clear identification
 * - Deduplicates user messages by messageId using Map for O(1) lookup
 * - Detects in-memory messages by checking for subsequent assistant replies
 * - Events displayed in chronological order for current chat only
 * - Limits event display to 100 events with overflow indication
 * - Event format: time ● [type] agent: event-name content
 *
 * Deduplication Strategy:
 * - Only user messages with messageId are deduplicated
 * - Uses exact messageId matching (no fuzzy content comparison)
 * - Agent messages remain separate (one per agent)
 * - Tracks which agents received each message via agentIds/agentNames arrays
 * - Consistent with frontend deduplication logic for predictable behavior
 *
  * Changes:
 * - 2025-11-01: Fixed export to show events for current chat only (not all chats)
 * - 2025-11-01: Reformatted events to show: time ● [type] agent: event-name content
 * - 2025-11-01: SSE chunk events now properly display content in export
 * - 2025-11-01: Fixed null chatId bug - all events now default to world.currentChatId during persistence
 */

// Core module imports
import { createCategoryLogger } from './logger.js';
import { getWorld, listAgents, getAgent, getMemory } from './managers.js';
import { type StorageAPI, createStorageWithWrappers } from './storage/storage-factory.js';

// Type imports
import type { World, Agent, Chat, AgentMessage, WorldChat } from './types.js';

// Initialize logger and storage
const logger = createCategoryLogger('core.export');
let storageWrappers: StorageAPI | null = null;

async function initializeModules() {
  // Skip storage initialization in test environment to prevent SQLite errors
  // Tests use mocked storage from vitest-setup.ts
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  storageWrappers = await createStorageWithWrappers();
}

const moduleInitialization = initializeModules();

async function buildAgentMap(worldId: string, agentSummaries?: Agent[]): Promise<Map<string, Agent>> {
  const summaries = agentSummaries ?? await listAgents(worldId);
  const agentsMap = new Map<string, Agent>();
  for (const agentInfo of summaries) {
    const fullAgent = await getAgent(worldId, agentInfo.id);
    if (fullAgent) {
      agentsMap.set(fullAgent.id, fullAgent);
    }
  }
  return agentsMap;
}

function formatSenderLabel(message: AgentMessage, agentsMap: Map<string, Agent>): string | undefined {
  const raw = message.sender;
  const agent = message.agentId ? agentsMap.get(message.agentId) : null;
  const agentName = agent ? agent.name : message.agentId;

  if (message.role === 'user' || message.role === 'assistant') {
    if (raw) {
      const senderLabel = raw.toLowerCase() === 'human' ? 'HUMAN' : raw;
      return agentName ? `${senderLabel} → ${agentName}` : senderLabel;
    }
    return agentName || undefined;
  }

  if (raw) {
    return raw.toLowerCase() === 'human' ? 'HUMAN' : raw;
  }
  return undefined;
}

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
  const agentsMap = await buildAgentMap(worldData.id, agents);

  // Get the current chat directly from the world, if any
  const currentChat = worldData.currentChatId ? worldData.chats.get(worldData.currentChatId) : null;
  const hasCurrentChat = currentChat !== null;

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
  markdown += `- **Total Chats:** ${worldData.chats.size}\n`;
  markdown += `- **Current Chat:** ${currentChat ? currentChat.name : 'None'}\n`;

  // Agents Section
  if (agents.length > 0) {
    markdown += `## Agents (${agents.length})\n\n`;

    for (const agentInfo of agents) {
      const fullAgent = await getAgent(worldData.id, agentInfo.id);
      if (!fullAgent) continue;

      markdown += `### ${fullAgent.name}\n\n`;
      markdown += `**Configuration:**\n`;
      markdown += `- **ID:** ${fullAgent.id}\n`;
      markdown += `- **LLM Provider:** ${fullAgent.provider}\n`;
      markdown += `- **Model:** ${fullAgent.model}\n`;
      markdown += `- **Temperature:** ${fullAgent.temperature || 'default'}\n`;
      markdown += `- **Max Tokens:** ${fullAgent.maxTokens || 'default'}\n`;
      markdown += `- **LLM Calls:** ${fullAgent.llmCallCount}\n`;

      if (fullAgent.systemPrompt) {
        markdown += `- **System Prompt:**\n`;
        markdown += `\`\`\`\n${fullAgent.systemPrompt}\n\`\`\`\n\n`;
      }

      // Memory intentionally excluded from agent export

      markdown += `---\n\n`;
    }
  } else {
    markdown += `## Agents\n\nNo agents found in this world.\n\n`;
  }

  // Current Chat Section
  if (hasCurrentChat && currentChat) {
    markdown += `## Current Chat - ${currentChat.name}\n\n`;

    // Get chat messages using getMemory
    try {
      const chatMessages = await getMemory(worldData.id, currentChat.id);
      if (chatMessages && chatMessages.length > 0) {
        markdown += `**Messages (${chatMessages.length}):**\n\n`;

        // Sort messages by timestamp if available
        const sortedMessages = chatMessages.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateA - dateB;
        });

        // Deduplicate messages using messageId (consistent with frontend approach)
        // Uses O(n) Map-based lookup instead of O(n²) content comparison
        type ConsolidatedMessage = AgentMessage & { agentIds?: string[], agentNames?: string[] };
        const messageMap = new Map<string, ConsolidatedMessage>();
        const messagesWithoutId: ConsolidatedMessage[] = [];

        for (const message of sortedMessages) {
          // Only deduplicate user messages with messageId (same as frontend)
          const isUserMessage = message.role === 'user';

          if (isUserMessage && message.messageId) {
            const existing = messageMap.get(message.messageId);
            if (existing) {
              // Merge agent information for duplicate message
              if (message.agentId) {
                if (!existing.agentIds) {
                  existing.agentIds = existing.agentId ? [existing.agentId] : [];
                }
                if (!existing.agentIds.includes(message.agentId)) {
                  existing.agentIds.push(message.agentId);
                }
                // Collect agent names for display
                const agent = agentsMap.get(message.agentId);
                if (agent) {
                  if (!existing.agentNames) {
                    existing.agentNames = [];
                    // Add original agent's name if exists
                    if (existing.agentId) {
                      const originalAgent = agentsMap.get(existing.agentId);
                      if (originalAgent && !existing.agentNames.includes(originalAgent.name)) {
                        existing.agentNames.push(originalAgent.name);
                      }
                    }
                  }
                  if (!existing.agentNames.includes(agent.name)) {
                    existing.agentNames.push(agent.name);
                  }
                }
              }
            } else {
              // First occurrence - add to map
              messageMap.set(message.messageId, {
                ...message,
                agentIds: message.agentId ? [message.agentId] : undefined,
                agentNames: message.agentId && agentsMap.get(message.agentId)
                  ? [agentsMap.get(message.agentId)!.name]
                  : undefined
              });
            }
          } else {
            // Keep all agent messages and messages without messageId separate
            messagesWithoutId.push({
              ...message,
              agentIds: message.agentId ? [message.agentId] : undefined,
              agentNames: message.agentId && agentsMap.get(message.agentId)
                ? [agentsMap.get(message.agentId)!.name]
                : undefined
            });
          }
        }

        // Combine deduplicated user messages with all other messages
        // Maintain chronological order with logical flow: replies before incoming messages
        const consolidatedMessages = [...Array.from(messageMap.values()), ...messagesWithoutId]
          .sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

            // Primary sort: by timestamp
            if (dateA !== dateB) {
              return dateA - dateB;
            }

            // Secondary sort: when timestamps are equal, assistant (reply) comes before user (incoming)
            // This ensures logical flow: agent replies first, then that reply is saved to other agents' memories
            const roleOrderA = a.role === 'assistant' ? 0 : a.role === 'user' ? 1 : 2;
            const roleOrderB = b.role === 'assistant' ? 0 : b.role === 'user' ? 1 : 2;
            return roleOrderA - roleOrderB;
          });

        // Format consolidated messages with improved labeling
        consolidatedMessages.forEach((message, index) => {
          // Determine if this is a user message or agent message
          const isUserMessage = message.role === 'user';
          const isAssistantMessage = message.role === 'assistant';

          // Special case: user messages with replyToMessageId are actually replies from agents
          // This happens in multi-agent scenarios where agent responses are stored as 'user' messages
          // in the receiving agent's memory but have threading information
          const isReplyMessage = isUserMessage && message.replyToMessageId;

          // Get sender information
          const rawSender = message.sender?.toLowerCase() === 'human' ? 'HUMAN' : message.sender;

          // Get agent/recipient information
          // For user messages: show only FIRST agent (intended recipient), not all who received it
          let agentNamesStr: string | undefined;
          if (message.agentNames && message.agentNames.length > 0) {
            // Show only first agent for user messages (the intended recipient)
            agentNamesStr = isUserMessage ? message.agentNames[0] : message.agentNames.join(', ');
          } else if (message.agentIds && message.agentIds.length > 0) {
            agentNamesStr = isUserMessage ? message.agentIds[0] : message.agentIds.join(', ');
          } else if (message.agentId) {
            const agent = agentsMap.get(message.agentId);
            agentNamesStr = agent ? agent.name : message.agentId;
          }

          // Build label based on message type
          let label: string;
          let messageType: string = '';

          if (isUserMessage && !isReplyMessage) {
            // User messages show who sent and who received
            if (rawSender) {
              if (rawSender === 'HUMAN') {
                label = `From: ${rawSender}`;
                // Frontend shows no \"To:\" line - just \"From: HUMAN\"
              } else {
                // Agent sent to another agent (non-reply user message)
                // This should be rare - most cross-agent messages should have replyToMessageId
                label = `Agent: ${agentNamesStr || 'Unknown'} (message from ${rawSender})`;
              }
            } else {
              label = agentNamesStr ? `Agent: ${agentNamesStr} (message)` : 'Unknown sender';
            }
          } else if (isAssistantMessage || isReplyMessage) {
            // Assistant messages OR user messages with replyToMessageId are both replies
            // Look up the reply target from replyToMessageId
            let replyTarget: string | null = null;
            if (message.replyToMessageId) {
              const parentMessage = consolidatedMessages.find(m => m.messageId === message.replyToMessageId);
              if (parentMessage) {
                const parentSender = parentMessage.sender?.toLowerCase() === 'human' ? 'human' : parentMessage.sender;
                replyTarget = parentSender || null;
              }
            }

            if (isReplyMessage && rawSender && rawSender !== 'HUMAN') {
              // Cross-agent reply: user message with replyToMessageId from another agent
              // Look up the agent name for the sender
              const senderAgent = agents.find(a => a.id === rawSender);
              const senderName = senderAgent ? senderAgent.name : rawSender;
              label = replyTarget
                ? `Agent: ${senderName} (reply to ${replyTarget})`
                : `Agent: ${senderName} (reply)`;
            } else if (isAssistantMessage) {
              // Regular assistant message - use agentNamesStr
              if (agentNamesStr) {
                label = replyTarget
                  ? `Agent: ${agentNamesStr} (reply to ${replyTarget})`
                  : `Agent: ${agentNamesStr} (reply)`;
              } else {
                label = replyTarget
                  ? `Unknown agent (reply to ${replyTarget})`
                  : 'Unknown agent (reply)';
              }
            } else {
              // isReplyMessage but from HUMAN - shouldn't happen but handle gracefully
              label = replyTarget
                ? `From: HUMAN (reply to ${replyTarget})`
                : `From: HUMAN (reply)`;
            }
          } else if (message.role === 'tool') {
            // Tool result messages
            label = agentNamesStr ? `Agent: ${agentNamesStr} (tool result)` : 'Tool result';
          } else {
            // System or other messages
            label = rawSender || message.role.toUpperCase();
          }

          let hasToolCalls = false;

          // Check for tool_calls field first (proper AI SDK format)
          if (message.tool_calls && message.tool_calls.length > 0) {
            const toolNames = message.tool_calls
              .map(tc => tc.function?.name || '')
              .filter(name => name !== '');

            if (toolNames.length > 0) {
              markdown += `${index + 1}. **${label}**:\n    \`\`\`\n    [${toolNames.length} tool call${toolNames.length > 1 ? 's' : ''}: ${toolNames.join(', ')}]\n    \`\`\`\n\n`;
            } else {
              markdown += `${index + 1}. **${label}**:\n    \`\`\`\n    [${message.tool_calls.length} tool call${message.tool_calls.length > 1 ? 's' : ''}]\n    \`\`\`\n\n`;
            }
            hasToolCalls = true;
          }
          // Handle tool role messages (tool results)
          else if (message.role === 'tool') {
            const toolCallId = (message as any).tool_call_id || 'unknown';
            markdown += `${index + 1}. **${label}**:\n    \`\`\`\n    [Tool result for: ${toolCallId}]\n    \`\`\`\n\n`;
            hasToolCalls = true;
          }
          // Fallback: check content string for tool call JSON objects
          else if (typeof message.content === 'string') {
            // Simple heuristic: if content is mostly JSON objects (starts with { and has multiple lines of {})
            const lines = message.content.trim().split('\n');
            const jsonLines = lines.filter(line => line.trim().startsWith('{') && line.trim().endsWith('}'));

            if (jsonLines.length > 0 && jsonLines.length === lines.length) {
              // All lines are JSON objects - likely tool calls
              const validToolCalls = jsonLines.filter(line => {
                try {
                  const parsed = JSON.parse(line.trim());
                  return parsed.hasOwnProperty('name') || parsed.hasOwnProperty('parameters') ||
                    parsed.hasOwnProperty('arguments') || parsed.hasOwnProperty('function');
                } catch {
                  return false;
                }
              });

              if (validToolCalls.length > 0) {
                const toolNames = validToolCalls
                  .map(line => {
                    try {
                      const parsed = JSON.parse(line.trim());
                      return parsed.function?.name || parsed.name || '';
                    } catch {
                      return '';
                    }
                  })
                  .filter(name => name !== '');

                if (toolNames.length > 0) {
                  markdown += `${index + 1}. **${label}**:\n    \`\`\`\n    [${toolNames.length} tool call${toolNames.length > 1 ? 's' : ''}: ${toolNames.join(', ')}]\n    \`\`\`\n\n`;
                } else {
                  // Tool calls exist but names are empty - show count
                  markdown += `${index + 1}. **${label}**:\n    \`\`\`\n    [${validToolCalls.length} tool call${validToolCalls.length > 1 ? 's' : ''}]\n    \`\`\`\n\n`;
                }
                hasToolCalls = true;
              }
            }
          }

          // Show regular content with proper markdown code block formatting
          if (!hasToolCalls && typeof message.content === 'string' && message.content.trim()) {
            // Preserve original content with newlines intact and escape any backticks
            let formattedContent = message.content.trim();

            // Convert literal \n to actual newlines for better readability
            formattedContent = formattedContent.replace(/\\n/g, '\n');

            // Escape any existing backticks in the content to prevent breaking code blocks
            formattedContent = formattedContent.replace(/```/g, '\\`\\`\\`');

            // Indent each line properly within the code block to maintain markdown structure
            const indentedContent = formattedContent
              .split('\n')
              .map(line => `    ${line}`)
              .join('\n');

            markdown += `${index + 1}. **${label}**:\n    \`\`\`\n${indentedContent}\n    \`\`\`\n\n`;
          } else if (hasToolCalls && typeof message.content === 'string' && message.content.trim() && message.role === 'tool') {
            // For tool messages with content, show truncated content in code block
            const truncatedContent = message.content.substring(0, 200);
            const suffix = message.content.length > 200 ? '...' : '';
            let toolContent = (truncatedContent + suffix).trim();

            // Convert literal \n to actual newlines and escape backticks
            toolContent = toolContent.replace(/\\n/g, '\n').replace(/```/g, '\\`\\`\\`');

            // Indent each line properly within the code block
            const indentedToolContent = toolContent
              .split('\n')
              .map(line => `    ${line}`)
              .join('\n');

            markdown += `    \`\`\`\n${indentedToolContent}\n    \`\`\`\n\n`;
          }
        });

        const userMessageCount = sortedMessages.filter(m => m.role === 'user').length;
        const deduplicatedUserCount = Array.from(messageMap.values()).length;
        markdown += `*Note: ${sortedMessages.length} total messages (${userMessageCount} user, ${sortedMessages.length - userMessageCount} agent/system), `;
        markdown += `${consolidatedMessages.length} after deduplication (${deduplicatedUserCount} unique user messages)*\n\n`;
      } else {
        markdown += `**Messages:** No messages found for this chat\n\n`;
      }
    } catch (error) {
      logger.error('Failed to load chat messages', { chatId: currentChat.id, error: error instanceof Error ? error.message : error });
      markdown += `**Messages:** Unable to load messages (${error instanceof Error ? error.message : 'Unknown error'})\n\n`;
    }

    markdown += `---\n\n`;
  } else {
    markdown += `## Current Chat\n\nNo current chat found in this world.\n\n`;
  }

  // World Events Section
  if (worldData.eventStorage && currentChat) {
    try {
      // Get events for current chat in chronological order
      const allEvents = await worldData.eventStorage.getEventsByWorldAndChat(
        worldData.id,
        currentChat.id,
        { order: 'asc', limit: 1000 }
      );

      if (allEvents.length > 0) {
        markdown += `## Chat Events (${allEvents.length})\n\n`;

        const eventTypes = Array.from(new Set(allEvents.map((e: any) => e.type)));
        markdown += `**Event Types:** ${eventTypes.join(', ')}\n\n`;

        // Display events in chronological order (already sorted by query)
        // Limit to 100 events to avoid overly large exports
        const displayLimit = 100;
        const eventsToDisplay = allEvents.slice(0, displayLimit);

        eventsToDisplay.forEach((event: any, index: number) => {
          const timestamp = event.createdAt instanceof Date
            ? event.createdAt.toISOString()
            : new Date(event.createdAt).toISOString();

          // Format events similar to CLI: ● sender: content
          let displayLine = '';

          if (event.type === 'message' && event.payload) {
            const sender = event.payload.sender || 'agent';
            const content = typeof event.payload.content === 'string'
              ? event.payload.content.substring(0, 200)
              : JSON.stringify(event.payload.content).substring(0, 200);
            displayLine = `● [message] ${sender}: ${content}${content.length >= 200 ? '...' : ''}`;
          } else if (event.type === 'sse' && event.payload) {
            const agentName = event.payload.agentName || 'agent';
            const sseType = event.payload.type || 'unknown';
            const content = event.payload.content
              ? (typeof event.payload.content === 'string' ? event.payload.content.substring(0, 200) : '')
              : '';
            displayLine = content
              ? `● [sse] ${agentName}: ${sseType} ${content}${content.length >= 200 ? '...' : ''}`
              : `● [sse] ${agentName}: ${sseType}`;
          } else if (event.type === 'world' && event.payload) {
            // World activity event (response-start, response-end, idle)
            const activityType = event.payload.activityType || event.payload.type || 'unknown';
            const source = event.payload.source || 'world';
            // Remove 'agent:' prefix if present
            const displaySource = source.startsWith('agent:') ? source.substring(6) : source;
            displayLine = `● [world] ${displaySource}: ${activityType} pending=${event.payload.pendingOperations || 0}`;
          } else if (event.type === 'tool' && event.payload) {
            // Tool execution event
            const agentName = event.payload.agentName || 'agent';
            const toolType = event.payload.type || 'unknown';
            displayLine = `● [tool] ${agentName} ${toolType}`;
          } else if (event.type === 'system' && event.payload) {
            const content = typeof event.payload === 'string'
              ? event.payload.substring(0, 200)
              : JSON.stringify(event.payload).substring(0, 200);
            displayLine = `● [system] ${content}${content.length >= 200 ? '...' : ''}`;
          } else {
            displayLine = `● [${event.type}]: ${JSON.stringify(event.payload).substring(0, 200)}`;
          }

          markdown += `${index + 1}. \`${timestamp.substring(11, 19)}\` ${displayLine}\n`;
        });

        if (allEvents.length > displayLimit) {
          markdown += `\n*... and ${allEvents.length - displayLimit} more events (showing first ${displayLimit})*\n`;
        }

        markdown += `\n`;
      } else {
        markdown += `## Chat Events\n\nNo events recorded for this chat.\n\n`;
      }
    } catch (error) {
      logger.error('Failed to load chat events', { worldId: worldData.id, chatId: currentChat?.id, error: error instanceof Error ? error.message : error });
      markdown += `## Chat Events\n\nUnable to load events (${error instanceof Error ? error.message : 'Unknown error'})\n\n`;
    }
  } else {
    markdown += `## Chat Events\n\n${currentChat ? 'Event storage not configured for this world.' : 'No current chat to display events for.'}\n\n`;
  }

  // Export metadata
  markdown += `## Export Metadata\n\n`;
  markdown += `- **Export Format Version:** 1.1\n`;
  markdown += `- **Agent World Version:** ${process.env.npm_package_version || 'Unknown'}\n`;
  markdown += `- **Total Export Size:** ${markdown.length} characters\n`;

  // Count events if available
  let eventCount = 0;
  if (worldData.eventStorage) {
    try {
      const events = await worldData.eventStorage.getEventsByWorldAndChat(worldData.id, null, { limit: 10000 });
      eventCount = events.length;
    } catch {
      // Ignore errors in metadata generation
    }
  }

  markdown += `- **Sections:** World Configuration, Agents (${agents.length}), Current Chat (${hasCurrentChat ? 1 : 0}), Events (${eventCount})\n`;

  return markdown;
}

export async function exportChatToMarkdown(worldId: string, chatId: string): Promise<string> {
  await moduleInitialization;

  const worldData = await getWorld(worldId);
  if (!worldData) {
    throw new Error(`World '${worldId}' not found`);
  }

  const chat = worldData.chats.get(chatId);
  if (!chat) {
    throw new Error(`Chat '${chatId}' not found in world '${worldData.name}'`);
  }

  const agentsMap = await buildAgentMap(worldData.id);
  const chatMessages = await getMemory(worldData.id, chatId);
  const messages = Array.isArray(chatMessages) ? [...chatMessages] : [];

  const createdAt = chat.createdAt instanceof Date ? chat.createdAt : new Date(chat.createdAt);
  const updatedAt = chat.updatedAt instanceof Date ? chat.updatedAt : new Date(chat.updatedAt);

  let markdown = `# Chat Export: ${chat.name}\n\n`;
  markdown += `**World:** ${worldData.name} (${worldData.id})\n`;
  markdown += `**Chat ID:** ${chat.id}\n`;
  markdown += `**Created:** ${createdAt.toISOString()}\n`;
  markdown += `**Updated:** ${updatedAt.toISOString()}\n`;
  markdown += `**Recorded Messages:** ${chat.messageCount}\n`;
  markdown += `**Exported Messages:** ${messages.length}\n`;
  if (chat.description) {
    markdown += `**Description:** ${chat.description}\n`;
  }
  markdown += `\n`;

  if (messages.length === 0) {
    markdown += '## Messages\n\nNo messages found for this chat.\n';
    return markdown;
  }

  const sortedMessages = messages.sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateA - dateB;
  });

  markdown += `## Messages (${sortedMessages.length})\n\n`;

  sortedMessages.forEach((message, index) => {
    const senderLabel = formatSenderLabel(message, agentsMap) || message.role.toUpperCase();
    const timestamp = message.createdAt ? new Date(message.createdAt).toISOString() : 'Unknown';
    const agentName = message.agentId ? agentsMap.get(message.agentId)?.name || message.agentId : undefined;

    markdown += `### ${index + 1}. ${senderLabel}\n`;
    markdown += `- **Role:** ${message.role}\n`;
    markdown += `- **Timestamp:** ${timestamp}\n`;
    if (agentName) {
      markdown += `- **Agent:** ${agentName}\n`;
    }
    if (message.chatId && message.chatId !== chatId) {
      markdown += `- **Chat ID:** ${message.chatId}\n`;
    }
    markdown += `\n${message.content}\n\n`;
  });

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
