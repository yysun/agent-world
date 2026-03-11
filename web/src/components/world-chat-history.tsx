/**
 * Purpose:
 * - Render the web chat-history sidebar controls and list for a world.
 *
 * Key Features:
 * - Lists all chats with create/load/delete affordances.
 * - Filters chats client-side with a case-insensitive query.
 * - Exposes stable attributes for browser E2E automation.
 *
 * Notes on Implementation:
 * - Delete confirmation remains delegated to the parent World component.
 * - Filtering stays pure via `filterChatsByQuery` for direct unit coverage.
 *
 * Summary of Recent Changes:
 * - 2026-03-10: Added stable chat-history selectors and current-chat metadata for Playwright web E2E coverage.
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
    <fieldset className="settings-fieldset" data-testid="chat-history">
      <legend>Chat History</legend>

      <div className="chat-history-controls">
        <input
          type="text"
          className="message-input chat-history-search-input"
          placeholder="Search chats..."
          value={chatSearchQuery || ''}
          $oninput="update-chat-search"
          data-testid="chat-search"
        />
        <button
          className="new-chat-btn"
          $onclick="create-new-chat"
          title={hasAgents ? "Create new chat session" : "Create an agent first to enable new chats"}
          aria-label={hasAgents ? "Create new chat session" : "Create an agent first to enable new chats"}
          disabled={!hasAgents}
          data-testid="chat-create"
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
          <ul className="chat-list simplified-chat-list" data-testid="chat-list">
            {filteredChats.map(chat => {
              const isCurrent = currentChatId === chat.id;
              return (
                <li
                  key={chat.id}
                  $onclick={["load-chat-from-history", chat.id]}
                  className={`chat-item simplified-chat-item chat-list-li${isCurrent ? ' current' : ''}`}
                  data-testid={`chat-item-${chat.id}`}
                  data-chat-id={chat.id}
                  data-chat-current={isCurrent ? 'true' : 'false'}
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
                    data-testid={`chat-delete-${chat.id}`}
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
