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

  const handleCreateChat = () => {
    app.run('chat-history-show-create-form');
  };

  const handleLoadChat = (chat: ChatInfo) => {
    app.run('chat-history-show-load-confirm', chat);
  };

  const handleDeleteChat = (chat: ChatInfo) => {
    app.run('chat-history-show-delete-confirm', chat);
  };

  const handleSummarizeChat = (chat: ChatInfo) => {
    app.run('chat-history-summarize', chat);
  };

  const handleCreateSubmit = (e: Event) => {
    e.preventDefault();
    app.run('chat-history-create-submit');
  };

  const handleCreateCancel = () => {
    app.run('chat-history-hide-create-form');
  };

  const handleLoadConfirm = () => {
    app.run('chat-history-load-confirm');
  };

  const handleDeleteConfirm = () => {
    app.run('chat-history-delete-confirm');
  };

  const handleModalCancel = () => {
    app.run('chat-history-hide-modals');
  };

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <fieldset className="settings-fieldset">
      <legend>Chat History - {worldName}</legend>
      
      <div className="chat-history-container">
        {chatHistory.loading ? (
          <div className="loading-indicator">Loading chat history...</div>
        ) : chatHistory.error ? (
          <div className="error-message">
            Error: {chatHistory.error}
            <button className="btn-retry" onclick={() => app.run('chat-history-refresh')}>
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="chat-history-header">
              <button 
                className="btn-primary" 
                onclick={handleCreateChat}
                disabled={chatHistory.loading}
              >
                📁 New Chat
              </button>
              <button 
                className="btn-secondary" 
                onclick={() => app.run('chat-history-refresh')}
                disabled={chatHistory.loading}
              >
                🔄 Refresh
              </button>
            </div>

            {chatHistory.chats.length === 0 ? (
              <div className="no-chats">
                <p>No chat history entries found.</p>
                <p>Create a new chat to save the current world state.</p>
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
                          onclick={() => handleLoadChat(chat)}
                          title="Load and restore world state"
                        >
                          📂
                        </button>
                        <button 
                          className="action-btn" 
                          onclick={() => handleSummarizeChat(chat)}
                          title="Generate summary"
                        >
                          📝
                        </button>
                        <button 
                          className="action-btn" 
                          onclick={() => handleDeleteChat(chat)}
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
          </>
        )}
      </div>

      {/* Create Chat Modal */}
      {chatHistory.showCreateForm && (
        <div className="modal-overlay" onclick={handleModalCancel}>
          <div className="modal-content" onclick={(e: Event) => e.stopPropagation()}>
            <h3>Create New Chat</h3>
            <form onsubmit={handleCreateSubmit}>
              <div className="form-group">
                <label htmlFor="chat-name">Name:</label>
                <input
                  id="chat-name"
                  type="text"
                  value={chatHistory.formData.name}
                  oninput={(e: any) => app.run('chat-history-update-form', { name: e.target.value })}
                  placeholder="Enter chat name"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="chat-description">Description:</label>
                <textarea
                  id="chat-description"
                  value={chatHistory.formData.description}
                  oninput={(e: any) => app.run('chat-history-update-form', { description: e.target.value })}
                  placeholder="Optional description"
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={chatHistory.loading}>
                  {chatHistory.loading ? 'Creating...' : 'Create Chat'}
                </button>
                <button type="button" className="btn-secondary" onclick={handleCreateCancel}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Load Confirmation Modal */}
      {chatHistory.showLoadConfirm && chatHistory.selectedChat && (
        <div className="modal-overlay" onclick={handleModalCancel}>
          <div className="modal-content" onclick={(e: Event) => e.stopPropagation()}>
            <h3>Load Chat</h3>
            <p>
              Are you sure you want to restore world state from chat "{chatHistory.selectedChat.name}"?
            </p>
            <p className="warning">
              ⚠️ This will replace the current world state with the saved snapshot.
            </p>
            <div className="form-actions">
              <button className="btn-primary" onclick={handleLoadConfirm} disabled={chatHistory.loading}>
                {chatHistory.loading ? 'Loading...' : 'Load Chat'}
              </button>
              <button className="btn-secondary" onclick={handleModalCancel}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {chatHistory.showDeleteConfirm && chatHistory.selectedChat && (
        <div className="modal-overlay" onclick={handleModalCancel}>
          <div className="modal-content" onclick={(e: Event) => e.stopPropagation()}>
            <h3>Delete Chat</h3>
            <p>
              Are you sure you want to delete chat "{chatHistory.selectedChat.name}"?
            </p>
            <p className="warning">
              ⚠️ This action cannot be undone.
            </p>
            <div className="form-actions">
              <button className="btn-danger" onclick={handleDeleteConfirm} disabled={chatHistory.loading}>
                {chatHistory.loading ? 'Deleting...' : 'Delete Chat'}
              </button>
              <button className="btn-secondary" onclick={handleModalCancel}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </fieldset>
  );
}