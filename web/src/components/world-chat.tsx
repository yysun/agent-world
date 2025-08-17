/**
 * World Chat Component - Real-time chat interface with agent message filtering
 *
 * Features:
 * - Real-time message streaming with agent selection filtering
 * - Cross-agent message detection and system message display
 * - User input handling with send functionality and loading states
 * - AppRun JSX with props-based state management
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
    activeAgent,
    currentChat
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
        <div className="conversation-area" ref={e => e.scrollTop = e.scrollHeight}>
          {messagesLoading ? (
            <div className="loading-messages">Loading messages...</div>
          ) : messages.length === 0 ? (
            <div className="no-messages">No messages yet. Start a conversation!</div>
          ) : (
            messages.filter(message =>
              // Don't filter system messages if they have logEvent (log messages)
              // Only filter pure system messages without logEvent
              message.sender !== 'system' || message.logEvent
            )
              .map((message, index) => {

                // Handle log messages with special styling
                if (message.logEvent) {
                  console.log('Rendering log message:', message);
                  return (
                    <div key={message.id || 'log-' + index} className="message log-message">
                      <div className="message-content">
                        <span className={`log-dot ${message.logEvent.level}`}></span>
                        <span className="log-category">{message.logEvent.category}:</span>
                        <span className="log-content">{message.logEvent.message}</span>
                      </div>
                    </div>
                  );
                }

                const senderType = getSenderType(message.sender);
                const isCrossAgentMessage = hasSenderAgentMismatch(message);
                const baseMessageClass = senderType === SenderType.HUMAN ? 'user-message' : 'agent-message';
                const systemClass = senderType === SenderType.SYSTEM ? 'system-message' : '';
                const crossAgentClass = isCrossAgentMessage ? 'cross-agent-message' : '';
                const messageClasses = `message ${baseMessageClass} ${systemClass} ${crossAgentClass}`.trim();

                return (
                  <div key={message.id || 'msg-' + index} className={messageClasses}>
                    <div className="message-sender">
                      {message.sender}
                      {isCrossAgentMessage && message.fromAgentId && (
                        <span className="source-agent-indicator" title={`From agent: ${message.fromAgentId}`}>
                          → {message.fromAgentId}
                        </span>
                      )}
                    </div>
                    <div className="message-content">
                      {safeHTML(renderMarkdown(message.text))}
                    </div>
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
                      type: message.type,
                      sender: message.sender,
                      fromAgentId: message.fromAgentId,
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
