/**
 * World Chat History Component - Chat history management for world conversations
 * 
 * Features:
 * - List all chat history entries with details
 * - Create new chat history entries with snapshots
 * - Load and restore world state from chat history
 * - Delete chat history entries with confirmation (modal handled by parent)
 * - Generate summaries using LLM
 * - Real-time updates and error handling
 * 
 * Implementation:
 * - Functional component using AppRun JSX
 * - Simplified props - only receives world data
 * - AppRun $ directive pattern for event handling
 * - Fieldset layout matching other components
 * - Delete confirmation modal moved to parent World component
 * - Integration with chat history API endpoints
 * 
 * This component replaces world-settings when chat history is selected
 * and provides full CRUD operations for chat management.
 * 
 * Changes:
 * - Simplified props interface to only include world
 * - Removed delete confirmation modal (moved to parent World component)
 * - Cleaned up component to focus on chat list display and basic actions
 * - Delete confirmation popup now handled by parent component
 */

import { app } from 'apprun';
import type { World } from '../types';

export interface WorldChatHistoryProps {
  world: World | null;
}

export default function WorldChatHistory(props: WorldChatHistoryProps) {
  const { world } = props;

  // Check if agents exist to enable/disable New Chat button
  const hasAgents = world && world.agents && world.agents.length > 0;
  const chats = world?.chats || [];

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
    </fieldset>
  );
  // ...existing code...
}