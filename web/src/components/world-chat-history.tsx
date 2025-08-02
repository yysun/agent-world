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
import type { World, Chat } from '../types';

export interface WorldChatHistoryProps {
  worldName: string;
  world: World | null;
  selectedChatForAction: Chat | null;
  showDeleteChatConfirm: boolean;
}

export default function WorldChatHistory(props: WorldChatHistoryProps) {
  const { worldName, world, selectedChatForAction, showDeleteChatConfirm } = props;

  // Check if agents exist to enable/disable New Chat button
  const hasAgents = world && world.agents && world.agents.length > 0;
  const chats = world?.chats || [];

  // Internal state for modal management - will be handled via AppRun events
  // These will be managed through AppRun state updates rather than props

  return (
    <fieldset className="settings-fieldset">
      <legend>Chat History</legend>

      <div className="chat-history-header centered">
        <button
          className="new-chat-btn"
          $onclick="create-new-chat"
          title={hasAgents ? "Create new chat session" : "Create an agent first to enable new chats"}
          disabled={!hasAgents}
        >
          ✚ New Chat
        </button>
      </div>

      <div className="chat-history-container">
        {chats.length === 0 ? (
          <div className="no-chats">
            <p>No chat history entries found.</p>
            <p>Start a conversation with agents to auto-save chats.</p>
          </div>
        ) : (
          <ul className="chat-list simplified-chat-list">
            {chats.map(chat => (
              <li key={chat.id} className="chat-item simplified-chat-item chat-list-li">
                <span
                  className="chat-title clickable chat-list-title"
                  $onclick={["load-chat-from-history", chat.id]}
                  title={chat.name}
                >
                  {chat.name}
                </span>
                <button
                  className="chat-close-btn chat-list-close-btn"
                  $onclick={["chat-history-show-delete-confirm", chat]}
                  title="Delete chat"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteChatConfirm && selectedChatForAction && (
        <div className="modal-overlay" $onclick="chat-history-hide-modals">
          <div className="modal-content" onclick={(e: Event) => e.stopPropagation()}>
            <h3>Delete Chat</h3>
            <p className="delete-confirmation-text">
              Are you sure you want to delete chat <span className="delete-confirmation-name">"{selectedChatForAction.name}"</span>?
            </p>
            <p className="warning delete-confirmation-warning">
              ⚠️ This action cannot be undone.
            </p>
            <div className="form-actions">
              <button
                className="btn-danger"
                $onclick={['delete-chat-from-history', selectedChatForAction.id]}
              >
                Delete Chat
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