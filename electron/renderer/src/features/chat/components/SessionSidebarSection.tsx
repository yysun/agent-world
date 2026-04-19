/**
 * Session Sidebar Section
 * Purpose:
 * - Render the chat-session controls and list inside the left sidebar.
 *
 * Key Features:
 * - Session creation action and search field.
 * - Empty, filtered-empty, and populated session states.
 * - Keyboard-accessible session selection and delete affordances.
 *
 * Implementation Notes:
 * - This stays chat-owned even though it renders inside shell chrome.
 *
 * Recent Changes:
 * - 2026-04-19: Extracted session sidebar ownership out of `LeftSidebarPanel`.
 */

import { Input } from '../../../design-system/primitives';

export default function SessionSidebarSection({
  loadedWorld,
  onCreateSession,
  sessionSearch,
  setSessionSearch,
  sessions,
  filteredSessions,
  selectedSessionId,
  onSelectSession,
  deletingSessionId,
  onDeleteSession,
}) {
  return (
    <>
      <div className="mb-2 flex shrink-0 items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-sidebar-foreground/70">Chat Sessions</div>
        <button
          type="button"
          onClick={onCreateSession}
          disabled={!loadedWorld}
          className="flex h-7 w-7 items-center justify-center rounded text-sidebar-foreground transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground disabled:cursor-not-allowed disabled:opacity-50"
          title={!loadedWorld ? 'Load a world first' : 'Create new session'}
          aria-label={!loadedWorld ? 'Load a world first' : 'Create new session'}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <div className="mb-2 shrink-0">
        <Input
          type="text"
          value={sessionSearch}
          onChange={(event) => setSessionSearch(event.target.value)}
          placeholder="Search sessions..."
          tone="sidebar"
          className="bg-sidebar px-2 py-1 placeholder:text-sidebar-foreground/60"
          aria-label="Search chat sessions"
        />
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-auto pr-1" data-testid="session-list">
        {sessions.length === 0 ? (
          <div className="rounded-md border border-dashed border-sidebar-border p-3 text-xs text-sidebar-foreground/70">
            {loadedWorld ? 'No sessions yet.' : 'No world loaded.'}
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="rounded-md border border-dashed border-sidebar-border p-3 text-xs text-sidebar-foreground/70">
            No matching sessions.
          </div>
        ) : (
          filteredSessions.map((session) => (
            <div
              key={session.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectSession(session.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectSession(session.id);
                }
              }}
              className={`group w-full rounded-md py-1 pl-2 pr-0 text-left text-xs ${selectedSessionId === session.id
                ? 'bg-sidebar-session-selected text-sidebar-foreground'
                : 'bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground'
                }`}
              data-testid={`session-item-${session.id}`}
            >
              <div className="flex items-center justify-between gap-1">
                <div className="min-w-0 flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${selectedSessionId === session.id
                      ? 'bg-sidebar-foreground/75'
                      : 'bg-sidebar-foreground/35 group-hover:bg-sidebar-foreground/55'
                      }`}
                    aria-hidden="true"
                  />
                  <div className="truncate text-[11px] font-medium leading-[1.05]">{session.name}</div>
                </div>
                <div className="relative -mr-1 h-5 w-7 shrink-0">
                  <span
                    className={`absolute inset-0 inline-flex items-center justify-center rounded-full border border-sidebar-border bg-sidebar-accent px-1.5 text-[10px] font-medium leading-none text-sidebar-foreground/80 transition-opacity ${deletingSessionId === session.id
                      ? 'opacity-0'
                      : 'opacity-100 group-hover:opacity-0 group-focus-within:opacity-0'
                      }`}
                    aria-hidden="true"
                  >
                    {session.messageCount}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => onDeleteSession(session.id, event)}
                    disabled={deletingSessionId === session.id}
                    className={`absolute inset-0 flex items-center justify-center rounded text-sidebar-foreground/70 transition-all hover:bg-destructive/20 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50 ${deletingSessionId === session.id
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                      }`}
                    title="Delete session"
                    aria-label={`Delete session ${session.name}`}
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
