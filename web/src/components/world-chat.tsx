/**
 * World Chat Component - Chat interface for world conversations
 * 
 * Features:
 * - Real-time message display with streaming indicators
 * - User input handling with send functionality
 * - Message filtering for completed, streaming, and regular messages
 * - Scroll-to-bottom behavior for new messages
 * - Loading states for messages
 * - Send button state management
 * 
 * Implementation:
 * - Functional component using AppRun JSX
 * - Props-based state management from parent World component
 * - AppRun $ directive pattern for event handling
 * - Message filtering logic for SSE streams and regular messages
 * - Proper createdAt formatting
 * 
 * Changes:
 * - Extracted from World component for better separation of concerns
 * - Maintained all original chat functionality
 * - Added proper TypeScript interfaces for props
 * - Updated to use AppRun $ directive pattern ($onclick, $oninput, $onkeypress)
 * - Fixed message filtering to show regular non-streaming messages (e.g., GM turn limit notifications)
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
}

interface WorldChatProps {
  worldName: string;
  messages: Message[];
  userInput: string;
  messagesLoading: boolean;
  isSending: boolean;
}

export default function WorldChat(props: WorldChatProps) {
  const {
    worldName,
    messages,
    userInput,
    messagesLoading,
    isSending
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
                // Always show user messages
                if (message.sender === 'HUMAN' || message.type === 'user') {
                  return true;
                }
                // For agent messages: show completed streams OR currently streaming OR regular non-streaming messages
                // This shows final messages but prevents duplication during streaming
                return message.streamComplete === true ||
                  (message.isStreaming === true && !message.streamComplete) ||
                  (message.streamComplete === undefined && message.isStreaming === undefined);
              })
              .map((message, index) => (
                <div key={message.id || index} className={`message ${message.sender === 'HUMAN' || message.type === 'user' ? 'user-message' : 'agent-message'}`}>
                  <div className="message-sender">{message.sender === 'HUMAN' || message.type === 'user' ? 'User' : message.sender}</div>
                  <div className="message-content">{message.text}</div>
                  <div className="message-timestamp">
                    {message.createdAt ? new Date(message.createdAt).toLocaleTimeString() : 'Now'}
                  </div>
                  {message.isStreaming && <div className="streaming-indicator">Typing...</div>}
                  {message.hasError && <div className="error-indicator">Error: {message.errorMessage}</div>}
                </div>
              ))
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
