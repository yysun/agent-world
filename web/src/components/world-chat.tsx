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
 * - AppRun JSX with props-based state management
 *
 * Changes:
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

const debug = false;

export default function WorldChat(props: WorldChatProps) {
  const {
    worldName,
    messages = [], // Default to empty array if undefined
    rawMessages = [], // Raw messages before deduplication for filtering
    userInput = '', // Default to empty string if undefined
    messagesLoading,
    isSending,
    isWaiting,
    agentActivities = [],
    needScroll = false,
    activeAgent,
    currentChat,
    editingMessageId = null,
    editingText = '',
    agentFilters = []  // Agent IDs to filter by
  } = props;

  const promptReady = !isWaiting;
  const promptIndicator = promptReady ? '>' : '…';
  const inputPlaceholder = promptReady ? 'Type your message...' : 'Waiting for agents...';
  const inputDisabled = isSending || isWaiting;
  const disableSend = !userInput.trim() || isSending || isWaiting;
  const showWaitingDots = isWaiting && agentActivities.length === 0;

  // Helper function to determine if a message has sender/agent mismatch
  const hasSenderAgentMismatch = (message: Message): boolean => {
    const senderLower = toKebabCase(message.sender);
    const agentIdLower = toKebabCase(message.fromAgentId);
    return senderLower !== agentIdLower && !message.isStreaming;
  };

  // Helper function to resolve reply target from replyToMessageId
  const getReplyTarget = (message: Message, allMessages: Message[]): string | null => {
    if (!message.replyToMessageId) {
      console.log(`[DEBUG] No replyToMessageId for message ${message.id} (${message.sender})`);
      return null;
    }

    const parentMessage = allMessages.find(m => m.messageId === message.replyToMessageId);
    if (!parentMessage) {
      console.log(`[DEBUG] Parent message not found for replyToMessageId: ${message.replyToMessageId}`);
      return null;
    }

    const senderType = getSenderType(parentMessage.sender);
    const replyTarget = senderType === SenderType.HUMAN ? 'HUMAN' : parentMessage.sender;
    console.log(`[DEBUG] Reply target found: ${replyTarget} for message ${message.id} (${message.sender})`);
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

  // Helper function to detect and format tool calls (3-tier detection matching export logic)
  const formatMessageText = (message: Message): string => {
    const text = message.text;

    // Tier 1: Check for tool_calls array (AI SDK format)
    if ((message as any).tool_calls && (message as any).tool_calls.length > 0) {
      const toolCalls = (message as any).tool_calls;
      const toolNames = toolCalls
        .map((tc: any) => tc.function?.name || '')
        .filter((name: string) => name !== '');

      if (toolNames.length > 0) {
        return `[${toolNames.length} tool call${toolNames.length > 1 ? 's' : ''}: ${toolNames.join(', ')}]`;
      } else {
        return `[${toolCalls.length} tool call${toolCalls.length > 1 ? 's' : ''}]`;
      }
    }

    // Tier 2: Check if this is a tool result message
    if (message.type === 'tool') {
      const toolCallId = (message as any).tool_call_id || 'unknown';
      return `[Tool result for: ${toolCallId}]`;
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

  return (
    <fieldset className="chat-fieldset">
      <legend>
        {worldName} {
          currentChat ? ` - ${currentChat}` :
            <span className="unsaved-indicator" title="Unsaved chat"> ●</span>}
      </legend>
      <div className="chat-container">
        {/* Conversation Area */}
        <div
          className="conversation-area"
          ref={el => {
            if (!el) return;
            if (needScroll) {
              requestAnimationFrame(() => {
                el.scrollTop = el.scrollHeight;
                app.run('ack-scroll');
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
                const isExpanded = !!message.isLogExpanded;
                let formattedData: string | null = null;
                if (message.worldEvent.data !== undefined) {
                  try {
                    formattedData = JSON.stringify(message.worldEvent.data, null, 2);
                  } catch (error) {
                    formattedData = String(message.worldEvent.data);
                  }
                }

                // Map world event types to log levels for dot color
                const dotLevel = message.worldEvent.level ||
                  (message.worldEvent.type === 'system' ? 'info' : 'debug');

                return (
                  <div key={message.id || 'world-event-' + index} className="message log-message">
                    <button
                      type="button"
                      className="log-header"
                      aria-expanded={isExpanded}
                      $onclick={['toggle-log-details', message.id || `world-event-${index}`]}
                    >
                      <span className={`log-dot ${dotLevel}`}></span>
                      <span className="log-category">{message.worldEvent.category}</span>
                      <span className="log-content">{message.worldEvent.message}</span>
                      <span className="log-toggle-icon" aria-hidden="true">
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    </button>
                    {isExpanded && formattedData && (
                      <pre className="log-details">
                        {formattedData}
                      </pre>
                    )}
                  </div>
                );
              }

              const senderType = getSenderType(message.sender);
              const isCrossAgentMessage = hasSenderAgentMismatch(message);
              // Memory-only message: INCOMING agent message (type=user/human) saved to another agent's memory without triggering response
              // This is when an agent's reply gets saved to another agent's memory as an incoming message
              // Identified by: type=user/human + agent sender + sender/agentId mismatch (cross-agent)
              // Note: Agent replies have type='agent' or 'assistant', incoming messages have type='user' or 'human'
              const isIncomingMessage = message.type === 'user' || message.type === 'human';

              // Special case: user messages with replyToMessageId are actually replies from agents
              // This happens in multi-agent scenarios where agent responses are stored as 'user' messages
              // in the receiving agent's memory but have threading information
              const isReplyMessage = isIncomingMessage && message.replyToMessageId;

              // Check if there's a reply to this incoming message (explicit threading)
              const hasReply = message.messageId
                ? filteredMessages.some(m => m.replyToMessageId === message.messageId)
                : false; // Legacy messages without threading assumed to have replies

              const isMemoryOnlyMessage = isIncomingMessage &&
                !isReplyMessage && // Reply messages are not memory-only
                senderType === SenderType.AGENT &&
                isCrossAgentMessage &&
                !message.isStreaming &&
                !hasReply; // Only mark as memory-only if confirmed no reply
              const baseMessageClass = senderType === SenderType.HUMAN ? 'user-message' : 'agent-message';
              const systemClass = senderType === SenderType.SYSTEM ? 'system-message' : '';
              const crossAgentClass = isCrossAgentMessage && !isMemoryOnlyMessage ? 'cross-agent-message' : '';
              const memoryOnlyClass = isMemoryOnlyMessage ? 'memory-only-message' : '';
              const messageClasses = `message ${baseMessageClass} ${systemClass} ${crossAgentClass} ${memoryOnlyClass}`.trim();

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
                  console.log(`[DEBUG] Processing isReplyMessage for ${message.sender}, messageId: ${message.messageId}, replyToMessageId: ${message.replyToMessageId}`);
                  const replyTarget = getReplyTarget(message, filteredMessages);
                  if (replyTarget) {
                    displayLabel = `Agent: ${message.sender} (reply to ${replyTarget})`;
                  } else {
                    displayLabel = `Agent: ${message.sender} (reply)`;
                  }
                } else if (message.type === 'assistant' || message.type === 'agent') {
                  // Regular assistant/agent message
                  console.log(`[DEBUG] Processing assistant/agent message for ${message.sender}, messageId: ${message.messageId}, replyToMessageId: ${message.replyToMessageId}`);
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
                <div key={message.id || 'msg-' + index} className={messageClasses}>
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
                      <div className="message-content">
                        {safeHTML(renderMarkdown(formatMessageText(message)))}
                      </div>
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
              );
            })
          )}

          {showWaitingDots && (
            <div className="message user-message waiting-message">
              <div className="message-content">
                <div className="waiting-dots">
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
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
