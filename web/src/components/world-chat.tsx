/**
 * World Chat Component - Real-time chat interface with agent message filtering
 *
 * Features:
 * - Real-time message streaming with agent selection filtering
 * - Cross-agent message detection and system message display
 * - Memory-only message styling (agent messages saved to other agents' memory)
 * - User input handling with send functionality and loading states
 * - Message editing with frontend-driven DELETE → POST flow
 * - Message deduplication by messageId for multi-agent scenarios
 * - Delivery status display showing which agents received each message
 * - AppRun JSX with props-based state management
 *
 * Changes:
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
    userInput = '', // Default to empty string if undefined
    messagesLoading,
    isSending,
    isWaiting,
    needScroll = false,
    activeAgent,
    currentChat,
    editingMessageId = null,
    editingText = ''
  } = props;

  // Helper function to determine if a message has sender/agent mismatch
  const hasSenderAgentMismatch = (message: Message): boolean => {
    const senderLower = toKebabCase(message.sender);
    const agentIdLower = toKebabCase(message.fromAgentId);
    return senderLower !== agentIdLower && !message.isStreaming;
  };

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
          ) : messages.length === 0 ? (
            <div className="no-messages">No messages yet. Start a conversation!</div>
          ) : (
            messages.map((message, index) => {
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

              const senderType = getSenderType(message.sender);
              const isCrossAgentMessage = hasSenderAgentMismatch(message);
              // Memory-only message: INCOMING agent message (type=user/human) saved to another agent's memory without triggering response
              // This is when an agent's reply gets saved to another agent's memory as an incoming message
              // Identified by: type=user/human + agent sender + sender/agentId mismatch (cross-agent)
              // Note: Agent replies have type='agent' or 'assistant', incoming messages have type='user' or 'human'
              const isIncomingMessage = message.type === 'user' || message.type === 'human';

              // Check if there's a reply to this incoming message (explicit threading)
              const hasReply = message.messageId
                ? messages.some(m => m.replyToMessageId === message.messageId)
                : false; // Legacy messages without threading assumed to have replies

              const isMemoryOnlyMessage = isIncomingMessage &&
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
              } else if (senderType === SenderType.AGENT) {
                // Check if this is an incoming message (cross-agent with type='user') or a reply (type='agent')
                if (isCrossAgentMessage && isIncomingMessage) {
                  // Incoming message to agent memory (sender sent to fromAgentId)
                  displayLabel = `Agent: ${message.fromAgentId || message.sender} (incoming from ${message.sender})`;
                  // Check if this is memory-only (no reply follows)
                  if (isMemoryOnlyMessage) {
                    displayLabel += ' [in-memory, no reply]';
                  }
                } else {
                  // Agent reply (normal agent message)
                  displayLabel = `Agent: ${message.sender} (reply)`;
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
                        <button
                          className="message-edit-btn"
                          $onclick={['start-edit-message', message.id, message.text]}
                          title="Edit message"
                          disabled={!message.messageId || message.userEntered}
                        >
                          ✎
                        </button>
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

          {/* Waiting indicator - three dots when waiting for streaming to start */}
          {isWaiting && (
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
              placeholder="Type your message..."
              value={userInput || ''}
              $oninput='update-input'
              $onkeypress='key-press'
            />
            <button
              className="send-button"
              $onclick="send-message"
              disabled={!userInput.trim() || isSending}
            >
              {isSending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </fieldset>
  );
}
