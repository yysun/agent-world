/**
 * World Chat History Component - Chat history management interface
 * 
 * Features:
 * - List all chat history with create/load/delete operations
 * - Client-side chat-session search (case-insensitive title filtering)
 * - LLM-generated summaries and real-time updates
 * - AppRun JSX with fieldset layout matching other components
 * - Delete confirmation handled by parent World component
 */

import type { WorldChatHistoryProps } from '../types';

export function filterChatsByQuery<T extends { name?: string }>(chats: T[], query: string): T[] {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return chats;
  return chats.filter((chat) => String(chat?.name || '').toLowerCase().includes(normalizedQuery));
}

export default function WorldChatHistory(props: WorldChatHistoryProps) {
  const { world, chatSearchQuery } = props;

  // Check if agents exist to enable/disable New Chat button
  const hasAgents = world && world.agents && world.agents.length > 0;
  const chats = world?.chats || [];
  const filteredChats = filterChatsByQuery(chats, chatSearchQuery);
  const currentChatId = world?.currentChatId ?? null;

  return (
    <fieldset className="settings-fieldset">
      <legend>Chat History</legend>

      <div className="chat-history-controls">
        <input
          type="text"
          className="message-input chat-history-search-input"
          placeholder="Search chats..."
          value={chatSearchQuery || ''}
          $oninput="update-chat-search"
        />
        <button
          className="new-chat-btn"
          $onclick="create-new-chat"
          title={hasAgents ? "Create new chat session" : "Create an agent first to enable new chats"}
          aria-label={hasAgents ? "Create new chat session" : "Create an agent first to enable new chats"}
          disabled={!hasAgents}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <div className="chat-history-container">
        {chats.length === 0 ? (
          <div className="no-chats">
            <p>No chat history entries found.</p>
            <p>Start a conversation with agents to auto-save chats.</p>
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="no-chats">
            <p>No chats match "{chatSearchQuery}".</p>
          </div>
        ) : (
          <ul className="chat-list simplified-chat-list">
            {filteredChats.map(chat => {
              const isCurrent = currentChatId === chat.id;
              return (
                <li
                  key={chat.id}
                  $onclick={["load-chat-from-history", chat.id]}
                  className={`chat-item simplified-chat-item chat-list-li${isCurrent ? ' current' : ''}`}
                >
                  <span
                    className={`chat-title clickable chat-list-title${isCurrent ? ' current' : ''}`}
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
              );
            })}
          </ul>
        )}
      </div>
    </fieldset>
  );
  // ...existing code...
}
