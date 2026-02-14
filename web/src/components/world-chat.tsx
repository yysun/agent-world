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
 * - Message body rendering delegated to domain module (`renderMessageContent`)
 * - Left-side avatar rendering for message boxes using actual agent spriteIndex values
 * - Human messages keep an empty avatar slot (no sprite image)
 * - Activity indicators: ActivityPulse and ElapsedTimeCounter in chat header
 * - Agent queue indicator in chat header (active + queued agents)
 * - Tool execution status: ToolExecutionStatus showing active tools with icons
 * - Collapsible tool output: Expand/collapse tool results with stdout/stderr styling
 * - Tool output truncation: 50K character limit with truncation warning
 * - Role-based message styling: Distinct left border colors for visual hierarchy
 * - AppRun JSX with props-based state management
 *
 * Changes:
 * - 2026-02-14: Extracted message body rendering to `web/src/domain/message-content.tsx`
 * - 2026-02-14: Removed legacy 3-tier tool call reconstruction in favor of canonical message text rendering
 * - 2026-02-14: Added AgentQueueDisplay in chat header for active/queued visibility
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

import { app } from 'apprun';
import type { WorldChatProps, Message } from '../types';
import toKebabCase from '../utils/toKebabCase';
import { SenderType, getSenderType } from '../utils/sender-type.js';
import { isToolResultMessage, renderMessageContent } from '../domain/message-content';
import { ActivityPulse, ElapsedTimeCounter } from './activity-indicators';
import { ToolExecutionStatus } from './tool-execution-status';
import { AgentQueueDisplay } from './agent-queue-display';

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

  const queuedAgents = agents
    .filter((agent) => agent.name !== activeAgent?.name)
    .map((agent) => ({ name: agent.name, spriteIndex: agent.spriteIndex }));

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

  return (
    <fieldset className="chat-fieldset">
      <legend>
        {worldName} {
          currentChat ? ` - ${currentChat}` :
            <span className="unsaved-indicator" title="Unsaved chat"> ●</span>}
        <AgentQueueDisplay
          activeAgent={activeAgent ? { name: activeAgent.name, spriteIndex: activeAgent.spriteIndex } : null}
          queuedAgents={queuedAgents}
        />
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
              const crossAgentClass = isCrossAgentMessage && !isMemoryOnlyMessage && senderType !== SenderType.HUMAN ? 'cross-agent-message' : '';
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
                        {renderMessageContent(message)}
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
