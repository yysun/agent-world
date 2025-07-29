/**
 * World Chat Component - Chat interface for world conversations
 * 
 * Features:
 * - Real-time message display with streaming indicators
 * - User input handling with send functionality
 * - Message filtering for completed, streaming, and regular messages
 * - Agent-specific message filtering: shows only selected agent's messages when agent is selected using fromAgentId
 * - System message display: always shows GM/system messages regardless of agent selection
 * - Cross-agent message detection: identifies and styles messages where sender differs from source agent
 * - Scroll-to-bottom behavior for new messages
 * - Loading states for messages
 * - Send button state management
 * 
 * Implementation:
 * - Functional component using AppRun JSX
 * - Props-based state management from parent World component
 * - AppRun $ directive pattern for event handling
 * - Message filtering logic for SSE streams and regular messages
 * - Conditional message filtering based on selectedAgent prop
 * - Always shows user messages regardless of selected agent
 * - Always shows system/GM messages (turn limits, notifications) regardless of agent selection
 * - Proper createdAt formatting
 * 
 * Changes:
 * - Extracted from World component for better separation of concerns
 * - Maintained all original chat functionality
 * - Added proper TypeScript interfaces for props
 * - Updated to use AppRun $ directive pattern ($onclick, $oninput, $onkeypress)
 * - Fixed message filtering to show regular non-streaming messages (e.g., GM turn limit notifications)
 * - Added selectedAgent prop for agent-specific message filtering
 * - Enhanced message filtering: filters by selected agent while always showing user messages
 * - Fixed system message filtering to always show GM/system messages regardless of agent selection
 * - Removed hideUserEnteredMessages prop - userEntered messages are now filtered from state in parent component
 * - Updated message filtering to use fromAgentId instead of sender name for more reliable agent identification
 * - Added cross-agent message detection and styling for messages from different agents' memories
 */

import { app, safeHTML } from 'apprun';
import type { Message } from '../types';
import toKebabCase from '../utils/toKebabCase';
import { renderMarkdown } from '../utils/markdown';

// Component Props Interfaces (consolidated from components)
export interface WorldChatProps {
  worldName: string;
  messages?: Message[]; // Made optional with default in component
  userInput?: string; // Made optional with default in component
  messagesLoading: boolean;
  isSending: boolean;
  isWaiting: boolean;
  activeAgent?: {
    spriteIndex: number;
    name: string;
  } | null;
  selectedAgent?: {
    id?: string;
    name: string;
  } | null;
}


export default function WorldChat(props: WorldChatProps) {
  const {
    worldName,
    messages = [], // Default to empty array if undefined
    userInput = '', // Default to empty string if undefined
    messagesLoading,
    isSending,
    isWaiting,
    activeAgent,
    selectedAgent
  } = props;

  // Helper function to determine if a message has sender/agent mismatch
  const hasSenderAgentMismatch = (message: Message): boolean => {

    const senderLower = toKebabCase(message.sender);
    const agentIdLower = toKebabCase(message.fromAgentId);
    // Only check messages that have fromAgentId (came from agent memory)
    if (!message.fromAgentId) return false;

    // If sender is HUMAN/USER, it's normal for it to be in any agent's memory
    if (senderLower === 'human') {
      return false;
    }

    // If sender is system/SYSTEM, it's normal for it to be in any agent's memory
    if (senderLower === 'system') {
      return false;
    }

    // If sender name contains agent id or agent id contains sender name, they likely match
    if (senderLower.includes(agentIdLower) || agentIdLower.includes(senderLower)) {
      return false;
    }

    // Otherwise, it's likely a mismatch (cross-agent message)
    return true;
  };

  return (
    <fieldset className="chat-fieldset">
      <legend>{worldName}</legend>
      <div className="chat-container">
        {/* Conversation Area */}
        <div className="conversation-area" ref={e => e.scrollTop = e.scrollHeight}>
          {messagesLoading ? (
            <div className="loading-messages">Loading messages...</div>
          ) : messages.length === 0 ? (
            <div className="no-messages">No messages yet. Start a conversation!</div>
          ) : (
            messages
              .filter(message => {
                // Always show user messages
                if (message.sender === 'HUMAN' || message.sender === 'USER' || message.type === 'user' || message.sender === 'system' || message.sender === 'SYSTEM') {
                  return true;
                }
                if (message.isStreaming === true) {
                  return true; // Currently streaming
                }
                // If an agent is selected for settings, filter to show only that agent's messages
                if (selectedAgent?.id && message.fromAgentId !== selectedAgent.id) {
                  return false;
                }
                return true;
              })
              .map((message, index) => {
                // Check if this is a cross-agent message
                const isCrossAgentMessage = hasSenderAgentMismatch(message);

                const isSystemMessage = message.sender === 'system' || message.sender === 'SYSTEM';
                const baseMessageClass = (message.sender === 'HUMAN' || message.sender === 'USER') || message.type === 'user' ? 'user-message' : 'agent-message';
                const systemClass = isSystemMessage ? 'system-message' : '';
                const crossAgentClass = isCrossAgentMessage ? 'cross-agent-message' : '';
                const messageClasses = `message ${baseMessageClass} ${systemClass} ${crossAgentClass}`.trim();

                return (
                  <div key={message.id || index} className={messageClasses}>
                    <div className="message-sender">
                      {message.sender || (message.type === 'user' ? 'User' : 'Agent')}
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
                    <div className="message-debug-info">{JSON.stringify({
                      type: message.type,
                      sender: message.sender,
                      fromAgentId: message.fromAgentId,
                    })}</div>

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
