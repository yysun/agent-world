/**
 * World Chat History Component - Chat history management for world conversations
 * 
 * Features:
 * - List all chat history entries with details
 * - Create new chat history entries with snapshots
 * - Load and restore world state from chat history
 * - Delete chat history entries with confirmation
 * - Generate summaries using LLM
 * - Real-time updates and error handling
 * 
 * Implementation:
 * - Functional component using AppRun JSX
 * - Props-based state management from parent World component
 * - AppRun $ directive pattern for event handling
 * - Fieldset layout matching other components
 * - Modal dialogs for create/delete operations
 * - Integration with chat history API endpoints
 * 
 * This component replaces world-settings when chat history is selected
 * and provides full CRUD operations for chat management.
 * 
 * Changes:
 * - Created as standalone chat history management component
 * - Designed to integrate with existing World component architecture
 * - Uses consolidated types from centralized types/index.ts
 * - Follows AppRun component patterns established in the codebase
 */

import { app } from 'apprun';
import type { ChatHistoryState, ChatInfo, WorldChat } from '../types';

export interface WorldChatHistoryProps {
  worldName: string;
  chatHistory: ChatHistoryState;
}

export default function WorldChatHistory(props: WorldChatHistoryProps) {
  const { worldName, chatHistory } = props;

  // AppRun pattern compliance: Using $onclick directives for event handling
  // Following apprun-prompt.md guidelines for functional components
  
  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <fieldset className="settings-fieldset">
      <legend>Chat History</legend>

      <div className="chat-history-header centered">
        <button
          className="new-chat-btn"
          $onclick="create-new-chat"
          title="Create new chat session"
        >
          ✚ New Chat
        </button>
      </div>

      <div className="chat-history-container">
        {chatHistory.loading ? (
          <div className="loading-indicator">Loading chat history...</div>
        ) : chatHistory.chats.length === 0 ? (
          <div className="no-chats">
            <p>No chat history entries found.</p>
            <p>Start a conversation with agents to auto-save chats.</p>
          </div>
        ) : (
          <div className="chat-list">
            {chatHistory.chats.map(chat => (
              <div key={chat.id} className="chat-item">
                <div className="chat-header">
                  <h4 className="chat-name">{chat.name}</h4>
                  <div className="chat-actions">
                    <button
                      className="action-btn"
                      $onclick={['load-chat-from-history', chat.id]}
                      title="Load chat"
                    >
                      📂
                    </button>
                    <button
                      className="action-btn"
                      $onclick={['chat-history-summarize', chat]}
                      title="Generate summary"
                    >
                      📝
                    </button>
                    <button
                      className="action-btn"
                      $onclick={['chat-history-show-delete-confirm', chat]}
                      title="Delete chat"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {chat.description && (
                  <div className="chat-description">{chat.description}</div>
                )}

                <div className="chat-metadata">
                  <span className="chat-messages">💬 {chat.messageCount} messages</span>
                  <span className="chat-created">📅 {formatDate(chat.createdAt)}</span>
                  {chat.updatedAt !== chat.createdAt && (
                    <span className="chat-updated">🔄 {formatDate(chat.updatedAt)}</span>
                  )}
                </div>

                {chat.summary && (
                  <div className="chat-summary">
                    <strong>Summary:</strong> {chat.summary}
                  </div>
                )}

                {chat.tags && chat.tags.length > 0 && (
                  <div className="chat-tags">
                    {chat.tags.map(tag => (
                      <span key={tag} className="tag">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {chatHistory.showDeleteConfirm && chatHistory.selectedChat && (
        <div className="modal-overlay" $onclick="chat-history-hide-modals">
          <div className="modal-content" onclick={(e: Event) => e.stopPropagation()}>
            <h3>Delete Chat</h3>
            <p>
              Are you sure you want to delete chat "{chatHistory.selectedChat.name}"?
            </p>
            <p className="warning">
              ⚠️ This action cannot be undone.
            </p>
            <div className="form-actions">
              <button 
                className="btn-danger" 
                $onclick={['delete-chat-from-history', chatHistory.selectedChat.id]}
                disabled={chatHistory.loading}
              >
                {chatHistory.loading ? 'Deleting...' : 'Delete Chat'}
              </button>
              <button className="btn-secondary" $onclick="chat-history-hide-modals">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </fieldset>
  );
}