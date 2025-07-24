/**
 * World Chat Component - Chat interface for world conversations
 * 
 * Features:
 * - Real-time message display with streaming indicators
 * - User input handling with send functionality
 * - Message filtering for completed, streaming, and regular messages
 * - Agent-specific message filtering: shows only selected agent's messages when agent is selected using fromAgentId
 * - System message display: always shows GM/system messages regardless of agent selection
 * - User-entered message filtering: can hide messages marked with userEntered flag when viewing settings
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
 * - Added hideUserEnteredMessages prop to filter out user-entered messages when viewing settings
 * - Updated message filtering to use fromAgentId instead of sender name for more reliable agent identification
 */

import { app } from 'apprun';

interface Message {
  id?: string | number;
  sender: string;
  text: string;
  createdAt: string;
  type?: string;
  streamComplete?: boolean;
  isStreaming?: boolean;
  hasError?: boolean;
  errorMessage?: string;
  userEntered?: boolean;
  fromAgentId?: string;
}

interface WorldChatProps {
  worldName: string;
  messages: Message[];
  userInput: string;
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
  hideUserEnteredMessages?: boolean;
}

export default function WorldChat(props: WorldChatProps) {
  const {
    worldName,
    messages,
    userInput,
    messagesLoading,
    isSending,
    isWaiting,
    activeAgent,
    selectedAgent,
    hideUserEnteredMessages = false
  } = props;

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
                // Hide user-entered messages when viewing settings (world or agent)
                if (hideUserEnteredMessages && message.userEntered) {
                  return false;
                }

                // Always show user messages (unless they're userEntered and we're hiding those)
                if (message.sender === 'HUMAN' || message.sender === 'USER' || message.type === 'user' || message.sender === 'system' || message.sender === 'SYSTEM') {
                  return true;
                }

                // If an agent is selected for settings, filter to show only that agent's messages
                if (selectedAgent?.id && message.fromAgentId !== selectedAgent.id) {
                  return false;
                }

                // For agent messages: 
                // Show completed streams (streamComplete === true) 
                // OR show currently streaming messages that are not yet complete (isStreaming === true && streamComplete !== true)
                // OR show regular non-streaming messages (no streaming properties)
                if (message.isStreaming === true && message.streamComplete !== true) {
                  return true; // Currently streaming
                }
                if (message.streamComplete === true) {
                  return true; // Completed stream
                }
                if (message.streamComplete === undefined && message.isStreaming === undefined) {
                  return true; // Regular message (like GM notifications)
                }
                return false; // Filter out incomplete or duplicate messages
              })
              .map((message, index) => (
                <div key={message.id || index} className={`message ${(message.sender === 'HUMAN' || message.sender === 'USER') || message.type === 'user' ? 'user-message' : 'agent-message'}`}>
                  <div className="message-sender">{message.sender || (message.type === 'user' ? 'User' : 'Agent')}</div>
                  <div className="message-content">{message.text}</div>
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
                </div>
              ))
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
              value={userInput}
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
