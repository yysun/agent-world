/**
 * World Chat Component - Real-time chat interface with agent message filtering
 *
 * Features:
 * - Real-time message streaming with agent selection filtering
 * - Cross-agent message detection and system message display
 * - Memory-only message styling (agent messages saved to other agents' memory)
 * - User input handling with send functionality and loading states
 * - Message editing with frontend-driven DELETE → POST flow
 * - Message deletion with confirmation dialog (deletes message and all after it)
 * - Message deduplication by messageId for multi-agent scenarios
 * - Displays only the first/intended recipient agent, not all who received it
 * - Agent activity display for world events (response-start, tool-start)
 * - Tool result message filtering (hides internal tool result protocol messages)
 * - Detailed tool call display: "Calling tool: shell_cmd (command: x, params: y)" format
 * - Detailed tool result display: "Tool result: shell_cmd (command: x, params: y)" format
 * - Left-side avatar rendering for message boxes using actual agent spriteIndex values
 * - Human messages keep an empty avatar slot (no sprite image)
 * - Activity indicators: ActivityPulse and ElapsedTimeCounter in chat header
 * - Tool execution status: ToolExecutionStatus showing active tools with icons
 * - Collapsible tool output: Expand/collapse tool results with stdout/stderr styling
 * - Tool output truncation: 50K character limit with truncation warning
 * - Role-based message styling: Distinct left border colors for visual hierarchy
 * - AppRun JSX with props-based state management
 *
 * Changes:
 * - 2026-02-11: Phase 6 - Added role-based left border colors (human=light blue, agent=sky blue, tool=amber, system=gray, cross-agent=purple)
 * - 2026-02-11: Phase 6 - Applied .tool-message class to tool result messages
 * - 2026-02-11: Phase 5 - Added collapsible tool output with expand/collapse
 * - 2026-02-11: Phase 5 - Added 50K character truncation for long tool outputs
 * - 2026-02-11: Phase 5 - Distinguished stdout (terminal style) vs stderr (red-tinted)
 * - 2026-02-11: Phase 5 - Tool messages now visible (no longer hidden by shouldHideMessage)
 * - 2026-02-11: Phase 4 - Added ToolExecutionStatus showing running tools with icons
 * - 2026-02-11: Phase 3 - Added ActivityPulse and ElapsedTimeCounter to chat header
 * - 2026-02-11: Integrated isBusy and elapsedMs props from World.tsx state
 * - 2026-02-08: Removed legacy manual tool-intervention request and response box rendering
 * - 2026-02-08: Fixed undefined HUMAN_AVATAR_SPRITE_INDEX runtime error in avatar sprite resolver
 * - 2026-02-08: Left human message avatars empty while preserving avatar alignment slot
 * - 2026-02-08: Mapped message avatars to world agents' assigned spriteIndex values
 * - 2026-02-08: Added left-side avatars for world chat message boxes
 * - 2025-11-11: Fixed tool call display to prioritize tool_calls data over pre-saved text (upgrades old messages)
 * - 2025-11-11: Updated tool call/result display to show full argument details without truncation
 * - 2025-11-11: Enhanced tool call request preview to show tool name and arguments
 * - 2025-11-11: Enhanced tool result preview to show tool name and arguments instead of just tool_call_id
 * - 2025-11-03: Display agent activities (response-start, tool-start) instead of waiting dots
 * - 2025-10-27: Fixed message labeling to match export format - consistent reply detection
 * - 2025-10-27: Removed confusing '[in-memory, no reply]' labels from display
 * - 2025-10-26: Fixed agent filter to check sender first (whose memory) for in-memory messages
 * - 2025-10-26: Fixed cross-agent message display - sender=recipient, fromAgentId=original author
 * - 2025-10-26: Fixed 'To: unknown' bug - empty seenByAgents handled gracefully
 * - 2025-10-26: Added comment explaining empty seenByAgents will be populated by duplicates
 * - 2025-10-26: Added message delete button with confirmation dialog
 * - 2025-10-25: Added memory-only message styling with gray left border for agent→agent messages
 * - 2025-10-25: Added delivery status badge showing seenByAgents (📨 o1, a1, o3)
 * - 2025-10-25: Edit button disabled until messageId confirmed from backend
 * - 2025-10-21: Integrated message edit functionality with remove-and-resubmit flow
 */

import { app, safeHTML } from 'apprun';
import type { WorldChatProps, Message } from '../types';
import toKebabCase from '../utils/toKebabCase';
import { SenderType, getSenderType } from '../utils/sender-type.js';
import { renderMarkdown } from '../utils/markdown';
import { ActivityPulse, ElapsedTimeCounter, ThinkingIndicator } from './activity-indicators';
import { ToolExecutionStatus } from './tool-execution-status';

const debug = false;
const SYSTEM_AVATAR_SPRITE_INDEX = 4;

export default function WorldChat(props: WorldChatProps) {
  const {
    worldName,
    messages = [], // Default to empty array if undefined
    rawMessages = [], // Raw messages before deduplication for filtering
    userInput = '', // Default to empty string if undefined
    messagesLoading,
    isSending,
    isWaiting,
    needScroll = false,
    activeAgent,
    agents = [],
    currentChat,
    editingMessageId = null,
    editingText = '',
    agentFilters = [],  // Agent IDs to filter by
    isBusy = false,
    elapsedMs = 0,
    activeTools = []
  } = props;

  const promptReady = !isWaiting;
  const promptIndicator = promptReady ? '>' : '…';
  const inputPlaceholder = promptReady ? 'Type your message...' : 'Waiting for agents...';
  const inputDisabled = isSending || isWaiting;
  const disableSend = !userInput.trim() || isSending || isWaiting;
  const agentSpriteByName = new Map<string, number>();
  const agentSpriteById = new Map<string, number>();

  for (const agent of agents) {
    const normalizedName = toKebabCase(agent.name);
    const normalizedId = toKebabCase(agent.id);
    agentSpriteByName.set(normalizedName, agent.spriteIndex);
    agentSpriteById.set(normalizedId, agent.spriteIndex);
  }

  // Helper function to determine if a message has sender/agent mismatch
  const hasSenderAgentMismatch = (message: Message): boolean => {
    const senderLower = toKebabCase(message.sender);
    const agentIdLower = toKebabCase(message.fromAgentId);
    return senderLower !== agentIdLower && !message.isStreaming;
  };

  // Helper function to resolve reply target from replyToMessageId
  const getReplyTarget = (message: Message, allMessages: Message[]): string | null => {
    if (!message.replyToMessageId) {
      return null;
    }

    const parentMessage = allMessages.find(m => m.messageId === message.replyToMessageId);
    if (!parentMessage) {
      return null;
    }

    const senderType = getSenderType(parentMessage.sender);
    const replyTarget = senderType === SenderType.HUMAN ? 'HUMAN' : parentMessage.sender;
    return replyTarget;
  };

  // Filter messages based on active agent filters
  // When filters active: use raw messages and filter by ownerAgentId, then deduplicate human messages
  // When no filters: use pre-deduplicated messages for better performance
  const filteredMessages = agentFilters.length > 0
    ? (() => {
      // First filter by agent ownership
      const agentMessages = rawMessages.filter(message => {
        // Always include human/user messages (we'll deduplicate them next)
        const senderType = getSenderType(message.sender);
        if (senderType === SenderType.HUMAN) {
          return true;
        }

        // Check if message is from a filtered agent's memory
        return message.ownerAgentId && agentFilters.includes(message.ownerAgentId);
      });

      // Deduplicate human messages while preserving all agent messages
      const messageMap = new Map<string, Message>();
      const deduplicatedMessages: Message[] = [];

      for (const message of agentMessages) {
        const senderType = getSenderType(message.sender);
        const isHumanMessage = senderType === SenderType.HUMAN;

        if (isHumanMessage && message.messageId) {
          // Deduplicate human messages by messageId
          if (!messageMap.has(message.messageId)) {
            messageMap.set(message.messageId, message);
            deduplicatedMessages.push(message);
          }
        } else {
          // Keep all agent messages
          deduplicatedMessages.push(message);
        }
      }

      return deduplicatedMessages;
    })()
    : messages;  // No filters = use pre-deduplicated messages

  // Helper function to check if message should be hidden from display.
  // Internal tool result protocol messages are not shown in the chat UI.
  // Phase 5: Tool messages are now visible with collapsible output.
  const shouldHideMessage = (message: Message): boolean => {
    try {
      const text = message.text.trim();
      const jsonText = text.startsWith('@') ? text.substring(text.indexOf(',') + 1).trim() : text;

      if (jsonText.startsWith('{') && jsonText.endsWith('}')) {
        const parsed = JSON.parse(jsonText);
        if (parsed.__type === 'tool_result' && parsed.tool_call_id) {
          return true;
        }
      }
    } catch {
      // Not valid JSON or doesn't match pattern - don't hide
    }

    return false;
  };

  // Helper function to detect and format tool calls (3-tier detection matching export logic)
  const formatMessageText = (message: Message): string => {
    // Tier 1: Check for tool_calls array FIRST (prioritize regenerating from data over using pre-saved text)
    // This allows old messages with simple "Calling tool: name" to be upgraded to detailed format
    if ((message as any).tool_calls) {
      // Parse tool_calls if it's a JSON string (from database)
      let toolCalls = (message as any).tool_calls;
      if (typeof toolCalls === 'string') {
        try {
          toolCalls = JSON.parse(toolCalls);
        } catch {
          toolCalls = [];
        }
      }

      if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        // Format tool calls with details
        const toolCallDetails = toolCalls.map((tc: any) => {
          const toolName = tc.function?.name || 'unknown';
          let toolArgs = '';
          try {
            const args = JSON.parse(tc.function?.arguments || '{}');
            const argKeys = Object.keys(args);
            if (argKeys.length > 0) {
              // Show all arguments without truncation for better visibility
              const argSummary = argKeys.map((key: string) => {
                const val = args[key];
                const strVal = typeof val === 'string' ? val : JSON.stringify(val);
                return `${key}: ${strVal}`;
              }).join(', ');
              toolArgs = ` (${argSummary})`;
            }
          } catch {
            toolArgs = '';
          }
          return `${toolName}${toolArgs}`;
        });

        if (toolCalls.length === 1) {
          return `Calling tool: ${toolCallDetails[0]}`;
        } else {
          return `Calling tools:\n${toolCallDetails.map((td, i) => `${i + 1}. ${td}`).join('\n')}`;
        }
      }
    }

    const text = message.text;

    // Tier 2: Check if this is a tool result message
    if (message.type === 'tool') {
      const toolCallId = (message as any).tool_call_id || 'unknown';

      // Find the tool call details from previous assistant messages
      let toolName = 'unknown';
      let toolArgs = '';
      const currentIndex = this.state.messages.findIndex(m => m.messageId === message.messageId);
      if (currentIndex >= 0) {
        for (let i = currentIndex - 1; i >= 0; i--) {
          const prevMsg = this.state.messages[i];
          if (prevMsg.type === 'assistant' && (prevMsg as any).tool_calls) {
            // Parse tool_calls if it's a JSON string (from database)
            let prevToolCalls = (prevMsg as any).tool_calls;
            if (typeof prevToolCalls === 'string') {
              try {
                prevToolCalls = JSON.parse(prevToolCalls);
              } catch {
                prevToolCalls = [];
              }
            }
            if (!Array.isArray(prevToolCalls)) continue;

            const toolCall = prevToolCalls.find((tc: any) => tc.id === toolCallId);
            if (toolCall) {
              toolName = toolCall.function?.name || 'unknown';
              try {
                const args = JSON.parse(toolCall.function?.arguments || '{}');
                const argKeys = Object.keys(args);
                if (argKeys.length > 0) {
                  // Show all arguments without truncation
                  const argSummary = argKeys.map((key: string) => {
                    const val = args[key];
                    const strVal = typeof val === 'string' ? val : JSON.stringify(val);
                    return `${key}: ${strVal}`;
                  }).join(', ');
                  toolArgs = ` (${argSummary})`;
                }
              } catch {
                toolArgs = '';
              }
              break;
            }
          }
        }
      }

      return `Tool result: ${toolName}${toolArgs}`;
    }

    // Tier 3: Fallback - check if message content is all JSON tool call objects
    const lines = text.trim().split('\n');
    const jsonLines = lines.filter(line => line.trim().startsWith('{') && line.trim().endsWith('}'));

    if (jsonLines.length > 0 && jsonLines.length === lines.length) {
      // All lines are JSON objects - check if they're tool calls
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
        // Extract tool names
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
          return `[${toolNames.length} tool call${toolNames.length > 1 ? 's' : ''}: ${toolNames.join(', ')}]`;
        } else {
          return `[${validToolCalls.length} tool call${validToolCalls.length > 1 ? 's' : ''}]`;
        }
      }
    }

    return text;
  };

  const getMessageRowAlignmentClass = (senderType: SenderType, isCrossAgentMessage: boolean): string => {
    if (senderType === SenderType.HUMAN || isCrossAgentMessage) {
      return 'message-row-left';
    }
    return 'message-row-right';
  };

  const getMessageAvatarSpriteIndex = (message: Message): number => {
    const senderType = getSenderType(message.sender);
    if (senderType === SenderType.HUMAN) {
      // Human messages render an empty avatar slot, so sprite index is unused.
      return SYSTEM_AVATAR_SPRITE_INDEX;
    }
    if (senderType === SenderType.SYSTEM || senderType === SenderType.WORLD) {
      return SYSTEM_AVATAR_SPRITE_INDEX;
    }

    const normalizedSender = toKebabCase(message.sender || '');
    const normalizedFromAgentId = toKebabCase(message.fromAgentId || '');

    if (agentSpriteByName.has(normalizedSender)) {
      return agentSpriteByName.get(normalizedSender)!;
    }
    if (agentSpriteById.has(normalizedSender)) {
      return agentSpriteById.get(normalizedSender)!;
    }
    if (agentSpriteById.has(normalizedFromAgentId)) {
      return agentSpriteById.get(normalizedFromAgentId)!;
    }
    if (agentSpriteByName.has(normalizedFromAgentId)) {
      return agentSpriteByName.get(normalizedFromAgentId)!;
    }

    return SYSTEM_AVATAR_SPRITE_INDEX;
  };

  // Phase 5: Helper functions for collapsible tool output

  /**
   * Check if message is a tool result message
   */
  const isToolResultMessage = (message: Message): boolean => {
    return message.type === 'tool';
  };

  /**
   * Truncate tool output if longer than 50K characters
   */
  const truncateToolOutput = (text: string): { content: string; wasTruncated: boolean } => {
    const MAX_LENGTH = 50000;
    if (text.length > MAX_LENGTH) {
      return {
        content: text.substring(0, MAX_LENGTH),
        wasTruncated: true
      };
    }
    return {
      content: text,
      wasTruncated: false
    };
  };

  /**
   * Detect if tool output is stderr based on message properties
   */
  const isStderrOutput = (message: Message): boolean => {
    return message.streamType === 'stderr';
  };

  return (
    <fieldset className="chat-fieldset">
      <legend>
        {worldName} {
          currentChat ? ` - ${currentChat}` :
            <span className="unsaved-indicator" title="Unsaved chat"> ●</span>}
        <ActivityPulse isBusy={isBusy || false} />
        {(isBusy || (elapsedMs && elapsedMs > 0)) && <ElapsedTimeCounter elapsedMs={elapsedMs || 0} />}
      </legend>
      <div className="chat-container">
        {/* Tool Execution Status */}
        <ToolExecutionStatus activeTools={activeTools} />

        {/* Conversation Area */}
        <div
          className="conversation-area"
          ref={(el, state) => {
            if (el && needScroll) {
              requestAnimationFrame(() => {
                el.scrollTop = el.scrollHeight;
                // Reset needScroll directly in state to prevent unwanted scrolls
                if (state) {
                  state.needScroll = false;
                }
              });
            }
          }}
        >
          {messagesLoading ? (
            <div className="loading-messages">Loading messages...</div>
          ) : filteredMessages.length === 0 ? (
            <div className="no-messages">No messages yet. Start a conversation!</div>
          ) : (
            filteredMessages.map((message, index) => {
              // Skip messages that should be hidden (internal tool result messages)
              if (shouldHideMessage(message)) {
                return null;
              }

              // Render log events (server logs)
              if (message.logEvent) {
                const isExpanded = !!message.isLogExpanded;
                let formattedArgs: string | null = null;
                if (message.logEvent.data !== undefined) {
                  try {
                    formattedArgs = JSON.stringify(message.logEvent.data, null, 2);
                  } catch (error) {
                    formattedArgs = String(message.logEvent.data);
                  }
                }

                return (
                  <div key={message.id || 'log-' + index} className="message log-message">
                    <button
                      type="button"
                      className="log-header"
                      aria-expanded={isExpanded}
                      $onclick={['toggle-log-details', message.id || `log-${index}`]}
                    >
                      <span className={`log-dot ${message.logEvent.level}`}></span>
                      <span className="log-category">{message.logEvent.category}</span>
                      <span className="log-content">{message.logEvent.message}</span>
                      <span className="log-toggle-icon" aria-hidden="true">
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    </button>
                    {isExpanded && (
                      <pre className="log-details">
                        {formattedArgs ?? 'No additional details'}
                      </pre>
                    )}
                  </div>
                );
              }

              // Render world events (system and world)
              if (message.worldEvent) {
                // Don't display in UI and don't log here (logged once in handler to prevent duplicates on re-renders)
                return null;
              }

              const senderType = getSenderType(message.sender);
              const isCrossAgentMessage = hasSenderAgentMismatch(message);
              // Memory-only message: INCOMING agent message (type=user/human) saved to another agent's memory without triggering response
              // This is when an agent's reply gets saved to another agent's memory as an incoming message
              // Identified by: type=user/human + agent sender + sender/agentId mismatch (cross-agent)
              // Note: Agent replies have type='agent' or 'assistant', incoming messages have type='user' or 'human'
              const isIncomingMessage = message.type === 'user' || message.type === 'human';

              // Helper: Check if message is replying to the current viewing agent
              const isReplyingToCurrentAgent = (): boolean => {
                if (!message.replyToMessageId) return false;
                const parentMessage = filteredMessages.find(m => m.messageId === message.replyToMessageId);
                if (!parentMessage) return false;
                // Check if parent is from the current agent (the owner of this memory)
                return parentMessage.sender === message.fromAgentId;
              };

              // Special case: user messages with replyToMessageId are actually replies from agents
              // This happens in multi-agent scenarios where agent responses are stored as 'user' messages
              // BUT: if the replyToMessageId points to HUMAN or another agent (not the current agent),
              // it's memory-only (the agent was responding to someone else, not this agent)
              const isReplyMessage = isIncomingMessage && message.replyToMessageId && isReplyingToCurrentAgent();

              // Memory-only logic:
              // For threaded messages (with replyToMessageId): If not replying to current agent, it's memory-only
              // For non-threaded messages (legacy): Check if there's a reply to determine if it's memory-only
              const hasThreading = !!message.replyToMessageId;
              const hasReply = message.messageId
                ? filteredMessages.some(m => m.replyToMessageId === message.messageId)
                : false;

              const isMemoryOnlyMessage = isIncomingMessage &&
                senderType === SenderType.AGENT &&
                isCrossAgentMessage &&
                !message.isStreaming &&
                (hasThreading ? !isReplyMessage : !hasReply); // Threaded: hide if not replying to us. Non-threaded: hide if no reply

              // Skip rendering memory-only messages completely
              if (isMemoryOnlyMessage) {
                return null;
              }

              const baseMessageClass = senderType === SenderType.HUMAN ? 'user-message' : 'agent-message';
              const systemClass = senderType === SenderType.SYSTEM ? 'system-message' : '';
              const crossAgentClass = isCrossAgentMessage && !isMemoryOnlyMessage ? 'cross-agent-message' : '';
              const memoryOnlyClass = isMemoryOnlyMessage ? 'memory-only-message' : '';
              const toolClass = isToolResultMessage(message) ? 'tool-message' : '';
              const messageClasses = `message ${baseMessageClass} ${systemClass} ${crossAgentClass} ${memoryOnlyClass} ${toolClass}`.trim();
              const rowAlignmentClass = getMessageRowAlignmentClass(senderType, isCrossAgentMessage);
              const isHumanAvatar = senderType === SenderType.HUMAN;
              const avatarSpriteIndex = getMessageAvatarSpriteIndex(message);
              const avatarTitle = senderType === SenderType.HUMAN ? 'HUMAN' : message.sender || 'Agent';

              const isUserMessage = senderType === SenderType.HUMAN;
              const isEditing = editingMessageId === message.id;

              // Build display label matching export format
              let displayLabel = '';
              if (isUserMessage) {
                displayLabel = 'From: HUMAN';
                if (message.seenByAgents && message.seenByAgents.length > 0) {
                  displayLabel += `\nTo: ${message.seenByAgents.join(', ')}`;
                }
                // Note: If seenByAgents is empty, don't show 'To:' line (will be populated by duplicates)
              } else if (senderType === SenderType.AGENT) {
                // Check if this is a reply message (has replyToMessageId) or incoming message
                if (isReplyMessage) {
                  // Cross-agent reply: user message with replyToMessageId from another agent
                  const replyTarget = getReplyTarget(message, filteredMessages);
                  if (replyTarget) {
                    displayLabel = `Agent: ${message.sender} (reply to ${replyTarget})`;
                  } else {
                    displayLabel = `Agent: ${message.sender} (reply)`;
                  }
                } else if (message.type === 'assistant' || message.type === 'agent') {
                  // Regular assistant/agent message
                  const replyTarget = getReplyTarget(message, filteredMessages);
                  if (replyTarget) {
                    displayLabel = `Agent: ${message.sender} (reply to ${replyTarget})`;
                  } else {
                    displayLabel = `Agent: ${message.sender} (reply)`;
                  }
                } else if (isCrossAgentMessage && isIncomingMessage) {
                  // Non-reply cross-agent message (rare - most should have replyToMessageId)
                  displayLabel = `Agent: ${message.sender} (message from ${message.fromAgentId || message.sender})`;
                } else {
                  // Fallback
                  displayLabel = `Agent: ${message.sender}`;
                }
              } else if (senderType === SenderType.SYSTEM) {
                displayLabel = message.sender;
              } else {
                displayLabel = message.sender;
              }

              return (
                <div key={message.id || 'msg-' + index} className={`message-row ${rowAlignmentClass}`}>
                  <div className="message-avatar-container" title={avatarTitle}>
                    <div className={isHumanAvatar ? 'message-avatar message-avatar-empty' : `message-avatar agent-sprite sprite-${avatarSpriteIndex}`}></div>
                  </div>
                  <div className={messageClasses}>
                    <div className="message-sender" style={{ whiteSpace: 'pre-line' }}>
                      {displayLabel}
                    </div>
                    {isEditing ? (
                      <div className="message-edit-container">
                        <textarea
                          className="message-edit-input"
                          value={editingText}
                          $oninput='update-edit-text'
                          rows={3}
                          autoFocus
                        />
                        <div className="message-edit-actions">
                          <button
                            className="btn-primary"
                            $onclick={['save-edit-message', message.id]}
                          >
                            Update
                          </button>
                          <button
                            className="btn-secondary"
                            $onclick='cancel-edit-message'
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {message.isToolStreaming ? (
                          /* Render streaming tool output with stdout/stderr distinction */
                          <div className="tool-stream-output">
                            <div className="tool-stream-header">
                              ⚙️ Executing...
                            </div>
                            <div className={`tool-stream-content ${message.streamType === 'stderr' ? 'stderr' : 'stdout'}`}>
                              <pre className="tool-output-text">{message.text || '(waiting for output...)'}</pre>
                            </div>
                          </div>
                        ) : isToolResultMessage(message) ? (
                          /* Phase 5: Collapsible tool output for tool result messages */
                          (() => {
                            const { content, wasTruncated } = truncateToolOutput(message.text);
                            const isExpanded = message.isToolOutputExpanded || false;
                            const outputClass = isStderrOutput(message) ? 'tool-output-stderr' : 'tool-output-stdout';

                            return (
                              <div className="tool-output-container">
                                <div className="tool-output-header">
                                  <button
                                    className="tool-output-toggle"
                                    $onclick={['toggle-tool-output', message.id]}
                                    title={isExpanded ? 'Collapse output' : 'Expand output'}
                                  >
                                    <span className="toggle-icon">{isExpanded ? '▼' : '▶'}</span>
                                    <span className="tool-label">{formatMessageText(message)}</span>
                                  </button>
                                </div>
                                {isExpanded && (
                                  <div className={`tool-output-content ${outputClass}`}>
                                    <pre className="tool-output-text">{content}</pre>
                                    {wasTruncated && (
                                      <div className="tool-output-truncated">
                                        ⚠️ Output truncated (exceeded 50,000 characters)
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })()
                        ) : (
                          /* Regular message content */
                          <div className="message-content">
                            {safeHTML(renderMarkdown(formatMessageText(message)))}
                          </div>
                        )}
                        {isUserMessage && !message.isStreaming && (
                          <div className="message-actions">
                            <button
                              className="message-edit-btn"
                              $onclick={['start-edit-message', { messageId: message.id, text: message.text }]}
                              title="Edit message"
                              disabled={!message.messageId || message.userEntered}
                            >
                              ✏️
                            </button>
                            <button
                              className="message-delete-btn"
                              $onclick={['show-delete-message-confirm', {
                                messageId: message.id,
                                backendMessageId: message.messageId,
                                messageText: message.text,
                                userEntered: message.userEntered
                              }]}
                              title="Delete message and all after it"
                              disabled={!message.messageId || message.userEntered}
                            >
                              🗑️
                            </button>
                          </div>
                        )}
                      </>
                    )}
                    <div className="message-timestamp">
                      {message.createdAt ? new Date(message.createdAt).toLocaleTimeString() : 'Now'}
                    </div>
                    {message.isStreaming && (
                      <div className="streaming-indicator">
                        <div className="streaming-content">
                          <div className={`agent-sprite sprite-${activeAgent?.spriteIndex ?? 0}`}></div>
                          <span>responding ...</span>
                        </div>
                      </div>
                    )}
                    {message.hasError && <div className="error-indicator">Error: {message.errorMessage}</div>}
                    {debug && <div className="message-debug-info">{JSON.stringify({
                      id: message.id,
                      type: message.type,
                      sender: message.sender,
                      fromAgentId: message.fromAgentId,
                      messageId: message.messageId || 'undefined',
                      hasMessageId: !!message.messageId,
                    })}</div>}
                  </div>
                </div>
              );
            })
          )}

          {/* Show waiting dots when processing */}
          {isWaiting && (
            <div className="message-row message-row-left">
              <div className="message-avatar-container" title="HUMAN">
                <div className="message-avatar message-avatar-empty"></div>
              </div>
              <div className="message user-message waiting-message">
                <div className="message-content">
                  <div className="waiting-dots">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Input Area */}
        <div className="input-area">
          <div className="input-container">
            <input
              type="text"
              className="message-input"
              placeholder={inputPlaceholder}
              value={userInput || ''}
              $oninput='update-input'
              $onkeypress='key-press'
              disabled={inputDisabled}
            />
            <button
              className="send-button"
              $onclick="send-message"
              disabled={disableSend}
            >
              {isSending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </fieldset>
  );
}
