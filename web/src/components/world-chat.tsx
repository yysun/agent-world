/**
 * World Chat Component - Real-time chat interface with agent message filtering
 *
 * Features:
 * - Real-time message streaming with agent selection filtering
 * - Cross-agent message detection and system message display
 * - User input handling with send functionality and loading states
 * - Message editing with frontend-driven DELETE → POST flow
 * - Message deduplication by messageId for multi-agent scenarios
 * - Delivery status display showing which agents received each message
 * - AppRun JSX with props-based state management
 *
 * Changes:
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
              const baseMessageClass = senderType === SenderType.HUMAN ? 'user-message' : 'agent-message';
              const systemClass = senderType === SenderType.SYSTEM ? 'system-message' : '';
              const crossAgentClass = isCrossAgentMessage ? 'cross-agent-message' : '';
              const messageClasses = `message ${baseMessageClass} ${systemClass} ${crossAgentClass}`.trim();

              const isUserMessage = senderType === SenderType.HUMAN;
              const isEditing = editingMessageId === message.id;

              return (
                <div key={message.id || 'msg-' + index} className={messageClasses}>
                  <div className="message-sender">
                    {message.sender}
                    {isUserMessage && message.seenByAgents && message.seenByAgents.length > 0 ? (
                      <span className="source-agent-indicator" title="Agents that received this message">
                        → {message.seenByAgents.join(', ')}
                      </span>
                    ) : isCrossAgentMessage && message.fromAgentId ? (
                      <span className="source-agent-indicator" title={`From agent: ${message.fromAgentId}`}>
                        → {message.fromAgentId}
                      </span>
                    ) : null}
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
                        {safeHTML(renderMarkdown(message.text))}
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
